import * as Joi from 'joi';

export interface RedisConfig {
  host: string;
  port: number;
  password: string;
  db: number;
}

export const redisConfig = (): RedisConfig => ({
  host: String(process.env.REDIS_HOST),
  port: Number(process.env.REDIS_PORT),
  password: String(process.env.REDIS_PASSWORD),
  db: Number(process.env.REDIS_DB),
});

export const redisEnvSchema = {
  REDIS_HOST: Joi.string().hostname().default('localhost'),
  REDIS_PORT: Joi.number().port().default(6379),
  // Required: docker-compose refuses to start redis without it.
  REDIS_PASSWORD: Joi.string().required(),
  REDIS_DB: Joi.number().integer().min(0).default(0),
};
