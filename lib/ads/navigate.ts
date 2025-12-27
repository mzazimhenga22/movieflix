import { DEFAULT_INTERSTITIAL_SECONDS, shouldShowInterstitialOnPlay } from './gating';
import { createPrefetchKey } from '../videoPrefetchCache';

const INTERSTITIAL_NAV_KEY = '__movieflix_interstitial_nav';

type InterstitialNavState = {
  active: boolean;
  queued: number;
  pendingNext?: { pathname: string; params?: Record<string, any> };
  updatedAt: number;
};

function getInterstitialNavState(): InterstitialNavState {
  const g = globalThis as any;
  if (!g[INTERSTITIAL_NAV_KEY]) {
    g[INTERSTITIAL_NAV_KEY] = { active: false, queued: 0, pendingNext: undefined, updatedAt: Date.now() };
  }
  return g[INTERSTITIAL_NAV_KEY] as InterstitialNavState;
}

export function pushWithOptionalInterstitial(
  router: { push: (arg: any) => void },
  plan: string | null | undefined,
  next: { pathname: string; params?: Record<string, any> },
  options?: { seconds?: number; placement?: string },
) {
  if (!shouldShowInterstitialOnPlay(plan)) {
    router.push(next as any);
    return;
  }

  const state = getInterstitialNavState();
  if (state.active) {
    state.pendingNext = next;
    state.queued = (state.queued ?? 0) + 1;
    state.updatedAt = Date.now();
    return;
  }

  const seconds = String(options?.seconds ?? DEFAULT_INTERSTITIAL_SECONDS);
  const prefetchKey = createPrefetchKey(next);
  state.active = true;
  state.queued = 0;
  state.pendingNext = next;
  state.updatedAt = Date.now();

  router.push({
    pathname: '/ad-interstitial',
    params: {
      __nextPathname: next.pathname,
      __seconds: seconds,
      __placement: options?.placement ?? 'play',
      __prefetchKey: prefetchKey,
      ...(next.params ?? {}),
    },
  } as any);
}
