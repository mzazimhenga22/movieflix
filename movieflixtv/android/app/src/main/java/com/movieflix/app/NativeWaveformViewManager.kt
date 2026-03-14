package com.movieflix.app.app

import android.graphics.Color
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

class NativeWaveformViewManager : SimpleViewManager<NativeWaveformView>() {
    override fun getName() = "NativeWaveformView"

    override fun createViewInstance(reactContext: ThemedReactContext): NativeWaveformView {
        return NativeWaveformView(reactContext)
    }

    @ReactProp(name = "accentColor")
    fun setAccentColor(view: NativeWaveformView, color: String?) {
        try {
            view.setAccentColor(Color.parseColor(color ?: "#e50914"))
        } catch (_: Throwable) {
            view.setAccentColor(Color.parseColor("#e50914"))
        }
    }

    @ReactProp(name = "isPlaying")
    fun setPlaying(view: NativeWaveformView, playing: Boolean) {
        view.setPlaying(playing)
    }
}
