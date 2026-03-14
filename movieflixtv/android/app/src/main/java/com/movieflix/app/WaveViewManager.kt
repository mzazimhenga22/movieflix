package com.movieflix.app.app

import android.graphics.Color
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

class WaveViewManager : SimpleViewManager<WaveView>() {
    override fun getName() = "WaveView"

    override fun createViewInstance(reactContext: ThemedReactContext): WaveView {
        return WaveView(reactContext)
    }

    @ReactProp(name = "color")
    fun setColor(view: WaveView, color: String?) {
        if (color != null) {
            try {
                view.setColor(Color.parseColor(color))
            } catch (e: Exception) { }
        }
    }
}
