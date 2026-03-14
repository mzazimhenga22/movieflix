package com.movieflix.app

import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

class LiquidGlassSliderManager : SimpleViewManager<LiquidGlassSlider>() {

    override fun getName(): String = "LiquidGlassSlider"

    override fun createViewInstance(reactContext: ThemedReactContext): LiquidGlassSlider {
        return LiquidGlassSlider(reactContext)
    }

    @ReactProp(name = "accentColor")
    fun setAccentColor(view: LiquidGlassSlider, color: Int?) {
        if (color != null) view.setAccentColor(color)
    }

    @ReactProp(name = "trackColor")
    fun setTrackColor(view: LiquidGlassSlider, color: Int?) {
        if (color != null) view.setTrackColor(color)
    }

    @ReactProp(name = "glowColor")
    fun setGlowColor(view: LiquidGlassSlider, color: Int?) {
        if (color != null) view.setGlowColor(color)
    }

    @ReactProp(name = "glowIntensity", defaultFloat = 0.3f)
    fun setGlowIntensity(view: LiquidGlassSlider, intensity: Float) {
        view.setGlowIntensity(intensity)
    }

    @ReactProp(name = "trackHeight", defaultFloat = 6f)
    fun setTrackHeight(view: LiquidGlassSlider, height: Float) {
        view.setTrackHeight(height)
    }

    @ReactProp(name = "thumbSize", defaultFloat = 40f)
    fun setThumbSize(view: LiquidGlassSlider, size: Float) {
        view.setThumbSize(size)
    }

    @ReactProp(name = "minValue", defaultFloat = 0f)
    fun setMinValue(view: LiquidGlassSlider, min: Float) {
        view.setMinValue(min)
    }

    @ReactProp(name = "maxValue", defaultFloat = 1f)
    fun setMaxValue(view: LiquidGlassSlider, max: Float) {
        view.setMaxValue(max)
    }

    @ReactProp(name = "value", defaultFloat = 0.5f)
    fun setValue(view: LiquidGlassSlider, value: Float) {
        view.setValue(value)
    }

    @ReactProp(name = "animated", defaultBoolean = true)
    fun setAnimated(view: LiquidGlassSlider, animated: Boolean) {
        view.setAnimated(animated)
    }

    @ReactProp(name = "showValue", defaultBoolean = false)
    fun setShowValue(view: LiquidGlassSlider, show: Boolean) {
        view.setShowValue(show)
    }
}
