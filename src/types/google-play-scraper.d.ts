// The import makes this file a module, so the block below merges into the
// package's own typings instead of replacing them.
import 'google-play-scraper';

/**
 * google-play-scraper@10 forwards `requestOptions` straight to got, but its
 * bundled typings never picked the option up. Without it there is no request
 * timeout, and a hung Play response would hold a worker slot indefinitely.
 */
declare module 'google-play-scraper' {
  interface IFnAppOptions {
    requestOptions?: {
      headers?: Record<string, string>;
      timeout?: { request?: number };
    };
  }
}
