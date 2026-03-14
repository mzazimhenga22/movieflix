import React from 'react';
import { Slot, usePathname } from 'expo-router';
import { TvAccentProvider } from '../components/TvAccentContext';
import TvSideNav from '../components/TvSideNav';

export default function TvTabsLayout() {
  const pathname = usePathname();
  return (
    <TvAccentProvider>
      <TvSideNav pathname={pathname}>
        <Slot />
      </TvSideNav>
    </TvAccentProvider>
  );
}
