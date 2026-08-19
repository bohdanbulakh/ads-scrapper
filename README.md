# ads-scrapper

A crawler for publisher `app-ads.txt` files, built on NestJS + BullMQ.

Given a table of mobile app bundle ids, it resolves each one to its developer's
domain through the App Store / Play listing, then fetches `app-ads.txt` from that
domain and stores the file in S3. Both halves run continuously on a schedule, so
the data refreshes itself rather than being a one-off import.

The app has **no HTTP API** — there are no controllers. It listens on `PORT`
only so the process holds a port; everything is driven by cron and queues.

## How it works

```
apps (bundle_id, source)
  ──► bundle-info-queue ──► store listing lookup ──► publishers row (upsert by domain)
                                                        │
publishers (domain) ◄───────────────────────────────────┘
  ──► ads-file-queue    ──► GET https://<domain>/app-ads.txt ──► s3://<bucket>/publishers/<domain>/ads.txt
```

**Stage 1 — `src/queue/bundle-info/`.** Takes an app's bundle id, looks the
listing up (iTunes lookup API for `APP_STORE`, `google-play-scraper` for
`PLAY_MARKET`), reduces the developer website to a bare hostname, and upserts a
`publishers` row on that domain. Many apps collapse onto one publisher, which is
the point — the file is fetched once per domain, not once per app.

**Stage 2 — `src/queue/ads-file/`.** Takes a publisher domain, fetches
`https://<domain>/app-ads.txt`, and puts the body in the bucket. The outcome is
recorded on the row either way.

Each stage records a status and its own next-fetch time:

| `apps.publisher_fetch_status` | meaning |
| --- | --- |
| `RESOLVED` | listing had a usable website; `publisher_id` is set |
| `NO_DOMAIN` | listing exists, but no usable developer website on it |
| `NOT_FOUND` | no listing for that bundle id |
| `FAILED` | the job threw and used up its retries |

| `publishers.ads_file_fetch_status` | meaning |
| --- | --- |
| `STORED` | body written to the bucket |
| `NOT_FOUND` | 404, or a 200 that is really an HTML error page |
| `REJECTED` | over the 5 MB ceiling — not a real `app-ads.txt` |
| `FAILED` | the job threw and used up its retries |

## Project setup

```bash
$ yarn install
```

## Environment variables

All ports, credentials and connection settings live in the root `.env` file.
`.env` is gitignored — `.env.example` is the committed template, so mirror any
new variable there.

```bash
$ cp .env.example .env
```

Docker Compose auto-loads the root `.env`, so the same file drives both the
published host ports in `docker-compose.yml` and the environment passed into the
containers via `env_file`.

## Infrastructure (PostgreSQL + Redis + MinIO)

```bash
# start postgres + redis + minio + the web UIs in the background
$ docker compose up -d

# check health
$ docker compose ps

# tail logs
$ docker compose logs -f

# stop (keeps data)
$ docker compose down

# stop and wipe the postgres/redis/minio volumes
$ docker compose down -v
```

Data is persisted in the named volumes `postgres_data`, `redis_data` and
`minio_data`. Redis runs with `--requirepass` and AOF persistence enabled.

`minio-init` is a one-shot `minio/mc` container: it waits for MinIO to become
healthy, creates `S3_BUCKET` if it is missing and exits `0`. Nothing else
creates the bucket, so a fresh `docker compose up -d` is enough to get the app
writing files.

Compose runs the dependencies only — the app itself is not containerised here,
it runs on the host with `yarn start:dev`.

### Web UIs

| UI | URL | Credentials |
| --- | --- | --- |
| **Bull Board** — BullMQ queues | http://localhost:3001 | none by default |
| **MinIO Console** — S3 browser | http://localhost:9001 | `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` |

