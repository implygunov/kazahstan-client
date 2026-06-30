const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const { init } = require('./database');
const db = require('./database');
const config = require('./config');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Перед каждым запросом к API перечитываем данные из MySQL,
// чтобы правки из phpMyAdmin сразу отражались на сайте, а память была свежей.
app.use('/api', async (req, res, next) => {
  if (req.method !== 'GET') return next();
  try {
    await db.reload();
    next();
  } catch (e) {
    console.error('[db] reload error:', e.message);
    res.status(503).json({ error: 'db_unavailable' });
  }
});

app.use('/api', require('./routes/auth'));
app.use('/api', require('./routes/profile'));
app.use('/api', require('./routes/keys'));
app.use('/api', require('./routes/promocodes'));
app.use('/api', require('./routes/tickets'));
app.use('/api', require('./routes/stats'));
app.use('/api', require('./routes/admin'));
app.use('/api', require('./routes/payments'));
app.use('/api', require('./routes/download'));
app.use('/api', require('./routes/loader'));

// ── Release manifest for the native Kazahstan DLC (release_service.cpp) ──
// The loader GETs this, then downloads files.zip (base game) and the protected
// jar from the ABSOLUTE urls below. Big files live on a CDN (GitHub Releases /
// Cloudflare R2) — set the urls via env on Render. Bump *_version to force a
// re-download on clients.
app.get('/launcher_storage/release/manifest.json', (req, res) => {
  const base = process.env.SITE_BASE || 'https://kazahstan-client-1.onrender.com';
  res.json({
    version: process.env.GAME_VERSION || '1.21.4',
    files_version: process.env.FILES_VERSION || '2026.06.30',
    files_zip_url: process.env.FILES_ZIP_URL || (base + '/launcher_storage/release/files.zip'),
    client_version: process.env.CLIENT_VERSION || '2.4.0',
    client_jar_url: process.env.CLIENT_JAR_URL || (base + '/launcher_storage/release/Kazahstan-obf-2.4.jar'),
    host_relative_path: process.env.HOST_RELATIVE_PATH || 'builds/Aura/game/versions/Fabric 1.21.4/1.21.4.exe',
    jar_relative_path: process.env.JAR_RELATIVE_PATH || 'builds/Aura/game/mods/Kazahstan-obf-2.4.jar',
  });
});

app.use(express.static(path.join(__dirname, '..'), {
  index: false,
  setHeaders: (res, filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.html') res.set('Content-Type', 'text/html; charset=utf-8');
    else if (ext === '.css') res.set('Content-Type', 'text/css; charset=utf-8');
    else if (ext === '.js') res.set('Content-Type', 'application/javascript; charset=utf-8');
    else if (ext === '.svg') res.set('Content-Type', 'image/svg+xml; charset=utf-8');
  }
}));

function sendIndex(res) {
  let html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  if (config.TURNSTILE_SITEKEY) {
    const inject = `<script>window.__TS_SITEKEY__=${JSON.stringify(config.TURNSTILE_SITEKEY)};</script>`;
    html = html.replace('</head>', inject + '</head>');
  }
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
}

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  sendIndex(res);
});

init()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Kazahstan Client Server running at http://localhost:${PORT}`);
    });
  })
  .catch((e) => {
    console.error('Не удалось подключиться к MySQL:', e.message);
    process.exit(1);
  });
