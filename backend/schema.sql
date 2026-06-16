-- ============================================================
--  Kazahstan Client — схема базы данных (MySQL 8)
--  Импорт: mysql -h HOST -u USER -p DBNAME < schema.sql
--  или через phpMyAdmin на Sprinthost (вкладка Импорт).
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------- users ----------
CREATE TABLE IF NOT EXISTS users (
  id                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
  username           VARCHAR(64)  NOT NULL,
  email              VARCHAR(190) NOT NULL,
  password           VARCHAR(255) NOT NULL,
  role               VARCHAR(32)  NOT NULL DEFAULT 'DEFAULT',
  hwid               VARCHAR(190) NULL,
  subscription_until VARCHAR(40)  NULL,
  premium_until      VARCHAR(40)  NULL,
  ram                INT          NOT NULL DEFAULT 2048,
  created_at         VARCHAR(40)  NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_username (username),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- keys (ключи активации) ----------
CREATE TABLE IF NOT EXISTS `keys` (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code         VARCHAR(64)  NOT NULL,
  role         VARCHAR(32)  NOT NULL DEFAULT 'BETA',
  days         INT          NULL,
  activated_by INT UNSIGNED NULL,
  activated_at VARCHAR(40)  NULL,
  created_at   VARCHAR(40)  NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_keys_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- orders (заказы / платежи) ----------
CREATE TABLE IF NOT EXISTS orders (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id      INT UNSIGNED NOT NULL,
  method       VARCHAR(32)  NOT NULL,
  amount_rub   DECIMAL(10,2) NOT NULL DEFAULT 0,
  asset        VARCHAR(16)  NULL,
  amount_asset VARCHAR(32)  NULL,
  status       VARCHAR(16)  NOT NULL DEFAULT 'pending',
  invoice_id   VARCHAR(64)  NULL,
  comment_code VARCHAR(32)  NULL,
  `role`       VARCHAR(32)  NULL,
  days         INT          NULL,
  issued_key   VARCHAR(64)  NULL,
  created_at   VARCHAR(40)  NOT NULL,
  paid_at      VARCHAR(40)  NULL,
  PRIMARY KEY (id),
  KEY idx_orders_user (user_id),
  KEY idx_orders_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- promocodes ----------
CREATE TABLE IF NOT EXISTS promocodes (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code             VARCHAR(64)  NOT NULL,
  discount_percent INT          NOT NULL DEFAULT 10,
  created_at       VARCHAR(40)  NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_promo_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- tickets ----------
CREATE TABLE IF NOT EXISTS tickets (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    INT UNSIGNED NOT NULL,
  title      VARCHAR(190) NOT NULL,
  status     VARCHAR(16)  NOT NULL DEFAULT 'open',
  created_at VARCHAR(40)  NOT NULL,
  updated_at VARCHAR(40)  NOT NULL,
  PRIMARY KEY (id),
  KEY idx_tickets_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- ticket_messages ----------
CREATE TABLE IF NOT EXISTS ticket_messages (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  ticket_id   INT UNSIGNED NOT NULL,
  sender_role VARCHAR(16)  NOT NULL,
  sender_name VARCHAR(64)  NOT NULL,
  message     TEXT         NULL,
  attachments JSON         NULL,
  created_at  VARCHAR(40)  NOT NULL,
  PRIMARY KEY (id),
  KEY idx_msg_ticket (ticket_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- journal (журнал действий) ----------
CREATE TABLE IF NOT EXISTS journal (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  action     VARCHAR(64)  NOT NULL,
  target     VARCHAR(190) NULL,
  meta       VARCHAR(190) NULL,
  actor_name VARCHAR(64)  NULL,
  actor_id   INT UNSIGNED NULL,
  actor_role VARCHAR(32)  NULL,
  created_at VARCHAR(40)  NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
--  Сиды (стартовые данные). Пароль у всех: admin123
--  bcrypt-хэш ниже соответствует "admin123".
-- ============================================================

INSERT INTO users (id, username, email, password, role, hwid, subscription_until, premium_until, ram, created_at) VALUES
  (1, 'admin', 'admin@kazahstanclient.app', '$2a$10$QzHne3TvlFKJkpHawct7xeRMNzXyHoRPb5fQUkbnXcr.7q612.1A2', 'DEVELOPER', NULL, '2099-12-31T23:59:59.999Z', '2099-12-31T23:59:59.999Z', 8192, '2024-01-01T00:00:00.000Z'),
  (2, 'moder', 'moder@kazahstanclient.app', '$2a$10$QzHne3TvlFKJkpHawct7xeRMNzXyHoRPb5fQUkbnXcr.7q612.1A2', 'MODERATOR', NULL, NULL, NULL, 4096, '2024-01-01T00:00:00.000Z'),
  (3, 'user',  'user@kazahstanclient.app',  '$2a$10$QzHne3TvlFKJkpHawct7xeRMNzXyHoRPb5fQUkbnXcr.7q612.1A2', 'DEFAULT', NULL, NULL, NULL, 2048, '2024-01-01T00:00:00.000Z')
ON DUPLICATE KEY UPDATE username = VALUES(username);

INSERT INTO promocodes (id, code, discount_percent, created_at) VALUES
  (1, 'HELLO10', 10, '2024-01-01T00:00:00.000Z')
ON DUPLICATE KEY UPDATE code = VALUES(code);
