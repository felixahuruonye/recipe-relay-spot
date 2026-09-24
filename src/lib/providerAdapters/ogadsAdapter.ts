import { BaseProviderAdapter } from './baseAdapter';

/**
 * OGAds — content locker via JS embed or direct link (spec #10).
 * OGAds supports both a JS-injected locker and a plain direct link;
 * we use the direct-link form since it fits the same iframe/locker
 * modal every other provider uses, keeping one code path instead of
 * a special JS-injection case:
 *
 *   https://ogads.com/locker/YOUR_LOCKER_ID?s1={CLICK_ID}
 */
export class OGAdsAdapter extends BaseProviderAdapter {
  constructor() {
    super('ogads');
  }
}

export const ogadsAdapter = new OGAdsAdapter();
