import { DEFAULT_WORKER_CONCURRENCY } from '../common/config/schemas/queue-config';

/**
 * `@Processor()` options are evaluated when the decorator runs — at import
 * time, before Nest has built the DI container — so worker concurrency is the
 * one setting that cannot come from `ExtendedConfigService`. It is still
 * declared in `queue-config.ts`, so it is validated and documented alongside
 * the rest; this only has to repeat the fallback for the window before
 * validation has run.
 */
export function workerConcurrency(): number {
  const configured = Number(process.env.WORKER_CONCURRENCY);

  return Number.isInteger(configured) && configured > 0
    ? configured
    : DEFAULT_WORKER_CONCURRENCY;
}
