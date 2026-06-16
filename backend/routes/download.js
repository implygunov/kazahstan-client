const { Router } = require('express');
const fs = require('fs');
const crypto = require('crypto');
const { Readable } = require('stream');
const { authMiddleware, logAction } = require('../middleware');
const config = require('../config');

const router = Router();

function getKey() {
  const hex = config.JAR_ENC_KEY || '';
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) return null;
  return Buffer.from(hex, 'hex');
}

// Открывает источник как Node Readable:
//  - если задан URL (напр. GitHub Releases) — тянем через fetch (редиректы ок);
//  - иначе локальный файл (для запуска со start.bat).
// На Render файловой системы под 136 МБ jar нет, поэтому продакшен — через URL.
async function openSource(url, filePath) {
  if (url) {
    const r = await fetch(url, { redirect: 'follow' });
    if (!r.ok || !r.body) throw new Error(`source fetch ${r.status}`);
    return Readable.fromWeb(r.body);
  }
  if (filePath && fs.existsSync(filePath)) {
    return fs.createReadStream(filePath);
  }
  return null;
}

// Шифрованная загрузка JAR.
// Файл шифруется на лету AES-256-GCM. Формат потока:
//   MAGIC(4) | VER(1) | IV(12) | CIPHERTEXT(...) | TAG(16)
// Лаунчер расшифровывает тем же ключом из config.JAR_ENC_KEY.
router.get('/download/client', authMiddleware, async (req, res) => {
  const key = getKey();
  if (!key) return res.status(500).json({ error: 'enc_key_not_configured' });

  let input;
  try {
    input = await openSource(config.JAR_SOURCE_URL, config.JAR_SOURCE_PATH);
  } catch (e) {
    return res.status(502).json({ error: 'jar_source_unavailable', detail: e.message });
  }
  if (!input) return res.status(404).json({ error: 'jar_not_found' });

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', 'attachment; filename="client.enc.jar"');
  res.setHeader('X-Encryption', 'AES-256-GCM');

  // Заголовок потока: MAGIC "KZC1" + версия 1 + IV.
  res.write(Buffer.concat([Buffer.from('KZC1'), Buffer.from([1]), iv]));

  input.on('error', () => { if (!res.headersSent) res.status(500); res.end(); });

  input.pipe(cipher);
  cipher.on('data', (chunk) => res.write(chunk));
  cipher.on('end', () => {
    res.end(cipher.getAuthTag()); // 16-байтный GCM-тег в конце
    logAction('jar_download', `uid:${req.user.id}`, 'aes-256-gcm', req.user);
  });
  cipher.on('error', () => { if (!res.headersSent) res.status(500); res.end(); });
});

// Отдача Java-агента (Pillar B). Сам агент не секретен (ключа в нём нет),
// но раздаём только авторизованному лаунчеру, чтобы не светить публично.
router.get('/download/agent', authMiddleware, async (req, res) => {
  let input;
  try {
    input = await openSource(config.AGENT_SOURCE_URL, config.AGENT_SOURCE_PATH);
  } catch (e) {
    return res.status(502).json({ error: 'agent_source_unavailable', detail: e.message });
  }
  if (!input) return res.status(404).json({ error: 'agent_not_found' });

  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', 'attachment; filename="kzc-agent.jar"');
  input.on('error', () => { if (!res.headersSent) res.status(500); res.end(); });
  input.pipe(res);
});

module.exports = router;
