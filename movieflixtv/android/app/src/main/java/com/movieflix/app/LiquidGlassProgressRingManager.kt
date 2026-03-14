package com.movieflix.app

import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

class LiquidGlassProgressRingManager : SimpleViewManager<LiquidGlassProgressRing>() {

    override fun getName(): String = "LiquidGlassProgressRing"

    override fun createViewInstance(reactContext: ThemedReactContext): LiquidGlassProgressRing {
        return LiquidGlassProgressRing(reactContext)
    }

    @ReactProp(name = "ringColor")
    fun setRingColor(view: LiquidGlassProgressRing, color: Int?) {
        if (color != null) view.setRingColor(color)
    }

    @ReactProp(name = "secondaryColor")
    fun setSecondaryColor(view: LiquidGlassProgressRing, color: Int?) {
        if (color != null) view.setSecondaryColor(color)
    }

    @ReactProp(name = "ringWidth", defaultFloat = 4f)
    fun setRingWidth(view: LiquidGlassProgressRing, width: Float) {
        view.setRingWidth(width)
    }

    @ReactProp(name = "glowIntensity", defaultFloat = 0.4f)
    fun setGlowIntensity(view: LiquidGlassProgressRing, intensity: Float) {
        view.setGlowIntensity(intensity)
    }

    @ReactProp(name = "progress", defaultFloat = 0f)
    fun setProgress(view: LiquidGlassProgressRing, progress: Float) {
        view.setProgress(progress)
    }

    @ReactProp(name = "indeterminate", defaultBoolean = true)
    fun setIndeterminate(view: LiquidGlassProgressRing, indeterminate: Boolean) {
        view.setIndeterminate(indeterminate)
    }
}
