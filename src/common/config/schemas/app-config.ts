import * as Joi from 'joi';

export const NODE_ENVS = ['development', 'test', 'production'] as const;

export type NodeEnv = (typeof NODE_ENVS)[number];

export interface AppConfig {
  nodeEnv: NodeEnv;
  port: number;
}

export const appConfig = (): AppConfig => ({
  nodeEnv: process.env.NODE_ENV as NodeEnv,
  port: Number(process.env.PORT),
});

export const appEnvSchema = {
  NODE_ENV: Joi.string()
    .valid(...NODE_ENVS)
    .default('development'),
  PORT: Joi.number().port().default(3000),
};
