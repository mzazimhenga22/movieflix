import { Audio } from 'expo-av';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { Platform, Pressable, type PressableProps } from 'react-native';

// Navigation feedback sound
let tickSound: Audio.Sound | null = null;
let lastTickTime = 0;
const TICK_THROTTLE_MS = 50;

const loadTickSound = async () => {
  if (tickSound) return;
  try {
    await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
    const { sound } = await Audio.Sound.createAsync(
      require('../../assets/sounds/tick.wav'),
      { volume: 0.15, shouldPlay: false }
    );
    tickSound = sound;
  } catch { }
};

const playTickSound = () => {
  const now = Date.now();
  if (now - lastTickTime < TICK_THROTTLE_MS) return;
  lastTickTime = now;
  if (tickSound) {
    tickSound.setPositionAsync(0).then(() => tickSound?.playAsync()).catch(() => { });
  }
};

// Preload on module load
loadTickSound();

type NodeInfo = {
  disabled: boolean;
  preferred: boolean;
};

type RegistryEntry = {
  node: HTMLElement;
  info: NodeInfo;
};

type TvSpatialNavContextValue = {
  register: (node: HTMLElement, info: NodeInfo) => void;
  unregister: (node: HTMLElement) => void;
  update: (node: HTMLElement, partial: Partial<NodeInfo>) => void;
  getAll: () => RegistryEntry[];
};

const TvSpatialNavContext = createContext<TvSpatialNavContextValue | null>(null);

function isEditableElement(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName?.toLowerCase?.() ?? '';
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  // contentEditable is where browser/TV remote text entry should behave normally.
  return (el as any).isContentEditable === true;
}

type Direction = 'left' | 'right' | 'up' | 'down';

type NavZone = 'sidenav' | 'content' | null;

function getNavZone(el: HTMLElement | null): NavZone {
  if (!el || !el.closest) return null;
  const zoneEl = el.closest('[data-tv-region]') as HTMLElement | null;
  const zone = (zoneEl?.getAttribute('data-tv-region') ?? '').toLowerCase();
  return zone === 'sidenav' || zone === 'content' ? (zone as NavZone) : null;
}

function keyToDirection(e: KeyboardEvent): Direction | null {
  // Normalize both modern key values and older ones.
  const key = e.key;
  if (key === 'ArrowLeft' || key === 'Left') return 'left';
  if (key === 'ArrowRight' || key === 'Right') return 'right';
  if (key === 'ArrowUp' || key === 'Up') return 'up';
  if (key === 'ArrowDown' || key === 'Down') return 'down';

  // KeyCode fallback (some TV browsers / remotes).
  const keyCode = (e as any).keyCode as number | undefined;
  if (keyCode === 37) return 'left';
  if (keyCode === 38) return 'up';
  if (keyCode === 39) return 'right';
  if (keyCode === 40) return 'down';
  return null;
}

