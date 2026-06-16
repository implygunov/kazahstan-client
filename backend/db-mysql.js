// MySQL-бэкенд для Kazahstan Client.
// Грузит все таблицы в память (объект data) при старте, а save() асинхронно
// синхронизирует память -> MySQL. Роуты остаются синхронными и не меняются.

const mysql = require('mysql2/promise');
const config = require('./config');

let pool = null;

// Объект-зеркало БД в памяти (тот же контракт, что был у JSON-версии).
const data = {
  users: [],
  keys: [],
  orders: [],
  promocodes: [],
  tickets: [],
  ticket_messages: [],
  journal: [],
  stats: { users: 0, launches: 0, days: 0 },
  sequences: { users: 0, keys: 0, orders: 0, tickets: 0, promocodes: 0, journal: 0, messages: 0 },
};

// Таблицы, которые синхронизируются между памятью и MySQL.
// key — имя поля в data; table — имя таблицы (keys экранируется бэктиками).
const TABLES = [
  { key: 'users', table: 'users', cols: ['id', 'username', 'email', 'password', 'role', 'rml', 'rml_hwid', 'hwid', 'subscription_until', 'premium_until', 'ram', 'created_at'] },
  { key: 'keys', table: '`keys`', cols: ['id', 'code', 'role', 'days', 'activated_by', 'activated_at', 'created_at'] },
  { key: 'orders', table: 'orders', cols: ['id', 'user_id', 'method', 'amount_rub', 'asset', 'amount_asset', 'status', 'invoice_id', 'comment_code', 'role', 'days', 'issued_key', 'created_at', 'paid_at'] },
  { key: 'promocodes', table: 'promocodes', cols: ['id', 'code', 'discount_percent', 'created_at'] },
  { key: 'tickets', table: 'tickets', cols: ['id', 'user_id', 'title', 'status', 'created_at', 'updated_at'] },
  { key: 'ticket_messages', table: 'ticket_messages', cols: ['id', 'ticket_id', 'sender_role', 'sender_name', 'message', 'attachments', 'created_at'] },
  { key: 'journal', table: 'journal', cols: ['id', 'action', 'target', 'meta', 'actor_name', 'actor_id', 'actor_role', 'created_at'] },
];

const JSON_COLS = new Set(['attachments']); // поля, хранящиеся как JSON

// Ключи внутри data.stats, которые персистятся в таблицу `settings` как JSON.
// Сюда попадает конфиг лоадера (техработы, версия, доступы), чтобы он
// переживал перезапуск/сон free-дино Render, а не сбрасывался в дефолт.
const SETTINGS_KEYS = ['loader'];

function colName(c) {
  return c === 'keys' ? '`keys`' : '`' + c + '`';
}

async function init() {
  pool = mysql.createPool({
    host: config.MYSQL_HOST,
    port: config.MYSQL_PORT,
    user: config.MYSQL_USER,
    password: config.MYSQL_PASSWORD,
    database: config.MYSQL_DATABASE,
    waitForConnections: true,
    connectionLimit: 5,
    charset: 'utf8mb4',
    ssl: config.MYSQL_SSL ? { rejectUnauthorized: false } : undefined,
  });

  // Проверка соединения.
  const conn = await pool.getConnection();
  conn.release();

  // Таблица настроек (key-value JSON). Создаём здесь, чтобы существующие БД
  // не требовали ручной миграции/ре-импорта schema.sql.
  await pool.query(
    'CREATE TABLE IF NOT EXISTS settings (' +
    '`key` VARCHAR(64) NOT NULL, ' +
    '`value` JSON NULL, ' +
    'PRIMARY KEY (`key`)' +
    ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
  );

  await loadAll();
  recomputeSequences();
  data.stats.users = data.users.length;
  return data;
}

async function loadAll() {
  for (const t of TABLES) {
    const [rows] = await pool.query(`SELECT * FROM ${t.table}`);
    data[t.key] = rows.map(normalizeRow);
  }
  await loadSettings();
}

