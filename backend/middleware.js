const jwt = require('jsonwebtoken');
const { data } = require('./database');

const JWT_SECRET = 'cry-dlc-local-secret-key-2024';

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'unauthorized' });
  try {
    const decoded = jwt.verify(auth.slice(7), JWT_SECRET);
    req.user = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'invalid_token' });
  }
}

function adminOnly(req, res, next) {
  const user = data.users.find(u => u.id === req.user.id);
  if (!user || (user.role !== 'ADMIN' && user.role !== 'DEVELOPER')) return res.status(403).json({ error: 'forbidden' });
  req.dbUser = user;
  next();
}

function developerOnly(req, res, next) {
  const user = data.users.find(u => u.id === req.user.id);
  if (!user || user.role !== 'DEVELOPER') return res.status(403).json({ error: 'forbidden' });
  req.dbUser = user;
  next();
}

function logAction(action, target, meta, actor) {
  const { data: db, nextId } = require('./database');
  db.journal.push({
    id: nextId('journal'),
    action,
    target,
    meta,
    actor_name: actor.username,
    actor_id: actor.id,
    actor_role: actor.role,
    created_at: new Date().toISOString(),
  });
  require('./database').save();
}

module.exports = { JWT_SECRET, authMiddleware, adminOnly, developerOnly, logAction };
