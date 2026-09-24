/**
 * Task Provider Engine — the adapter pattern from the spec (#9).
 *
 * Every network reduces to the same shape once you strip away its
 * branding: build a URL carrying our user + click identifiers, then
 * launch it either as an embedded iframe (offerwall), a locker
 * widget, or — until an admin has configured real credentials for
 * that network — nothing at all (we never fabricate a working-looking
 * link to a network we don't actually have an account with; that
 * would violate the "no fake tasks" rule as much as inventing a
 * reward would).
 *
 * calculateReward(), handlePostback(), validateConversion() and
 * handleReversal() are NOT implemented here — those are financial
 * operations and live server-side only, in process_task_postback()
 * (a single Postgres function driven entirely by each provider's row
 * in task_provider_config, so it never needs per-provider branching).
 * Duplicating that logic in the browser would be both a security hole
 * and exactly the "trust the frontend" anti-pattern the spec warns
 * against in section 3.
 */

export type EmbedType = 'iframe' | 'locker' | 'link';

export interface ProviderIntegrationConfig {
  providerId: string;
  displayName: string;
  category: string;
  embedType: EmbedType;
  /** e.g. "https://monlix.com/offerwall?site_id=XXXX&sub_id={CLICK_ID}" */
  launchUrlTemplate: string | null;
  siteId: string | null;
}

export interface LaunchContext {
  userId: string;
  clickId: string;
  offerId: string;
}

export interface ProviderAdapter {
  providerId: string;
  /** Whether the admin has actually configured this network yet. */
  isConfigured(config: ProviderIntegrationConfig): boolean;
  /** Builds the real, launchable URL by substituting placeholders. */
  getLaunchUrl(config: ProviderIntegrationConfig, ctx: LaunchContext): string | null;
}

/** Substitutes the three identifiers every network's postback needs to
 * be able to echo back to us: {USER_ID}, {CLICK_ID}, {OFFER_ID}. */
export function substitutePlaceholders(template: string, ctx: LaunchContext): string {
  return template
    .replaceAll('{USER_ID}', encodeURIComponent(ctx.userId))
    .replaceAll('{CLICK_ID}', encodeURIComponent(ctx.clickId))
    .replaceAll('{OFFER_ID}', encodeURIComponent(ctx.offerId));
}
