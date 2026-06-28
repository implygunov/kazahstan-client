const { Router } = require('express');
const { data, save, nextId } = require('../database');
const { authMiddleware } = require('../middleware');

const router = Router();

router.post('/promocodes/apply', authMiddleware, (req, res) => {
  const { code } = req.body;
  const promo = data.promocodes.find(p => p.code === code);
  if (!promo) return res.status(400).json({ error: 'invalid_promo' });
  res.json({ promo: { discountPercent: promo.discount_percent } });
});

module.exports = router;
