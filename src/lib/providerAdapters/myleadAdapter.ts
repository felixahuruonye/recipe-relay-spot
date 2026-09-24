import { BaseProviderAdapter } from './baseAdapter';

/**
 * MyLead — offer feed + S2S postback (spec #8), identified by
 * clickid/affid/status/payout on their end. MyLead's tracking links
 * are typically per-offer redirect links rather than an embeddable
 * widget, so this defaults to embed_type 'link' unless admin sets it
 * to 'iframe' for a specific campaign that supports it:
 *
 *   https://mylead.global/track/OFFER_SLUG?aff_click_id={CLICK_ID}
 *
 * MyLead's postback URL (set on THEIR dashboard, not ours) should
 * point at our existing generic endpoint with their macros mapped to
 * ours — see the postback configuration guide in the Phase 2 summary.
 */
export class MyLeadAdapter extends BaseProviderAdapter {
  constructor() {
    super('mylead');
  }
}

export const myleadAdapter = new MyLeadAdapter();
