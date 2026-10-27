const express = require("express");
const session = require("express-session");
const axios = require("axios");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const REDIRECT_URI = process.env.DISCORD_REDIRECT_URI;
const SESSION_SECRET = process.env.SESSION_SECRET;

app.set("trust proxy", 1);
app.use(express.static(path.join(__dirname, "public")));

app.use(session({
  name: "pwvenom.sid",
  secret: SESSION_SECRET || "CHANGE_THIS_SECRET_IN_RAILWAY",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 8 * 60 * 60 * 1000
  }
}));

const css = `
*{box-sizing:border-box}
body{margin:0;background:#080808;color:#f7f7f7;font-family:Arial,sans-serif;min-height:100vh}
.wrap{max-width:1050px;margin:auto;padding:22px}
.top,.head,.server{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap}
.brand{font-weight:900;letter-spacing:2px;color:white;text-decoration:none}
.red{color:#ed2338}
.hero{position:relative;isolation:isolate;overflow:hidden;min-height:610px;border:1px solid #42141a;border-radius:18px;margin-top:24px;padding:38px 28px;display:flex;flex-direction:column;justify-content:flex-end;background:#080808}
.hero:before{content:"";position:absolute;inset:0;z-index:-2;background-image:url('/venom.jpg');background-size:cover;background-position:center 25%;transform:scale(1.01)}
.hero:after{content:"";position:absolute;inset:0;z-index:-1;background:linear-gradient(0deg,rgba(5,5,5,.98) 0%,rgba(5,5,5,.72) 38%,rgba(5,5,5,.12) 100%),linear-gradient(90deg,rgba(5,5,5,.25),transparent 75%)}
.eyebrow{color:#ff5363;letter-spacing:3px;font-size:12px;font-weight:bold}
h1{font-size:clamp(36px,7vw,66px);line-height:1.04;margin:14px 0}
p,.muted{color:#bdbdbd;line-height:1.65}
.btn{display:inline-block;background:#df1d31;color:white;text-decoration:none;border:0;border-radius:9px;padding:13px 18px;font-weight:bold;cursor:pointer}
.secondary{background:#222;border:1px solid #444}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;margin:22px 0}
.card{background:#121212;border:1px solid #32191c;border-radius:14px;padding:20px}
.card h3{margin-top:0}
.pill{display:inline-block;background:#2a1115;color:#ff9aa4;border-radius:20px;padding:5px 10px;font-size:12px}
.notice{background:#1c0c0f;border:1px solid #5b252c;padding:15px;border-radius:10px;color:#f3c5ca;line-height:1.6}
.input{background:#090909;color:#fff;border:1px solid #444;padding:12px;border-radius:9px;width:100%;max-width:330px}
.foot{margin-top:35px;border-top:1px solid #2b1b1d;padding:22px 0;color:#777;font-size:12px}
code{overflow-wrap:anywhere}
@media(max-width:600px){.wrap{padding:14px}.hero{min-height:570px;padding:23px 18px;background-position:center}.hero:before{background-position:54% center}}
`;

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));
}

function page(title, body, user) {
  return `<!doctype html><html lang="ar"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#080808">
<title>${esc(title)} | PW VENOM LOGS</title><style>${css}</style></head><body>
<div class="wrap">
<header class="top"><a class="brand" href="/">🕷 PW <span class="red">VENOM LOGS</span></a>
<span class="muted">${user ? esc(user.username) : "DISCORD LOG DASHBOARD"}</span></header>
${body}
<footer class="foot">PW VENOM LOGS · لا تشارك Client Secret أو Bot Token مع أي شخص.</footer>
</div></body></html>`;
}

function configured() {
  return Boolean(CLIENT_ID && CLIENT_SECRET && REDIRECT_URI && SESSION_SECRET);
}

function loginRequired(req, res, next) {
  if (!req.session.user || !req.session.accessToken) return res.redirect("/login");
  next();
}

