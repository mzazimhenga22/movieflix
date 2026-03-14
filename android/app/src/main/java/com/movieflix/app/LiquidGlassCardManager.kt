package com.movieflix.app

import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

class LiquidGlassCardManager : SimpleViewManager<LiquidGlassCard>() {

    override fun getName(): String = "LiquidGlassCard"

    override fun createViewInstance(reactContext: ThemedReactContext): LiquidGlassCard {
        return LiquidGlassCard(reactContext)
    }

    @ReactProp(name = "cornerRadius", defaultFloat = 24f)
    fun setCornerRadius(view: LiquidGlassCard, radius: Float) {
        view.setCornerRadius(radius)
    }

    @ReactProp(name = "tintColor")
    fun setTintColor(view: LiquidGlassCard, color: Int?) {
        if (color != null) view.setTintColor(color)
    }

    @ReactProp(name = "glowColor")
    fun setGlowColor(view: LiquidGlassCard, color: Int?) {
        if (color != null) view.setGlowColor(color)
    }

    @ReactProp(name = "glowIntensity", defaultFloat = 0.18f)
    fun setGlowIntensity(view: LiquidGlassCard, intensity: Float) {
        view.setGlowIntensity(intensity)
    }

    @ReactProp(name = "interactive", defaultBoolean = true)
    fun setInteractive(view: LiquidGlassCard, interactive: Boolean) {
        view.setInteractive(interactive)
    }

    @ReactProp(name = "animated", defaultBoolean = true)
    fun setAnimated(view: LiquidGlassCard, animated: Boolean) {
        view.setAnimated(animated)
    }
}
