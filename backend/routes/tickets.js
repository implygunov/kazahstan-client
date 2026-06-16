const { Router } = require('express');
const { data, save, nextId } = require('../database');
const { authMiddleware, logAction } = require('../middleware');

const router = Router();

router.get('/tickets', authMiddleware, (req, res) => {
  const tickets = data.tickets
    .filter(t => t.user_id === req.user.id)
    .map(t => ({ id: t.id, title: t.title, status: t.status, updated_at: t.updated_at, created_at: t.created_at }));
  res.json({ tickets });
});

router.post('/tickets', authMiddleware, (req, res) => {
  const { title } = req.body;
  const openTicket = data.tickets.find(t => t.user_id === req.user.id && t.status === 'open');
  if (openTicket) return res.status(400).json({ error: 'already_open' });
  const ticket = {
    id: nextId('tickets'),
    user_id: req.user.id,
    title: title || 'Support',
    status: 'open',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  data.tickets.push(ticket);
  save();
  res.json({ id: ticket.id });
});

router.get('/tickets/:id/messages', authMiddleware, (req, res) => {
  const ticket = data.tickets.find(t => t.id === parseInt(req.params.id) && t.user_id === req.user.id);
  if (!ticket) return res.status(404).json({ error: 'not_found' });
  const messages = data.ticket_messages.filter(m => m.ticket_id === ticket.id);
  res.json({ messages });
});

router.post('/tickets/:id/message', authMiddleware, (req, res) => {
  const { text, attachments } = req.body;
  const ticket = data.tickets.find(t => t.id === parseInt(req.params.id) && t.user_id === req.user.id);
  if (!ticket) return res.status(404).json({ error: 'not_found' });
  if (ticket.status !== 'open') return res.status(400).json({ error: 'ticket_closed' });
  const msg = {
    id: nextId('messages'),
    ticket_id: ticket.id,
    sender_role: 'user',
    sender_name: req.user.username,
    message: text || '',
    attachments: attachments || [],
    created_at: new Date().toISOString(),
  };
  data.ticket_messages.push(msg);
  ticket.updated_at = new Date().toISOString();
  save();
  res.json({ ok: true });
});

router.post('/tickets/:id/close', authMiddleware, (req, res) => {
  const ticket = data.tickets.find(t => t.id === parseInt(req.params.id) && t.user_id === req.user.id);
  if (!ticket) return res.status(404).json({ error: 'not_found' });
  ticket.status = 'closed';
  ticket.updated_at = new Date().toISOString();
  save();
  res.json({ ok: true });
});

module.exports = router;
