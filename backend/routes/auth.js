const { Router } = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { data, save, nextId } = require('../database');
const { JWT_SECRET, authMiddleware, logAction } = require('../middleware');
const { TURNSTILE_SECRET } = require('../config');
const config = require('../config');

const router = Router();

// Проверка токена Cloudflare Turnstile на сервере.
// Если секрет не задан (.env пустой) — пропускаем, чтобы не блокировать вход.
async function verifyCaptcha(token, ip) {
  if (!TURNSTILE_SECRET) return true;
  if (!token) return false;
  try {
    const body = new URLSearchParams({ secret: TURNSTILE_SECRET, response: token });
    if (ip) body.append('remoteip', ip);
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const result = await r.json();
    return !!result.success;
  } catch (e) {
    return false;
  }
}

router.post('/login', async (req, res) => {
  const { login, password, captchaToken } = req.body;
  if (!login || !password) return res.status(400).json({ error: 'empty_fields' });
  if (!(await verifyCaptcha(captchaToken, req.ip))) return res.status(400).json({ error: 'captcha_failed' });
  const user = data.users.find(u => u.username === login || u.email === login);
  if (!user) return res.status(400).json({ error: 'user_not_found' });
  if (!bcrypt.compareSync(password, user.password)) return res.status(400).json({ error: 'wrong_password' });
  if (user.role === 'BANNED') return res.status(403).json({ error: 'banned' });
  const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: { id: user.id, username: user.username, role: user.role }, userId: user.id });
});

router.post('/register', async (req, res) => {
  const { username, email, password, captchaToken } = req.body;
  if (!username || !email || !password) return res.status(400).json({ error: 'empty_fields' });
  if (!(await verifyCaptcha(captchaToken, req.ip))) return res.status(400).json({ error: 'captcha_failed' });
  if (data.users.find(u => u.username === username)) return res.status(400).json({ error: 'username_exists' });
  if (data.users.find(u => u.email === email)) return res.status(400).json({ error: 'email_exists' });
  const hashed = bcrypt.hashSync(password, 10);
  const user = {
    id: nextId('users'),
    username,
    email,
    password: hashed,
    role: 'DEFAULT',
    hwid: null,
    subscription_until: null,
    premium_until: null,
    ram: 2048,
    created_at: new Date().toISOString(),
  };
  data.users.push(user);
  data.stats.users = data.users.length;
  save();
  const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: { id: user.id, username: user.username, role: user.role }, userId: user.id });
});

router.get('/profile/:id', authMiddleware, (req, res) => {
  const user = data.users.find(u => u.id === parseInt(req.params.id) || u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'user_not_found' });
  const now = new Date();
  const sub = user.subscription_until ? new Date(user.subscription_until) > now : false;
  const prem = user.premium_until ? new Date(user.premium_until) > now : false;
  res.json({
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      hwid: user.hwid,
      subscription_until: user.subscription_until,
      premium_until: user.premium_until,
      ram: user.ram || 2048,
      created_at: user.created_at,
    },
    subscriptionActive: sub || ['ADMIN', 'DEVELOPER', 'MODERATOR'].includes(user.role),
    premiumActive: prem || ['ADMIN', 'DEVELOPER', 'MODERATOR'].includes(user.role),
  });
});

// ── Логин для лаунчера (KazahstanLoader, C#) ──
// Лаунчер шлёт { login, password, hwid } и ждёт ответ в своём формате:
//   успех:  { allowed: true, username, role, ram, subTime, uid }
//   отказ:  { allowed: false, error: "<сообщение>" }
// Капча тут не нужна — десктоп-клиент не проходит Turnstile.
const PRIVILEGED = ['ADMIN', 'DEVELOPER', "YOUTUBE", "MODERATOR", "USER", "BETA", "PREMIUM", 'MODERATOR'];

router.post('/launcher/login', (req, res) => {
  const { login, password, hwid } = req.body || {};
  if (!login || !password) return res.json({ allowed: false, error: 'User not found' });

  const user = data.users.find(u => u.username === login || u.email === login);
  if (!user) return res.json({ allowed: false, error: 'User not found' });
  if (!bcrypt.compareSync(password, user.password)) return res.json({ allowed: false, error: 'Wrong password' });
  if (user.role === 'BANNED') return res.json({ allowed: false, error: 'User is banned' });

  // Проверка техработ: блокируем вход, кроме привилегированных ролей и bypass-списка
  const MAINTENANCE_BYPASS_ROLES = ['ADMIN', 'DEVELOPER', 'YOUTUBE', 'MODERATOR'];
  const loaderCfg = data.stats && data.stats.loader;
  if (loaderCfg && loaderCfg.maintenance) {
    const bypassUids = loaderCfg.maintenance_bypass_uids || [];
    if (!MAINTENANCE_BYPASS_ROLES.includes(user.role) && !bypassUids.includes(String(user.id))) {
      const msg = loaderCfg.maintenance_message || 'Технические работы. Скоро вернёмся!';
      return res.json({ allowed: false, error: msg });
    }
  }

  // RML HWID: отдельная привязка железа для лоадера (не пересекается с игровым hwid).
  if (hwid) {
    if (!user.rml_hwid) { user.rml_hwid = hwid; save(); }
    else if (user.rml_hwid !== hwid) return res.json({ allowed: false, error: 'HWID mismatch' });
  }

  // Подписка: привилегированные роли — без ограничения по времени.
  const now = new Date();
  const subActive = user.subscription_until ? new Date(user.subscription_until) > now : false;
  if (!PRIVILEGED.includes(user.role) && !subActive) {
    return res.json({ allowed: false, error: 'Subscription expired' });
  }

  // JWT для защищённых лаунчер-роутов (/download/client, /launcher/key).
  // Тот же формат, что у web-login, чтобы authMiddleware работал одинаково.
  const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '30d' });

  res.json({
    allowed: true,
    token,
    username: user.username,
    role: user.role,
    rml: user.rml === 1 || user.rml === true,
    ram: String(user.ram || 2048),
    subTime: user.subscription_until || '',
    uid: String(user.id),
  });
});

