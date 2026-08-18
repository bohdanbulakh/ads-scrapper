import * as Joi from 'joi';

export interface FakeFetchConfig {
  enabled: boolean;
  latencyMs: number;
  failureRate: number;
  publisherPoolSize: number;
}

export const fakeFetchConfig = (): FakeFetchConfig => ({
  enabled: process.env.FAKE_FETCH === 'true',
  latencyMs: Number(process.env.FAKE_FETCH_LATENCY_MS),
  failureRate: Number(process.env.FAKE_FETCH_FAILURE_RATE),
  publisherPoolSize: Number(process.env.FAKE_FETCH_PUBLISHER_POOL),
});

export const fakeFetchEnvSchema = {
  FAKE_FETCH: Joi.boolean()
    .default(false)
    .when('NODE_ENV', { is: 'production', then: Joi.valid(false) }),

  FAKE_FETCH_LATENCY_MS: Joi.number().integer().min(0).max(60_000).default(25),
  FAKE_FETCH_FAILURE_RATE: Joi.number().min(0).max(1).default(0),
  FAKE_FETCH_PUBLISHER_POOL: Joi.number().integer().min(1).default(50_000),
};
