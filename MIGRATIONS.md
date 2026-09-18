# Миграция PostgreSQL

1. Создать базу и пользователя из `.env`.
2. Применить `schema.sql` одним запуском.
3. Применить `seed.sql` только для тестовой площадки.
4. Проверить индексы и healthcheck CRM.
5. Для production использовать отдельные миграции и резервную копию перед изменением схемы.
6. Для существующей базы применить `migrations/001_auth_sessions.sql` перед включением persistent sessions.

Пример для контейнера:

```bash
docker compose up -d db
# init scripts из /docker-entrypoint-initdb.d выполняются автоматически на новом томе
```

Для существующего тома:

```bash
docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < migrations/001_auth_sessions.sql
```
