const express = require("express");
const session = require("express-session");
const crypto = require("crypto");

const app = express();
app.set("trust proxy", 1);

const PORT = process.env.PORT || 3000;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
const BOT_API_URL = (process.env.BOT_API_URL || "").replace(/\/+$/, "");
const BOT_CONTROL_SECRET = process.env.BOT_CONTROL_SECRET;
const SESSION_SECRET = process.env.SESSION_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI || !SESSION_SECRET) {
  console.error("Missing required environment variables.");
  process.exit(1);
}

app.use(express.urlencoded({ extended: false }));
app.use(express.json({ limit: "20kb" }));

app.use(
  session({
    name: "pwvenom.sid",
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000
    }
  })
);

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[c]);
}

function avatarURL(user) {
  if (!user || !user.id || !user.avatar) {
    return "https://cdn.discordapp.com/embed/avatars/0.png";
  }

  const format = user.avatar.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${encodeURIComponent(user.id)}/${encodeURIComponent(user.avatar)}.${format}?size=128`;
}

function guildIcon(guild) {
  if (!guild.icon) {
    return "https://cdn.discordapp.com/embed/avatars/1.png";
  }

  const format = guild.icon.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/icons/${encodeURIComponent(guild.id)}/${encodeURIComponent(guild.icon)}.${format}?size=128`;
}

