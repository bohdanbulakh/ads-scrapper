# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Package manager is **yarn 4** (`packageManager` field); use `yarn`, not `npm`.

```bash
yarn start:dev                 # watch mode (nest start --watch --no-shell)
yarn build                     # nest build -> dist/
yarn lint                      # eslint --fix over src, test, scripts
yarn format                    # prettier
yarn test                      # jest (rootDir src, *.spec.ts)
yarn test src/foo/bar.spec.ts  # single file
yarn test -t "case name"       # single case
yarn test:e2e                  # jest --config test/jest-e2e.json (*.e2e-spec.ts)
```

Infra and data:

```bash
docker compose up -d           # postgres + redis + minio + minio-init + bull-board
yarn db:generate --name x      # drizzle migration into drizzle/ (commit it)
yarn db:migrate                # apply
yarn db:studio                 # browse
yarn seed --apps 1_000_000     # generated rows (see README for flags)
yarn seed:reset --storage      # truncate tables, drop jobs, delete seeded S3 keys
```

There are currently **no test files in the repo** — `yarn test` exits with "no tests found".

The `--no-shell` flag on the `start` scripts is deliberate: without it the Nest CLI spawns
through `/bin/sh -c` and SIGINT never reaches node, orphaning the app on port 3000.

## Architecture

An ads.txt crawler. Nothing is HTTP-driven — there are **no controllers**; the app is a
cron-fed, two-stage BullMQ pipeline over two Postgres tables.

```
apps (bundle_id, source)
  --> bundle-info-queue  --> store listing lookup --> publishers row (upsert by domain)
publishers (domain)
  --> ads-file-queue     --> GET https://<domain>/app-ads.txt --> S3 publishers/<domain>/ads.txt
```

Stage 1 (`src/queue/bundle-info/`) resolves an app's developer website to a bare domain and
upserts a `publishers` row. Stage 2 (`src/queue/ads-file/`) fetches that domain's
`app-ads.txt` and stores the body in S3/MinIO. The two stages share nothing but the
`publishers` table.

### Dispatch and the claim/lease

`TasksDispatcherService` runs both dispatchers on a 30-second cron. Each calls
`XService.enqueue()`, which tops the queue up to `QUEUE_TARGET_DEPTH` (`waiting + delayed`)
rather than draining the table — the deficit becomes the `LIMIT` of the claim query. The
processors also call `enqueue()` on the `drained` worker event, so a busy run refills itself
without waiting for the next tick (`ExtendedWorkerHost.isShuttingDown` suppresses that during
shutdown so a closing worker doesn't re-enqueue).

Claiming lives only in the DAOs (`src/dao/`): `getExpiredBundleIds` /
`getExpiredPublisherDomains` are an `UPDATE ... SET locked = true` over a
`SELECT ... FOR UPDATE SKIP LOCKED` subquery, returning the claimed rows in one round trip.
The completion side — `markPublisherFetched` / `markFileFetched` — is the *only* place that
clears `locked` and rewrites the cadence: **7 days** for an app's publisher lookup, **1 day**
for a publisher's file. Every terminal outcome (`NOT_FOUND`, `NO_DOMAIN`, `REJECTED`,
`FAILED`) goes through those two methods, so no call site can record a status and forget to
release the row. Consequence to know: a process killed mid-job leaves its rows `locked = true`
with nothing to reset them — there is no lease expiry.

Both tables carry a **partial** index on `next_to_fetch_*` `WHERE NOT locked`. The claim query
must stay written as a plain `next_to_fetch_* <= now()` range with no `OR ... IS NULL` — the
columns are `NOT NULL DEFAULT now()` precisely so the index scan has an upper bound to stop
at. See the README for the measured numbers.

### Retries vs. terminal statuses

A processor **returns** a result for anything final and **throws** only for things worth
retrying: the ads-file processor throws on 5xx and 429, everything else (404, HTML masquerading
as a 200, over the 5 MB `MAX_BYTES` ceiling) is a status write. BullMQ's defaults live in
`queue.module.ts` (3 attempts, exponential backoff). `@OnWorkerEvent('failed')` checks
`attemptsMade >= opts.attempts` and only then writes `FAILED` — so a mid-retry failure leaves
the row locked and in flight, which is what brings transient errors back in minutes rather
than after a full cadence.

### Fetcher swap (FAKE_FETCH)

The two network calls sit behind injection tokens — `STORE_LISTING_FETCHER` and
`ADS_FILE_FETCHER` — with the real/fake implementation chosen by a `useFactory` in
`queue.module.ts` from `fakeFetch.enabled`. Everything downstream of the fetch is the same
code path either way. The fakes are deterministic (hash of the bundle id/domain, see
`src/queue/fake/fake-fetch.util.ts`) and answer with roughly the real status mix; seeded
domains are `seed-<n>.example`, a reserved TLD, so a run that forgets `FAKE_FETCH=true` fails
fast instead of crawling strangers. Joi rejects `FAKE_FETCH=true` when `NODE_ENV=production`.

Anything new that talks to a third party should follow the same shape: interface + token in
its own file, real and fake implementations beside it, wired in `queue.module.ts`.

### Config

`src/common/config/schemas/<name>-config.ts` exports three things: the `XConfig` interface, an
`xConfig()` factory reading `process.env`, and an `xEnvSchema` object of Joi rules. A new
variable means editing one schema file and registering it in **both** `configuration.ts`
(`RootConfig` + the factory) and `env.validation.ts` (spread into the Joi object). The Joi
schema is the single source of truth for defaults and required-ness — its defaults are written
back onto `process.env` before the factories run, so never default a value at the point of use.

Read config through `ExtendedConfigService.get('redis.port')`: typed from `RootConfig`, throws
`NotFoundConfig: <path>` instead of returning `undefined`. The one exception is
`WORKER_CONCURRENCY` — `@Processor({ concurrency })` is evaluated at import time, before DI
exists, so `src/queue/worker-concurrency.ts` reads `process.env` directly; it is still declared
in `queue-config.ts` so it stays validated and documented.

### Database access

`DatabaseModule` is global and exports the `DRIZZLE` token (`@Inject(DRIZZLE) db: DrizzleDatabase`).
Queries belong in a DAO under `src/dao/`, not in processors or services — the processors depend
on `AppDao` / `PublisherDao` and never touch drizzle directly. Schema is
`src/database/schema/`, re-exported through its `index.ts`, which is also what `drizzle.config.ts`
points at; enums are Postgres `pgEnum`s paired with a TS `enum` of the same name.

`DatabaseModule.onModuleInit` probes the pool and `StorageModule.onModuleInit` sends a
`HeadBucket`, so the app exits 1 at boot rather than failing per-job when Postgres or MinIO is
unreachable.

## Conventions

- **Relative imports only** — there are no `@/` path aliases (they were deliberately removed);
  `tsconfig.json` defines no `paths`.
- Injection tokens are declared next to the interface they provide, in a `*.constants.ts` or
  the interface file itself.
- Queue name, job name, job data and job result types for a queue live together in that
  queue's `*.constants.ts`.
- `scripts/` is outside `rootDir` and compiles under `scripts/tsconfig.json` via ts-node; it
  talks to Postgres through a raw `pg.Pool`, not Nest.
- Comments in this codebase explain *why* a non-obvious choice was made (index predicates,
  `--no-shell`, `tsBuildInfoFile` placement). Match that register — don't narrate what the code
  already says.
