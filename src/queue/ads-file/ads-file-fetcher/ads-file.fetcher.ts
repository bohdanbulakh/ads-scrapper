/** Injection token for {@link AdsFileFetcher}. */
export const ADS_FILE_FETCHER = 'ADS_FILE_FETCHER';

export interface AdsFileFetcher {
  fetch(domain: string): Promise<Response>;
}
