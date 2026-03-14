package com.movieflix.app

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class MoviesPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return listOf(
            MoviesModule(reactContext), 
            DownloadServiceModule(reactContext), 
            MusicPlaybackServiceModule(reactContext), 
            MessagingModule(reactContext), 
            ProfileModule(reactContext), 
            ReelsModule(reactContext), 
            VideoPlayerModule(reactContext), 
            AlgorithmModule(reactContext), 
            SocialFeedModule(reactContext), 
            CacheModule(reactContext), 
            TvFocusModule(reactContext)
        )
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return listOf(
            // TV-specific views
            TvGlowViewManager(),
            WaveViewManager(),
            FastMovieRailManager(),
            StoryViewManager(),
            
            // Control views
            NativeGlassControlManager(),
            NativeVinylViewManager(),
            NativeWaveformViewManager(),
            NativePlaybackControlsViewManager(),
            
            // Phase 1: Core Liquid Glass Components
            LiquidGlassViewManager(),
            LiquidGlassProViewManager(),
            LiquidGlassButtonManager(),
            LiquidGlassSliderManager(),
            LiquidGlassProgressRingManager(),
            LiquidGlassCardManager(),
            
            // Phase 2: Performance-Optimized Native Components
            LiquidHeroViewManager(),
            LiquidRatingBadgeManager(),
            LiquidWaveformViewManager(),
            LiquidChipViewManager(),
            
            // Phase 3: Additional Native Components
            LiquidLiveBadgeManager(),
            LiquidKeyboardKeyManager(),
            LiquidProgressBarManager()
        )
    }
}
