package com.movieflix.app

import android.graphics.Color
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

class LiquidGlassViewManager : SimpleViewManager<LiquidGlassView>() {

    override fun getName(): String = "LiquidGlassView"

    override fun createViewInstance(reactContext: ThemedReactContext): LiquidGlassView {
        return LiquidGlassView(reactContext)
    }

    // Basic properties
    @ReactProp(name = "glowColor")
    fun setGlowColor(view: LiquidGlassView, color: String?) {
        if (color != null) {
            try { view.setGlowColor(Color.parseColor(color)) } catch (_: Exception) {}
        }
    }

    @ReactProp(name = "tintColor")
    fun setTintColor(view: LiquidGlassView, color: String?) {
        if (color != null) {
            try { view.setTintColor(Color.parseColor(color)) } catch (_: Exception) {}
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

    @ReactProp(name = "glowIntensity", defaultFloat = 0.7f)
    fun setGlowIntensity(view: LiquidGlassView, intensity: Float) {
        view.setGlowIntensity(intensity)
    }

    @ReactProp(name = "borderWidth", defaultFloat = 1.8f)
    fun setBorderWidth(view: LiquidGlassView, width: Float) {
        view.setBorderWidth(width)
    }

    @ReactProp(name = "animated", defaultBoolean = true)
    fun setAnimated(view: LiquidGlassView, animated: Boolean) {
        view.setAnimated(animated)
    }

    // iOS 26 properties - Content and environmental awareness
    @ReactProp(name = "contentColor", defaultInt = 0)
    fun setContentColor(view: LiquidGlassView, color: Int) {
        view.setContentColor(color)
    }

    @ReactProp(name = "ambientLight", defaultFloat = 0.8f)
    fun setAmbientLight(view: LiquidGlassView, level: Float) {
        view.setAmbientLight(level)
    }

    @ReactProp(name = "scrollOpacity", defaultFloat = 1.0f)
    fun setScrollOpacity(view: LiquidGlassView, opacity: Float) {
        view.setScrollOpacity(opacity)
    }

    @ReactProp(name = "scrollVelocity", defaultFloat = 0f)
    fun setScrollVelocity(view: LiquidGlassView, velocity: Float) {
        view.setScrollVelocity(velocity)
    }

    // String-based color for contentColor
    @ReactProp(name = "contentColorString")
    fun setContentColorString(view: LiquidGlassView, color: String?) {
        if (color != null) {
            try {
                view.setContentColor(Color.parseColor(color))
            } catch (_: Exception) {}
        }
    }

    // Advanced iOS 26 properties for 10/10 liquid glass
    @ReactProp(name = "causticIntensity", defaultFloat = 0.6f)
    fun setCausticIntensity(view: LiquidGlassView, intensity: Float) {
        view.setCausticIntensity(intensity)
    }

    @ReactProp(name = "chromaticAberration", defaultFloat = 0.8f)
    fun setChromaticAberration(view: LiquidGlassView, amount: Float) {
        view.setChromaticAberration(amount)
    }

    @ReactProp(name = "glassThickness", defaultFloat = 12f)
    fun setGlassThickness(view: LiquidGlassView, thickness: Float) {
        view.setGlassThickness(thickness)
    }

    @ReactProp(name = "parallaxStrength", defaultFloat = 0.15f)
    fun setParallaxStrength(view: LiquidGlassView, strength: Float) {
        view.setParallaxStrength(strength)
    }

    @ReactProp(name = "quality", defaultInt = 3)
    fun setQuality(view: LiquidGlassView, q: Int) {
        val quality = when (q) {
            0 -> LiquidGlassView.GlassQuality.LOW
            1 -> LiquidGlassView.GlassQuality.MEDIUM
            2 -> LiquidGlassView.GlassQuality.HIGH
            else -> LiquidGlassView.GlassQuality.ULTRA
        }
        view.setQuality(quality)
    }
}