Bull Board (`venatum/bull-board`, same bullmq major as the app) lists every
queue it finds under the `bull:*` keys in redis, so `bundle-info-queue` and
`ads-file-queue` appear without being configured anywhere. Per queue it shows
the waiting/active/delayed/completed/failed counts, each job's payload, return
value and stack trace, and lets you retry, promote or clean jobs — it writes to
redis, so treat it as a dev/ops tool, not a read-only viewer. Set
`BULL_BOARD_USER` + `BULL_BOARD_PASSWORD` to put it behind a login page, and
`BULL_BOARD_PORT` to move it off 3001 (3000 is left free for the Nest app).

The MinIO Console ships inside the `minio/minio` image — there is no separate
container. Recent MinIO releases trimmed it down to the object browser: buckets,
folders, object preview, upload and download, which is what is needed to inspect
the fetched `ads.txt` files. For anything beyond that (policies, users, lifecycle
rules) use `mc`:

```bash
$ docker compose run --rm --entrypoint sh minio-init -c \
    'mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" && mc ls -r local/"$S3_BUCKET"'
```

Use `localhost` in `DATABASE_URL`/`REDIS_HOST` when running the app on the host,
or the service names `postgres`/`redis` when running it inside the compose
network.

The app reads `DATABASE_URL`, `REDIS_*` and `S3_*`; `POSTGRES_*` and `MINIO_*`
exist only to configure the containers and the published host ports. Keep the
two sides in sync — `S3_ACCESS_KEY`/`S3_SECRET_KEY` are the same pair as
`MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD`.

### Config layer

`src/common/config/` holds one file per namespace under `schemas/`, each
exporting three things: the `XConfig` interface, an `xConfig()` factory that
reads `process.env`, and an `xEnvSchema` object of Joi rules.

```
src/common/config/
  schemas/app-config.ts         AppConfig       | appConfig()       | appEnvSchema
  schemas/database-config.ts    DatabaseConfig  | databaseConfig()  | databaseEnvSchema
  schemas/fake-fetch-config.ts  FakeFetchConfig | fakeFetchConfig() | fakeFetchEnvSchema
  schemas/queue-config.ts       QueueConfig     | queueConfig()     | queueEnvSchema
  schemas/redis-config.ts       RedisConfig     | redisConfig()     | redisEnvSchema
  schemas/storage-config.ts     StorageConfig   | storageConfig()   | storageEnvSchema
  configuration.ts              RootConfig — composes the factories
  env.validation.ts             spreads the rule objects into one Joi.object()
  config-infra.module.ts        ConfigInfraModule (global)
  extended-config.service.ts    ExtendedConfigService
```

Adding a variable means touching one schema file and registering it in both
`configuration.ts` (the `RootConfig` field and its factory) and
`env.validation.ts` (the spread of its rule object).

Config is read through `ExtendedConfigService`, which infers types from
`RootConfig` and throws on a missing path instead of returning `undefined`:

```ts
constructor(private readonly config: ExtendedConfigService) {}

this.config.get('database.url'); // string
this.config.get('redis.port'); // number
this.config.get('redis.nope'); // Error: NotFoundConfig: redis.nope
```

The one setting that cannot come from here is `WORKER_CONCURRENCY`:
`@Processor({ concurrency })` is evaluated when the decorator runs, at import
time, before Nest has built the container. `src/queue/worker-concurrency.ts`
reads `process.env` directly for that window; the variable is still declared in
`queue-config.ts` so it stays validated and documented with the rest.

### Validation

The environment is validated with Joi at startup, so a bad `.env` fails the boot
instead of surfacing later as a connection error:

```
Error: Config validation error: "NODE_ENV" must be one of [development, test, production]
"REDIS_PORT" must be a valid port
```

Validation runs with `abortEarly: false`, so every problem is reported at once,
and `.unknown(true)` lets unrelated variables (including the `POSTGRES_*` ones
that only docker-compose reads) pass through.

