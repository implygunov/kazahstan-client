const { Router } = require('express');
const { data, save } = require('../database');
const { authMiddleware, adminOnly, logAction } = require('../middleware');

const router = Router();

const AVAILABLE_VERSIONS = ['1.21.4', '1.21.8', '1.21.11'];

function getCfg() {
  if (!data.stats.loader) {
    data.stats.loader = {
      maintenance: false,
      maintenance_message: 'Технические работы. Скоро вернёмся!',
      current_version: '1.21.4',
      auth_disabled: false,
      user_access: [],
    };
  }
  return data.stats.loader;
}

// Public — лоадер запрашивает при старте
router.get('/loader/status', (req, res) => {
  const cfg = getCfg();
  res.json({
    maintenance: cfg.maintenance,
    message: cfg.maintenance_message,
    version: cfg.current_version,
    auth_disabled: cfg.auth_disabled,
  });
});

// Admin — получить полный конфиг лоадера
router.get('/admin/loader', authMiddleware, adminOnly, (req, res) => {
  res.json({ config: getCfg(), available_versions: AVAILABLE_VERSIONS });
});

// Admin — включить/выключить техработы + изменить сообщение
router.post('/admin/loader/maintenance', authMiddleware, adminOnly, async (req, res) => {
  const { enabled, message } = req.body;
  const cfg = getCfg();
  if (enabled !== undefined) cfg.maintenance = !!enabled;
  if (message !== undefined) cfg.maintenance_message = String(message);
  await save();
  logAction('loader_maintenance', `enabled:${cfg.maintenance}`, cfg.maintenance_message, req.user);
  res.json({ ok: true, maintenance: cfg.maintenance });
});

// Admin — включить/выключить авторизацию
router.post('/admin/loader/auth', authMiddleware, adminOnly, async (req, res) => {
  const { disabled } = req.body;
  const cfg = getCfg();
  cfg.auth_disabled = !!disabled;
  await save();
  logAction('loader_auth_toggle', `disabled:${cfg.auth_disabled}`, '', req.user);
  res.json({ ok: true, auth_disabled: cfg.auth_disabled });
});

// Admin — установить активную версию
router.post('/admin/loader/version', authMiddleware, adminOnly, async (req, res) => {
  const { version } = req.body;
  if (!AVAILABLE_VERSIONS.includes(version)) return res.status(400).json({ error: 'invalid_version' });
  const cfg = getCfg();
  cfg.current_version = version;
  await save();
  logAction('loader_version_set', `version:${version}`, '', req.user);
  res.json({ ok: true, version: cfg.current_version });
});

// Admin — "уведомить всех об обновлении" (меняет current_version, лоадеры получат при следующем status-запросе)
router.post('/admin/loader/notify', authMiddleware, adminOnly, async (req, res) => {
  const { version } = req.body;
  if (!AVAILABLE_VERSIONS.includes(version)) return res.status(400).json({ error: 'invalid_version' });
  const cfg = getCfg();
  cfg.current_version = version;
  await save();
  logAction('loader_notify', `version:${version}`, 'broadcast via status poll', req.user);
  res.json({ ok: true, version });
});

// Admin — выдать доступ пользователю к версиям
router.post('/admin/loader/access', authMiddleware, adminOnly, async (req, res) => {
  const { uid, username, versions, action } = req.body;
  if (!uid) return res.status(400).json({ error: 'uid_required' });
  const cfg = getCfg();
  if (!cfg.user_access) cfg.user_access = [];
  const idx = cfg.user_access.findIndex(u => String(u.uid) === String(uid));
  if (action === 'revoke') {
    if (idx !== -1) cfg.user_access.splice(idx, 1);
  } else {
    if (idx !== -1) {
      cfg.user_access[idx].versions = versions || [];
      if (username) cfg.user_access[idx].username = username;
    } else {
      cfg.user_access.push({ uid: String(uid), username: username || String(uid), versions: versions || [] });
    }
  }
  await save();
  logAction('loader_access', `uid:${uid}`, `action:${action} versions:${(versions || []).join(',')}`, req.user);
  res.json({ ok: true, user_access: cfg.user_access });
});

// Admin — список доступов пользователей
router.get('/admin/loader/access', authMiddleware, adminOnly, (req, res) => {
  res.json({ user_access: getCfg().user_access || [] });
});

module.exports = router;
