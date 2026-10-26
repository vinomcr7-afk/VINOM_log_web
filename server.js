
require("dotenv").config();

const express = require("express");
const session = require("express-session");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "change-this-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 24 * 60 * 60 * 1000
    }
  })
);

app.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>PW VENOM LOGS</title>
      <style>
        * { box-sizing: border-box; }
        body {
          margin: 0;
          min-height: 100vh;
          background: #07090d;
          color: #f5f5f5;
          font-family: Arial, sans-serif;
          display: flex;
          align-items: center;
          justify-content: center;
          text-align: center;
        }
        .card {
          width: 90%;
          max-width: 460px;
          padding: 36px 24px;
          background: #10141c;
          border: 1px solid #292f3a;
          border-radius: 20px;
          box-shadow: 0 0 35px #b0000022;
        }
        .logo {
          color: #ff3030;
          font-size: 32px;
          font-weight: 900;
          letter-spacing: 2px;
        }
        p { color: #aab2c0; line-height: 1.7; }
        .status {
          margin: 24px 0;
          padding: 12px;
          background: #191f29;
          border-radius: 10px;
          color: #ff5555;
        }
        .button {
          display: block;
          padding: 14px;
          border-radius: 10px;
          background: #b51220;
          color: white;
          text-decoration: none;
          font-weight: bold;
        }
        .note { font-size: 12px; margin-top: 20px; }
      </style>
    </head>
    <body>
      <main class="card">
        <div class="logo">🕷 PW VENOM</div>
        <h1>LOGS DASHBOARD</h1>
        <p>Manage your Discord server logs from one place.</p>
        <div class="status">Dashboard starting up</div>
        <a class="button" href="/login">Login with Discord</a>
        <p class="note">Secure dashboard • PW VENOM LOGS</p>
      </main>
    </body>
    </html>
  `);
});

app.get("/login", (req, res) => {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const redirectUri = process.env.DISCORD_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return res.status(503).send(
      "Discord login is not configured yet. Set DISCORD_CLIENT_ID and DISCORD_REDIRECT_URI in Railway."
    );
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "identify guilds"
  });

  res.redirect(
    "https://discord.com/oauth2/authorize?" + params.toString()
  );
});

app.get("/auth/callback", async (req, res) => {
  const { code, error } = req.query;

  if (error || !code) {
    return res.status(400).send("Discord login was cancelled.");
  }

  try {
    const redirectUri = process.env.DISCORD_REDIRECT_URI;

    const tokenResponse = await axios.post(
      "https://discord.com/api/oauth2/token",
      new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri
      }).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        }
      }
    );

    const accessToken = tokenResponse.data.access_token;

    const userResponse = await axios.get(
      "https://discord.com/api/users/@me",
      {
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    );

    req.session.user = userResponse.data;
    req.session.accessToken = accessToken;

    res.redirect("/dashboard");
  } catch (error) {
    console.error("Discord login error:", error.response?.data || error.message);
    res.status(500).send("Discord login failed. Check the Railway logs.");
  }
});

app.get("/dashboard", async (req, res) => {
  if (!req.session.user || !req.session.accessToken) {
    return res.redirect("/login");
  }

  try {
    const response = await axios.get(
      "https://discord.com/api/users/@me/guilds",
      {
        headers: {
          Authorization: `Bearer ${req.session.accessToken}`
        }
      }
    );

    const guilds = response.data;
    const cards = guilds.map(guild => `
      <div class="guild">
        <strong>${escapeHtml(guild.name)}</strong>
        <p>${guild.owner ? "Owner" : "Server member"}</p>
        <span>${guild.permissions}</span>
      </div>
    `).join("");

    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>PW VENOM Dashboard</title>
        <style>
          body { margin:0; padding:24px; background:#07090d; color:#fff; font-family:Arial,sans-serif; }
          .top { max-width:900px; margin:20px auto; }
          h1 { color:#ff3030; }
          .guild { background:#121722; border:1px solid #292f3a; border-radius:12px; padding:18px; margin:12px 0; }
          .guild p { color:#aab2c0; }
          a { color:#ff6060; }
        </style>
      </head>
      <body>
        <main class="top">
          <h1>🕷 PW VENOM LOGS</h1>
          <p>Welcome, ${escapeHtml(req.session.user.username)}!</p>
          <h2>Your Discord servers</h2>
          ${cards || "<p>No servers were returned by Discord.</p>"}
          <p><a href="/logout">Log out</a></p>
        </main>
      </body>
      </html>
    `);
  } catch (error) {
    console.error("Guild list error:", error.response?.data || error.message);
    res.status(500).send("Could not load your servers. Please log in again.");
  }
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`PW VENOM LOGS website listening on port ${PORT}`);
});
