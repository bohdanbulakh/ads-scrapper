import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';

import type * as schema from '@/database/schema';

/** Injection token for the drizzle client. */
export const DRIZZLE = Symbol('DRIZZLE');

/** Type of the provider behind {@link DRIZZLE}. */
export type DrizzleDatabase = NodePgDatabase<typeof schema> & { $client: Pool };
