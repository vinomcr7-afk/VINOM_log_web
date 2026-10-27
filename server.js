const express = require("express");
const session = require("express-session");
const axios = require("axios");
const crypto = require("crypto");

const app = express();
app.set("trust proxy", 1);
app.use(express.urlencoded({ extended: false, limit: "20kb" }));

const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const REDIRECT_URI =
  process.env.DISCORD_REDIRECT_URI ||
  "https://vinomlogweb-production.up.railway.app/auth/callback";
const SESSION_SECRET = process.env.SESSION_SECRET;

app.use(session({
  name: "pwvenom.sid",
  secret: SESSION_SECRET || crypto.randomBytes(32).toString("hex"),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 24 * 60 * 60 * 1000
  }
}));

const esc = (v = "") =>
  String(v).replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));

function page(title, body, user = null) {
  const avatar = user?.avatar
    ? `https://cdn.discordapp.com/avatars/${encodeURIComponent(user.id)}/${encodeURIComponent(user.avatar)}.png?size=64`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#090909">
<title>${esc(title)} | PW VENOM LOGS</title>
<style>
*{box-sizing:border-box}
body{margin:0;background:#080808;color:#f6f6f6;font-family:Arial,Helvetica,sans-serif}
header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 5%;border-bottom:1px solid #282828;background:#0c0c0c}
.brand{font-weight:900;letter-spacing:1px;color:#ff243b;text-decoration:none;font-size:20px}
.user{display:flex;align-items:center;gap:9px;font-size:13px;color:#ddd}
.user img{width:32px;height:32px;border-radius:50%}
main{max-width:1000px;margin:36px auto;padding:0 18px}
.hero,.box{background:linear-gradient(145deg,#171717,#0f0f0f);border:1px solid #343434;border-radius:18px;padding:26px;margin:16px 0;box-shadow:0 12px 40px #0008}
h1{font-size:clamp(28px,6vw,46px);margin:0 0 12px}
h1 span,.red{color:#ff243b}
p{color:#c5c5c5;line-height:1.6}
.btn{display:inline-block;background:#e31832;color:white;border:0;border-radius:9px;padding:12px 17px;text-decoration:none;font-weight:700;cursor:pointer;margin:5px 5px 5px 0}
.btn.secondary{background:#222;border:1px solid #444}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px}
.server{display:flex;align-items:center;gap:14px}
.server img,.placeholder{width:58px;height:58px;border-radius:15px;object-fit:cover;background:#292929;display:grid;place-items:center;font-size:22px}
.server h3{margin:0 0 10px;overflow-wrap:anywhere}
.muted{font-size:13px;color:#999}
.notice{border-left:3px solid #ff243b;padding:10px 14px;background:#211014;color:#ddd;border-radius:5px}
.footer{text-align:center;color:#777;padding:28px;font-size:12px}
a{color:#ff5366}
</style>
</head>
<body>
<header>
<a class="brand" href="/">🕷 PW VENOM LOGS</a>
${user
  ? `<div class="user">${avatar ? `<img src="${avatar}" alt="">` : ""}<span>${esc(user.username)}<br><span class="muted">Discord account</span></span></div>`
  : `<span class="muted">DISCORD SERVER MANAGEMENT</span>`}
</header>
<main>${body}</main>
<div class="footer">PW VENOM LOGS • Secure Discord server tools</div>
</body>
</html>`;
}

function requireLogin(req, res, next) {
  if (!req.session.user || !req.session.accessToken) {
    return res.redirect("/login");
  }
  next();
}

function canManageGuild(guild) {
  try {
    const p = BigInt(guild.permissions || "0");
    return (p & 0x20n) === 0x20n || (p & 0x8n) === 0x8n;
  } catch {
    return false;
  }
}

async function discordGet(req, endpoint) {
  const response = await axios.get(
    `https://discord.com/api/v10${endpoint}`,
    {
      headers: {
        Authorization: `Bearer ${req.session.accessToken}`
      },
      timeout: 10000
    }
  );
  return response.data;
}

app.get("/", (req, res) => {
  const user = req.session.user;

  const body = `
<section class="hero">
<p class="red">DISCORD LOGGING CONTROL PANEL</p>
<h1>Control your server.<br><span>Own the logs.</span></h1>
<p>Manage your Discord logging setup with a dark, clean PW VENOM interface.</p>
${user
  ? `<a class="btn" href="/dashboard">Open Dashboard</a>`
  : `<a class="btn" href="/login">Login with Discord</a>`}
<a class="btn secondary" href="/invite">➕ Add Bot</a>
</section>

<section class="box">
<h2>PW VENOM features</h2>
<div class="grid">
<div><h3>🔐 Discord Login</h3><p>Sign in with your Discord account.</p></div>
<div><h3>🧾 Server Dashboard</h3><p>See servers where you have Manage Server or Administrator permission.</p></div>
<div><h3>🕷️ Log Controls</h3><p>Connect the dashboard to the bot API to configure log channels and categories.</p></div>
</div>
<p class="notice">Log settings need the bot API before they can be changed from the website.</p>
</section>`;

  res.send(page("Home", body, user));
});

app.get("/login", (req, res) => {
  if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
    return res.status(500).send(page(
      "Configuration error",
      `<section class="box">
      <h1>Configuration needed</h1>
      <p>Set DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET and DISCORD_REDIRECT_URI in Railway Variables.</p>
      </section>`
    ));
  }

  const state = crypto.randomBytes(24).toString("hex");
  req.session.oauthState = state;

  const url = new URL("https://discord.com/oauth2/authorize");
  url.searchParams.set("client_id", CLIENT_ID);
  url.searchParams.set("redirect_uri", REDIRECT_URI);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "identify guilds");
  url.searchParams.set("state", state);

  res.redirect(url.toString());
});

app.get("/auth/callback", async (req, res) => {
  try {
    if (
      !req.query.code ||
      !req.query.state ||
      !req.session.oauthState ||
      req.query.state !== req.session.oauthState
    ) {
      return res.status(400).send(page(
        "Login error",
        `<section class="box">
        <h1>Login could not be verified</h1>
        <p>Return home and try again.</p>
        <a class="btn" href="/">Home</a>
        </section>`
      ));
    }

    delete req.session.oauthState;

    const tokenResponse = await axios.post(
      "https://discord.com/api/v10/oauth2/token",
      new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: "authorization_code",
        code: String(req.query.code),
        redirect_uri: REDIRECT_URI
      }).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        timeout: 10000
      }
    );

    const token = tokenResponse.data.access_token;

    const [userResponse, guildResponse] = await Promise.all([
      axios.get("https://discord.com/api/v10/users/@me", {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10000
      }),
      axios.get("https://discord.com/api/v10/users/@me/guilds", {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10000
      })
    ]);

    req.session.user = userResponse.data;
    req.session.accessToken = token;
    req.session.guilds = guildResponse.data.filter(canManageGuild);

    req.session.save(() => res.redirect("/dashboard"));
  } catch (error) {
    console.error(
      "Discord OAuth error:",
      error.response?.data || error.message
    );

    res.status(500).send(page(
      "Login error",
      `<section class="box">
      <h1>Discord login failed</h1>
      <p>Check the OAuth settings and exact redirect URL in Railway and Discord Developer Portal.</p>
      <a class="btn" href="/">Try again</a>
      </section>`
    ));
  }
});

app.get("/dashboard", requireLogin, async (req, res) => {
  try {
    const guilds = (
      await discordGet(req, "/users/@me/guilds")
    ).filter(canManageGuild);

    req.session.guilds = guilds;

    const cards = guilds.map(guild => {
      const icon = guild.icon
        ? `https://cdn.discordapp.com/icons/${encodeURIComponent(guild.id)}/${encodeURIComponent(guild.icon)}.png?size=128`
        : "";

      return `
<article class="box server">
${icon
  ? `<img src="${icon}" alt="">`
  : `<div class="placeholder">🛡️</div>`}
<div style="min-width:0;flex:1">
<h3>${esc(guild.name)}</h3>
<div class="muted">Server ID: ${esc(guild.id)}</div>
<a class="btn" href="/server/${encodeURIComponent(guild.id)}">Open Settings</a>
</div>
</article>`;
    }).join("");

    const body = `
<section class="hero">
<p class="red">YOUR CONTROL PANEL</p>
<h1>My <span>Servers</span></h1>
<p>Select a server to continue.</p>
<a class="btn" href="/invite">➕ Add Bot</a>
<a class="btn secondary" href="/logout">Logout</a>
</section>
${guilds.length
  ? `<div class="grid">${cards}</div>`
  : `<section class="box">
  <h2>No manageable servers found</h2>
  <p>Make sure your account has Manage Server or Administrator permission.</p>
  <a class="btn" href="/invite">Add Bot to a Server</a>
  </section>`}`;

    res.send(page("Dashboard", body, req.session.user));
  } catch (error) {
    console.error(
      "Guild list error:",
      error.response?.data || error.message
    );

    res.status(500).send(page(
      "Dashboard error",
      `<section class="box">
      <h1>Could not load servers</h1>
      <p>Log out and sign in again, then retry.</p>
      <a class="btn" href="/logout">Logout</a>
      </section>`,
      req.session.user
    ));
  }
});

app.get("/invite", (req, res) => {
  const url = new URL("https://discord.com/oauth2/authorize");

  url.searchParams.set(
    "client_id",
    CLIENT_ID || "1564305371592401077"
  );
  url.searchParams.set("permissions", "268520448");
  url.searchParams.set("integration_type", "0");
  url.searchParams.set("scope", "bot applications.commands");

  res.redirect(url.toString());
});

app.get("/server/:id", requireLogin, async (req, res) => {
  try {
    const guilds = (
      await discordGet(req, "/users/@me/guilds")
    ).filter(canManageGuild);

    const guild = guilds.find(g => g.id === req.params.id);

    if (!guild) {
      return res.status(403).send(page(
        "Forbidden",
        `<section class="box">
        <h1>Access denied</h1>
        <p>You need Manage Server or Administrator permission in this server.</p>
        <a class="btn" href="/dashboard">Back</a>
        </section>`,
        req.session.user
      ));
    }

    const body = `
<section class="hero">
<p class="red">SERVER SETTINGS</p>
<h1>${esc(guild.name)}</h1>
<p>Server ID: ${esc(guild.id)}</p>
<p class="notice">The website layout is ready, but log controls need the bot API added to index.js before they can save settings.</p>
<a class="btn" href="/dashboard">← Back to servers</a>
<a class="btn secondary" href="/invite">Add Bot</a>
</section>
<section class="box">
<h2>Log configuration</h2>
<p>After connecting the bot API, this page can provide channel selection, log category toggles, and staff-role permissions. Settings are not saved until the bot API is connected.</p>
</section>`;

    res.send(page("Server Settings", body, req.session.user));
  } catch (error) {
    console.error(
      "Server page error:",
      error.response?.data || error.message
    );

    res.status(500).send(page(
      "Error",
      `<section class="box">
      <h1>Could not open server</h1>
      <a class="btn" href="/dashboard">Back</a>
      </section>`,
      req.session.user
    ));
  }
});

app.get("/health", (req, res) => {
  res.json({ ok: true, app: "PW VENOM LOGS" });
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("pwvenom.sid");
    res.redirect("/");
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`PW VENOM LOGS running on port ${PORT}`);
});