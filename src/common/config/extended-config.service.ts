import { Injectable } from '@nestjs/common';
import { ConfigService as NestConfig, Path, PathValue } from '@nestjs/config';

import { RootConfig } from '@/common/config/configuration';

/**
 * Overrides the default `ConfigService` to infer types by default and to fail
 * loudly on a missing path.
 */
@Injectable()
export class ExtendedConfigService<K = RootConfig> extends NestConfig<K> {
  public override get<P extends Path<K>>(path: P): PathValue<K, P> {
    const value = super.get(path, { infer: true });
    if (value === undefined) {
      throw new Error(`NotFoundConfig: ${path}`);
    }

    return value;
  }
}
