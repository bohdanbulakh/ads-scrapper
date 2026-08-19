/**
 * Puts the stack back to empty after a seeded run: truncates `apps` and
 * `publishers`, drops every job in both queues, and — with `--storage` — clears
 * the seeded app-ads.txt objects out of the bucket.
 *
 *   yarn seed:reset
 *   yarn seed:reset --storage --yes
 *
 * Stop the app first. A running worker will happily re-enqueue and re-store
 * while this is deleting.
 */
import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import { Queue } from 'bullmq';
import { parseArgs } from 'node:util';

import { ADS_FILE_QUEUE } from '../src/queue/ads-file/ads-file.constants';
import { BUNDLE_INFO_QUEUE } from '../src/queue/bundle-info/bundle-info.constants';
import {
  confirm,
  countRows,
  createPool,
  formatCount,
  truncateSeedTables,
} from './lib/common';

const USAGE = `
Usage: yarn seed:reset [options]

  --storage   also delete the stored app-ads.txt objects from the bucket
  --keep-db   leave apps + publishers alone
  --yes       skip the confirmation prompt
  --help
`;

/** S3 caps a single delete request at 1000 keys. */
const DELETE_BATCH = 1_000;

/**
 * Narrow enough to match only what the fake fetcher invents — every seeded
 * publisher is `seed-<n>.example` — so a real crawl's files survive a reset.
 */
const STORAGE_PREFIX = 'publishers/seed-';

async function obliterateQueues(): Promise<void> {
  const connection = {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379),
    password: process.env.REDIS_PASSWORD,
    db: Number(process.env.REDIS_DB ?? 0),
  };

  for (const name of [BUNDLE_INFO_QUEUE, ADS_FILE_QUEUE]) {
    const queue = new Queue(name, { connection });

    try {
      // `force` drops jobs that are still marked active — after a hard stop
      // there is usually a handful left behind that nothing will ever finish.
      await queue.obliterate({ force: true });
      console.log(`  queue "${name}" obliterated`);
    } finally {
      await queue.close();
    }
  }
}

async function clearStorage(): Promise<void> {
  const bucket = process.env.S3_BUCKET;

  if (!bucket) {
    throw new Error('S3_BUCKET is not set — see .env.example.');
  }

  const s3 = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? 'us-east-1',
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY!,
      secretAccessKey: process.env.S3_SECRET_KEY!,
    },
  });

  let continuationToken: string | undefined;
  let deleted = 0;

  try {
    do {
      const listed = await s3.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: STORAGE_PREFIX,
          MaxKeys: DELETE_BATCH,
          ContinuationToken: continuationToken,
        }),
      );

      const keys = (listed.Contents ?? [])
        .map(({ Key }) => Key)
        .filter((key): key is string => Boolean(key));

      if (keys.length > 0) {
        await s3.send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
          }),
        );
        deleted += keys.length;
      }

      // The token from a listing whose keys were just deleted still points at
      // the right place — S3 paginates by key, not by offset.
      continuationToken = listed.IsTruncated
        ? listed.NextContinuationToken
        : undefined;
    } while (continuationToken);

    console.log(`  storage cleared: ${formatCount(deleted)} objects`);
  } finally {
    s3.destroy();
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      storage: { type: 'boolean', default: false },
      'keep-db': { type: 'boolean', default: false },
      yes: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  });

  if (values.help) {
    console.log(USAGE);
    return;
  }

  const pool = createPool();

  try {
    const targets = ['all jobs in both queues'];

    if (!values['keep-db']) {
      const apps = await countRows(pool, 'apps');
      const publishers = await countRows(pool, 'publishers');

      targets.push(
        `${formatCount(apps)} apps + ${formatCount(publishers)} publishers`,
      );
    }

    if (values.storage) {
      targets.push(`every bucket object under "${STORAGE_PREFIX}"`);
    }

    if (
      !(await confirm(
        `This deletes ${targets.join(', ')}. Continue?`,
        values.yes,
      ))
    ) {
      console.log('Aborted.');
      return;
    }

    if (!values['keep-db']) {
      await truncateSeedTables(pool);
      console.log('  apps + publishers truncated');
    }

    await obliterateQueues();

    if (values.storage) await clearStorage();

    console.log('\nReset complete.');
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