function renderPage(title, content, user) {
  const account = user
    ? `<div class="account">
         <img class="user-avatar" src="${esc(avatarURL(user))}" alt="">
         <span>${esc(user.username)}</span>
         <a class="btn secondary" href="/logout">خروج</a>
       </div>`
    : `<a class="btn red" href="/auth/discord">تسجيل الدخول عبر Discord</a>`;

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} | PW VENOM LOG</title>
<style>
*{box-sizing:border-box}
body{margin:0;background:#08080c;color:#f5f5f7;font-family:Arial,Tahoma,sans-serif}
header{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;padding:18px 5%;background:#111116;border-bottom:1px solid #30212a}
.brand{font-size:22px;font-weight:900;color:white;text-decoration:none}
.brand span,.accent{color:#f12642}
.account{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.user-avatar{width:34px;height:34px;border-radius:50%;object-fit:cover}
.container{width:92%;max-width:1100px;margin:30px auto;min-height:70vh}
.hero{padding:27px;background:linear-gradient(135deg,#281018,#111116 75%);border:1px solid #542332;border-radius:17px;margin-bottom:24px}
h1{font-size:clamp(27px,5vw,42px);margin:12px 0}
p{color:#bdbdc7;line-height:1.8}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:16px}
.card{background:#121218;border:1px solid #2b2b35;border-radius:14px;padding:20px;overflow-wrap:anywhere}
.card h2{font-size:19px}
.btn{display:inline-block;text-decoration:none;padding:11px 15px;border-radius:8px;font-weight:bold;border:0;cursor:pointer;font-size:14px}
.red{background:#ed2341;color:white}
.secondary{background:#292932;color:white}
.btn:disabled{opacity:.5;cursor:not-allowed}
.badge{display:inline-block;background:#301821;color:#ff91a0;padding:7px 11px;border-radius:20px;font-size:12px}
.muted{font-size:13px;color:#9999a8}
.guild-head{display:flex;align-items:center;gap:13px}
.guild-icon{width:58px;height:58px;border-radius:16px;object-fit:cover;background:#25252d}
.actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:15px}
label{display:block;margin:15px 0 7px;color:#ddd}
select,input[type=text]{width:100%;padding:12px;background:#09090e;color:white;border:1px solid #393943;border-radius:8px}
.checks{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}
.checks label{background:#191920;padding:12px;border-radius:8px;margin:0}
.notice{padding:13px;background:#1a1418;border:1px solid #4a2631;border-radius:9px;color:#f0c3cc;line-height:1.8}
hr{border:0;border-top:1px solid #2b2b35;margin:18px 0}
footer{text-align:center;color:#777;padding:25px;font-size:13px}
a{color:inherit}
</style>
</head>
<body>
<header>
<a class="brand" href="/">PW <span>VENOM</span> LOG</a>
${account}
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

async function discordRequest(path, accessToken) {
  const response = await fetch("https://discord.com/api/v10" + path, {
    headers: { Authorization: "Bearer " + accessToken }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error("Discord API request failed");
    error.status = response.status;
    throw error;
  }

  return data;
}

async function getGuilds(req) {
  return discordRequest("/users/@me/guilds", req.session.accessToken);
}

function canManageGuild(guild) {
  try {
    const permissions = BigInt(guild.permissions || "0");
    return (permissions & 0x8n) === 0x8n ||
           (permissions & 0x20n) === 0x20n;
  } catch {
    return false;
  }
}

async function getManagedGuild(req, guildId) {
  if (!/^\d{17,20}$/.test(String(guildId))) {
    const error = new Error("Invalid server ID");
    error.status = 400;
    throw error;
  }

  const guilds = await getGuilds(req);
  const guild = guilds.find(g => g.id === String(guildId));

  if (!guild || !canManageGuild(guild)) {
    const error = new Error("You cannot manage this server");
    error.status = 403;
    throw error;
  }

  return guild;
}

async function botRequest(path, method = "GET", body) {
  if (!BOT_API_URL || !BOT_CONTROL_SECRET) {
    const error = new Error("Bot API is not configured");
    error.status = 503;
    throw error;
  }

  const response = await fetch(BOT_API_URL + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + BOT_CONTROL_SECRET
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(10000)
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.error || "Bot API request failed");
    error.status = response.status;
    throw error;
  }

  return data;
}

function pageError(res, user, message, status = 400) {
  return res.status(status).send(renderPage(
    "تنبيه",
    `<section class="card">
      <h1>تعذر إكمال الطلب</h1>
      <p>${esc(message)}</p>
      <a class="btn red" href="/dashboard">العودة للوحة التحكم</a>
    </section>`,
    user
  ));
}

app.get("/", (req, res) => {
  if (req.session.user) return res.redirect("/dashboard");

  const content = `
    <section class="hero">
      <span class="badge">DISCORD LOG SYSTEM</span>
      <h1>PW <span class="accent">VENOM</span> LOG</h1>
      <p>لوحة تحكم لإدارة نظام اللوق الخاص بسيرفرات Discord.</p>
      <a class="btn red" href="/auth/discord">الدخول عبر Discord</a>
    </section>
    <section class="grid">
      <article class="card"><h2>إدارة السيرفرات</h2><p>عرض السيرفرات التي تملك صلاحية إدارتها.</p></article>
      <article class="card"><h2>نظام اللوق</h2><p>إدارة القنوات وأنواع الأحداث بعد إكمال ربط البوت.</p></article>
      <article class="card"><h2>واجهة احترافية</h2><p>تصميم داكن بلمسات حمراء وهوية PW VENOM LOG.</p></article>
    </section>`;

  res.send(renderPage("الرئيسية", content, null));
});

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

  res.redirect("https://discord.com/oauth2/authorize?" + params.toString());
});

app.get("/auth/callback", async (req, res) => {
  if (req.query.error) {
    return res.status(400).send(renderPage(
      "فشل تسجيل الدخول",
      '<section class="card"><h1>تم إلغاء تسجيل الدخول</h1><a class="btn red" href="/">العودة</a></section>',
      null
    ));
  }

  const { code, state } = req.query;

  if (!code || !state || !req.session.oauthState ||
      state !== req.session.oauthState) {
    return res.status(400).send("Invalid OAuth state. Please try again.");
  }

  delete req.session.oauthState;

  try {
    const tokenResponse = await fetch("https://discord.com/api/v10/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: "authorization_code",
        code: String(code),
        redirect_uri: REDIRECT_URI
      })
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok || !tokenData.access_token) {
      return res.status(400).send(renderPage(
        "خطأ",
        '<section class="card"><h1>تعذر تسجيل الدخول</h1><p>تحقق من إعدادات Discord OAuth2.</p><a class="btn red" href="/">حاول مجددًا</a></section>',
        null
      ));
    }

    const discordUser = await discordRequest(
      "/users/@me",
      tokenData.access_token
    );

    await new Promise((resolve, reject) => {
      req.session.regenerate(err => err ? reject(err) : resolve());
    });

    req.session.user = {
      id: discordUser.id,
      username: discordUser.global_name || discordUser.username,
      avatar: discordUser.avatar
    };
    req.session.accessToken = tokenData.access_token;

    await new Promise((resolve, reject) => {
      req.session.save(err => err ? reject(err) : resolve());
    });

    res.redirect("/dashboard");
  } catch (error) {
    console.error("OAuth callback error:", error.message);
    res.status(500).send(renderPage(
      "خطأ",
      '<section class="card"><h1>حدث خطأ</h1><p>تعذر إكمال تسجيل الدخول.</p><a class="btn red" href="/">العودة</a></section>',
      null
    ));
  }
});

app.get("/dashboard", requireLogin, async (req, res) => {
  try {
    const guilds = await getGuilds(req);
    const manageable = guilds.filter(canManageGuild);

    const cards = manageable.map(guild => `
      <article class="card">
        <div class="guild-head">
          <img class="guild-icon" src="${esc(guildIcon(guild))}" alt="">
          <div>
            <h2>${esc(guild.name)}</h2>
            <span class="muted">ID: ${esc(guild.id)}</span>
          </div>
        </div>
        <p>السيرفر متاح لحسابك للإدارة.</p>
        <div class="actions">
          <a class="btn red" href="/guild/${encodeURIComponent(guild.id)}">إعدادات اللوق</a>
          <a class="btn secondary" target="_blank" rel="noopener noreferrer"
             href="https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(CLIENT_ID)}&permissions=8&scope=bot%20applications.commands&guild_id=${encodeURIComponent(guild.id)}&disable_guild_select=true">
             إضافة البوت
          </a>
        </div>
      </article>`).join("");

    const content = `
      <section class="hero">
        <span class="badge">DASHBOARD</span>
        <h1>مرحبًا ${esc(req.session.user.username)}</h1>
        <p>اختر السيرفر الذي تريد إدارة إعدادات اللوق فيه.</p>
        <p>السيرفرات التي يمكنك إدارتها: <strong>${manageable.length}</strong></p>
      </section>
      ${manageable.length
        ? `<section class="grid">${cards}</section>`
        : '<section class="card"><h2>لا توجد سيرفرات ظاهرة</h2><p>تأكد من صلاحيات حسابك في Discord.</p></section>'}
    `;

    res.send(renderPage("لوحة التحكم", content, req.session.user));
  } catch (error) {
    console.error("Dashboard error:", error.message);
    if (error.status === 401) {
      return req.session.destroy(() => res.redirect("/auth/discord"));
    }
    pageError(res, req.session.user, "تعذر تحميل السيرفرات. حاول تسجيل الدخول مجددًا.", 500);
  }
});

app.get("/guild/:id", requireLogin, async (req, res) => {
  try {
    const guild = await getManagedGuild(req, req.params.id);

    let config = null;
    let apiMessage = "لم يكتمل ربط واجهة API الخاصة بالبوت بعد.";

    try {
      const result = await botRequest(
        "/api/guilds/" + encodeURIComponent(guild.id) + "/config"
      );
      config = result.config || result;
      apiMessage = "";
    } catch (error) {
      console.error("Bot config request:", error.message);
      apiMessage = error.status === 503
        ? "أضف BOT_API_URL وتأكد من BOT_CONTROL_SECRET في Web."
        : "واجهة API الخاصة بالبوت غير جاهزة أو لا يمكن الوصول إليها.";
    }

    const events = [
      ["messageDelete", "حذف الرسائل"],
      ["messageUpdate", "تعديل الرسائل"],
      ["memberJoin", "دخول الأعضاء"],
      ["memberLeave", "خروج الأعضاء"],
      ["memberUpdate", "تغييرات الأعضاء"],
      ["roleUpdate", "تغييرات الرتب"],
      ["channelUpdate", "تغييرات القنوات"],
      ["voiceStateUpdate", "تغييرات الفويس"],
      ["modActions", "أحداث الإدارة"]
    ];

    const enabledEvents = config && Array.isArray(config.events)
      ? config.events
      : [];

    const checks = events.map(([key, label]) => `
      <label>
        <input type="checkbox" name="events" value="${esc(key)}"
          ${enabledEvents.includes(key) ? "checked" : ""}>
        ${esc(label)}
      </label>`).join("");

    const channelId = config && config.channelId ? config.channelId : "";

    const content = `
      <section class="hero">
        <span class="badge">SERVER SETTINGS</span>
        <div class="guild-head">
          <img class="guild-icon" src="${esc(guildIcon(guild))}" alt="">
          <div><h1>${esc(guild.name)}</h1><p>ID: ${esc(guild.id)}</p></div>
        </div>
      </section>
      ${apiMessage ? `<div class="notice">${esc(apiMessage)}</div><br>` : ""}
      <section class="card">
        <h2>إعدادات اللوق</h2>
        <p>أدخل ID قناة اللوق وحدد الأحداث التي تريد تسجيلها.</p>
        <form method="post" action="/guild/${encodeURIComponent(guild.id)}/config">
          <label for="channelId">ID قناة اللوق</label>
          <input id="channelId" name="channelId" type="text"
            inputmode="numeric" pattern="[0-9]{17,20}"
            value="${esc(channelId)}" placeholder="مثال: 123456789012345678" required>
          <label>أنواع الأحداث</label>
          <div class="checks">${checks}</div>
          <div class="actions">
            <button class="btn red" type="submit">حفظ الإعدادات</button>
            <a class="btn secondary" href="/dashboard">رجوع</a>
          </div>
        </form>
      </section>`;

    res.send(renderPage("إعدادات السيرفر", content, req.session.user));
  } catch (error) {
    pageError(
      res,
      req.session.user,
      error.status === 403
        ? "ليس لديك صلاحية إدارة هذا السيرفر."
        : "تعذر فتح إعدادات السيرفر.",
      error.status || 500
    );
  }
});

app.post("/guild/:id/config", requireLogin, async (req, res) => {
  try {
    const guild = await getManagedGuild(req, req.params.id);
    const channelId = String(req.body.channelId || "").trim();

    if (!/^\d{17,20}$/.test(channelId)) {
      return pageError(res, req.session.user, "ID قناة اللوق غير صحيح.", 400);
    }

    const allowedEvents = new Set([
      "messageDelete",
      "messageUpdate",
      "memberJoin",
      "memberLeave",
      "memberUpdate",
      "roleUpdate",
      "channelUpdate",
      "voiceStateUpdate",
      "modActions"
    ]);

    const submitted = Array.isArray(req.body.events)
      ? req.body.events
      : req.body.events ? [req.body.events] : [];

    const events = [...new Set(submitted.filter(e => allowedEvents.has(e)))];

    await botRequest(
      "/api/guilds/" + encodeURIComponent(guild.id) + "/config",
      "PUT",
      { channelId, events }
    );

    res.redirect("/guild/" + encodeURIComponent(guild.id) + "?saved=1");
  } catch (error) {
    console.error("Save config error:", error.message);
    pageError(
      res,
      req.session.user,
      error.status === 403
        ? "ليس لديك صلاحية إدارة هذا السيرفر."
        : "لم تُحفظ الإعدادات. تأكد من أن Bot API يدعم هذا الطلب.",
      error.status || 502
    );
  }
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("pwvenom.sid");
    res.redirect("/");
  });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "PW VENOM LOG Web" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("PW VENOM LOG Web listening on port " + PORT);
});