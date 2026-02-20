// flashlist.d.ts (place in your project, included by tsconfig)
import 'react';
import type { FlashListProps } from '@shopify/flash-list';

declare module '@shopify/flash-list' {
  interface FlashListProps<T> {
    /** Optional size estimate for item height — add if your version uses it */
    estimatedItemSize?: number;
  }
}
