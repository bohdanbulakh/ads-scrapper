import { Logger } from '@nestjs/common';

import { ExtendedConfigService } from '@/common/config/extended-config.service';
import { AdsFileFetcher } from '@/queue/ads-file/ads-file-fetcher/ads-file.fetcher';
import { applyHash, simulateLatency } from '@/queue/fake/fake-fetch.util';

/**
 * Cumulative shares of the outcome space, in percent. Between them they cover
 * every branch the processor has: stored, not-found, rejected, and the two
 * kinds of throw that hand the job back to the queue's retry.
 */
const OK = 65;
const NOT_FOUND = OK + 17;
const HTML = NOT_FOUND + 8;
const RATE_LIMITED = HTML + 2;
const OVERSIZED = RATE_LIMITED + 2;
// The remainder answers 200 with an empty body.

/** Comfortably past the processor's 5 MB ceiling, and no further. */
const OVERSIZED_BYTES = 5 * 1024 * 1024 + 64 * 1024;

const OVERSIZED_LINE = 'openx.com, pub-0000000, RESELLER, f08c47fec0942fa0\n';

/** Built on first use only — most runs never hit the oversized branch. */
let oversizedBody: Uint8Array<ArrayBuffer> | null = null;

export class FakeAdsFileFetcher implements AdsFileFetcher {
  private readonly logger = new Logger(FakeAdsFileFetcher.name);

  private readonly latencyMs: number;
  private readonly failureRate: number;

  constructor(config: ExtendedConfigService) {
    this.latencyMs = config.get('fakeFetch.latencyMs');
    this.failureRate = config.get('fakeFetch.failureRate');

    this.logger.warn(
      'FAKE_FETCH is on — app-ads.txt bodies are generated, not fetched',
    );
  }

  async fetch(domain: string): Promise<Response> {
    await simulateLatency(this.latencyMs);

    // Random rather than derived from the domain, so the retry can recover.
    if (Math.random() < this.failureRate) {
      throw new Error(`fake fetch failed for "${domain}"`);
    }

    const outcome = applyHash(domain, 0) % 100;

    if (outcome < OK) return this.plainText('');
    if (outcome < NOT_FOUND) return new Response(null, { status: 404 });
    if (outcome < HTML) return this.htmlPage(domain);
    if (outcome < RATE_LIMITED) return new Response(null, { status: 429 });
    if (outcome < OVERSIZED) return this.oversized();

    return this.plainText('');
  }

  /**
   * Plenty of sites answer 200 with their own "not found" page.
   */
  private htmlPage(domain: string): Response {
    const body =
      '<!DOCTYPE html>\n<html lang="en"><head><title>404 Not Found</title></head>' +
      '<body><h1>Not Found</h1></body></html>\n';

    return new Response(body, {
      status: 200,
      headers: {
        'content-type':
          applyHash(domain, 2) % 2 === 0
            ? 'text/html; charset=utf-8'
            : 'text/plain; charset=utf-8',
      },
    });
  }

  /** Built once and shared: nothing reads it back, and it is 5 MB a copy. */
  private oversized(): Response {
    oversizedBody ??= new TextEncoder().encode(
      OVERSIZED_LINE.repeat(Math.ceil(OVERSIZED_BYTES / OVERSIZED_LINE.length)),
    );

    return this.plainText(oversizedBody);
  }

  private plainText(body: Uint8Array<ArrayBuffer> | string): Response {
    return new Response(body, {
      status: 200,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }
}