function canManage(guild) {
  const permissions = BigInt(guild.permissions || "0");
  return (permissions & 8n) === 8n || (permissions & 32n) === 32n;
}

app.get("/health", (req, res) => {
  res.status(200).json({ ok: true, app: "PW VENOM LOGS" });
});

app.get("/", (req, res) => {
  const body = `
<main class="hero">
<div class="eyebrow">POWERED BY PW VENOM</div>
<h1>YOUR SERVER.<br><span class="red">YOUR LOGS.</span></h1>
<p>لوحة تحكم PW VENOM LOGS بتصميم أسود وأحمر، مع صورة فينوم في الخلفية.</p>
<div><a class="btn" href="/login">Login with Discord ↗</a></div>
</main>
<div class="grid">
<div class="card"><h3>🛡️ تسجيل آمن</h3><p>سجّل الدخول عبر Discord OAuth2.</p></div>
<div class="card"><h3>🕷️ لوحة السيرفرات</h3><p>اعرض السيرفرات المتاحة لحسابك.</p></div>
<div class="card"><h3>🔴 سجلات حقيقية</h3><p>عرض الأحداث الفعلية يتطلب ربط البوت بقاعدة بيانات.</p></div>
</div>`;
  res.send(page("Home", body, req.session.user));
});

app.get("/login", (req, res) => {
  if (!configured()) {
    return res.status(500).send(page("Setup", `
<h1>الإعدادات ناقصة</h1>
<div class="notice">أضف DISCORD_CLIENT_ID وDISCORD_CLIENT_SECRET وDISCORD_REDIRECT_URI وSESSION_SECRET في Railway.</div>
`, req.session.user));
  }
  const params = new URLSearchParams({
    client_id: CLIENT_ID, redirect_uri: REDIRECT_URI,
    response_type: "code", scope: "identify guilds"
  });
  res.redirect("https://discord.com/oauth2/authorize?" + params.toString());
});

app.get("/auth/callback", async (req, res) => {
  if (req.query.error) {
    return res.status(400).send(page("Login cancelled", `
<h1>تم إلغاء تسجيل الدخول</h1><a class="btn" href="/login">حاول مجددًا</a>
`, req.session.user));
  }
  if (!req.query.code) {
    return res.status(400).send(page("Missing code", `
<h1>افتح الموقع واضغط تسجيل الدخول أولًا</h1><a class="btn" href="/login">Login with Discord</a>
`, req.session.user));
  }
  if (!configured()) {
    return res.status(500).send(page("Setup", `<h1>تحقق من متغيرات Railway</h1>`, req.session.user));
  }
  try {
    const tokenResponse = await axios.post(
      "https://discord.com/api/oauth2/token",
      new URLSearchParams({
        client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
        grant_type: "authorization_code", code: String(req.query.code),
        redirect_uri: REDIRECT_URI
      }).toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 15000 }
    );
    const accessToken = tokenResponse.data.access_token;
    const userResponse = await axios.get("https://discord.com/api/users/@me", {
      headers: { Authorization: "Bearer " + accessToken }, timeout: 15000
    });
    req.session.user = userResponse.data;
    req.session.accessToken = accessToken;
    req.session.save(error => {
      if (error) return res.status(500).send(page("Session error", `<h1>تعذر حفظ جلسة الدخول</h1>`, req.session.user));
      res.redirect("/dashboard");
    });
  } catch (error) {
    console.error("Discord OAuth error:", error.response?.data || error.message);
    res.status(500).send(page("Login error", `
<h1>فشل تسجيل الدخول</h1>
<p>تحقق من تطابق Redirect URI في Discord وRailway.</p>
<a class="btn" href="/login">إعادة المحاولة</a>
`, req.session.user));
  }
});