The Joi schema is the single source of truth for defaults and required-ness —
`DATABASE_URL`, `REDIS_PASSWORD`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` and
`S3_BUCKET` are required, everything else defaults. Joi's defaults are written
back onto `process.env` before the config factories run, so add new variables to
the schema rather than defaulting them at the point of use.

## Database (Drizzle ORM)

Schema lives in `src/database/schema/`, migrations are generated into `drizzle/`
and are meant to be committed.

```bash
# after editing the schema, generate a migration
$ yarn db:generate --name add_something

# apply pending migrations
$ yarn db:migrate

# push the schema straight to the db without a migration file (dev only)
$ yarn db:push

# browse the data
$ yarn db:studio
```

Two tables: `apps` (one row per bundle id) and `publishers` (one row per
domain), joined by a nullable `apps.publisher_id`. Postgres enums back the two
status columns, each paired with a TypeScript `enum` of the same name.

`DatabaseModule` is global and exports the `DRIZZLE` provider, but queries belong
in a DAO under `src/dao/` — the processors depend on `AppDao` / `PublisherDao`
and never touch drizzle directly:

```ts
import { Inject, Injectable } from '@nestjs/common';
import { DRIZZLE, type DrizzleDatabase } from '../database/database.constants';
import { app } from '../database/schema';

@Injectable()
export class AppDao {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDatabase) {}

  findAll() {
    return this.db.select().from(app);
  }
}
```

`onModuleInit` probes the pool once at boot, so an unreachable database exits the
process instead of surfacing later as a failure on every job.

## Queues (BullMQ)

`QueueModule` is global. It configures the BullMQ redis connection from `.env`
and registers both queues:

| queue | producer | consumer | job data |
| --- | --- | --- | --- |
| `bundle-info-queue` | `BundleInfoService` | `BundleInfoProcessor` | `{ appId, bundleId, source }` |
| `ads-file-queue` | `AdsFileService` | `AdsFileProcessor` | `{ publisherId, domain }` |

Queue name, job name and the job data/result types for each queue live together
in that queue's `*.constants.ts`. Default job options (3 attempts, exponential
backoff, completed/failed retention) are set once in `queue.module.ts`.

### Dispatching

`TasksDispatcherService` runs both dispatchers on a 30-second cron. Neither
drains its table: `enqueue()` reads the queue's `waiting + delayed` count and
claims only the difference from `QUEUE_TARGET_DEPTH`, so the deficit becomes the
`LIMIT` of the claim query and redis never holds more than a few hundred jobs
regardless of how many rows are due.

The processors also call `enqueue()` on the worker's `drained` event, so a busy
run refills itself instead of idling until the next tick.
`ExtendedWorkerHost.isShuttingDown` suppresses that during shutdown — otherwise a
closing worker would re-enqueue on its way out.

### Claiming rows

Claiming lives only in the DAOs. `getExpiredBundleIds` /
`getExpiredPublisherDomains` are a single `UPDATE ... SET locked = true` over a
`SELECT ... FOR UPDATE SKIP LOCKED` subquery, returning the claimed rows in one
round trip — two dispatcher ticks, or two app instances, can never take the same
row.

`locked` is what keeps a row out of the next tick while its job is in flight;
`next_to_fetch_*` is the schedule. Only the completion side —
`markPublisherFetched` / `markFileFetched` — writes either one back: it clears
`locked` and sets the real cadence, **7 days** for an app's publisher lookup,
**1 day** for a publisher's `app-ads.txt`. The file is the thing that actually
changes; the publisher behind a bundle rarely does.

Every terminal outcome goes through those two methods, `NOT_FOUND`, `NO_DOMAIN`
and `REJECTED` included, so no call site can record a status and forget to
release and reschedule the row. The cadence itself is written in one place per
table, in the DAO.

One consequence worth knowing: a process killed mid-job leaves its claimed rows
`locked = true`, and nothing resets them — there is no lease expiry. After a hard
stop, clear them by hand (`UPDATE apps SET locked = false WHERE locked`) or reset
the test data.

### Retries

A processor **returns** a result for anything final and **throws** only for what
is worth retrying. The ads-file processor throws on 5xx and 429; a 404, an HTML
page served with a 200, or a body over 5 MB are all status writes, not errors.
BullMQ retries a thrown job three times with exponential backoff, and
`@OnWorkerEvent('failed')` writes `FAILED` only once `attemptsMade` has caught up
with `opts.attempts`. Until then the row stays locked and in flight, which is
what brings a transient failure back round in minutes rather than after a full
cadence.

### Fetchers

The two network calls sit behind injection tokens — `STORE_LISTING_FETCHER` and
`ADS_FILE_FETCHER` — and `queue.module.ts` picks the real or the fake
implementation from `fakeFetch.enabled` at startup. Nothing downstream of the
fetch knows which one it got. Anything else that talks to a third party should
follow the same shape: interface and token in one file, real and fake
implementations beside it.

## Storage (S3 / MinIO)

`StorageModule` is global and wraps one `S3Client`. Files are written to
`publishers/<domain>/ads.txt` as `text/plain; charset=utf-8` — one object per
publisher, overwritten on each refetch.

`onModuleInit` sends a `HeadBucket`, so a missing bucket or bad credentials stop
the boot with a message naming the variables to check rather than failing on the
first stored file. `S3_FORCE_PATH_STYLE` stays `true` for MinIO
(`host/bucket`) and goes `false` against real AWS (`bucket.host`).

## Seeding test data

Two scripts fill the stack with generated data so the dispatchers and both
queues can be driven at a realistic size, and clear it again afterwards.

```bash
# a million apps (the default)
$ yarn seed

