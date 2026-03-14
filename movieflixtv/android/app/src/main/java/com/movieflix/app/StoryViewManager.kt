package com.movieflix.app.app

import com.facebook.react.common.MapBuilder
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

class StoryViewManager : SimpleViewManager<StoryView>() {

    override fun getName(): String {
        return "StoryView"
    }

    override fun createViewInstance(reactContext: ThemedReactContext): StoryView {
        return StoryView(reactContext)
    }

    @ReactProp(name = "stories")
    fun setStories(view: StoryView, storiesJson: String?) {
        view.setStories(storiesJson)
    }

    @ReactProp(name = "initialStoryIndex", defaultInt = 0)
    fun setInitialStoryIndex(view: StoryView, index: Int) {
        view.setInitialStoryIndex(index)
    }

    @ReactProp(name = "initialMediaIndex", defaultInt = 0)
    fun setInitialMediaIndex(view: StoryView, index: Int) {
        view.setInitialMediaIndex(index)
    }

    override fun getExportedCustomBubblingEventTypeConstants(): Map<String, Any> {
        return MapBuilder.builder<String, Any>()
            .put("onStoryChange", MapBuilder.of("phasedRegistrationNames", MapBuilder.of("bubbled", "onStoryChange")))
            .put("onMediaChange", MapBuilder.of("phasedRegistrationNames", MapBuilder.of("bubbled", "onMediaChange")))
            .put("onClose", MapBuilder.of("phasedRegistrationNames", MapBuilder.of("bubbled", "onClose")))
            .put("onReply", MapBuilder.of("phasedRegistrationNames", MapBuilder.of("bubbled", "onReply")))
            .put("onSwipeUp", MapBuilder.of("phasedRegistrationNames", MapBuilder.of("bubbled", "onSwipeUp")))
            .build()
    }
}
