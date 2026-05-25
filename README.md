# Consentry

Сервис управления предпочтениями уведомлений - единый источник правды о  
том, какие уведомления, по каким каналам и в какое время можно отправлять  
конкретному пользователю.

Управляет тремя уровнями правил:

1. **Дефолты** для всех пользователей (`src/domain/defaults.ts`).
2. **Индивидуальные настройки** пользователя (включения/выключения по парам
  «тип × канал» + quiet hours в его таймзоне).
3. **Глобальные политики** - запреты по типу/каналу/региону
  (например, `marketing_sms` запрещён в `EU`).

Стек: **TypeScript + Node.js 20 + Fastify + Kysely + PostgreSQL + Vitest**.

---

## Запуск

### Через Docker Compose (рекомендуется)

```bash
docker compose up --build
```

Контейнер `app` сам прогоняет миграции и seed на старте, API поднимается на
`http://localhost:3000`.

### Локально, против своего PostgreSQL

```bash
cp .env.example .env       # при необходимости поправь DATABASE_URL
npm install
npm run migrate            # накатывает схему
npm run seed               # добавляет политику запрета marketing_sms в EU
npm run dev                # http://localhost:3000
```

### Тесты

```bash
npm test
```

- `quietHours.test.ts`, `evaluate.test.ts`, `merge.test.ts` - чистые
доменные тесты, инфраструктура не нужна.
- `integration.test.ts` - полный путь HTTP + реальный PostgreSQL через
[`testcontainers`]. Автоматически скипается, если Docker недоступен,
чтобы прогон всегда был зелёным.

---

## API

Все тела запросов и ответов - JSON.

### `GET /users/:id/preferences`

Возвращает **эффективные** настройки (дефолты, перекрытые индивидуальными
выборами пользователя):

```json
{
  "userId": "user-1",
  "items": [
    { "notificationType": "marketing_email", "channel": "email", "enabled": false },
    { "notificationType": "transactional_email", "channel": "email", "enabled": true }
  ],
  "quietHours": null,
  "updatedAt": "2026-05-25T10:00:00.000Z"
}
```

Если пользователя ещё нет в БД - пустая запись создаётся при первом
обращении, чтобы все последующие операции были адресуемы. Сами дефолты
**не материализуются** в БД: они применяются на чтении и на `evaluate`.
Это даёт дешёвый rollout новых дефолтов - все пользователи получают новое
значение со следующего запроса, без backfill.

### `POST /users/:id/preferences`

Тело - хотя бы одно поле должно присутствовать:

```json
{
  "items": [
    { "notificationType": "marketing_email", "channel": "email", "enabled": false }
  ],
  "quietHours": {
    "start": "22:00",
    "end": "08:00",
    "timezone": "Europe/Moscow",
    "appliesTo": ["marketing_push"]
  }
}
```

Заголовки:

- `Idempotency-Key: <opaque-string>` - необязательный. Если не передан,
сервис считает стабильный SHA-256 от канонического тела запроса, так
что побайтово идентичные повторы тоже схлопываются.

Ответ - обновлённые эффективные настройки. Заголовок
`x-idempotent-replay: true|false` подсказывает клиенту, был ли это повтор.

### `POST /evaluate`

```json
{
  "userId": "user-1",
  "notificationType": "marketing_email",
  "channel": "email",
  "region": "EU",
  "datetime": "2026-05-21T21:30:00Z"
}
```

Ответ:

```json
{ "decision": "deny", "reason": "blocked_by_global_policy", "detail": "..." }
```

Возможные значения `reason`: `allowed`, `blocked_by_global_policy`,
`disabled_by_user`, `quiet_hours`.

### `GET /health`

Эндпоинт для liveness/readiness-проб в Kubernetes.

---

## Архитектура

