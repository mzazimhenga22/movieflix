package com.movieflix.app

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class MoviesPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return listOf(MoviesModule(reactContext), DownloadServiceModule(reactContext), MusicPlaybackServiceModule(reactContext), MessagingModule(reactContext), ProfileModule(reactContext), ReelsModule(reactContext), VideoPlayerModule(reactContext), AlgorithmModule(reactContext), SocialFeedModule(reactContext), CacheModule(reactContext), TvFocusModule(reactContext))
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return listOf(TvGlowViewManager(), WaveViewManager(), FastMovieRailManager(), StoryViewManager(), NativeGlassControlManager(), NativeVinylViewManager(), NativeWaveformViewManager(), NativePlaybackControlsViewManager(), LiquidGlassViewManager())
    }
}
