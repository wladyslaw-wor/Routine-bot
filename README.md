# Routine: Telegram Bot + Mini App

Python-проект для управления задачами через Telegram Mini App:
- День управляемый: `Start Day` / `Close Day`
- Неделя управляемая: `Start Week` закрывает предыдущую и открывает новую
- Статусы инстансов: `planned`, `done`, `canceled`, `failed`
- Штрафы в валюте пользователя

## Stack
- Backend API: `FastAPI`
- DB: `SQLite` + `SQLAlchemy 2.0`
- Bot: `aiogram`
- Mini App: статический `HTML/CSS/JS` без сборки
- Auth Mini App: `initData` signature validation

## Project Structure
- `app/main.py` - FastAPI app
- `app/core/auth.py` - валидация Telegram `initData`
- `app/models/models.py` - SQLAlchemy модели
- `app/services/domain.py` - бизнес-логика day/week/penalties
- `app/api/*` - REST API
- `app/static/index.html`, `app/static/app.js` - Mini App UI
- `app/bot/bot.py` - aiogram bot (`/start` + Open App button)
- `app/db/init_db.py` - init-скрипт БД (`create_all`)

## Data Model
- `telegram_users`
- `user_settings` (`currency`, `penalty_daily_default`, `penalty_weekly_default`)
- `tasks` (`title`, `kind=daily|weekly|backlog`, `is_active`, `penalty_amount nullable`)
- `day_sessions` (`started_at`, `closed_at`)
- `week_sessions` (`started_at`, `closed_at`)
- `instances` (`status=planned|done|canceled|failed`, `penalty_applied`)

Penalty rules:
- `failed` -> штраф
- если у задачи `penalty_amount` = `null`:
  - `weekly` -> `penalty_weekly_default`
  - `daily/backlog` -> `penalty_daily_default`

## API Endpoints
Базовый префикс: `/api`

- `GET /auth/me`
- `POST /sessions/start_day`
- `POST /sessions/close_day`
- `POST /sessions/start_week`
- `POST /sessions/close_week`
- `GET /instances?scope=today|week|history`
- `PUT /instances/{id}/status`
- `POST /instances/add_backlog`
- `GET /tasks`
- `POST /tasks`
- `PUT /tasks/{id}`
- `DELETE /tasks/{id}`
- `GET /settings`
- `PUT /settings`
- `GET /stats?period=days|weeks|months`
- `GET /dashboard`

## Behavior Implemented
- `Start Day`:
  - создает open `day_session`
  - создает `planned` instances для всех активных `daily`
- `Close Day`:
  - все `planned` в текущем `day_session` -> `failed` с начислением штрафа
  - закрывает `day_session`
  - отправляет Telegram-уведомление со статистикой и суммой к переводу
- `Start Week`:
  - если есть открытая неделя: закрывает ее, все `planned weekly` -> `failed`
  - при авто-закрытии предыдущей недели отправляет Telegram-уведомление
  - открывает новую `week_session`
  - создает `planned` instances для всех активных `weekly`
- `Close Week`:
  - закрывает текущую неделю, все `planned weekly` -> `failed`
  - отправляет Telegram-уведомление со статистикой и суммой к переводу
- Backlog:
  - вручную добавляется в `Today` или `This Week` (`planned` instance)

## Local Run
1. Установить зависимости:
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

2. Настроить переменные:
```bash
cp .env.example .env
```
Заполнить минимум:
- `BOT_TOKEN`
- `MINI_APP_URL` (например `https://your-domain.com`)

3. Запустить API:
```bash
python3 run_api.py
```
Mini App доступен на `http://localhost:8000/`

4. Запустить бота (в отдельном терминале):
```bash
python3 run_bot.py
```

## Auth / Testing
В Telegram Mini App фронт отправляет заголовок:
- `X-Telegram-Init-Data` (подписанные данные)

Для локальной отладки без Telegram:
- `.env`: `DEBUG_ALLOW_FAKE_AUTH=true`
- использовать заголовок `X-Telegram-User-Id: 10001`
(фронт делает это автоматически вне Telegram)

## Deploy (VPS)
1. Поднять Python 3.12+, Nginx, systemd.
2. Скопировать проект, создать `.env`.
3. Установить зависимости в venv.
4. Запустить API через `uvicorn` за Nginx (HTTPS обязателен для Mini App).
5. Запустить `run_bot.py` как отдельный systemd сервис.

Пример сервисов:

`/etc/systemd/system/routine-api.service`
```ini
[Unit]
Description=Routine FastAPI
After=network.target

[Service]
User=www-data
WorkingDirectory=/opt/routine
EnvironmentFile=/opt/routine/.env
ExecStart=/opt/routine/.venv/bin/python run_api.py
Restart=always

[Install]
WantedBy=multi-user.target
```

`/etc/systemd/system/routine-bot.service`
```ini
[Unit]
Description=Routine Telegram Bot
After=network.target

[Service]
User=www-data
WorkingDirectory=/opt/routine
EnvironmentFile=/opt/routine/.env
ExecStart=/opt/routine/.venv/bin/python run_bot.py
Restart=always

[Install]
WantedBy=multi-user.target
```

Включение:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now routine-api routine-bot
```

## Notes
- SQLite подходит для single-node деплоя.
- Для роста нагрузки можно перейти на PostgreSQL, поменяв `DATABASE_URL`.
- Сейчас используется init-скрипт БД (`create_all`), без Alembic миграций.
