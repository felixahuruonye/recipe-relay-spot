import { BaseProviderAdapter } from './baseAdapter';

/**
 * Monlix — reward-platform offerwall with S2S postbacks (spec #7).
 * Monlix's own documentation describes an iframe integration keyed by
 * the site's user ID, which is exactly what launch_url_template +
 * {CLICK_ID} substitution produces once admin pastes in the real site
 * ID Monlix issues on signup:
 *
 *   https://monlix.com/offerwall?site_id=YOUR_SITE_ID&sub_id={CLICK_ID}
 *
 * No Monlix-specific URL quirks beyond the base adapter are needed
 * yet — this file exists so if Monlix's actual docs (once Felix has
 * an account) require something extra, it's isolated here instead of
 * spread through Offers.tsx.
 */
export class MonlixAdapter extends BaseProviderAdapter {
  constructor() {
    super('monlix');
  }
}

export const monlixAdapter = new MonlixAdapter();
