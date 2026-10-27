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
  console.error("Missing required Discord OAuth variables.");
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
      secure: true,
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000
    }
  })
);

function escapeHTML(value) {
  return String(value || "").replace(/[&<>"']/g, function (char) {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };
    return entities[char];
  });
}

function renderPage(title, content, user) {
  let account = "";

  if (user) {
    account =
      '<div class="account">' +
      '<span>' + escapeHTML(user.username) + '</span>' +
      '<a class="button secondary" href="/logout">تسجيل الخروج</a>' +
      "</div>";
  } else {
    account =
      '<a class="button red" href="/auth/discord">' +
      "تسجيل الدخول عبر Discord</a>";
  }

  return (
    '<!DOCTYPE html>' +
    '<html lang="ar" dir="rtl">' +
    "<head>" +
    '<meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    "<title>" + escapeHTML(title) + " | PW VENOM LOG</title>" +
    "<style>" +
    "*{box-sizing:border-box}" +
    "body{margin:0;background:#08080c;color:#f5f5f5;font-family:Arial,Tahoma,sans-serif}" +
    "header{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:20px 6%;background:#111116;border-bottom:1px solid #29232a}" +
    ".brand{font-size:23px;font-weight:900;color:white;text-decoration:none}" +
    ".brand span{color:#f12642}" +
    ".account{display:flex;align-items:center;gap:12px;flex-wrap:wrap}" +
    ".container{width:92%;max-width:1050px;margin:35px auto}" +
    ".hero{padding:32px;background:linear-gradient(135deg,#241017,#111116 75%);border:1px solid #4b202b;border-radius:16px;margin-bottom:24px}" +
    "h1{font-size:clamp(28px,5vw,44px);margin-top:10px}" +
    "p{color:#b9b9c4;line-height:1.8}" +
    ".grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}" +
    ".card{background:#121218;border:1px solid #2b2b34;border-radius:13px;padding:22px;overflow-wrap:anywhere}" +
    ".card h2{font-size:19px}" +
    ".button{display:inline-block;text-decoration:none;padding:12px 16px;border-radius:8px;font-weight:bold;border:0;cursor:pointer}" +
    ".red{background:#ed2341;color:white}" +
    ".secondary{background:#292932;color:white}" +
    ".badge{display:inline-block;background:#2c1820;color:#ff8495;padding:7px 11px;border-radius:20px;font-size:12px}" +
    ".muted{font-size:13px;color:#9696a4}" +
    "footer{text-align:center;color:#777;padding:28px;font-size:13px}" +
    "a{color:inherit}" +
    "</style>" +
    "</head>" +
    "<body>" +
    "<header>" +
    '<a class="brand" href="/">PW <span>VENOM</span> LOG</a>' +
    account +
    "</header>" +
    '<main class="container">' + content + "</main>" +
    "<footer>PW VENOM LOG &bull; Discord Logging Dashboard</footer>" +
    "</body></html>"
  );
}

function requireLogin(req, res, next) {
  if (!req.session.user || !req.session.accessToken) {
    return res.redirect("/auth/discord");
  }

  next();
}

app.get("/", function (req, res) {
  if (req.session.user) {
    return res.redirect("/dashboard");
  }

  const content =
    '<section class="hero">' +
    '<span class="badge">DISCORD LOG SYSTEM</span>' +
    "<h1>PW <span style=\"color:#f12642\">VENOM</span> LOG</h1>" +
    "<p>مرحبًا بك في لوحة تحكم اللوق الخاصة بسيرفرات Discord.</p>" +
    '<a class="button red" href="/auth/discord">تسجيل الدخول عبر Discord</a>' +
    "</section>" +
    '<section class="grid">' +
    '<div class="card"><h2>إدارة السيرفرات</h2><p>عرض السيرفرات التي تستطيع إدارتها.</p></div>' +
    '<div class="card"><h2>نظام اللوق</h2><p>جهّز لوحة التحكم لربطها ببوت اللوق الخاص بك.</p></div>' +
    '<div class="card"><h2>تصميم احترافي</h2><p>واجهة داكنة بلمسات حمراء.</p></div>' +
    "</section>";

  res.send(renderPage("الرئيسية", content, null));
});

app.get("/auth/discord", function (req, res) {
  const state = crypto.randomBytes(24).toString("hex");
  req.session.oauthState = state;

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: "identify guilds",
    state: state
  });

  res.redirect(
    "https://discord.com/oauth2/authorize?" + params.toString()
  );
});

