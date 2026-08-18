import * as Joi from 'joi';

export const DEFAULT_WORKER_CONCURRENCY = 10;

export interface QueueConfig {
  concurrency: number;
  targetDepth: number;
}

export const queueConfig = (): QueueConfig => ({
  concurrency: Number(process.env.WORKER_CONCURRENCY),
  targetDepth: Number(process.env.QUEUE_TARGET_DEPTH),
});

export const queueEnvSchema = {
  WORKER_CONCURRENCY: Joi.number()
    .integer()
    .min(1)
    .max(2_000)
    .default(DEFAULT_WORKER_CONCURRENCY),
  QUEUE_TARGET_DEPTH: Joi.number().integer().min(1).default(500),
};
