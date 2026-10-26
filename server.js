
const express = require("express");
const session = require("express-session");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

app.set("trust proxy", 1);

app.use(session({
  name: "pwvenom.sid",
  secret: process.env.SESSION_SECRET || "CHANGE_THIS_SECRET",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 8 * 60 * 60 * 1000
  }
}));

const ID = process.env.DISCORD_CLIENT_ID;
const SECRET = process.env.DISCORD_CLIENT_SECRET;
const REDIRECT = process.env.DISCORD_REDIRECT_URI;

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;",
    '"':"&quot;", "'":"&#39;"
  }[c]));
}

const style = `
body{margin:0;background:#080808;color:#fff;font-family:Arial,sans-serif}
main{max-width:950px;margin:auto;padding:25px}
header{padding:20px 0;border-bottom:1px solid #351116}
h1{font-size:42px}
.red{color:#e51d35}
.card{background:#141414;border:1px solid #42151c;border-radius:12px;padding:18px;margin:12px 0}
.btn{display:inline-block;background:#e51d35;color:white;padding:12px 18px;border-radius:8px;text-decoration:none;border:0}
input{background:#111;color:white;border:1px solid #444;padding:12px;border-radius:8px}
.muted{color:#aaa}
`;

function page(title, content, user) {
  return `<!doctype html>
<html lang="ar"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} | PW VENOM LOGS</title>
<style>${style}</style>
</head><body><main>
<header><a href="/" style="color:white;text-decoration:none;font-weight:bold">🕷 PW <span class="red">VENOM LOGS</span></a>
<span style="float:right">${user ? esc(user.username) : ""}</span></header>
${content}
<p class="muted">PW VENOM LOGS</p>
</main></body></html>`;
}

function loggedIn(req, res, next) {
  if (!req.session.user || !req.session.accessToken) {
    return res.redirect("/login");
  }
  next();
}

function canManage(guild) {
  const p = BigInt(guild.permissions || "0");
  return (p & 8n) === 8n || (p & 32n) === 32n;
}

/* اختبار الموقع */
app.get("/health", (req, res) => {
  res.status(200).json({
    ok: true,
    app: "PW VENOM LOGS"
  });
});

/* الصفحة الرئيسية */
app.get("/", (req, res) => {
  res.send(page("Home", `
<h1>YOUR SERVER.<br><span class="red">YOUR LOGS.</span></h1>
<p class="muted">لوحة تحكم PW VENOM LOGS بتصميم أسود وأحمر.</p>
<a class="btn" href="/login">Login with Discord</a>

<div class="card"><h3>🛡 تسجيل آمن</h3>
<p>الدخول عبر Discord OAuth2.</p></div>

<div class="card"><h3>🕷 لوحة التحكم</h3>
<p>عرض السيرفرات المتاحة لحسابك.</p></div>

<div class="card"><h3>🔴 سجلات الأحداث</h3>
<p>تحتاج ربط البوت بقاعدة بيانات لإظهار السجلات الحقيقية.</p></div>
`, req.session.user));
});

/* تسجيل الدخول */
app.get("/login", (req, res) => {
  if (!ID || !SECRET || !REDIRECT || !process.env.SESSION_SECRET) {
    return res.status(500).send(page("Setup", `
<h1>الإعدادات ناقصة</h1>
<p>تحقق من متغيرات Railway.</p>
`, null));
  }

  const params = new URLSearchParams({
    client_id: ID,
    redirect_uri: REDIRECT,
    response_type: "code",
    scope: "identify guilds"
  });

  res.redirect("https://discord.com/oauth2/authorize?" + params.toString());
});

/* الرجوع من Discord */
app.get("/auth/callback", async (req, res) => {
  if (req.query.error) {
    return res.status(400).send(page("Cancelled", `
<h1>تم إلغاء تسجيل الدخول</h1>
<a class="btn" href="/login">إعادة المحاولة</a>
`));
  }

  if (!req.query.code) {
    return res.status(400).send(page("Login", `
<h1>افتح الموقع واضغط تسجيل الدخول أولًا</h1>
<a class="btn" href="/login">Login with Discord</a>
`));
  }

  try {
    const token = await axios.post(
      "https://discord.com/api/oauth2/token",
      new URLSearchParams({
        client_id: ID,
        client_secret: SECRET,
        grant_type: "authorization_code",
        code: String(req.query.code),
        redirect_uri: REDIRECT
      }).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        timeout: 15000
      }
    );

    const accessToken = token.data.access_token;

    const user = await axios.get(
      "https://discord.com/api/users/@me",
      { headers: { Authorization: "Bearer " + accessToken } }
    );

    req.session.user = user.data;
    req.session.accessToken = accessToken;

    req.session.save(err => {
      if (err) {
        return res.status(500).send("Session error. Check Railway settings.");
      }
      res.redirect("/dashboard");
    });
  } catch (err) {
    console.error("OAuth error:", err.response?.data || err.message);

    res.status(500).send(page("Login Error", `
<h1>فشل تسجيل الدخول</h1>
<p>تحقق من Client ID وClient Secret ورابط Redirect URI.</p>
<a class="btn" href="/login">حاول مجددًا</a>
`));
  }
});

