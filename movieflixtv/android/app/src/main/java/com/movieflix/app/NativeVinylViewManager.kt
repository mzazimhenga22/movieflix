package com.movieflix.app

import android.graphics.Color
import com.facebook.react.common.MapBuilder
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

class NativeVinylViewManager : SimpleViewManager<NativeVinylView>() {
    override fun getName() = "NativeVinylView"

    override fun createViewInstance(reactContext: ThemedReactContext): NativeVinylView {
        return NativeVinylView(reactContext)
    }

    @ReactProp(name = "accentColor")
    fun setAccentColor(view: NativeVinylView, color: String?) {
        try {
            view.setAccentColor(Color.parseColor(color ?: "#e50914"))
        } catch (_: Throwable) {
            view.setAccentColor(Color.parseColor("#e50914"))
        }
    }

    @ReactProp(name = "isPlaying")
    fun setPlaying(view: NativeVinylView, playing: Boolean) {
        view.setPlaying(playing)
    }

    @ReactProp(name = "imageUrl")
    fun setImageUrl(view: NativeVinylView, url: String?) {
        view.setImageUrl(url)
    }
}