# ten million, wiping whatever is there first
$ yarn seed --apps 10_000_000 --truncate

# publishers only, to exercise the ads-file queue on its own
$ yarn seed --publishers 50000

$ yarn seed --help
```

| flag | default | meaning |
| --- | --- | --- |
| `--apps <count>` | `1_000_000` | rows to insert into `apps` |
| `--publishers <count>` | `0` | rows to insert into `publishers` |
| `--truncate` | off | empty `apps` + `publishers` first |
| `--yes` | off | skip the confirmation prompt |

Counts are written as `1000000` or `1_000_000`. Every seeded row is due
immediately, and 65% of the bundles are `PLAY_MARKET` — the rest are `APP_STORE`
numeric track ids. Rows are generated inside postgres with `generate_series`, so
only the row count crosses the wire — ten million apps takes about 90 seconds.

### Fake fetching

The seeded bundle ids are made up. Pointed at the real fetchers they would
produce ten million App Store and Play lookups that all miss, and get the
crawler rate-limited long before that. So run the app with `FAKE_FETCH=true`:

```bash
$ FAKE_FETCH=true LOG_LEVELS=warn,error WORKER_CONCURRENCY=50 yarn start
```

`FAKE_FETCH` swaps the two network calls — and only those — for stand-ins that
answer from the bundle id or domain itself. Everything downstream is the real
code path: the same status transitions, the same publisher upsert, the same
5 MB ceiling, the same writes to S3. The stand-ins are deterministic, so a given
bundle id always resolves the same way, and they cover every branch the
processors have:

| store lookup | | app-ads.txt fetch | |
| --- | --- | --- | --- |
| `RESOLVED` | 76% | `STORED` | 71% |
| `NO_DOMAIN` | 16% | `NOT_FOUND` (404 or an HTML error page) | 25% |
| `NOT_FOUND` | 8% | `REJECTED` (over 5 MB) | 2% |
| | | 429, handed back to the queue's retry | 2% |

The `NO_DOMAIN` share includes listings whose website is there but unusable — an
`ftp://` URL, `localhost`, a literal `N/A` — so the domain parsing gets
exercised too. Stored bodies are empty: what is being rehearsed is the path, not
the content. `FAKE_FETCH_FAILURE_RATE` (default `0`) layers random throws on top
of both stand-ins to exercise the retry path; unlike everything else about them
it is random rather than derived, so a retry can succeed.

