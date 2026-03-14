package com.movieflix.app

import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

class LiquidGlassViewManager : SimpleViewManager<LiquidGlassView>() {

    override fun getName(): String = "LiquidGlassView"

    override fun createViewInstance(reactContext: ThemedReactContext): LiquidGlassView {
        return LiquidGlassView(reactContext)
    }

    @ReactProp(name = "glowColor")
    fun setGlowColor(view: LiquidGlassView, color: Int?) {
        if (color != null) {
            view.setGlowColor(color)
        }
    }

    @ReactProp(name = "tintColor")
    fun setTintColor(view: LiquidGlassView, color: Int?) {
        if (color != null) {
            view.setTintColor(color)
        }
    }

    @ReactProp(name = "tintOpacity", defaultFloat = 0.55f)
    fun setTintOpacity(view: LiquidGlassView, opacity: Float) {
        view.setTintOpacity(opacity)
    }

    @ReactProp(name = "cornerRadius", defaultFloat = 28f)
    fun setCornerRadius(view: LiquidGlassView, radius: Float) {
        view.setCornerRadius(radius)
    }

    @ReactProp(name = "glowIntensity", defaultFloat = 0.22f)
    fun setGlowIntensity(view: LiquidGlassView, intensity: Float) {
        view.setGlowIntensity(intensity)
    }

    @ReactProp(name = "borderWidth", defaultFloat = 1.25f)
    fun setBorderWidth(view: LiquidGlassView, width: Float) {
        view.setBorderWidth(width)
    }

    @ReactProp(name = "borderOpacity", defaultFloat = 0.22f)
    fun setBorderOpacity(view: LiquidGlassView, opacity: Float) {
        view.setBorderOpacity(opacity)
    }

    @ReactProp(name = "borderColor")
    fun setBorderColor(view: LiquidGlassView, color: Int?) {
        if (color != null) {
            view.setBorderColor(color)
        }
    }

    @ReactProp(name = "animated", defaultBoolean = false)
    fun setAnimated(view: LiquidGlassView, animated: Boolean) {
        view.setAnimated(animated)
    }

    @ReactProp(name = "blurRadius", defaultFloat = 0f)
    fun setBlurRadius(view: LiquidGlassView, radius: Float) {
        view.setBlurRadius(radius.toInt())
    }

    @ReactProp(name = "chromaticAberration", defaultBoolean = false)
    fun setChromaticAberration(view: LiquidGlassView, enabled: Boolean) {
        view.setChromaticAberration(enabled)
    }

    @ReactProp(name = "breathingEffect", defaultBoolean = false)
    fun setBreathingEffect(view: LiquidGlassView, enabled: Boolean) {
        view.setBreathingEffect(enabled)
    }

    @ReactProp(name = "interactiveMalleability", defaultBoolean = false)
    fun setInteractiveMalleability(view: LiquidGlassView, enabled: Boolean) {
        view.setInteractiveMalleability(enabled)
    }
}
