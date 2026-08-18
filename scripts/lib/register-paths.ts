/**
 * Teaches the ts-node runtime the `@/*` alias the app's imports use.
 *
 * `tsconfig-paths/register` normally reads the mapping out of `tsconfig.json`,
 * but that only works when the config sets `baseUrl` — which the root config
 * does not, and cannot: TypeScript 6 deprecates it. Registering explicitly is
 * both shorter and independent of which directory the script is run from.
 */
import { resolve } from 'node:path';
import { register } from 'tsconfig-paths';

register({
  baseUrl: resolve(__dirname, '../..'),
  paths: { '@/*': ['src/*'] },
});
