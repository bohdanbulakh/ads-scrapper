/**
 * Fills `apps` (and optionally `publishers`) with generated rows, so the
 * dispatchers and both queues can be driven at a realistic size.
 *
 *   yarn seed --apps 10_000_000
 *   yarn seed --publishers 50000
 *
 * Rows are generated inside postgres with `generate_series`, so nothing but the
 * row count crosses the wire — tens of millions of rows is a few minutes, not
 * an afternoon.
 *
 * The bundle ids are made up and exist in no store: run the app with
 * `FAKE_FETCH=true` so the processors answer from the stand-in fetchers instead
 * of hammering the App Store and Play with ten million misses.
 */
import { Pool } from 'pg';
import { parseArgs } from 'node:util';

import {
  confirm,
  countRows,
  createPool,
  formatCount,
  parseCount,
  truncateSeedTables,
} from './lib/common';

const USAGE = `
Usage: yarn seed [options]

  --apps <count>        apps rows to insert          (default 1_000_000)
  --publishers <count>  publishers rows to insert    (default 0)
  --truncate            wipe apps + publishers first
  --yes                 skip the confirmation prompt
  --help

Counts are written as 1000000 or 1_000_000.
`;

/** Rows per INSERT. Large enough to amortise the round trip, small enough to
 * keep one statement's memory bounded. */
const BATCH = 100_000;

/** Share of PLAY_MARKET bundles; the rest are App Store numeric track ids. */
const PLAY_PERCENT = 65;

interface Options {
  apps: number;
  publishers: number;
  truncate: boolean;
  yes: boolean;
}

function parseOptions(): Options | null {
  const { values } = parseArgs({
    options: {
      apps: { type: 'string', default: '1_000_000' },
      publishers: { type: 'string', default: '0' },
      truncate: { type: 'boolean', default: false },
      yes: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  });

  if (values.help) {
    console.log(USAGE);
    return null;
  }

  return {
    apps: parseCount(values.apps, 'apps'),
    publishers: parseCount(values.publishers, 'publishers'),
    truncate: values.truncate,
    yes: values.yes,
  };
}

/** Runs `sql` over [offset, offset + count) in batches, one range per call. */
async function insertInBatches(
  pool: Pool,
  sql: string,
  count: number,
  offset: number,
  unit: string,
): Promise<void> {
  for (let done = 0; done < count; done += BATCH) {
    const size = Math.min(BATCH, count - done);
    const from = offset + done;

    await pool.query(sql, [from, from + size - 1]);
    console.log(
      `  ${formatCount(done + size)} / ${formatCount(count)} ${unit}`,
    );
  }
}

const APPS_SQL = `
  INSERT INTO apps (bundle_id, source, next_to_fetch_publisher, updated_at)
  SELECT
    CASE WHEN s.i % 100 < ${PLAY_PERCENT}
      -- App Store rows carry the numeric track id, which is the other shape the
      -- real lookup has to cope with.
      THEN 'com.seed.app' || s.i
      ELSE (1000000000 + s.i)::text
    END,
    (CASE WHEN s.i % 100 < ${PLAY_PERCENT} THEN 'PLAY_MARKET' ELSE 'APP_STORE' END)::bundle_source,
    now(),
    now()
  FROM generate_series($1::bigint, $2::bigint) AS s(i)
`;

/**
 * Only useful for driving the ads-file queue on its own — normally publishers
 * appear as the bundle-info queue resolves apps. The domains match the pool the
 * fake store fetcher hands out (`FAKE_FETCH_PUBLISHER_POOL`), so seeding both
 * lands on the same rows rather than doubling them up.
 */
const PUBLISHERS_SQL = `
  INSERT INTO publishers (name, domain, next_to_fetch_file, updated_at)
  SELECT
    'Seed Publisher ' || s.i,
    'seed-' || s.i || '.example',
    now(),
    now()
  FROM generate_series($1::bigint, $2::bigint) AS s(i)
  ON CONFLICT (domain) DO NOTHING
`;

async function main(): Promise<void> {
  const options = parseOptions();
  if (!options) return;

  const pool = createPool();

  try {
    if (options.truncate) {
      const existing =
        (await countRows(pool, 'apps')) + (await countRows(pool, 'publishers'));

      if (
        existing > 0 &&
        !(await confirm(
          `--truncate will delete ${formatCount(existing)} existing rows from apps and publishers. Continue?`,
          options.yes,
        ))
      ) {
        console.log('Aborted.');
        return;
      }

      await truncateSeedTables(pool);
      console.log('Truncated apps + publishers.');
    }

    // Durability buys nothing here and costs an fsync per batch; the data is
    // disposable by definition. Session-scoped, so it reverts on disconnect.
    await pool.query('SET synchronous_commit = off');

    if (options.apps > 0) {
      // Keeps bundle ids unique across repeated runs without a unique index to
      // lean on.
      const offset = await countRows(pool, 'apps');

      console.log(`Seeding ${formatCount(options.apps)} apps`);
      await insertInBatches(pool, APPS_SQL, options.apps, offset, 'apps');
    }

    if (options.publishers > 0) {
      console.log(`Seeding ${formatCount(options.publishers)} publishers`);
      await insertInBatches(
        pool,
        PUBLISHERS_SQL,
        options.publishers,
        0,
        'publishers',
      );
    }

    // Fresh bulk inserts leave the planner with stale statistics, and it will
    // pick a sequential scan over the claim index until autovacuum catches up.
    console.log('Running ANALYZE...');
    await pool.query('ANALYZE apps, publishers');

    console.log(
      `\nTotals: ${formatCount(await countRows(pool, 'apps'))} apps, ` +
        `${formatCount(await countRows(pool, 'publishers'))} publishers`,
    );
    console.log(
      'Now start the app with FAKE_FETCH=true so the processors use the ' +
        'stand-in fetchers.',
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
