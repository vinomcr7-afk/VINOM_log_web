const express = require("express");
const session = require("express-session");
const axios = require("axios");
const path = require("path");

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || "change-this-secret",
  resave: false,
  saveUninitialized: false,
  cookie: { secure: "auto", maxAge: 86400000 }
}));

app.use(express.static(path.join(__dirname, "public")));

const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const REDIRECT_URI = process.env.DISCORD_REDIRECT_URI;

app.get("/", (req, res) => {
  res.send(`
  <html>
  <head>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>PW VENOM LOGS</title>
  <style>
  body{background:#080808;color:white;font-family:Arial;text-align:center;padding:30px}
  h1{color:#e00020;font-size:35px}
  .box{background:#171717;border:1px solid #e00020;border-radius:15px;padding:25px;margin:20px auto;max-width:500px}
  a,button{display:inline-block;background:#d00020;color:white;padding:14px 20px;border-radius:8px;text-decoration:none;border:0;font-size:16px}
  </style>
  </head>
  <body>
  <div class="box">
  <h1>🕷️ PW VENOM LOGS</h1>
  <p>Discord Server Management</p>
  <p>لوحة تحكم لوغات ديسكورد</p>
  <a href="/login">Login with Discord</a>
  </div>
  </body>
  </html>
  `);
});

app.get("/login", (req, res) => {
  if (!CLIENT_ID || !REDIRECT_URI) {
    return res.status(500).send("Configure Discord OAuth variables in Railway.");
  }

  const url = new URL("https://discord.com/oauth2/authorize");
  url.searchParams.set("client_id", CLIENT_ID);
  url.searchParams.set("redirect_uri", REDIRECT_URI);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "identify guilds");

  res.redirect(url.toString());
});

app.get("/auth/callback", async (req, res) => {
  try {
    if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
      return res.status(500).send("Discord OAuth settings are missing.");
    }

    const tokenResponse = await axios.post(
      "https://discord.com/api/oauth2/token",
      new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: "authorization_code",
        code: req.query.code,
        redirect_uri: REDIRECT_URI
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const userResponse = await axios.get(
      "https://discord.com/api/users/@me",
      { headers: { Authorization: `Bearer ${tokenResponse.data.access_token}` } }
    );

    const guildResponse = await axios.get(
      "https://discord.com/api/users/@me/guilds",
      { headers: { Authorization: `Bearer ${tokenResponse.data.access_token}` } }
    );

    req.session.user = userResponse.data;
    req.session.guilds = guildResponse.data.filter(guild =>
      (Number(guild.permissions) & 0x20) === 0x20
    );

    res.redirect("/dashboard");
  } catch (error) {
    console.error("Discord login error:", error.response?.data || error.message);
    res.status(500).send("Discord login failed. Check OAuth settings in Railway.");
  }
});

app.get("/dashboard", (req, res) => {
  if (!req.session.user) return res.redirect("/login");

  const guilds = req.session.guilds || [];

  const cards = guilds.map(guild => {
    const icon = guild.icon
      ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png`
      : "";

    return `
      <div class="box">
        ${icon ? `<img src="${icon}" width="80" height="80" style="border-radius:50%">` : ""}
        <h3>${escapeHtml(guild.name)}</h3>
        <a href="/server/${encodeURIComponent(guild.id)}">Open Settings</a>
      </div>`;
  }).join("");

  res.send(`
    <html><head><meta name="viewport" content="width=device-width, initial-scale=1">
    <title>PW VENOM LOGS</title>
    <style>
    body{background:#080808;color:white;font-family:Arial;text-align:center;padding:20px}
    h1{color:#e00020}.box{background:#171717;border:1px solid #e00020;border-radius:15px;padding:20px;margin:15px auto;max-width:500px}
    a{display:inline-block;background:#d00020;color:white;padding:12px;border-radius:8px;text-decoration:none}
    </style></head><body>
    <h1>🕷️ PW VENOM LOGS</h1>
    <p>Welcome ${escapeHtml(req.session.user.username)}</p>
    ${cards || "<p>لم نجد سيرفرات تملك فيها صلاحية Manage Server.</p>"}
    <a href="/logout">Logout</a>
    </body></html>
  `);
});

app.get("/server/:id", (req, res) => {
  if (!req.session.user) return res.redirect("/login");

  const guild = (req.session.guilds || []).find(g => g.id === req.params.id);
  if (!guild) return res.status(403).send("You do not have permission to manage this server.");

  res.send(`
    <html><head><meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
    body{background:#080808;color:white;font-family:Arial;text-align:center;padding:25px}
    h1{color:#e00020}.box{background:#171717;padding:20px;border:1px solid #e00020;border-radius:12px}
    a{color:#ff3348}
    </style></head><body>
    <div class="box">
    <h1>🕷️ ${escapeHtml(guild.name)}</h1>
    <p>إعدادات لوغات السيرفر</p>
    <p>ربط روم اللوغات وحفظ الإعدادات يحتاج إلى إكمال ربط البوت.</p>
    <a href="/dashboard">رجوع</a>
    </div></body></html>
  `);
});

app.get("/health", (req, res) => {
  res.json({ ok: true, app: "PW VENOM LOGS" });
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;",
    '"': "&quot;", "'": "&#39;"
  }[char]));
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`PW VENOM LOGS running on port ${PORT}`);
});