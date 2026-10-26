
const express = require("express");
const session = require("express-session");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const REDIRECT_URI = process.env.DISCORD_REDIRECT_URI;
const SESSION_SECRET = process.env.SESSION_SECRET;

app.set("trust proxy", 1);

app.use(session({
  name: "pwvenom.sid",
  secret: SESSION_SECRET || "CHANGE_THIS_SECRET",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 28800000
  }
}));

const css = `
*{box-sizing:border-box}
body{margin:0;background:radial-gradient(ellipse at top,#28090d,#080808 55%);color:#f6f6f6;font-family:Arial,sans-serif;min-height:100vh}
.wrap{max-width:1050px;margin:auto;padding:24px}
.top,.head,.server{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap}
.brand{font-weight:900;letter-spacing:2px;color:white;text-decoration:none}
.red{color:#ed2338}
.hero{padding:55px 0 25px}
.eyebrow{color:#ff5363;letter-spacing:3px;font-size:12px;font-weight:bold}
h1{font-size:clamp(36px,7vw,66px);line-height:1.05;margin:16px 0}
p,.muted{color:#aaa;line-height:1.65}
.btn{display:inline-block;background:#df1d31;color:white;text-decoration:none;border:0;border-radius:9px;padding:13px 18px;font-weight:bold;cursor:pointer}
.secondary{background:#222;border:1px solid #444}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px;margin:24px 0}
.card{background:#121212;border:1px solid #32191c;border-radius:14px;padding:20px}
.card h3{margin-top:0}
.pill{display:inline-block;background:#2a1115;color:#ff9aa4;border-radius:20px;padding:5px 10px;font-size:12px}
.notice{background:#1c0c0f;border:1px solid #5b252c;padding:15px;border-radius:10px;color:#f3c5ca;line-height:1.6}
.input{background:#090909;color:#fff;border:1px solid #444;padding:12px;border-radius:9px;width:100%;max-width:330px}
.foot{margin-top:45px;border-top:1px solid #2b1b1d;padding:24px 0;color:#777;font-size:12px}
code{overflow-wrap:anywhere}
@media(max-width:600px){.wrap{padding:17px}.hero{padding-top:30px}}
`;

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;",
    '"': "&quot;", "'": "&#39;"
  }[c]));
}

function page(title, body, user) {
  return `<!doctype html>
<html lang="ar">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#080808">
<title>${esc(title)} | PW VENOM LOGS</title>
<style>${css}</style>
</head>
<body>
<div class="wrap">
<header class="top">
<a class="brand" href="/">🕷 PW <span class="red">VENOM LOGS</span></a>
<span class="muted">${user ? esc(user.username) : "DISCORD LOG DASHBOARD"}</span>
</header>
${body}
<footer class="foot">PW VENOM LOGS · لا تشارك Client Secret أو Bot Token.</footer>
</div>
</body>
</html>`;
}

function configured() {
  return CLIENT_ID && CLIENT_SECRET && REDIRECT_URI && SESSION_SECRET;
}

function loginRequired(req, res, next) {
  if (!req.session.user || !req.session.accessToken) {
    return res.redirect("/login");
  }
  next();
}

function canManage(guild) {
  const p = BigInt(guild.permissions || "0");
  return (p & 8n) === 8n || (p & 32n) === 32n;
}

app.get("/", (req, res) => {
  const body = `
<main class="hero">
<div class="eyebrow">POWERED BY PW VENOM</div>
<h1>YOUR SERVER.<br><span class="red">YOUR LOGS.</span></h1>
<p>لوحة تحكم بتصميم أسود وأحمر. سجّل الدخول عبر Discord لعرض السيرفرات التي يستطيع حسابك الوصول إليها.</p>
<a class="btn" href="/login">Login with Discord ↗</a>
<div class="grid">
<div class="card"><h3>🛡️ تسجيل آمن</h3><p>لن نطلب كلمة مرور Discord الخاصة بك.</p></div>
<div class="card"><h3>🕷️ لوحة السيرفرات</h3><p>عرض السيرفرات والبحث بينها.</p></div>
<div class="card"><h3>🔴 سجلات حقيقية</h3><p>تحتاج ربط البوت بقاعدة بيانات لإظهار الأحداث الفعلية.</p></div>
</div>
</main>`;
  res.send(page("Home", body, req.session.user));
});

