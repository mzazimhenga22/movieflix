package com.movieflix.app.app

import com.facebook.react.common.MapBuilder
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

class NativePlaybackControlsViewManager : SimpleViewManager<NativePlaybackControlsView>() {
    override fun getName() = "NativePlaybackControlsView"

    override fun createViewInstance(reactContext: ThemedReactContext): NativePlaybackControlsView {
        return NativePlaybackControlsView(reactContext)
    }

    @ReactProp(name = "durationMs")
    fun setDurationMs(view: NativePlaybackControlsView, value: Double) {
        view.setDurationMs(value)
    }

    @ReactProp(name = "positionMs")
    fun setPositionMs(view: NativePlaybackControlsView, value: Double) {
        view.setPositionMs(value)
    }

    @ReactProp(name = "accentColor")
    fun setAccentColor(view: NativePlaybackControlsView, value: String?) {
        view.setAccentColorHex(value)
    }

    override fun getExportedCustomBubblingEventTypeConstants(): Map<String, Any> {
        return MapBuilder.builder<String, Any>()
            .put(
                "onSeekStart",
                MapBuilder.of(
                    "phasedRegistrationNames",
                    MapBuilder.of("bubbled", "onSeekStart")
                )
            )
            .put(
                "onSeek",
                MapBuilder.of(
                    "phasedRegistrationNames",
                    MapBuilder.of("bubbled", "onSeek")
                )
            )
            .put(
                "onSeekComplete",
                MapBuilder.of(
                    "phasedRegistrationNames",
                    MapBuilder.of("bubbled", "onSeekComplete")
                )
            )
            .build()
    }
}
