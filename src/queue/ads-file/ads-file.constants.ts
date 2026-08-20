import { AdsFileFetchStatus } from '../../database/schema/enums/ads-file-fetch-status';

export const ADS_FILE_QUEUE = 'ads-file-queue';

export const ADS_FILE_JOB = 'ads-file-domain';

export interface AdsFileJobData {
  publisherId: string;
  domain: string;
}

export interface AdsFileJobResult {
  success: boolean;
  status: AdsFileFetchStatus;
}
