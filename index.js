const express = require("express");
const session = require("express-session");
const crypto = require("crypto");

const app = express();
app.set("trust proxy", 1);

const PORT = process.env.PORT || 3000;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;

if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
  console.error(
    "Missing DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, or REDIRECT_URI"
  );
  process.exit(1);
}

app.use(express.urlencoded({ extended: false }));

app.use(
  session({
    name: "pwvenom.sid",
    secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex"),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000
    }
  })
);

const htmlEscape = (value = "") =>
  String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);

function page(title, content, user = null) {
  const avatar = user
    ? `https://cdn.discordapp.com/avatars/${encodeURIComponent(user.id)}/${encodeURIComponent(user.avatar || "")}.png?size=64`
    : "";

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${htmlEscape(title)} | PW VENOM LOG</title>
<style>
*{box-sizing:border-box}
body{
 margin:0;background:#08090d;color:#f4f4f5;
 font-family:Arial,Tahoma,sans-serif;min-height:100vh
}
header{
 padding:20px 7%;display:flex;justify-content:space-between;
 align-items:center;border-bottom:1px solid #262730;background:#0d0e14
}
.brand{font-size:23px;font-weight:900;letter-spacing:1px}
.brand span{color:#ef233c}
a{color:inherit;text-decoration:none}
button,.button{
 display:inline-block;border:0;border-radius:9px;padding:12px 18px;
 font-size:15px;font-weight:bold;cursor:pointer
}
.primary{background:#ed233e;color:white}
.secondary{background:#242630;color:white}
.container{width:min(1050px,92%);margin:38px auto}
.hero{
 background:linear-gradient(135deg,#191017,#11121b 65%,#191019);
 border:1px solid #35202b;border-radius:18px;padding:35px;margin-bottom:24px
}
h1{font-size:clamp(28px,5vw,44px);margin:0 0 15px}
p{color:#b6b7c2;line-height:1.8}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}
.card{background:#111219;border:1px solid #292a35;border-radius:14px;padding:22px}
.card h2{font-size:19px;margin-top:0}
.badge{display:inline-block;background:#20212b;border-radius:20px;padding:6px 10px;font-size:12px;color:#ddd}
.muted{color:#9b9daa;font-size:13px}
.user{display:flex;gap:10px;align-items:center}
.avatar{width:35px;height:35px;border-radius:50%;background:#292a35}
footer{text-align:center;padding:30px;color:#777987;font-size:13px}
hr{border:0;border-top:1px solid #292a35;margin:20px 0}
</style>
</head>
<body>
<header>
 <a class="brand" href="/">PW <span>VENOM</span> LOG</a>
 <div>
 ${
   user
     ? `<div class="user">
          <img class="avatar" src="${avatar}" alt="">
          <span>${htmlEscape(user.username)}</span>
          <a class="button secondary" href="/logout">خروج</a>
        </div>`
     : `<a class="button primary" href="/auth/discord">تسجيل الدخول</a>`
 }
 </div>
</header>
<main class="container">${content}</main>
<footer>PW VENOM LOG · Discord Logging Dashboard</footer>
</body>
</html>`;
}

function requireLogin(req, res, next) {
  if (!req.session.user || !req.session.accessToken) {
    return res.redirect("/auth/discord");
  }
  next();
}

app.get("/", (req, res) => {
  if (req.session.user) return res.redirect("/dashboard");

  res.send(page("الرئيسية", `
    <section class="hero">
      <span class="badge">DISCORD LOG SYSTEM</span>
      <h1>PW <span style="color:#ef233c">VENOM</span> LOG</h1>
      <p>
        لوحة تحكم لمتابعة سيرفرات Discord وتجهيز نظام اللوق
        الخاص بك من واجهة واحدة.
      </p>
      <a class="button primary" href="/auth/discord">
        تسجيل الدخول عبر Discord
      </a>
    </section>
    <section class="grid">
      <div class="card">
        <h2>إدارة السيرفرات</h2>
        <p>عرض السيرفرات التي تستطيع إدارتها بحساب Discord الخاص بك.</p>
      </div>
      <div class="card">
        <h2>نظام اللوق</h2>
        <p>واجهة أولية للوحة التحكم. يلزم ربطها بالبوت لتطبيق تغييرات اللوق.</p>
      </div>
      <div class="card">
        <h2>حماية الحساب</h2>
        <p>تسجيل الدخول يتم عبر Discord OAuth2 دون طلب كلمة مرورك.</p>
      </div>
    </section>
  `));
});

// Start Discord OAuth2 login
app.get("/auth/discord", (req, res) => {
  const state = crypto.randomBytes(24).toString("hex");
  req.session.oauthState = state;

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: "identify guilds",
    state
  });

  res.redirect(
    `https://discord.com/oauth2/authorize?${params.toString()}`
  );
});

// Discord OAuth2 callback
app.get("/auth/callback", async (req, res) => {
  const { code, state, error } = req.query;

  if