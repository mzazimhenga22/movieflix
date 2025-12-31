import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { Platform, Pressable, type PressableProps } from 'react-native';

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
    node.focus?.();
  } catch {}
  try {
    node.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  } catch {}
}

function domFocusableEntries(): RegistryEntry[] {
  if (typeof document === 'undefined') return [];
  const nodes = Array.from(
    document.querySelectorAll(
      // Covers react-native-web Pressables (tabindex), and a few native DOM interactables.
      '[tabindex],button,[role="button"],a[href]'
    ),
  );

  return nodes
    .filter((n): n is HTMLElement => n instanceof HTMLElement)
    .filter((el) => {
      // Avoid grabbing hidden/offscreen elements.
      if (el.tabIndex < 0) return false;
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

  const candidates = usable
    .filter((e) => e.node !== active)
    .map((e) => {
      const rect = e.node.getBoundingClientRect?.();
      if (!rect) return null;
      const c = centerOf(rect);
      return { node: e.node, c };
    })
    .filter(Boolean) as { node: HTMLElement; c: { x: number; y: number } }[];

  const eps = 1;
  const filtered = candidates.filter((it) => {
    if (dir === 'left') return it.c.x < cur.x - eps;
    if (dir === 'right') return it.c.x > cur.x + eps;
    if (dir === 'up') return it.c.y < cur.y - eps;
    return it.c.y > cur.y + eps;
  });
  if (!filtered.length) return null;

  let best: { node: HTMLElement; primary: number; secondary: number } | null = null;
  for (const it of filtered) {
    const dx = Math.abs(it.c.x - cur.x);
    const dy = Math.abs(it.c.y - cur.y);
    const primary = dir === 'left' || dir === 'right' ? dx : dy;
    const secondary = dir === 'left' || dir === 'right' ? dy : dx;
    if (!best) {
      best = { node: it.node, primary, secondary };
      continue;
    }
    if (primary < best.primary - 0.01) {
      best = { node: it.node, primary, secondary };
      continue;
    }
    if (Math.abs(primary - best.primary) <= 0.01 && secondary < best.secondary) {
      best = { node: it.node, primary, secondary };
    }
  }
  return best?.node ?? null;
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

      const active = document.activeElement as HTMLElement | null;

      if (isSelect) {
        if (active && entries.some((it) => it.node === active)) {
          e.preventDefault();
          e.stopPropagation();
          try {
            active.click?.();
          } catch {}
        }
        return;
      }

      if (!dir) return;

      e.preventDefault();
      e.stopPropagation();

      const next = findNext(entries, active, dir);
      if (next) focusNode(next);
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
};

export const TvFocusable = React.forwardRef<any, TvFocusableProps>(function TvFocusable(
  { tvPreferredFocus, disabled, onFocus, onBlur, ...props },
  forwardedRef,
) {
  const ctx = useContext(TvSpatialNavContext);
  const nodeRef = useRef<HTMLElement | null>(null);

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

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (!tvPreferredFocus) return;
    const t = setTimeout(() => {
      const node = nodeRef.current;
      if (node) focusNode(node);
    }, 60);
    return () => clearTimeout(t);
  }, [tvPreferredFocus]);

  return (
    <Pressable
      {...props}
      ref={setRef}
      disabled={disabled}
      focusable={!disabled}
      // react-native-web: ensure elements are focusable via D-pad/keyboard.
      {...(Platform.OS === 'web'
        ? ({
            tabIndex: disabled ? -1 : 0,
            accessibilityRole: 'button',
            ...(tvPreferredFocus ? { 'data-tv-preferred': 'true' } : null),
          } as any)
        : null)}
      onFocus={(e: any) => {
        if (Platform.OS === 'web') {
          const node = nodeRef.current;
          if (node) {
            try {
              node.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
            } catch {}
          }
        }
        onFocus?.(e);
      }}
      onBlur={(e: any) => {
        onBlur?.(e);
      }}
    />
  );
});
