# Выпуск локального полного QA — 01.10.2026

Пользователь авторизовал коммит, GitHub и VPS. Пакет подготовлен в отдельном reconcile checkout; исходный грязный рабочий проект сохранён. Remote main является предком кандидата, публикация выполняется fast-forward без переписывания истории.

## Gate до публикации

- Code health и system architect/release review: GO с проверкой backup/restore и фактического production identity.
- Полный локальный runner: 167/167 PASS; после исправления escaping launcher static: 125/125 PASS.
- Повтор release smoke: dist, навигация, dashboard, employee report, guards, diff PASS; 360 файлов соответствуют проверенному Docker manifest.
- Секрет-скан: 0 findings; tmp, runtime .env, локальные credentials и QA база не входят в коммит/образ.
- Новых SQL миграций нет. Production остаётся на существующем PostgreSQL volume; локальные fixtures на VPS не переносятся.
- Мобильная/Fold адаптация отложена пользователем. Внешняя Telegram доставка, принтеры и реальные платежные шлюзы не подтверждаются этими проверками.

## План VPS

Создать уникальный snapshot предыдущего checkout, image, release state и БД; проверить восстановление дампа в отдельной временной БД. Новый clean checkout получить из Git bundle точного опубликованного SHA, скопировать существующий серверный .env без изменения ключей, project territory-crm и volume territory-crm_pgdata. Выполнить официальный deploy-vps.sh с разовым разрешённым HTTP opt-in. Перед seed проверить отсутствие archived baseline категорий.

После запуска проверить exact commit, release fingerprint/image, health с database=postgres, неизменность .env/volume, публичные файлы по Git blob и вход/session/logout и навигацию в браузере. При откате использовать предыдущий image/checkout с тем же DB volume; не восстанавливать БД автоматически поверх текущих данных.

Это pre-release запись, сама по себе не подтверждает завершение production deployment.
