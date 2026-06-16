// Конфигурация Kazahstan Client — впиши реальные значения перед продакшеном.
// Можно переопределить через переменные окружения (process.env) или файл .env.

// --- Мини-загрузчик .env (без сторонних зависимостей) ---
// Читает backend/.env (а если нет — .env в корне проекта) и кладёт значения
// в process.env. Уже выставленные переменные окружения имеют приоритет.
(() => {
  const fs = require('fs');
  const path = require('path');
  const files = [
    path.join(__dirname, '.env'),
    path.join(__dirname, '..', '.env'),
  ];
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_.]*)\s*=\s*(.*?)\s*$/);
      if (!m) continue; // пропускаем пустые строки и комментарии (# ...)
      let val = m[2];
      if ((val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
      if (process.env[m[1]] === undefined) process.env[m[1]] = val;
    }
  }
})();

module.exports = {
  // --- Cloudflare Turnstile (капча) ---
  // Ключи берутся в dash.cloudflare.com -> Turnstile -> твой виджет.
  // SITEKEY — публичный (попадает в браузер), SECRET — серверный (никому не показывать).
  // Если SECRET пустой — проверка капчи на сервере пропускается (не блокирует вход).
  TURNSTILE_SITEKEY: process.env.TURNSTILE_SITEKEY || '',
  TURNSTILE_SECRET: process.env.TURNSTILE_SECRET || '',


  // --- База данных: MySQL (хостинг Sprinthost) ---
  // Реквизиты берутся в панели Sprinthost -> Базы данных MySQL.
  // Для подключения с Render нужно разрешить удалённый доступ (см. RENDER.md).
  MYSQL_HOST: process.env.MYSQL_HOST || 'a1271231.xsph.ru',
  MYSQL_PORT: Number(process.env.MYSQL_PORT || 3306),
  MYSQL_USER: process.env.MYSQL_USER || 'a1271231_fhdjfu38uwwjdskj',
  MYSQL_PASSWORD: process.env.MYSQL_PASSWORD || 'Hksdhwedsud,%24shlsaj',
  MYSQL_DATABASE: process.env.MYSQL_DATABASE || 'a1271231_fhdjfu38uwwjdskj',
  // SSL для внешнего подключения (Sprinthost обычно без SSL — оставь false).
  MYSQL_SSL: process.env.MYSQL_SSL === 'true',

  // --- Оплата: CryptoBot (Crypto Pay API, @CryptoBot / @CryptoTestnetBot) ---
  // Токен берётся в @CryptoBot -> Crypto Pay -> Create App.
  CRYPTOBOT_TOKEN: process.env.CRYPTOBOT_TOKEN || '',
  CRYPTOBOT_API: process.env.CRYPTOBOT_API || 'https://pay.crypt.bot/api',
  // Валюта инвойса по умолчанию (USDT/TON/BTC и т.д.)
  CRYPTOBOT_ASSET: process.env.CRYPTOBOT_ASSET || 'USDT',

  // --- Оплата: СБП (Система быстрых платежей) ---
  // Перевод по номеру телефона на твой счёт. Это ручное подтверждение,
  // без эквайринга и без проверки возраста.
  SBP_PHONE: process.env.SBP_PHONE || '+79873352745',          // напр. +7XXXXXXXXXX
  SBP_BANK: process.env.SBP_BANK || '2202206229097691',            // напр. Сбербанк / Т-Банк
  SBP_RECEIVER: process.env.SBP_RECEIVER || 'Анненков Андрей А.',    // ФИО получателя (как в банке)

  // Курс рубля к активу CryptoBot для пересчёта суммы инвойса (1 USDT ~ N руб).
  RUB_PER_ASSET: Number(process.env.RUB_PER_ASSET || 100),

  // --- Шифрование JAR при загрузке ---
  // 32-байтный ключ (hex, 64 символа). Сгенерируй: openssl rand -hex 32
  JAR_ENC_KEY: process.env.JAR_ENC_KEY || '0000000000000000000000000000000000000000000000000000000000000000',
  // Путь к исходному (незашифрованному) jar лаунчера.
  JAR_SOURCE_PATH: process.env.JAR_SOURCE_PATH || require('path').join(__dirname, 'files', 'client.jar'),
  // URL защищённого jar (напр. GitHub Releases). На Render используем ЕГО, т.к.
  // 136 МБ файл в git/Render не положить. Если задан — приоритетнее, чем PATH.
  JAR_SOURCE_URL: process.env.JAR_SOURCE_URL || '',

  // --- Ключ расшифровки классов клиента (Pillar B) ---
  // 32-байтный ключ (hex, 64 символа), которым build-задача encryptClasses
  // зашифровала .class секретных пакетов. Выдаётся только авторизованному
  // лаунчеру через /api/launcher/key, лаунчер прокидывает его Java-агенту.
  // Ротируй на каждую новую сборку (новый K → старые слитые ключи бесполезны).
  KZC_CLASS_KEY: process.env.KZC_CLASS_KEY || '',
  // Путь к kzc-agent.jar (выход build/libs/kzc-agent.jar). Раздаётся лаунчеру.
  AGENT_SOURCE_PATH: process.env.AGENT_SOURCE_PATH || require('path').join(__dirname, 'files', 'kzc-agent.jar'),
  // URL агента (GitHub Releases) — для Render. Если задан — приоритетнее PATH.
  AGENT_SOURCE_URL: process.env.AGENT_SOURCE_URL || '',
};
