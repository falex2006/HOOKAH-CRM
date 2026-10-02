# Интеграция Hookah POS brand kit — 2026-10-01

Источник: пользовательский `Hookah-POS-brand-kit.zip`, SHA-256 `FC94A80E678D2F0C14CEF353B6A926C179E6ABB48B1DE9C3750412A7A1A7974D`. Прочитаны README, USAGE, brand-manifest и SVG; просмотрен auth preview. Вложенные генераторы Python и preview.html не запускались и не публиковались.

## Принятый контракт

| Поверхность | Актив | Отображение |
| --- | --- | --- |
| Staff/admin/SaaS sidebar | lockup-animated.svg | Полный логотип с мягкой подсветкой, до190×61px, contain; выбран пользователем |
| Авторизация и первый запуск | lockup-animated.svg | Полный продуктовый бренд, до240×76.8px; без подмены логотипом заведения |
| Reduced motion sidebar/auth | lockup.svg | Неподвижный matching lockup через picture source |
| Существующий compact sidebar | symbol.svg | Статичный знак; breakpoint/layout сохранён |
| Блокировка | lockup.svg | Статичный продуктовый бренд180×57.6px отдельно от аватара сотрудника |
| Favicon/Apple/PWA/Safari/OG | icons/* | Статичные активы архива |

Все runtime активы расположены в `/assets/brand/`, иконки в `/assets/brand/icons/`. Относительные icon URLs manifest сохранены. Импортированы21 файлы без изменения их содержимого; премиальные альтернативы, GIF-превью и генераторы не включены. Стандартные static lockup/symbol уже совпадали с архивом, поэтому их геометрия не менялась. Светлые варианты сохранены для будущих светлых поверхностей; новая тема не создаётся.

## Техническая связка

- `sync-published-assets.mjs` задаёт единый brand head, sidebar picture и rev2 для41 исходных/публикационных HTML; assets копируются в dist. Повторный sync не добавляет дубликаты metadata/source.
- CSS369: отдельный ограниченный auth logo slot, неизменный sidebar slot. Login97 исключает подмену product logo tenant logo; lock21 сохраняет существующий PIN и аватар.
- Server точечно разрешает21runtime paths и корректные MIME SVG/PNG/ICO/webmanifest; дополнительные файлы репозитория не становятся публичными. Docker уже копирует assets directory.
- Manifest добавляет только metadata/иконки; service worker, offline-механизм и установка PWA не дорабатывались. Социальные превью на публичном домене не проверялись; домен/HTTPS остаются будущим этапом.

## Проверка на компьютере

- Brand-kit/sidebar-brand/login/lock/design/auth-smoke-runtime/local-static-boundary contracts — PASS; syntax и source/dist parity проверены.
- Docker build PASS; HTTP GET всех21активов в loopback preview31921 и временном Docker31925 —200, содержимое совпадает с исходными файлами. ICO/webmanifest MIME проверены; preview.html/README/generator URLs —404.
- CUA login: currentSrc animated, natural300×96, displayed240×76.8, весь текст виден. Staff/admin:161.675×51.725, right185.7 внутри sidebar210.525. SaaS shell173.2×55.413, right201.2 внутри sidebar230; это проверка бренда оболочки, не новая приёмка доступа SaaS.
- В SVG browser document наблюдались3running animations `hookah-cell-glint`, duration5.4s, меняющаяся opacity разных ячеек. Геометрия и текст статичны. Reduced-motion fallback проверен контрактом и встроенным CSS SVG; системная настройка компьютера не переключалась.
- Блокировка/возврат проверены на синтетическом сотруднике с тестовым PIN: аватар и бренд различимы; возврат показывает рабочий зал. AX snapshot сохранял скрытый dialog после unlock, фактические aria-hidden=true/opacity0/pointer-eventsnone и screenshot подтвердили закрытие.
- Proof screenshots: `tmp/brand-kit/login-final.png`, `admin-final.png`, `staff-final.png`, `lock-final.png`, `platform-brand.png`; вне Git/release.
- Мобильная компоновка, Fold/телефон и мобильные проверки отложены пользователем. Реальные аккаунты, основной dirty checkout и VPS не изменялись. Остальная функциональная доработка приостановлена по текущему запросу.
