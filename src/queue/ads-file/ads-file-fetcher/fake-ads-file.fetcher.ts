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
const SERVER_ERROR = HTML + 5;
const RATE_LIMITED = SERVER_ERROR + 2;
const OVERSIZED = RATE_LIMITED + 2;
// The remainder answers 200 with an empty body.

/** Comfortably past the processor's 5 MB ceiling, and no further. */
const OVERSIZED_BYTES = 5 * 1024 * 1024 + 64 * 1024;

const EXCHANGES = [
  'google.com',
  'appnexus.com',
  'pubmatic.com',
  'rubiconproject.com',
  'openx.com',
  'indexexchange.com',
  'smaato.com',
  'inmobi.com',
];

const OVERSIZED_LINE = 'openx.com, pub-0000000, RESELLER, f08c47fec0942fa0\n';

/** Built on first use only — most runs never hit the oversized branch. */
let oversizedBody: Uint8Array<ArrayBuffer> | null = null;

/**
 * Stands in for fetching `https://<domain>/app-ads.txt` when `FAKE_FETCH=true`.
 *
 * Seeded publisher domains sit under `.example`, a reserved TLD that never
 * resolves, so the real fetcher would time out on every one of them — ten
 * seconds a job, and nothing ever stored. This answers from the domain instead,
 * with the same domain always producing the same response.
 */
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

    if (outcome < OK) return this.adsTxt(domain);
    if (outcome < NOT_FOUND) return new Response(null, { status: 404 });
    if (outcome < HTML) return this.htmlPage(domain);
    if (outcome < SERVER_ERROR) return new Response(null, { status: 503 });
    if (outcome < RATE_LIMITED) return new Response(null, { status: 429 });
    if (outcome < OVERSIZED) return this.oversized();

    return this.plainText('');
  }

  /** A few hundred bytes to ~25 KB, which is the range real files fall in. */
  private adsTxt(domain: string): Response {
    const seed = applyHash(domain, 1);
    const lines = [`# app-ads.txt for ${domain}`];
    const count = 20 + (seed % 400);

    for (let i = 0; i < count; i++) {
      const exchange = EXCHANGES[(seed + i) % EXCHANGES.length];
      const relationship = i % 3 === 0 ? 'DIRECT' : 'RESELLER';
      const publisherId = ((seed + i * 7919) % 9_000_000) + 1_000_000;

      lines.push(
        `${exchange}, pub-${publisherId}, ${relationship}, f08c47fec0942fa0`,
      );
    }

    lines.push(`CONTACT=ads@${domain}`);

    return this.plainText(lines.join('\n') + '\n');
  }

  /**
   * Plenty of sites answer 200 with their own "not found" page. Half declare it
   * as HTML, half claim `text/plain` — which is the case the processor has to
   * catch by sniffing the body rather than trusting the header.
   */
  private htmlPage(domain: string): Response {
    const body =
      '<!DOCTYPE html>\n<html><head><title>404 Not Found</title></head>' +
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
