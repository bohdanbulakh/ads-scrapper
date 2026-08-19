import { AdsFileFetcher } from './ads-file.fetcher';

const FETCH_TIMEOUT_MS = 10_000;

const USER_AGENT = 'ads-scrapper/1.0 (ads.txt crawler)';

export class RealAdsFileFetcher implements AdsFileFetcher {
  fetch(domain: string): Promise<Response> {
    return fetch(`https://${domain}/app-ads.txt`, {
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'user-agent': USER_AGENT,
        accept: 'text/plain,*/*;q=0.8',
      },
    });
  }
}
