package com.movieflix.app

import com.facebook.react.common.MapBuilder
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

class FastMovieRailManager : SimpleViewManager<FastMovieRailView>() {

    override fun getName(): String {
        return "FastMovieRail"
    }

    override fun createViewInstance(reactContext: ThemedReactContext): FastMovieRailView {
        return FastMovieRailView(reactContext)
    }

    @ReactProp(name = "title")
    fun setTitle(view: FastMovieRailView, title: String?) {
        view.setTitle(title ?: "")
    }

    @ReactProp(name = "movies")
    fun setMovies(view: FastMovieRailView, moviesJson: String?) {
        if (moviesJson != null) {
            view.setMovies(moviesJson)
        }
    }

    @ReactProp(name = "accentColor")
    fun setAccentColor(view: FastMovieRailView, color: String?) {
        view.setAccentColor(color)
    }

    override fun getExportedCustomBubblingEventTypeConstants(): Map<String, Any> {
        return MapBuilder.builder<String, Any>()
            .put("onItemPress", MapBuilder.of("phasedRegistrationNames", MapBuilder.of("bubbled", "onItemPress")))
            .put("onSeeAllPress", MapBuilder.of("phasedRegistrationNames", MapBuilder.of("bubbled", "onSeeAllPress")))
            .build()
    }
}