app.get("/login", (req, res) => {
  if (!configured()) {
    return res.status(500).send(page("Setup", `
<h1>الإعدادات ناقصة</h1>
<div class="notice">أضف متغيرات DISCORD_CLIENT_ID وDISCORD_CLIENT_SECRET وDISCORD_REDIRECT_URI وSESSION_SECRET في Railway.</div>
`));
  }

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: "identify guilds"
  });

  res.redirect("https://discord.com/oauth2/authorize?" + params);
});

app.get("/auth/callback", async (req, res) => {
  if (req.query.error) {
    return res.status(400).send(page("Cancelled", `
<h1>تم إلغاء تسجيل الدخول</h1>
<a class="btn" href="/login">حاول مجددًا</a>
`));
  }

  if (!req.query.code) {
    return res.status(400).send(page("Missing code", `
<h1>افتح الموقع واضغط تسجيل الدخول أولًا</h1>
<a class="btn" href="/login">Login with Discord</a>
`));
  }

  if (!configured()) {
    return res.status(500).send(page("Setup", `<h1>تحقق من متغيرات Railway</h1>`));
  }

  try {
    const token = await axios.post(
      "https://discord.com/api/oauth2/token",
      new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: "authorization_code",
        code: String(req.query.code),
        redirect_uri: REDIRECT_URI
      }).toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const accessToken = token.data.access_token;

    const me = await axios.get(
      "https://discord.com/api/users/@me",
      { headers: { Authorization: "Bearer " + accessToken } }
    );

    req.session.user = me.data;
    req.session.accessToken = accessToken;

    req.session.save(err => {
      if (err) {
        return res.status(500).send("Session error. Check SESSION_SECRET.");
      }
      res.redirect("/dashboard");
    });
  } catch (error) {
    const detail =
      error.response?.data?.error_description ||
      error.response?.data?.message ||
      error.message;

    console.error("OAuth error:", detail);

    res.status(500).send(page("Login error", `
<h1>فشل تسجيل الدخول</h1>
<p>تحقق أن Redirect URI في Discord وRailway متطابقان حرفيًا.</p>
<div class="notice">${esc(detail)}</div>
<a class="btn" href="/login">إعادة المحاولة</a>
`));
  }
});

app.get("/dashboard", loginRequired, async (req, res) => {
  try {
    const response = await axios.get(
      "https://discord.com/api/users/@me/guilds",
      { headers: { Authorization: "Bearer " + req.session.accessToken } }
    );

    const guilds = response.data || [];

    const cards = guilds.map(guild => `
<article class="card server" data-name="${esc(guild.name.toLowerCase())}">
<div>
<h3>🛡️ ${esc(guild.name)}</h3>
<span class="pill">${canManage(guild) ? "إدارة السيرفر" : "عضو"}</span>
<p class="muted">ID: <code>${esc(guild.id)}</code></p>
</div>
${canManage(guild)
  ? `<a class="btn secondary" href="/server/${encodeURIComponent(guild.id)}">فتح اللوحة</a>`
  : `<span class="muted">تحتاج صلاحية إدارة السيرفر</span>`}
</article>
`).join("");

    const body = `
<div class="head">
<div>
<div class="eyebrow">CONTROL CENTER</div>
<h1>لوحة <span class="red">التحكم</span></h1>
<p>مرحبًا ${esc(req.session.user.username)}، هذه قائمة السيرفرات المتاحة لحسابك.</p>
</div>
<a class="btn secondary" href="/logout">تسجيل الخروج</a>
</div>

<div class="grid">
<div class="card"><p>السيرفرات</p><h2>${guilds.length}</h2></div>
<div class="card"><p>الحساب</p><h2 class="red">متصل</h2></div>
<div class="card"><p>قاعدة بيانات اللوق</p><h2>غير مربوطة</h2></div>
</div>

<div class="notice">
هذه النسخة تعرض السيرفرات فقط. سجلات الرسائل والحذف والدخول والخروج الحقيقية تحتاج ربط البوت بقاعدة بيانات.
</div>

<div class="head">
<h2>سيرفراتك</h2>
<input id="search" class="input" placeholder="ابحث عن سيرفر..." oninput="filterGuilds()">
</div>

<div id="guilds" class="grid">
${cards || `<div class="card">لم يتم العثور على سيرفرات لهذا الحساب.</div>`}
</div>

<script>
function filterGuilds() {
  const q = document.getElementById("search").value.toLowerCase();
  document.querySelectorAll("[data-name]").forEach(item => {
    item.style.display = item.dataset.name.includes(q) ? "flex" : "none";
  });
}
</script>
`;

    res.send(page("Dashboard", body, req.session.user));
  } catch (error) {
    console.error("Guild list error", error.message);

    if (error.response?.status === 401) {
      return req.session.destroy(() => res.redirect("/login"));
    }

    res.status(502).send(page("Error", `
<h1>تعذر تحميل السيرفرات</h1>
<a class="btn" href="/dashboard">إعادة المحاولة</a>
`, req.session.user));
  }
});

