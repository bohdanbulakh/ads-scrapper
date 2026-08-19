<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

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

The app reads `DATABASE_URL` and `REDIS_*`; `POSTGRES_*` exists only to configure
the postgres container and the published host port. Keep the two in sync.

### Config layer

`src/common/config/` holds one file per namespace under `schemas/`, each
exporting three things: the `XConfig` interface, an `xConfig()` factory that
reads `process.env`, and an `xEnvSchema` object of Joi rules.

```
src/common/config/
  schemas/app-config.ts        AppConfig      | appConfig()      | appEnvSchema
  schemas/database-config.ts   DatabaseConfig | databaseConfig() | databaseEnvSchema
  schemas/redis-config.ts      RedisConfig    | redisConfig()    | redisEnvSchema
  configuration.ts             RootConfig — composes the factories
  env.validation.ts            spreads the rule objects into one Joi.object()
  config-infra.module.ts       ConfigInfraModule (global)
  extended-config.service.ts   ExtendedConfigService
```

Adding a variable means touching one schema file plus `configuration.ts`.

Config is read through `ExtendedConfigService`, which infers types from
`RootConfig` and throws on a missing path instead of returning `undefined`:

```ts
constructor(private readonly config: ExtendedConfigService) {}

this.config.get('database.url'); // string
this.config.get('redis.port'); // number
this.config.get('redis.nope'); // Error: NotFoundConfig: redis.nope
```

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
`DATABASE_URL` and `REDIS_PASSWORD` are required, everything else defaults.
Joi's defaults are written back onto `process.env` before the config factories
run, so add new variables to the schema rather than defaulting them at the point
of use.

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

`DatabaseModule` is global and exports the `DRIZZLE` provider:

```ts
import { Inject, Injectable } from '@nestjs/common';
import { DRIZZLE, DrizzleDatabase } from '@/database/database.constants';
import { ads } from '@/database/schema';

@Injectable()
export class AdsService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDatabase) {}

  findAll() {
    return this.db.select().from(ads);
  }
}
```

## Queues (BullMQ)

`QueueModule` is global, configures the BullMQ Redis connection from `.env` and
registers the `scrape` queue. Producer: `AdsFileService`, consumer:
`AdsFileProcessor` (`src/queue/`).

```ts
constructor(private readonly scrape: ScrapeService) {}

await this.scrape.enqueue({ source: 'olx', url: 'https://…' });
```

Default job options (3 attempts, exponential backoff, completed/failed
retention) are set once in `queue.module.ts`.

### Fetch scheduling

Each table carries a `next_to_fetch_*` column, and two different things write to
it:

- **The claim**, in `getExpiredBundleIds` / `getExpiredPublisherDomains`. A
  dispatcher tick takes the due rows and pushes them **10 minutes** out. That is
  a lease, not a schedule — it keeps the next tick off a row while its job is in
  flight, and releases it again if the worker dies mid-job.
- **The completion**, in `markPublisherFetched` / `markFileFetched`. Once a job
  finishes it overwrites the lease with the real cadence: **7 days** for an
  app's publisher lookup, **1 day** for a publisher's app-ads.txt. The file is
  the thing that actually changes; the publisher behind a bundle rarely does.

Every outcome counts as a completed attempt, `NOT_FOUND` and `REJECTED`
included, so all of them wait a full cycle. Only a job that *threw* — a 5xx, a
429, a timeout, after its three attempts are spent — leaves the short lease
untouched, which is what brings a transient failure back round in minutes rather
than days.

The cadence lives in one place per table, at the top of the DAO. Both processors
close out through those two methods precisely so no call site can record a
status and forget to reschedule the row.

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
bundle id always resolves the same way, and they answer with roughly the mix the
real stores do:

| store lookup | | app-ads.txt fetch | |
| --- | --- | --- | --- |
| `RESOLVED` | 76% | `STORED` | 66% |
| `NO_DOMAIN` | 16% | `NOT_FOUND` (404 or an HTML error page) | 25% |
| `NOT_FOUND` | 8% | `REJECTED` (over 5 MB) | 2% |
| | | 503/429, handed back to the queue's retry | 7% |

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

The app also refuses to start if the database is unreachable — `onModuleInit`
probes the pool once and lets the error propagate, so `bootstrap()` logs it and
exits 1 rather than serving traffic that fails on every request.

## Run tests

```bash
# unit tests
$ yarn run test

# e2e tests
$ yarn run test:e2e

# test coverage
$ yarn run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ yarn install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
