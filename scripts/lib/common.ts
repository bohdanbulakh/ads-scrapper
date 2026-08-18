import 'dotenv/config';

import { createInterface } from 'node:readline/promises';
import { Pool } from 'pg';

/** Counts are written as `1000000` or `1_000_000`. */
export function parseCount(value: string, label: string): number {
  const cleaned = value.trim().replace(/_/g, '');

  if (!/^\d+$/.test(cleaned)) {
    throw new Error(
      `--${label}: expected a number like 1000000 or 1_000_000, got "${value}"`,
    );
  }

  const count = Number(cleaned);
  if (!Number.isSafeInteger(count)) {
    throw new Error(`--${label}: out of range: "${value}"`);
  }

  return count;
}

export function formatCount(value: number): string {
  return value.toLocaleString('en-US').replace(/,/g, ' ');
}

export function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL is not set — see .env.example.');
  }

  return new Pool({ connectionString, max: 1 });
}

export async function truncateSeedTables(pool: Pool): Promise<void> {
  await pool.query('TRUNCATE TABLE apps, publishers RESTART IDENTITY CASCADE');
}

export async function countRows(pool: Pool, table: string): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT count(*) AS count FROM ${table}`,
  );

  return Number(rows[0].count);
}

/**
 * Guards the destructive flags. A non-interactive run has no way to answer, so
 * it has to say `--yes` up front rather than being assumed to agree.
 */
export async function confirm(
  question: string,
  assumeYes: boolean,
): Promise<boolean> {
  if (assumeYes) return true;

  if (!process.stdin.isTTY) {
    console.error(`Refusing to continue without --yes: ${question}`);
    return false;
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`${question} [y/N] `);
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}
