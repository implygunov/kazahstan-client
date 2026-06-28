# Деплой Kazahstan Client на Render.com + MySQL (Sprinthost)

Схема: **Node-сервис на Render** (фронт + API) подключается к **MySQL на Sprinthost**.
У Render своего MySQL нет, поэтому база живёт на Sprinthost, а Render ходит к ней по сети.

---

## Шаг 1. База данных на Sprinthost

1. Панель Sprinthost → **Базы данных MySQL** → создай базу и пользователя.
   Запиши: **имя БД**, **пользователь**, **пароль**, **хост** (обычно вида
   `localhost` для PHP, но для внешнего доступа Sprinthost даёт отдельный хост —
   уточни в панели/поддержке, часто это домен вида `srvXXX.hosting.reg.ru` или IP).
2. Импортируй схему: панель → **phpMyAdmin** → выбери базу → вкладка **Импорт** →
   загрузи файл `backend/schema.sql` → **Вперёд**.
   Создаст все таблицы и сиды (admin / moder / user, пароль `admin123`).
3. **Разреши удалённый доступ.** По умолчанию Sprinthost пускает к MySQL только
   с localhost. Render подключается с внешнего IP, поэтому:
   - найди в панели раздел **«Удалённый доступ к MySQL»** (или напиши в поддержку);
   - добавь доступ с `%` (любой IP) либо с IP-адресов Render.
   - Без этого будет ошибка подключения `ER_HOST_NOT_PRIVILEGED` / timeout.

> Render не публикует фиксированный список исходящих IP на free-плане, поэтому
> проще разрешить `%`. Безопасность держится на сильном пароле MySQL.

---

## Шаг 2. Залить код в Git (GitHub)

Render деплоит из Git-репозитория.

```bash
cd C:\crydlc
git init
git add .
git commit -m "Kazahstan Client"
git branch -M main
git remote add origin https://github.com/USERNAME/kazahstan-client.git
git push -u origin main
```

> Важно: пуш всей папки целиком (и `index.html`, и `assets/`, и `backend/`).
> Сервер отдаёт фронт из корня репозитория, а сам код — в `backend/`.

**Не коммить реальные секреты.** Файл `backend/config.js` читает всё из
переменных окружения — реальные токены/пароли задаются в Render (Шаг 4),
а не в коде.

---

## Шаг 3. Создать Web Service на Render

1. https://dashboard.render.com → **New** → **Web Service**.
2. Подключи свой GitHub-репозиторий.
3. Настройки:

| Поле | Значение |
|------|----------|
| **Name** | `kazahstan-client` (любое) |
| **Region** | Frankfurt (ближе к РФ) |
| **Branch** | `main` |
| **Root Directory** | `backend` |
| **Runtime** | `Node` |
| **Build Command** | `npm install` |
| **Start Command** | `node server.js` |
| **Instance Type** | Free |

> `Root Directory = backend` — обязательно, иначе Render не найдёт `package.json`.
> Порт слушать не нужно настраивать: сервер уже берёт `process.env.PORT`,
> который Render задаёт автоматически.

---

## Шаг 4. Переменные окружения (Environment)

В сервисе Render → вкладка **Environment** → **Add Environment Variable**.
Добавь по одной:

### База данных MySQL (Sprinthost)
```
MYSQL_HOST       = <внешний хост MySQL со Sprinthost>
MYSQL_PORT       = 3306
MYSQL_USER       = <пользователь БД>
MYSQL_PASSWORD   = <пароль БД>
MYSQL_DATABASE   = <имя БД>
MYSQL_SSL        = false
```

### Оплата — CryptoBot
Токен: открой **@CryptoBot** в Telegram → **Crypto Pay** → **Create App** →
скопируй API Token.
```
CRYPTOBOT_TOKEN  = <токен из @CryptoBot>
CRYPTOBOT_ASSET  = USDT
RUB_PER_ASSET    = 100
```
(`RUB_PER_ASSET` — сколько рублей в 1 USDT для пересчёта суммы инвойса.)

### Оплата — СБП
```
SBP_PHONE        = +7XXXXXXXXXX
SBP_BANK         = Сбербанк
SBP_RECEIVER     = Имя Фамилия
```

### Шифрование JAR
Сгенерируй 32-байтный ключ (любой из способов):
```bash
openssl rand -hex 32
# или: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
```
JAR_ENC_KEY      = <64 hex-символа>
```
Положи исходный jar в репозиторий по пути `backend/files/client.jar`
(или задай `JAR_SOURCE_PATH` на свой путь).

После добавления переменных Render автоматически передеплоит сервис.

---

## Шаг 5. Проверка

1. Открой URL сервиса (`https://kazahstan-client.onrender.com`).
2. Логи Render должны показать:
   `Kazahstan Client Server running at http://localhost:10000`
   (порт Render — внутренний, это нормально).
3. Зайди `admin / admin123` → проверь админку.
4. Если в логах `Не удалось подключиться к MySQL` — проверь Шаг 1.3
   (удалённый доступ) и правильность `MYSQL_HOST`/паролей.

---

## Как работает оплата и автовыдача ключа

- **CryptoBot:** фронт зовёт `POST /api/payments/cryptobot/create`
  (тело: `amountRub`, `role`, `days`) → создаётся инвойс, возвращается `payUrl`.
  Фронт опрашивает `GET /api/payments/cryptobot/status/:orderId`; как только
  CryptoBot вернул `paid`, сервер **генерит KZ-ключ и сразу активирует** его на
  покупателя (выдаёт роль/подписку). Ключ возвращается в ответе (`key`).
- **СБП:** `POST /api/payments/sbp/create` → отдаёт реквизиты и код для
  комментария. Оплата ручная: клиент переводит, админ подтверждает через
  `POST /api/payments/sbp/confirm` (тело `orderId`) → та же автовыдача ключа.
- **Заказы:** `GET /api/payments/my` (свои), `GET /api/admin/orders` (все, админ).

---

## Частые проблемы

| Симптом | Причина / решение |
|---------|-------------------|
| `Не удалось подключиться к MySQL` | Не разрешён удалённый доступ (Шаг 1.3) или неверный `MYSQL_HOST` |
| `ER_ACCESS_DENIED_ERROR` | Неверный `MYSQL_USER`/`MYSQL_PASSWORD` |
| `cryptobot_not_configured` | Не задан `CRYPTOBOT_TOKEN` |
| `sbp_not_configured` | Не задан `SBP_PHONE` |
| `jar_not_found` | Нет файла `backend/files/client.jar` |
| `enc_key_not_configured` | `JAR_ENC_KEY` не 64 hex-символа |
| Сервис «спит», первый запрос долгий | Особенность Free-плана Render (засыпает без трафика) |