The publisher domains come from a bounded pool (`FAKE_FETCH_PUBLISHER_POOL`),
which is what makes one publisher back many apps the way it does in production —
and what stops ten million apps from becoming ten million objects in S3. Domains
are `seed-<n>.example`; `.example` is reserved and never resolves, so a run that
accidentally starts without `FAKE_FETCH` fails fast instead of crawling someone.

`FAKE_FETCH=true` is rejected outright when `NODE_ENV=production`.

### Throughput knobs

`WORKER_CONCURRENCY` (default 10) is what makes a seeded run move; it is low by
default because the real processors talk to third parties. `QUEUE_TARGET_DEPTH`
(default 500) is how many jobs the dispatchers keep queued ahead of the workers,
and wants to stay comfortably above the concurrency. `LOG_LEVELS` matters more
than it looks: the processors log a line per job, and at a few thousand jobs a
second stdout becomes the bottleneck.

Both `apps` and `publishers` carry a **partial** index on their
`next_to_fetch_*` column, `WHERE NOT locked`, which the dispatchers' claim query
needs. Two details keep it doing its job, and the claim query has to be written
to match:

- `next_to_fetch_*` is `NOT NULL DEFAULT now()`, so eligibility is the plain
  range `next_to_fetch_* <= now()`. Spelling it `<= now() OR ... IS NULL`
  instead leaves the index scan with no upper bound to stop at: it walks the
  whole index looking for the NULLs, which sort last. Measured on 2M seeded
  apps, once the timed backlog drains: 1.6 seconds against 1 millisecond.
- `WHERE NOT locked` keeps rows that are in flight out of the index entirely.
  Without it a slow batch parks its rows at the head of the index and every
  later claim filters past them — 50k locked rows cost 67 milliseconds a tick
  against 1.8 with the predicate. It is free on the write side, since finishing
  a job rewrites `next_to_fetch_*` anyway.

### Cleaning up

```bash
# truncate both tables and drop every queued job
$ yarn seed:reset

# ...and delete the seeded app-ads.txt objects from the bucket
$ yarn seed:reset --storage
```

Stop the app first — a running worker will re-enqueue while this deletes.
`--storage` only removes keys under the seeded `seed-*.example` domains, so
files from a real crawl survive; the truncate is not that selective and empties
both tables outright, which `--keep-db` skips.

## Compile and run the project

```bash
# development
$ yarn run start

# watch mode
$ yarn run start:dev

# production mode
$ yarn run start:prod
```

The `start` scripts pass `--no-shell` on purpose. By default the Nest CLI spawns
the app through `/bin/sh -c`, and it forwards SIGINT to that shell rather than to
node — the shell dies without passing the signal on, orphaning the app and
leaving port 3000 held (`EADDRINUSE` on the next start). `--no-shell` makes the
CLI spawn node directly so the signal reaches it.

One case this does not cover: signalling the **yarn** process alone, which does
not forward to the CLI. A terminal ctrl+c is unaffected (it signals the whole
process group), but an IDE run configuration that stops by killing only the yarn
PID will still orphan the app. Point such configs at
`node_modules/.bin/nest start --watch --no-shell` directly, or enable
"kill process tree". To clear a stale one: `pkill -f dist/main`.

The app also refuses to start if the database or the bucket is unreachable —
`onModuleInit` probes each once and lets the error propagate, so `bootstrap()`
logs it and exits 1 rather than running a pipeline that fails on every job.

## Lint and format

```bash
$ yarn lint     # eslint --fix over src, apps, libs, test, scripts
$ yarn format   # prettier over src and test
```

## Run tests

```bash
# unit tests
$ yarn run test

# e2e tests
$ yarn run test:e2e

# test coverage
$ yarn run test:cov
```

There are no spec files in the repo yet, so all three currently report that no
tests were found. Unit specs are picked up as `src/**/*.spec.ts`; e2e specs as
`test/**/*.e2e-spec.ts` under `test/jest-e2e.json`.
