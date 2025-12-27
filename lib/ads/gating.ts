export type PlanTier = 'free' | 'plus' | 'premium';

export const DEFAULT_INTERSTITIAL_SECONDS = 30;

export function shouldShowAds(plan: string | null | undefined): boolean {
  return String(plan || '').toLowerCase() === 'free';
}

export function shouldShowInterstitialOnPlay(plan: string | null | undefined): boolean {
  return shouldShowAds(plan);
}
