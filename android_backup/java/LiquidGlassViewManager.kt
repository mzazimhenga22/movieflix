package com.movieflix.app

import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

class LiquidGlassViewManager : SimpleViewManager<LiquidGlassView>() {

    override fun getName(): String = "LiquidGlassView"

    override fun createViewInstance(reactContext: ThemedReactContext): LiquidGlassView {
        return LiquidGlassView(reactContext)
    }

    @ReactProp(name = "cornerRadius", defaultFloat = 28f)
    fun setCornerRadius(view: LiquidGlassView, radius: Float) {
        view.setCornerRadius(radius)
    }

    @ReactProp(name = "tintOpacity", defaultFloat = 0.22f)
    fun setTintOpacity(view: LiquidGlassView, opacity: Float) {
        view.setTintOpacity(opacity)
    }

    @ReactProp(name = "blurRadius", defaultFloat = 80f)
    fun setBlurRadius(view: LiquidGlassView, radius: Float) {
        view.setBlurRadius(radius.toInt())
    }

    @ReactProp(name = "borderOpacity", defaultFloat = 0.3f)
    fun setBorderOpacity(view: LiquidGlassView, opacity: Float) {
        view.setBorderOpacity(opacity)
    }
}
