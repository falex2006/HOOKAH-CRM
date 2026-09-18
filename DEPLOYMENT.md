# Развёртывание на VPS

## Подготовка

1. На VPS установить Docker Engine и Compose plugin.
2. Скопировать проект в отдельный каталог и создать `.env` из `.env.example`.
3. Задать уникальные значения `POSTGRES_PASSWORD`, `DEMO_OWNER_PASSWORD`, `DEMO_STAFF_PASSWORD`, домен и `AUTH_REQUIRED=true`.
4. Открыть наружу только 80/443; порт PostgreSQL не публиковать.

## Запуск

```bash
chmod +x deploy-vps.sh backup-postgres.sh
./deploy-vps.sh
```

Сервис CRM слушает только внутренний порт контейнера 3000. Nginx принимает внешний HTTP и проксирует запросы в CRM. После запуска проверить `docker compose ps` и `curl http://127.0.0.1/api/health`.

## HTTPS

В `nginx/default.conf` заменить `server_name` на домен. Для production выдать сертификат Let's Encrypt через Certbot или внешний reverse proxy, затем добавить listener 443 с `ssl_certificate`, `ssl_certificate_key` и редирект с 80 на 443. В `.env` оставить `AUTH_REQUIRED=true`.

## База и резервные копии

При первом запуске нового тома PostgreSQL автоматически применяются `schema.sql` и `seed.sql`. Изменения существующей базы вносить отдельными миграциями, не редактированием уже выполненных init-файлов.

```bash
BACKUP_DIR=/var/backups/hookah-crm ./backup-postgres.sh
```

Добавить эту команду в systemd timer или cron, а копии передавать на отдельное защищённое хранилище. Периодически проверять восстановление во временную базу.

## Обновление

```bash
docker compose pull
docker compose build --pull
docker compose up -d
docker compose ps
```

Перед обновлением сохранить backup. Healthcheck CRM и PostgreSQL должны быть `healthy`.
