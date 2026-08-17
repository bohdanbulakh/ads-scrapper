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

## Infrastructure (PostgreSQL + Redis)

```bash
# start postgres + redis in the background
$ docker compose up -d

# check health
$ docker compose ps

# tail logs
$ docker compose logs -f

# stop (keeps data)
$ docker compose down

# stop and wipe the postgres/redis volumes
$ docker compose down -v
```

Data is persisted in the named volumes `postgres_data` and `redis_data`. Redis
runs with `--requirepass` and AOF persistence enabled.

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