// ── Profile endpoint for C++ native launcher (RestoreSession) ──
// GET /api/endpoints/profile.php   Bearer: JWT
// Returns { success: true, user: { id, username, email, hwid, subscription_type, ... } }
router.get('/endpoints/profile.php', authMiddleware, (req, res) => {
  const user = data.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ success: false, error: 'user_not_found' });

  const PRIVILEGED_ROLES = ['ADMIN', 'DEVELOPER', 'YOUTUBE', 'MODERATOR'];
  const now = new Date();
  let subscription_type = 'none';
  let subscription_expires = '';

  if (PRIVILEGED_ROLES.includes(user.role)) {
    subscription_type = 'lifetime';
  } else if (user.subscription_until && new Date(user.subscription_until) > now) {
    subscription_type = 'premium';
    subscription_expires = new Date(user.subscription_until).toISOString().replace('T', ' ').slice(0, 19);
  }

  res.json({
    success: true,
    user: {
      id: user.id,
      username: user.username,
      email: user.email || '',
      hwid: user.rml_hwid || user.hwid || '',
      avatar: user.avatar || '',
      banner: user.banner || '',
      subscription_type,
      subscription_expires,
      role: (user.role || 'user').toLowerCase(),
      status: user.role === 'BANNED' ? 'banned' : 'active',
    },
  });
});

// ── Set HWID for native launcher ──
// POST /api/endpoints/set_hwid.php  Bearer: JWT  Body: { hwid }
router.post('/endpoints/set_hwid.php', authMiddleware, async (req, res) => {
  const { hwid } = req.body;
  if (!hwid) return res.status(400).json({ success: false, error: 'hwid_required' });
  const user = data.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ success: false, error: 'user_not_found' });
  user.rml_hwid = hwid;
  await save();
  res.json({ success: true });
});

// ── Login for native Kazahstan DLC (auth_service.cpp -> /endpoints/login.php) ──
// Body: { login, password, launcher_version, launcher_build }
// Success: { success: true, access: "<jwt>" }   Fail: { success: false, error }
// Subscription is NOT gated here — profile.php reports it and the UI gates the
// Launch button. Hard blocks: wrong creds, ban, maintenance.
router.post('/endpoints/login.php', (req, res) => {
  const { login, password } = req.body || {};
  if (!login || !password) return res.status(400).json({ success: false, error: 'empty_fields' });

  const user = data.users.find(u => u.username === login || u.email === login);
  if (!user) return res.status(401).json({ success: false, error: 'Invalid username or password' });
  if (!bcrypt.compareSync(password, user.password)) return res.status(401).json({ success: false, error: 'Invalid username or password' });
  if (user.role === 'BANNED') return res.status(403).json({ success: false, error: 'User is banned' });

  // Maintenance gate (same rule as /launcher/login).
  const MAINTENANCE_BYPASS_ROLES = ['ADMIN', 'DEVELOPER', 'YOUTUBE', 'MODERATOR'];
  const loaderCfg = data.stats && data.stats.loader;
  if (loaderCfg && loaderCfg.maintenance) {
    const bypassUids = loaderCfg.maintenance_bypass_uids || [];
    if (!MAINTENANCE_BYPASS_ROLES.includes(user.role) && !bypassUids.includes(String(user.id))) {
      return res.status(403).json({ success: false, error: loaderCfg.maintenance_message || 'Технические работы. Скоро вернёмся!' });
    }
  }

  const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ success: true, access: token, token });
});

// ── Выдача ключа расшифровки классов (Pillar B) ──
// Ключ K, которым при сборке зашифрованы .class секретных пакетов клиента.
// Отдаётся ТОЛЬКО авторизованному лаунчеру (Bearer JWT). Лаунчер передаёт его
// Java-агенту через переменную окружения KZC_K; без него классы = мусор.
// Привязка к сессии (uid/hwid) + лог факта выдачи для аудита/детекта слива.
router.get('/launcher/key', authMiddleware, (req, res) => {
  const key = config.KZC_CLASS_KEY;
  if (!key || !/^[0-9a-fA-F]{64}$/.test(key)) {
    return res.status(500).json({ error: 'class_key_not_configured' });
  }
  const user = data.users.find(u => u.id === req.user.id);
  if (!user || user.role === 'BANNED') return res.status(403).json({ error: 'forbidden' });
  logAction('class_key_issue', `uid:${req.user.id}`, `hwid:${user.hwid || '-'}`, req.user);
  res.json({ k: key });
});

module.exports = router;
