package com.movieflix.app

import android.graphics.Color
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

class TvGlowViewManager : SimpleViewManager<TvGlowView>() {
    override fun getName(): String {
        return "TvGlowView"
    }

    override fun createViewInstance(reactContext: ThemedReactContext): TvGlowView {
        return TvGlowView(reactContext)
    }

    @ReactProp(name = "color")
    fun setColor(view: TvGlowView, color: String?) {
        if (color != null) {
            try {
                view.setColor(Color.parseColor(color))
            } catch (e: Exception) {
                // ignore invalid color
            }
        }
    }
}