app.get("/dashboard", loginRequired, async (req, res) => {
  try {
    const response = await axios.get("https://discord.com/api/users/@me/guilds", {
      headers: { Authorization: "Bearer " + req.session.accessToken }, timeout: 15000
    });
    const guilds = response.data || [];
    const cards = guilds.map(g => `
<article class="card server" data-name="${esc(g.name.toLowerCase())}">
<div><h3>🛡️ ${esc(g.name)}</h3>
<span class="pill">${canManage(g) ? "إدارة السيرفر" : "عضو"}</span>
<p class="muted">ID: <code>${esc(g.id)}</code></p></div>
${canManage(g) ? `<a class="btn secondary" href="/server/${encodeURIComponent(g.id)}">فتح اللوحة</a>` : ""}
</article>`).join("");
    const body = `
<div class="head"><div><div class="eyebrow">CONTROL CENTER</div>
<h1>لوحة <span class="red">التحكم</span></h1><p>مرحبًا ${esc(req.session.user.username)}</p></div>
<a class="btn secondary" href="/logout">تسجيل الخروج</a></div>
<div class="grid"><div class="card"><p>السيرفرات</p><h2>${guilds.length}</h2></div>
<div class="card"><p>الحساب</p><h2 class="red">متصل</h2></div>
<div class="card"><p>قاعدة بيانات اللوق</p><h2>غير مربوطة</h2></div></div>
<div class="notice">السجلات الحقيقية تحتاج ربط البوت بقاعدة بيانات.</div>
<div class="head"><h2>سيرفراتك</h2><input id="search" class="input" placeholder="ابحث عن سيرفر..." oninput="filterGuilds()"></div>
<div id="guilds" class="grid">${cards || `<div class="card">لم يتم العثور على سيرفرات.</div>`}</div>
<script>function filterGuilds(){const q=document.getElementById("search").value.toLowerCase();document.querySelectorAll("[data-name]").forEach(x=>x.style.display=x.dataset.name.includes(q)?"flex":"none")}</script>`;
    res.send(page("Dashboard", body, req.session.user));
  } catch (error) {
    console.error("Guild list error:", error.response?.data || error.message);
    if (error.response?.status === 401) return req.session.destroy(() => res.redirect("/login"));
    res.status(502).send(page("Error", `<h1>تعذر تحميل السيرفرات</h1><a class="btn" href="/dashboard">إعادة المحاولة</a>`, req.session.user));
  }
});

app.get("/server/:id", loginRequired, async (req, res) => {
  try {
    const response = await axios.get("https://discord.com/api/users/@me/guilds", {
      headers: { Authorization: "Bearer " + req.session.accessToken }, timeout: 15000
    });
    const guild = (response.data || []).find(g => g.id === req.params.id);
    if (!guild || !canManage(guild)) {
      return res.status(403).send(page("Forbidden", `<h1>ليس لديك صلاحية إدارة هذا السيرفر</h1><a class="btn" href="/dashboard">رجوع</a>`, req.session.user));
    }
    res.send(page(guild.name, `
<h1>${esc(guild.name)}</h1>
<div class="grid"><div class="card"><h3>🧾 سجل الأحداث</h3><p>يحتاج ربط البوت بقاعدة بيانات.</p></div>
<div class="card"><h3>⚙️ إعدادات اللوق</h3><p>إعداد القنوات يحتاج ربطًا إضافيًا بالبوت.</p></div></div>
<a class="btn" href="/dashboard">رجوع للوحة</a>`, req.session.user));
  } catch (error) {
    console.error("Server page error:", error.message);
    res.status(502).send(page("Error", `<h1>تعذر تحميل بيانات السيرفر</h1><a class="btn" href="/dashboard">رجوع</a>`, req.session.user));
  }
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => { res.clearCookie("pwvenom.sid"); res.redirect("/"); });
});

app.use((req, res) => {
  res.status(404).send(page("404", `<h1>404 — الصفحة غير موجودة</h1><a class="btn" href="/">الرئيسية</a>`, req.session.user));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("PW VENOM LOGS running on port " + PORT);
});