app.get("/auth/callback", async function (req, res) {
  const code = req.query.code;
  const state = req.query.state;

  if (req.query.error) {
    return res.status(400).send(
      renderPage(
        "فشل تسجيل الدخول",
        '<section class="card"><h1>تم إلغاء تسجيل الدخول</h1>' +
          '<a class="button red" href="/">العودة للرئيسية</a></section>',
        null
      )
    );
  }

  if (
    !code ||
    !state ||
    !req.session.oauthState ||
    state !== req.session.oauthState
  ) {
    return res.status(400).send("Invalid OAuth state. Please try again.");
  }

  delete req.session.oauthState;

  try {
    const tokenResponse = await fetch(
      "https://discord.com/api/v10/oauth2/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          grant_type: "authorization_code",
          code: String(code),
          redirect_uri: REDIRECT_URI
        })
      }
    );

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok || !tokenData.access_token) {
      console.error("Discord OAuth token request failed.");
      return res.status(400).send(
        renderPage(
          "خطأ",
          '<section class="card"><h1>تعذر تسجيل الدخول</h1>' +
            "<p>تحقق من إعدادات Discord OAuth2 في Railway.</p>" +
            '<a class="button red" href="/">حاول مجددًا</a></section>',
          null
        )
      );
    }

    const userResponse = await fetch(
      "https://discord.com/api/v10/users/@me",
      {
        headers: {
          Authorization: "Bearer " + tokenData.access_token
        }
      }
    );

    if (!userResponse.ok) {
      throw new Error("Could not retrieve Discord user.");
    }

    const discordUser = await userResponse.json();

    await new Promise(function (resolve, reject) {
      req.session.regenerate(function (err) {
        if (err) return reject(err);
        resolve();
      });
    });

    req.session.user = {
      id: discordUser.id,
      username: discordUser.global_name || discordUser.username,
      avatar: discordUser.avatar
    };

    req.session.accessToken = tokenData.access_token;

    await new Promise(function (resolve, reject) {
      req.session.save(function (err) {
        if (err) return reject(err);
        resolve();
      });
    });

    res.redirect("/dashboard");
  } catch (error) {
    console.error("OAuth callback error:", error.message);

    res.status(500).send(
      renderPage(
        "خطأ",
        '<section class="card"><h1>حدث خطأ</h1>' +
          "<p>تعذر إكمال تسجيل الدخول. حاول مرة أخرى.</p>" +
          '<a class="button red" href="/">العودة</a></section>',
        null
      )
    );
  }
});

app.get("/dashboard", requireLogin, async function (req, res) {
  try {
    const guildResponse = await fetch(
      "https://discord.com/api/v10/users/@me/guilds",
      {
        headers: {
          Authorization: "Bearer " + req.session.accessToken
        }
      }
    );

    if (guildResponse.status === 401) {
      return req.session.destroy(function () {
        res.redirect("/auth/discord");
      });
    }

    if (!guildResponse.ok) {
      throw new Error("Could not retrieve Discord servers.");
    }

    const guilds = await guildResponse.json();

    const manageableGuilds = guilds.filter(function (guild) {
      const permissions = BigInt(guild.permissions || "0");
      const administrator = 0x8n;
      const manageGuild = 0x20n;

      return (
        (permissions & administrator) === administrator ||
        (permissions & manageGuild) === manageGuild
      );
    });

    let guildCards = "";

    for (const guild of manageableGuilds) {
      guildCards +=
        '<article class="card">' +
        '<span class="badge">سيرفر Discord</span>' +
        "<h2>" + escapeHTML(guild.name) + "</h2>" +
        '<p class="muted">Server ID: ' + escapeHTML(guild.id) + "</p>" +
        "<p>لديك صلاحية إدارة هذا السيرفر.</p>" +
        "<hr>" +
        "<p>إعدادات اللوق تحتاج إلى ربط لوحة التحكم بالبوت.</p>" +
        '<span class="badge">الربط بالبوت: لم يكتمل</span>' +
        "</article>";
    }

    let content =
      '<section class="hero">' +
      '<span class="badge">DASHBOARD</span>' +
      "<h1>مرحبًا " + escapeHTML(req.session.user.username) + "</h1>" +
      "<p>تم تسجيل الدخول بنجاح إلى PW VENOM LOG.</p>" +
      "</section>" +
      "<h2>السيرفرات التي يمكنك إدارتها</h2>";

    if (manageableGuilds.length > 0) {
      content += '<section class="grid">' + guildCards + "</section>";
    } else {
      content +=
        '<section class="card"><h2>لا توجد سيرفرات ظاهرة</h2>' +
        "<p>تأكد من أنك تملك صلاحية إدارة سيرفر Discord.</p></section>";
    }

    content +=
      '<p class="muted">عدد السيرفرات: ' +
      manageableGuilds.length +
      "</p>";

    res.send(renderPage("لوحة التحكم", content, req.session.user));
  } catch (error) {
    console.error("Dashboard error:", error.message);

    res.status(500).send(
      renderPage(
        "خطأ",
        '<section class="card"><h1>تعذر تحميل السيرفرات</h1>' +
          '<a class="button red" href="/auth/discord">إعادة تسجيل الدخول</a></section>',
        req.session.user
      )
    );
  }
});

app.get("/logout", function (req, res) {
  req.session.destroy(function () {
    res.clearCookie("pwvenom.sid");
    res.redirect("/");
  });
});

app.get("/health", function (req, res) {
  res.json({
    status: "ok",
    service: "PW VENOM LOG Web"
  });
});

app.listen(PORT, "0.0.0.0", function () {
  console.log("PW VENOM LOG Web listening on port " + PORT);
});