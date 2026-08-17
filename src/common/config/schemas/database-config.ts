import * as Joi from 'joi';

export interface DatabaseConfig {
  url: string;
}

export const databaseConfig = (): DatabaseConfig => ({
  url: process.env.DATABASE_URL as string,
});

export const databaseEnvSchema = {
  // `uri()` alone accepts any scheme, so a stray `http://...` would validate.
  DATABASE_URL: Joi.string()
    .uri({ scheme: [/postgres(ql)?/] })
    .required(),
};
