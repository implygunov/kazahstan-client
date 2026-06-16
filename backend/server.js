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

// Отдаём index.html, подставляя публичный Site Key Turnstile из .env (TURNSTILE_SITEKEY).
// Фронт читает его из window.__TS_SITEKEY__; если ключ не задан — используется встроенный по умолчанию.
function sendIndex(res) {
  let html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  if (config.TURNSTILE_SITEKEY) {
    const inject = `<script>window.__TS_SITEKEY__=${JSON.stringify(config.TURNSTILE_SITEKEY)};</script>\n    `;
    html = html.replace('<script type="module"', inject + '<script type="module"');
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
