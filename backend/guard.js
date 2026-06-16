// Antegral Guard — серверная анти-DDoS защита.
// Скользящее окно по IP + усиленный лимит на auth-эндпоинты (антибрутфорс).
// Чисто in-memory, без зависимостей. Память самоочищается.

// ── Настройки (можно переопределить через ENV) ──
const GLOBAL_WINDOW_MS = parseInt(process.env.AG_WINDOW_MS || '10000', 10);   // окно
const GLOBAL_MAX = parseInt(process.env.AG_MAX || '120', 10);                 // запросов на /api за окно
const AUTH_WINDOW_MS = parseInt(process.env.AG_AUTH_WINDOW_MS || '60000', 10);// окно для логина
const AUTH_MAX = parseInt(process.env.AG_AUTH_MAX || '12', 10);              // попыток логина за окно
const BAN_MS = parseInt(process.env.AG_BAN_MS || '30000', 10);              // временный бан при флуде

const AUTH_PATHS = ['/login', '/register', '/launcher/login'];

// ip -> { hits: number[], authHits: number[], bannedUntil: number }
const store = new Map();

function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return req.ip || (req.connection && req.connection.remoteAddress) || 'unknown';
}

function getRec(ip) {
  let r = store.get(ip);
  if (!r) { r = { hits: [], authHits: [], bannedUntil: 0 }; store.set(ip, r); }
  return r;
}

function prune(arr, now, win) {
  // выкидываем устаревшие отметки
  while (arr.length && arr[0] <= now - win) arr.shift();
}

// Периодическая чистка карты, чтобы не текла память.
let lastSweep = 0;
function sweep(now) {
  if (now - lastSweep < 60000) return;
  lastSweep = now;
  for (const [ip, r] of store) {
    if (!r.hits.length && !r.authHits.length && r.bannedUntil < now) store.delete(ip);
  }
}

function guard(req, res, next) {
  // временная метка передаётся middleware-ом (Date.now доступен в рантайме сервера)
  const now = Date.now();
  const ip = clientIp(req);
  const rec = getRec(ip);
  sweep(now);

  // активный бан
  if (rec.bannedUntil > now) {
    res.set('Retry-After', String(Math.ceil((rec.bannedUntil - now) / 1000)));
    return res.status(429).json({ error: 'rate_limited', guard: 'antegral', retry_after: Math.ceil((rec.bannedUntil - now) / 1000) });
  }

  // глобальное окно
  prune(rec.hits, now, GLOBAL_WINDOW_MS);
  rec.hits.push(now);
  if (rec.hits.length > GLOBAL_MAX) {
    rec.bannedUntil = now + BAN_MS;
    res.set('Retry-After', String(Math.ceil(BAN_MS / 1000)));
    return res.status(429).json({ error: 'rate_limited', guard: 'antegral', retry_after: Math.ceil(BAN_MS / 1000) });
  }

  // усиленный лимит на авторизацию (антибрутфорс)
  const isAuth = AUTH_PATHS.some(p => req.path === p || req.path.endsWith(p));
  if (isAuth) {
    prune(rec.authHits, now, AUTH_WINDOW_MS);
    rec.authHits.push(now);
    if (rec.authHits.length > AUTH_MAX) {
      rec.bannedUntil = now + BAN_MS;
      res.set('Retry-After', String(Math.ceil(BAN_MS / 1000)));
      return res.status(429).json({ error: 'too_many_attempts', guard: 'antegral', retry_after: Math.ceil(BAN_MS / 1000) });
    }
  }

  next();
}

module.exports = { guard };