app.get("/server/:id", loginRequired, async (req, res) => {
  try {
    const response = await axios.get(
      "https://discord.com/api/users/@me/guilds",
      { headers: { Authorization: "Bearer " + req.session.accessToken } }
    );

    const guild = (response.data || []).find(g => g.id === req.params.id);

    if (!guild || !canManage(guild)) {
      return res.status(403).send(page("Forbidden", `
<h1>ليس لديك صلاحية إدارة هذا السيرفر</h1>
<a class="btn" href="/dashboard">رجوع</a>
`, req.session.user));
    }

    const body = `
<div class="head">
<div>
<div class="eyebrow">SERVER DASHBOARD</div>
<h1>${esc(guild.name)}</h1>
<p>ID: <code>${esc(guild.id)}</code></p>
</div>
<a class="btn secondary" href="/dashboard">رجوع</a>
</div>

<div class="grid">
<div class="card">
<h3>🧾 سجل الأحداث</h3>
<p>غير متاح حتى يتم ربط البوت بقاعدة بيانات.</p>
<span class="pill">بانتظار الربط</span>
</div>
<div class="card">
<h3>⚙️ إعدادات اللوق</h3>
<p>ستتم إضافة إعداد القناة وأنواع الأحداث بعد ربط البوت.</p>
<span class="pill">قيد الإعداد</span>
</div>
</div>

<div class="notice">هذه الصفحة لا تغيّر إعدادات السيرفر أو البوت.</div>
`;

    res.send(page(guild.name, body, req.session.user));
  } catch (error) {
    res.status(502).send(page("Error", `
<h1>تعذر تحميل بيانات السيرفر</h1>
<a class="btn" href="/dashboard">رجوع</a>
`, req.session.user));
  }
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("pwvenom.sid");
    res.redirect("/");
  });
});

app.get("/health", (req, res) => {
  res.json({ ok: true, app: "PW VENOM LOGS" });
});

app.use((req, res) => {
  res.status(404).send(page("404", `
<h1>404 — الصفحة غير موجودة</h1>
<a class="btn" href="/">الرئيسية</a>
`, req.session.user));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("PW VENOM LOGS web listening on " + PORT);
});
'''
package='''{
  "name": "pw-venom-logs-web",
  "version": "1.1.0",
  "private": true,
  "description": "PW VENOM LOGS Discord dashboard",
  "main": "server.js",
  "scripts": { "start": "node server.js" },
  "dependencies": {
    "axios": "^1.7.9",
    "express": "^4.21.2",
    "express-session": "^1.18.1"
  }
}'''
readme='''PW VENOM LOGS WEB DASHBOARD

Railway variables (web service only):
DISCORD_CLIENT_ID = 1564305371592401077
DISCORD_CLIENT_SECRET = OAuth2 Client Secret from your existing Discord application
DISCORD_REDIRECT_URI = https://vinomlogweb-production.up.railway.app/auth/callback
SESSION_SECRET = long random secret string
NODE_ENV = production

In Discord Developer Portal > existing application > OAuth2 > Redirects, add exactly:
https://vinomlogweb-production.up.railway.app/auth/callback

Health check:
https://vinomlogweb-production.up.railway.app/health

Do not change the existing bot service or expose its token.
This dashboard lists Discord servers. Real event logs require bot/database integration.
'''
for name,content in [("server.js",server),("package.json",package),("README.md",readme)]:
    open(os.path.join(base,name),"w",encoding="utf-8").write(content)
zip_path="/mnt/data/pw-venom-logs-web-complete.zip"
with zipfile.ZipFile(zip_path,"w",zipfile.ZIP_DEFLATED) as z:
    for name in ["server.js","package.json","README.md"]:
        z.write(os.path.join(base,name),name)
print("Created complete copy-paste package.")
