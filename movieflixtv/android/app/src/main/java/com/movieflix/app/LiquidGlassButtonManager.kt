package com.movieflix.app

import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

class LiquidGlassButtonManager : SimpleViewManager<LiquidGlassButton>() {

    override fun getName(): String = "LiquidGlassButton"

    override fun createViewInstance(reactContext: ThemedReactContext): LiquidGlassButton {
        return LiquidGlassButton(reactContext)
    }

    @ReactProp(name = "cornerRadius", defaultFloat = 24f)
    fun setCornerRadius(view: LiquidGlassButton, radius: Float) {
        view.setCornerRadius(radius)
    }

    @ReactProp(name = "tintColor")
    fun setTintColor(view: LiquidGlassButton, color: Int?) {
        if (color != null) view.setTintColor(color)
    }

    @ReactProp(name = "glowColor")
    fun setGlowColor(view: LiquidGlassButton, color: Int?) {
        if (color != null) view.setGlowColor(color)
    }

    @ReactProp(name = "glowIntensity", defaultFloat = 0.2f)
    fun setGlowIntensity(view: LiquidGlassButton, intensity: Float) {
        view.setGlowIntensity(intensity)
    }

    @ReactProp(name = "borderWidth", defaultFloat = 1.2f)
    fun setBorderWidth(view: LiquidGlassButton, width: Float) {
        view.setBorderWidth(width)
    }

    @ReactProp(name = "borderOpacity", defaultFloat = 0.3f)
    fun setBorderOpacity(view: LiquidGlassButton, opacity: Float) {
        view.setBorderOpacity(opacity)
    }

    @ReactProp(name = "iconName", defaultString = "play")
    fun setIconName(view: LiquidGlassButton, name: String) {
        view.setIconName(name)
    }

    @ReactProp(name = "iconColor")
    fun setIconColor(view: LiquidGlassButton, color: Int?) {
        if (color != null) view.setIconColor(color)
    }

    @ReactProp(name = "iconSize", defaultFloat = 20f)
    fun setIconSize(view: LiquidGlassButton, size: Float) {
        view.setIconSize(size)
    }

    @ReactProp(name = "animated", defaultBoolean = false)
    fun setAnimated(view: LiquidGlassButton, animated: Boolean) {
        view.setAnimated(animated)
    }
}
