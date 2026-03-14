package com.movieflix.app

import com.facebook.react.common.MapBuilder
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

class NativeGlassControlManager : SimpleViewManager<NativeGlassControl>() {
    override fun getName() = "NativeGlassControl"

    override fun createViewInstance(reactContext: ThemedReactContext): NativeGlassControl {
        return NativeGlassControl(reactContext)
    }

    @ReactProp(name = "iconName")
    fun setIconName(view: NativeGlassControl, iconName: String?) {
        view.setIconName(iconName ?: "play")
    }

    @ReactProp(name = "showGlassBackground", defaultBoolean = false)
    fun setShowGlassBackground(view: NativeGlassControl, show: Boolean) {
        view.setShowGlassBackground(show)
    }

    @ReactProp(name = "glassColor")
    fun setGlassColor(view: NativeGlassControl, color: String?) {
        if (color != null) {
            try { view.setGlassColor(android.graphics.Color.parseColor(color)) } catch (_: Exception) {}
        }
    }

    @ReactProp(name = "glassGlowColor")
    fun setGlassGlowColor(view: NativeGlassControl, color: String?) {
        if (color != null) {
            try { view.setGlassGlowColor(android.graphics.Color.parseColor(color)) } catch (_: Exception) {}
        }
    }

    override fun getExportedCustomBubblingEventTypeConstants(): Map<String, Any> {
        return MapBuilder.builder<String, Any>()
            .put(
                "onPress",
                MapBuilder.of(
                    "phasedRegistrationNames",
                    MapBuilder.of("bubbled", "onPress")
                )
            )
            .build()
    }
}