/* لوحة التحكم */
app.get("/dashboard", loggedIn, async (req, res) => {
  try {
    const response = await axios.get(
      "https://discord.com/api/users/@me/guilds",
      {
        headers: {
          Authorization: "Bearer " + req.session.accessToken
        },
        timeout: 15000
      }
    );

    const guilds = response.data || [];

    const cards = guilds.map(g => `
<div class="card guild" data-name="${esc(g.name.toLowerCase())}">
  <h3>🛡 ${esc(g.name)}</h3>
  <p class="muted">Server ID: ${esc(g.id)}</p>
  <p>${canManage(g) ? "لديك صلاحية إدارة السيرفر" : "عضو في السيرفر"}</p>
  ${canManage(g)
    ? `<a class="btn" href="/server/${encodeURIComponent(g.id)}">فتح اللوحة</a>`
    : ""}
</div>
`).join("");

    res.send(page("Dashboard", `
<h1>لوحة <span class="red">التحكم</span></h1>
<p>مرحبًا ${esc(req.session.user.username)}</p>
<a class="btn" href="/logout">تسجيل الخروج</a>

<div class="card">
<h3>عدد السيرفرات: ${guilds.length}</h3>
<p class="muted">سجلات الأحداث الحقيقية غير مربوطة بقاعدة بيانات بعد.</p>
</div>

<input id="search" placeholder="ابحث عن سيرفر..." oninput="filterGuilds()">
<div id="guilds">
${cards || '<div class="card">لم يتم العثور على سيرفرات.</div>'}
</div>

<script>
function filterGuilds() {
  const q = document.getElementById("search").value.toLowerCase();
  document.querySelectorAll(".guild").forEach(g => {
    g.style.display = g.dataset.name.includes(q) ? "block" : "none";
  });
}
</script>
`, req.session.user));
  } catch (err) {
    console.error("Guild error:", err.response?.data || err.message);

    if (err.response?.status === 401) {
      return req.session.destroy(() => res.redirect("/login"));
    }

    res.status(502).send(page("Error", `
<h1>تعذر تحميل السيرفرات</h1>
<a class="btn" href="/dashboard">إعادة المحاولة</a>
`, req.session.user));
  }
});

/* صفحة السيرفر */
app.get("/server/:id", loggedIn, async (req, res) => {
  try {
    const response = await axios.get(
      "https://discord.com/api/users/@me/guilds",
      {
        headers: {
          Authorization: "Bearer " + req.session.accessToken
        }
      }
    );

    const guild = (response.data || []).find(g => g.id === req.params.id);

    if (!guild || !canManage(guild)) {
      return res.status(403).send(page("Forbidden", `
<h1>ليس لديك صلاحية إدارة هذا السيرفر</h1>
<a class="btn" href="/dashboard">رجوع</a>
`, req.session.user));
    }

    res.send(page(guild.name, `
<h1>${esc(guild.name)}</h1>
<div class="card">
<h3>🧾 سجلات الأحداث</h3>
<p>تحتاج ربط البوت بقاعدة بيانات لعرض الأحداث الحقيقية.</p>
</div>
<div class="card">
<h3>⚙ إعدادات اللوق</h3>
<p>إعدادات القنوات تحتاج ربطًا إضافيًا بالبوت.</p>
</div>
<a class="btn" href="/dashboard">رجوع للوحة</a>
`, req.session.user));
  } catch (err) {
    res.status(502).send("تعذر تحميل بيانات السيرفر.");
  }
});

/* تسجيل الخروج */
app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("pwvenom.sid");
    res.redirect("/");
  });
});

/* أي رابط غير موجود */
app.use((req, res) => {
  res.status(404).send(page("404", `
<h1>404 — الصفحة غير موجودة</h1>
<a class="btn" href="/">الرئيسية</a>
`, req.session.user));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("PW VENOM LOGS running on port " + PORT);
});
