import { ProviderAdapter } from './types';
import { monlixAdapter } from './monlixAdapter';
import { myleadAdapter } from './myleadAdapter';
import { cpagripAdapter } from './cpagripAdapter';
import { ogadsAdapter } from './ogadsAdapter';
import { BaseProviderAdapter } from './baseAdapter';

/**
 * Task Provider Engine (spec #9) — the registry every caller goes
 * through instead of writing `if providerId === 'monlix' ...` inline.
 * Adding a fifth or sixth network later means adding one file plus
 * one line here, nothing else in the app changes.
 */
const registry: Record<string, ProviderAdapter> = {
  monlix: monlixAdapter,
  mylead: myleadAdapter,
  cpagrip: cpagripAdapter,
  ogads: ogadsAdapter,
};

export function getProviderAdapter(providerId: string): ProviderAdapter {
  return registry[providerId?.toLowerCase()] || new BaseProviderAdapter(providerId);
}

export * from './types';