function centerOf(rect: DOMRect) {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function focusNode(node: HTMLElement) {
  try {
    node.focus?.({ preventScroll: true });
  } catch { }
  try {
    // scrollIntoView with 'center' is much better for TV interfaces to keep context
    node.scrollIntoView?.({ behavior: 'smooth', block: 'center', inline: 'center' });
  } catch { }
}

function domFocusableEntries(): RegistryEntry[] {
  if (typeof document === 'undefined') return [];
  const nodes = Array.from(
    document.querySelectorAll(
      // Covers react-native-web Pressables (tabindex), and a few native DOM interactables.
      '[data-tv-focusable="true"],[tabindex],button,[role="button"],a[href]'
    ),
  );

  return nodes
    .filter((n): n is HTMLElement => n instanceof HTMLElement)
    .filter((el) => {
      // Avoid grabbing hidden/offscreen elements.
      if (el.tabIndex < 0 && el.getAttribute('data-tv-focusable') !== 'true') return false;
      const ariaDisabled = (el.getAttribute('aria-disabled') ?? '').toLowerCase() === 'true';
      const disabled = ariaDisabled || (el as any).disabled === true;
      if (disabled) return false;
      // If it has 0 size, it won't be a good navigation target.
      const rect = el.getBoundingClientRect?.();
      if (!rect || rect.width < 2 || rect.height < 2) return false;
      return true;
    })
    .map((node) => {
      const preferred = node.getAttribute('data-tv-preferred') === 'true';
      return { node, info: { disabled: false, preferred } };
    });
}

function mergeEntries(primary: RegistryEntry[], secondary: RegistryEntry[]): RegistryEntry[] {
  const map = new Map<HTMLElement, NodeInfo>();
  for (const e of secondary) map.set(e.node, e.info);
  for (const e of primary) map.set(e.node, e.info);
  return Array.from(map.entries()).map(([node, info]) => ({ node, info }));
}

function findNext(entries: RegistryEntry[], active: HTMLElement | null, dir: Direction): HTMLElement | null {
  const usable = entries.filter((e) => e.node && !e.info.disabled);
  if (!usable.length) return null;

  if (!active || !usable.some((e) => e.node === active)) {
    const preferred = usable.find((e) => e.info.preferred)?.node;
    return preferred ?? usable[0]!.node;
  }

  const activeRect = active.getBoundingClientRect?.();
  if (!activeRect) return null;
  const cur = centerOf(activeRect);
  const activeZone = getNavZone(active);

  const candidates = usable
    .filter((e) => e.node !== active)
    .map((e) => {
      const rect = e.node.getBoundingClientRect?.();
      if (!rect) return null;
      const c = centerOf(rect);
      const zone = getNavZone(e.node);
      return { node: e.node, c, rect, zone };
    })
    .filter(Boolean) as { node: HTMLElement; c: { x: number; y: number }; rect: DOMRect; zone: NavZone }[];

  const eps = 1;
  const filtered = candidates.filter((it) => {
    if (dir === 'left') return it.c.x < cur.x - eps;
    if (dir === 'right') return it.c.x > cur.x + eps;
    if (dir === 'up') return it.c.y < cur.y - eps;
    return it.c.y > cur.y + eps;
  });

  // Prefer moving between navigation zones when using left/right
  if (activeZone && (dir === 'left' || dir === 'right')) {
    // When in sidenav going right, find ANY item in content zone (not just filtered)
    // This ensures we can always reach content even if it's not strictly to our right
    if (dir === 'right' && activeZone === 'sidenav') {
      const contentCandidates = candidates.filter((it) => it.zone === 'content');
      if (contentCandidates.length) {
        return findNextFromCandidates(contentCandidates, cur, dir);
      }
    }

    // When in content going left, find sidenav
    if (dir === 'left' && activeZone === 'content') {
      const sidenavCandidates = candidates.filter((it) => it.zone === 'sidenav');
      if (sidenavCandidates.length) {
        return findNextFromCandidates(sidenavCandidates, cur, dir);
      }
    }

    // Don't allow navigating left when in sidenav - nowhere to go
    if (dir === 'left' && activeZone === 'sidenav') {
      return null;
    }

    // Standard zone-crossing for other cases
    const desiredZone: NavZone = activeZone === 'sidenav' ? 'content' : 'sidenav';
    const zoneCandidates = filtered.filter((it) => it.zone === desiredZone);
    if (zoneCandidates.length) {
      return findNextFromCandidates(zoneCandidates, cur, dir);
    }
  }


  // If no candidates in strict direction, try with looser constraints for left/right
  // This helps jumping from SideNav (narrow vertical strip) to main content area
  let searchCandidates = filtered;
  if (!searchCandidates.length && (dir === 'left' || dir === 'right')) {
    // Allow candidates that overlap vertically with current element - use very generous tolerance
    // for jumping between navigation zones (SideNav <-> Content)
    const activeTop = activeRect.top;
    const activeBottom = activeRect.bottom;
    const windowHeight = typeof window !== 'undefined' ? window.innerHeight : 1080;
    // Use half the window height as tolerance to ensure we can always jump to content
    const tolerance = Math.max(400, windowHeight / 2);
    searchCandidates = candidates.filter((it) => {
      const overlapsVertically = it.rect.bottom > activeTop - tolerance && it.rect.top < activeBottom + tolerance;
      if (dir === 'left') return it.c.x < cur.x - eps && overlapsVertically;
      if (dir === 'right') return it.c.x > cur.x + eps && overlapsVertically;
      return false;
    });
  }

  // Still no candidates? For left/right, just find the closest item in that direction (no vertical constraint)
  if (!searchCandidates.length && (dir === 'left' || dir === 'right')) {
    searchCandidates = candidates.filter((it) => {
      if (dir === 'left') return it.c.x < cur.x - eps;
      if (dir === 'right') return it.c.x > cur.x + eps;
      return false;
    });
  }

  // For up/down navigation, use generous horizontal tolerance to find items in top bar or content rails
  if (!searchCandidates.length && (dir === 'up' || dir === 'down')) {
    const activeLeft = activeRect.left;
    const activeRight = activeRect.right;
    const windowWidth = typeof window !== 'undefined' ? window.innerWidth : 1920;
    // Use half the window width as tolerance to ensure we can reach top bar tabs from anywhere
    const tolerance = Math.max(400, windowWidth / 2);
    searchCandidates = candidates.filter((it) => {
      const overlapsHorizontally = it.rect.right > activeLeft - tolerance && it.rect.left < activeRight + tolerance;
      if (dir === 'up') return it.c.y < cur.y - eps && overlapsHorizontally;
      if (dir === 'down') return it.c.y > cur.y + eps && overlapsHorizontally;
      return false;
    });
  }

  // Final fallback for up/down - find closest item in that direction with no horizontal constraint
  if (!searchCandidates.length && (dir === 'up' || dir === 'down')) {
    searchCandidates = candidates.filter((it) => {
      if (dir === 'up') return it.c.y < cur.y - eps;
      if (dir === 'down') return it.c.y > cur.y + eps;
      return false;
    });
  }

  if (!searchCandidates.length) return null;

  return findNextFromCandidates(searchCandidates, cur, dir);
}

function findNextFromCandidates(
  candidates: { node: HTMLElement; c: { x: number; y: number } }[],
  cur: { x: number; y: number },
  dir: Direction,
): HTMLElement | null {
  let best: { node: HTMLElement; score: number } | null = null;
  for (const it of candidates) {
    const dx = Math.abs(it.c.x - cur.x);
    const dy = Math.abs(it.c.y - cur.y);
    const primary = dir === 'left' || dir === 'right' ? dx : dy;
    const secondary = dir === 'left' || dir === 'right' ? dy : dx;

    // Use a weighted score: primary distance + (secondary distance * weight).
    // A weight of 3.0 strongly penalizes off-axis candidates, ensuring navigation
    // prefers items that are aligned in the direction of travel (e.g. directly below).
    const score = primary + (secondary * 3.0);

    if (!best || score < best.score) {
      best = { node: it.node, score };
    }
  }
  return best?.node ?? null;
}

function resolveActiveElement(entries: RegistryEntry[], active: HTMLElement | null): HTMLElement | null {
  if (!active) return null;
  if (active === document.body || active.tagName === 'HTML') return null;
  if (entries.some((it) => it.node === active)) return active;
  if (active.closest) {
    const closest = active.closest('[data-tv-focusable="true"],[tabindex],[role="button"],button,a[href]') as HTMLElement | null;
    if (closest && entries.some((it) => it.node === closest)) return closest;
  }
  let node: HTMLElement | null = active;
  while (node && node !== document.body) {
    const parent = node.parentElement;
    if (parent && entries.some((it) => it.node === parent)) return parent;
    node = parent as HTMLElement | null;
  }
  return active;
}

export function TvSpatialNavigationProvider({ children }: { children: React.ReactNode }) {
  const mapRef = useRef(new Map<HTMLElement, NodeInfo>());

  const register = useCallback((node: HTMLElement, info: NodeInfo) => {
    mapRef.current.set(node, info);
  }, []);

  const unregister = useCallback((node: HTMLElement) => {
    mapRef.current.delete(node);
  }, []);

  const update = useCallback((node: HTMLElement, partial: Partial<NodeInfo>) => {
    const prev = mapRef.current.get(node);
    if (!prev) return;
    mapRef.current.set(node, { ...prev, ...partial });
  }, []);

  const getAll = useCallback((): RegistryEntry[] => {
    return Array.from(mapRef.current.entries()).map(([node, info]) => ({ node, info }));
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const onKeyDown = (e: KeyboardEvent) => {
      // Let the keyboard handle text entry.
      if (isEditableElement(e.target as Element | null)) return;

      const dir = keyToDirection(e);

      const key = e.key;
      const isSelect = key === 'Enter' || key === ' ' || key === 'Spacebar';

      if (!dir && !isSelect) return;

      const entries = mergeEntries(getAll(), domFocusableEntries()).filter((it) => it.node && !it.info.disabled);
      if (!entries.length) return;

      const rawActive = document.activeElement as HTMLElement | null;
      const active = resolveActiveElement(entries, rawActive);

      if (isSelect) {
        if (active && entries.some((it) => it.node === active)) {
          e.preventDefault();
          e.stopPropagation();
          playTickSound();
          try {
            active.click?.();
          } catch { }
        }
        return;
      }

      if (!dir) return;

      const next = findNext(entries, active, dir);
      if (next) {
        e.preventDefault();
        e.stopPropagation();
        playTickSound();
        focusNode(next);
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [getAll]);

  const value = useMemo<TvSpatialNavContextValue>(
    () => ({ register, unregister, update, getAll }),
    [getAll, register, unregister, update],
  );

  return <TvSpatialNavContext.Provider value={value}>{children}</TvSpatialNavContext.Provider>;
}

export type TvFocusableProps = PressableProps & {
  tvPreferredFocus?: boolean;
  isTVSelectable?: boolean;
  tvParallaxProperties?: any;
};

export const TvFocusable = React.forwardRef<any, TvFocusableProps>(function TvFocusable(
  { tvPreferredFocus, isTVSelectable = true, disabled, onFocus, onBlur, style, ...props },
  forwardedRef,
) {
  const ctx = useContext(TvSpatialNavContext);
  const nodeRef = useRef<HTMLElement | null>(null);
  const [isFocused, setIsFocused] = React.useState(false);

  const setRef = useCallback(
    (node: any) => {
      const prev = nodeRef.current;
      if (Platform.OS === 'web' && prev && ctx) ctx.unregister(prev);

      nodeRef.current = Platform.OS === 'web' ? (node as HTMLElement | null) : null;

      if (typeof forwardedRef === 'function') forwardedRef(node);
      else if (forwardedRef && typeof forwardedRef === 'object') (forwardedRef as any).current = node;

      if (Platform.OS === 'web' && nodeRef.current && ctx) {
        ctx.register(nodeRef.current, { disabled: Boolean(disabled), preferred: Boolean(tvPreferredFocus) });
      }
    },
    [ctx, disabled, forwardedRef, tvPreferredFocus],
  );

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = nodeRef.current;
    if (!node || !ctx) return;
    ctx.update(node, { disabled: Boolean(disabled), preferred: Boolean(tvPreferredFocus) });
  }, [ctx, disabled, tvPreferredFocus]);

  // Track if we've already done initial focus to prevent stealing focus on re-renders
  const hasInitialFocusedRef = useRef(false);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (!tvPreferredFocus) {
      // Reset when tvPreferredFocus becomes false so it can focus again if it becomes true
      hasInitialFocusedRef.current = false;
      return;
    }
    // Only auto-focus once on initial mount, not on subsequent re-renders
    if (hasInitialFocusedRef.current) return;

    // Check if something else already has focus - don't steal it
    const activeElement = document.activeElement;
    const hasExistingFocus = activeElement &&
      activeElement !== document.body &&
      activeElement.tagName !== 'HTML';

    if (hasExistingFocus) {
      hasInitialFocusedRef.current = true;
      return;
    }

    const t = setTimeout(() => {
      const node = nodeRef.current;
      if (node) {
        hasInitialFocusedRef.current = true;
        focusNode(node);
      }
    }, 60);
    return () => clearTimeout(t);
  }, [tvPreferredFocus]);

  // Calculated style if it's a function
  const computedStyle = useMemo(() => {
    if (typeof style === 'function') {
      return style({ pressed: false, focused: isFocused } as any);
    }
    return style;
  }, [style, isFocused]);

  return (
    <Pressable
      {...props}
      style={computedStyle}
      ref={setRef}
      disabled={disabled}
      focusable={!disabled}
      // Native TV platforms (Android TV / tvOS) use `hasTVPreferredFocus` and `isTVSelectable`.
      {...(Platform.OS !== 'web' ? ({
        hasTVPreferredFocus: Boolean(tvPreferredFocus),
        isTVSelectable: isTVSelectable,
      } as any) : null)}
      // react-native-web: ensure elements are focusable via D-pad/keyboard.
      {...(Platform.OS === 'web'
        ? ({
          tabIndex: disabled ? -1 : 0,
          accessibilityRole: 'button',
          'data-tv-focusable': 'true',
          ...(tvPreferredFocus ? { 'data-tv-preferred': 'true' } : null),
        } as any)
        : null)}
      // Keep role consistent for screen readers / TV focus engines.
      accessibilityRole={(props as any).accessibilityRole ?? 'button'}
      onFocus={(e: any) => {
        setIsFocused(true);
        if (Platform.OS === 'web') {
          const node = nodeRef.current;
          if (node) {
            try {
              node.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
            } catch { }
          }
        }
        onFocus?.(e);
      }}
      onBlur={(e: any) => {
        setIsFocused(false);
        onBlur?.(e);
      }}
    />
  );
});

// Dummy default export to satisfy expo-router (this file is in app/ but not a route)
export default function TvSpatialNavigationRoute() {
  return null;
}
