package com.movieflix.app

import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp
import com.facebook.react.common.MapBuilder

class LiquidSliderViewManager : SimpleViewManager<LiquidSliderView>() {

    override fun getName(): String = "LiquidSliderView"

    override fun createViewInstance(reactContext: ThemedReactContext): LiquidSliderView {
        return LiquidSliderView(reactContext)
    }

    @ReactProp(name = "progress", defaultFloat = 0.5f)
    fun setProgress(view: LiquidSliderView, value: Float) {
        view.setProgress(value)
    }

    override fun getExportedCustomDirectEventTypeConstants(): MutableMap<String, Any>? {
        return MapBuilder.builder<String, Any>()
            .put("onValueChange", MapBuilder.of("registrationName", "onValueChange"))
            .put("onSlidingComplete", MapBuilder.of("registrationName", "onSlidingComplete"))
            .build().toMutableMap()
    }
}
