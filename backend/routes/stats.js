const { Router } = require('express');
const { data } = require('../database');

const router = Router();

router.get('/stats', (req, res) => {
  data.stats.users = data.users.length;
  res.json({ users: data.stats.users || 0, launches: data.stats.launches || 0, days: data.stats.days || 0 });
});

// Манифест версии для апдейт-чека лаунчера (необязательный, без авторизации).
router.get('/version', (req, res) => {
  res.json({ latest_version: '2.0', files: [] });
});

module.exports = router;