// Подтягиваем key-value настройки из таблицы `settings` в data.stats.
async function loadSettings() {
  const [rows] = await pool.query('SELECT `key`, `value` FROM settings');
  for (const row of rows) {
    let v = row.value;
    if (typeof v === 'string') {
      try { v = JSON.parse(v); } catch (_) { /* оставляем как есть */ }
    }
    data.stats[row.key] = v;
  }
}

// Перечитать всё из MySQL в память (источник правды — БД).
// Вызывается перед каждым запросом, чтобы правки из phpMyAdmin сразу были видны
// и чтобы save() не затирал базу устаревшей памятью.
async function reload() {
  if (!pool) return;
  await loadAll();
  recomputeSequences();
  data.stats.users = data.users.length;
}

// mysql2 уже парсит JSON-колонки; приводим типы к тем, что ждут роуты.
function normalizeRow(row) {
  const out = { ...row };
  if (out.amount_rub != null) out.amount_rub = Number(out.amount_rub);
  return out;
}

function recomputeSequences() {
  const maxId = (arr) => arr.reduce((m, x) => Math.max(m, Number(x.id) || 0), 0);
  data.sequences.users = maxId(data.users);
  data.sequences.keys = maxId(data.keys);
  data.sequences.orders = maxId(data.orders);
  data.sequences.tickets = maxId(data.tickets);
  data.sequences.promocodes = maxId(data.promocodes);
  data.sequences.journal = maxId(data.journal);
  data.sequences.messages = maxId(data.ticket_messages);
}

function nextId(entity) {
  data.sequences[entity] = (data.sequences[entity] || 0) + 1;
  return data.sequences[entity];
}

// --- Персист: память -> MySQL (full sync с очередью) ---
let saving = false;
let dirty = false;

function save() {
  // Синхронный контракт: помечаем «грязно» и запускаем фоновую запись.
  dirty = true;
  flush();
}

async function flush() {
  if (saving) return;
  saving = true;
  try {
    while (dirty) {
      dirty = false;
      await syncToDb();
    }
  } catch (e) {
    console.error('[db] save error:', e.message);
    dirty = true; // повторим при следующем save()
  } finally {
    saving = false;
  }
}

async function syncToDb() {
  for (const t of TABLES) {
    const rows = data[t.key] || [];

    // Upsert всех строк из памяти.
    if (rows.length) {
      const placeholders = rows.map(() => '(' + t.cols.map(() => '?').join(',') + ')').join(',');
      const values = [];
      for (const r of rows) {
        for (const c of t.cols) {
          let v = r[c];
          if (v === undefined) v = null;
          if (JSON_COLS.has(c) && v != null && typeof v !== 'string') v = JSON.stringify(v);
          values.push(v);
        }
      }
      const updateClause = t.cols.filter(c => c !== 'id').map(c => `${colName(c)}=VALUES(${colName(c)})`).join(',');
      const sql = `INSERT INTO ${t.table} (${t.cols.map(colName).join(',')}) VALUES ${placeholders} ` +
        `ON DUPLICATE KEY UPDATE ${updateClause}`;
      await pool.query(sql, values);
    }

    // Удаляем из MySQL строки, которых больше нет в памяти.
    const ids = rows.map(r => Number(r.id)).filter(Boolean);
    if (ids.length) {
      await pool.query(`DELETE FROM ${t.table} WHERE id NOT IN (${ids.map(() => '?').join(',')})`, ids);
    } else {
      await pool.query(`DELETE FROM ${t.table}`);
    }
  }

  // Персист key-value настроек (конфиг лоадера и т.п.) из data.stats.
  for (const key of SETTINGS_KEYS) {
    const val = data.stats[key];
    if (val === undefined) continue;
    await pool.query(
      'INSERT INTO settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value`=VALUES(`value`)',
      [key, JSON.stringify(val)]
    );
  }
}

module.exports = { init, reload, data, save, nextId, _pool: () => pool };
