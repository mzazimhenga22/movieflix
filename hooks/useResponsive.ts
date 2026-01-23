import { useWindowDimensions, PixelRatio } from 'react-native';
import { useMemo } from 'react';

// Base design dimensions (iPhone 14 Pro)
const BASE_WIDTH = 393;
const BASE_HEIGHT = 852;

export interface ResponsiveConfig {
  screenWidth: number;
  screenHeight: number;
  isSmallScreen: boolean;
  isMediumScreen: boolean;
  isLargeScreen: boolean;
  isTablet: boolean;
  fontScale: number;
  // Scaling functions
  wp: (percentage: number) => number;
  hp: (percentage: number) => number;
  sp: (size: number) => number;
  ms: (size: number, factor?: number) => number;
  // Card dimensions
  cardWidth: number;
  cardHeight: number;
  compactCardWidth: number;
  compactCardHeight: number;
  largeCardWidth: number;
  largeCardHeight: number;
  // Spacing
  horizontalPadding: number;
  cardGap: number;
  borderRadius: number;
  // Font sizes
  titleSize: number;
  subtitleSize: number;
  captionSize: number;
  badgeSize: number;
}

export function useResponsive(): ResponsiveConfig {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const fontScale = PixelRatio.getFontScale();

  return useMemo(() => {
    const isSmallScreen = screenWidth < 360;
    const isMediumScreen = screenWidth >= 360 && screenWidth < 414;
    const isLargeScreen = screenWidth >= 414;
    const isTablet = screenWidth >= 600;

    // Width percentage
    const wp = (percentage: number) => (screenWidth * percentage) / 100;
    
    // Height percentage
    const hp = (percentage: number) => (screenHeight * percentage) / 100;
    
    // Scaled size (based on screen width ratio)
    const widthRatio = screenWidth / BASE_WIDTH;
    const sp = (size: number) => Math.round(size * Math.min(widthRatio, 1.3));
    
    // Moderate scale - scales less aggressively
    const ms = (size: number, factor = 0.5) => {
      const newSize = size + (widthRatio - 1) * factor * size;
      return Math.round(Math.max(size * 0.8, Math.min(newSize, size * 1.4)));
    };

    // Card dimensions - responsive to screen width
    // Show ~2.3 cards on screen for default, ensuring no cutoff
    const cardGap = isSmallScreen ? 10 : isMediumScreen ? 12 : 14;
    const horizontalPadding = isSmallScreen ? 12 : isMediumScreen ? 16 : 20;
    
    // Calculate card width to fit 2.3 cards with gaps
    const availableWidth = screenWidth - (horizontalPadding * 2);
    const defaultCardWidth = Math.floor((availableWidth - cardGap * 2) / 2.3);
    const cardWidth = Math.max(120, Math.min(defaultCardWidth, 170));
    const cardHeight = Math.round(cardWidth * 1.5); // 2:3 aspect ratio
    
    // Compact cards (smaller screens or grid view)
    const compactCardWidth = Math.max(100, Math.round(cardWidth * 0.8));
    const compactCardHeight = Math.round(compactCardWidth * 1.5);
    
    // Large cards (featured/spotlight)
    const largeCardWidth = Math.min(wp(75), 320);
    const largeCardHeight = Math.round(largeCardWidth * 1.03);
    
    // Border radius - scales with card size
    const borderRadius = isSmallScreen ? 14 : isMediumScreen ? 16 : 18;
    
    // Font sizes - scaled but clamped
    const titleSize = ms(15, 0.3);
    const subtitleSize = ms(12, 0.3);
    const captionSize = ms(10, 0.3);
    const badgeSize = ms(9, 0.2);

    return {
      screenWidth,
      screenHeight,
      isSmallScreen,
      isMediumScreen,
      isLargeScreen,
      isTablet,
      fontScale,
      wp,
      hp,
      sp,
      ms,
      cardWidth,
      cardHeight,
      compactCardWidth,
      compactCardHeight,
      largeCardWidth,
      largeCardHeight,
      horizontalPadding,
      cardGap,
      borderRadius,
      titleSize,
      subtitleSize,
      captionSize,
      badgeSize,
    };
  }, [screenWidth, screenHeight, fontScale]);
}

// Export static helper for components that can't use hooks
export function getResponsiveCardDimensions(screenWidth: number) {
  const isSmallScreen = screenWidth < 360;
  const isMediumScreen = screenWidth >= 360 && screenWidth < 414;
  
  const cardGap = isSmallScreen ? 10 : isMediumScreen ? 12 : 14;
  const horizontalPadding = isSmallScreen ? 12 : isMediumScreen ? 16 : 20;
  
  const availableWidth = screenWidth - (horizontalPadding * 2);
  const defaultCardWidth = Math.floor((availableWidth - cardGap * 2) / 2.3);
  const cardWidth = Math.max(120, Math.min(defaultCardWidth, 170));
  const cardHeight = Math.round(cardWidth * 1.5);
  
  const compactCardWidth = Math.max(100, Math.round(cardWidth * 0.8));
  const compactCardHeight = Math.round(compactCardWidth * 1.5);
  
  const largeCardWidth = Math.min(screenWidth * 0.75, 320);
  const largeCardHeight = Math.round(largeCardWidth * 1.03);
  
  const borderRadius = isSmallScreen ? 14 : isMediumScreen ? 16 : 18;

  return {
    cardWidth,
    cardHeight,
    compactCardWidth,
    compactCardHeight,
    largeCardWidth,
    largeCardHeight,
    cardGap,
    horizontalPadding,
    borderRadius,
    isSmallScreen,
  };
}
