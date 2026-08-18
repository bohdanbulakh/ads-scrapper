import { LogLevel } from '@nestjs/common';
import * as Joi from 'joi';

export const NODE_ENVS = ['development', 'test', 'production'] as const;

export type NodeEnv = (typeof NODE_ENVS)[number];

const LOG_LEVELS: readonly LogLevel[] = [
  'verbose',
  'debug',
  'log',
  'warn',
  'error',
  'fatal',
];

export interface AppConfig {
  nodeEnv: NodeEnv;
  port: number;
  logLevels: LogLevel[];
}

export const appConfig = (): AppConfig => ({
  nodeEnv: process.env.NODE_ENV as NodeEnv,
  port: Number(process.env.PORT),
  logLevels: splitLogLevels(process.env.LOG_LEVELS as string),
});

function splitLogLevels(value: string): LogLevel[] {
  return value
    .split(',')
    .map((level) => level.trim())
    .filter(Boolean) as LogLevel[];
}

export const appEnvSchema = {
  NODE_ENV: Joi.string()
    .valid(...NODE_ENVS)
    .default('development'),
  PORT: Joi.number().port().default(3000),
  LOG_LEVELS: Joi.string()
    .default('log,warn,error')
    .custom((value: string, helpers) => {
      const invalid = splitLogLevels(value).filter(
        (level) => !LOG_LEVELS.includes(level),
      );

      return invalid.length > 0
        ? helpers.message({
            custom: `"LOG_LEVELS" contains unknown levels: ${invalid.join(', ')}. Valid levels: ${LOG_LEVELS.join(', ')}`,
          })
        : value;
    }),
};
