package com.movieflix.app

import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

class LiquidGlassProViewManager : SimpleViewManager<LiquidGlassProView>() {

    override fun getName(): String = "LiquidGlassProView"

    override fun createViewInstance(reactContext: ThemedReactContext): LiquidGlassProView {
        return LiquidGlassProView(reactContext)
    }

    @ReactProp(name = "cornerRadius", defaultFloat = 28f)
    fun setCornerRadius(view: LiquidGlassProView, radius: Float) {
        view.setCornerRadius(radius)
    }

    @ReactProp(name = "tintOpacity", defaultFloat = 0.18f)
    fun setTintOpacity(view: LiquidGlassProView, opacity: Float) {
        view.setTintOpacity(opacity)
    }

    @ReactProp(name = "tintColor")
    fun setTintColor(view: LiquidGlassProView, color: Int?) {
        if (color != null) view.setTintColor(color)
    }

    @ReactProp(name = "glowColor")
    fun setGlowColor(view: LiquidGlassProView, color: Int?) {
        if (color != null) view.setGlowColor(color)
    }

    @ReactProp(name = "glowIntensity", defaultFloat = 0.15f)
    fun setGlowIntensity(view: LiquidGlassProView, intensity: Float) {
        view.setGlowIntensity(intensity)
    }

    @ReactProp(name = "borderWidth", defaultFloat = 1.5f)
    fun setBorderWidth(view: LiquidGlassProView, width: Float) {
        view.setBorderWidth(width)
    }

    @ReactProp(name = "borderOpacity", defaultFloat = 0.25f)
    fun setBorderOpacity(view: LiquidGlassProView, opacity: Float) {
        view.setBorderOpacity(opacity)
    }

    @ReactProp(name = "borderColor")
    fun setBorderColor(view: LiquidGlassProView, color: Int?) {
        if (color != null) view.setBorderColor(color)
    }

    @ReactProp(name = "animated", defaultBoolean = false)
    fun setAnimated(view: LiquidGlassProView, animated: Boolean) {
        view.setAnimated(animated)
    }

    @ReactProp(name = "interactive", defaultBoolean = false)
    fun setInteractive(view: LiquidGlassProView, interactive: Boolean) {
        view.setInteractive(interactive)
    }

    @ReactProp(name = "morphOnPress", defaultBoolean = true)
    fun setMorphOnPress(view: LiquidGlassProView, enabled: Boolean) {
        view.setMorphOnPress(enabled)
    }

    @ReactProp(name = "refractionStrength", defaultFloat = 12f)
    fun setRefractionStrength(view: LiquidGlassProView, strength: Float) {
        view.setRefractionStrength(strength)
    }

    @ReactProp(name = "chromaticAberration", defaultFloat = 0.8f)
    fun setChromaticAberration(view: LiquidGlassProView, amount: Float) {
        view.setChromaticAberration(amount)
    }
}
