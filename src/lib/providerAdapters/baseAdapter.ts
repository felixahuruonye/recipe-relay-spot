import { LaunchContext, ProviderAdapter, ProviderIntegrationConfig, substitutePlaceholders } from './types';

/**
 * Shared behavior: every adapter is "configured" once admin has set a
 * launch_url_template, and every adapter builds its URL the same way.
 * Per-provider files exist (per the spec's diagram) so provider-specific
 * quirks — a different placeholder scheme, a required extra query
 * param, a different embed shape — have an obvious, isolated place to
 * live once we learn what each network's real API actually needs.
 */
export class BaseProviderAdapter implements ProviderAdapter {
  constructor(public providerId: string) {}

  isConfigured(config: ProviderIntegrationConfig): boolean {
    return !!config.launchUrlTemplate;
  }

  getLaunchUrl(config: ProviderIntegrationConfig, ctx: LaunchContext): string | null {
    if (!config.launchUrlTemplate) return null;
    return substitutePlaceholders(config.launchUrlTemplate, ctx);
  }
}