```
src/
  domain/           # чистые типы и правила, без I/O
    types.ts        # NotificationType, Channel, QuietHours, ...
    defaults.ts     # матрица дефолтных предпочтений
    quietHours.ts   # таймзоно-корректная проверка окна (Luxon)
    evaluate.ts     # движок решений (одна функция)
    merge.ts        # дефолты ⊕ перекрытия пользователя
  application/
    preferencesService.ts   # юзкейсы, структурное логирование, идемпотентность
  infrastructure/
    db/             # Kysely-схема, репозитории, мигратор, seed
    http/           # Fastify + Zod-валидация
    logging/        # фабрика логгера pino
  config/env.ts     # валидация переменных окружения через Zod
  main.ts           # composition root + graceful shutdown
migrations/         # plain SQL, накатывается собственным мигратором
k8s/                # Deployment + Service + Secret
test/               # vitest: unit + интеграционные с PostgreSQL
```

### Почему именно так

- **Чистое доменное ядро.** `evaluate`, `quietHours`, `merge` ничего не
знают про Postgres и HTTP - их тривиально покрыть unit-тестами.
- **Kysely вместо ORM.** Сквозные TypeScript-типы поверх рукописного
SQL, никакой кодогенерации в рантайме и DSL для миграций.
- **Идемпотентность на границе хранилища.** Таблица
`preference_change_log` с `UNIQUE (user_id, idempotency_key)` делает
повторы no-op без оптимистичных блокировок. Ключ либо приходит от
клиента, либо вычисляется детерминированно из канонического тела.
- **Явный порядок правил** в `evaluate.ts`: глобальная политика →
настройка пользователя → quiet hours. Возвращаемый `reason` - это
ровно то, что хочется видеть на дашбордах.
- **Дефолты применяются на чтении.** Принятие нового дефолта не требует
backfill - каждый пользователь получает новое значение со следующего
запроса.
- **Quiet hours корректны по таймзоне.** Окна, пересекающие полночь
(`22:00`–`08:00`), вычисляются в IANA-зоне пользователя через Luxon,
без арифметики на строках.

### Observability

`pino` пишет структурированные JSON-логи. Два ключевых события:

- `preferences.updated` - с `idempotencyKey`, `alreadyApplied`,
числом изменённых элементов.
- `evaluate.decision` - с `decision`, `reason` и всеми входами оценки.

Для метрик это естественные точки расширения: те же события должны стать
счётчиками (`evaluate_decision_total{reason=...}`,
`preference_updates_total{replay="true|false"}`) и гистограммой
латентности `evaluate`. Реестр `prom-client`, прокинутый в Fastify
на `/metrics`, - следующий шаг.

---

## Что добавил бы для продакшена

- **Аутентификация и авторизация** на каждом маршруте (в тестовом
намеренно опущено). Как минимум - JWT для сервис-сервис вызовов и
scope-проверка пользователя на `/users/:id/preferences`.
- **Метрики Prometheus** (`prom-client`) и трейсинг
(`@opentelemetry/*`) с экспортом туда, куда смотрит платформа;
middleware с correlation-id.
- **Кэш `policies.list()`** с коротким TTL и инвалидацией по событию -
политики меняются редко, а `evaluate` находится на горячем пути.
- **CRUD для глобальных политик** (админский эндпоинт или внутренняя
CLI). Сейчас они грузятся миграцией/сидом, потому что ТЗ не просит
отдельной поверхности.
- **Outbox-события `preferences.updated`** для downstream-сервисов,
которым нужно инвалидировать свои кэши.
- **Backfill-джоба**, материализующая дефолты в строки на пользователя,
когда каталог стабилизируется - упрощает запросы и даёт аудит.
- **Контрактные тесты** для API-консьюмеров: автоматическая публикация
OpenAPI-спеки, сгенерированной из Zod-схем через `zod-to-openapi`.
- **CI**: lint + unit на каждый PR, интеграционные тесты на `main`
через testcontainers, сборка образа + Trivy-скан, деплой через
Helm/Argo.

