package com.movieflix.app

import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

// ============================================================================
// Phase 1: Core Liquid Glass Components
// ============================================================================

// LiquidGlassProViewManager
class LiquidGlassProViewManager : SimpleViewManager<LiquidGlassProView>() {
    override fun getName() = "LiquidGlassProView"
    override fun createViewInstance(reactContext: ThemedReactContext) = LiquidGlassProView(reactContext)
    
    @ReactProp(name = "cornerRadius", defaultFloat = 24f)
    fun setCornerRadius(view: LiquidGlassProView, radius: Float) { view.setCornerRadius(radius) }
    
    @ReactProp(name = "tintOpacity", defaultFloat = 0.18f)
    fun setTintOpacity(view: LiquidGlassProView, opacity: Float) { view.setTintOpacity(opacity) }
    
    @ReactProp(name = "tintColor")
    fun setTintColor(view: LiquidGlassProView, color: Int?) { if (color != null) view.setTintColor(color) }
    
    @ReactProp(name = "glowColor")
    fun setGlowColor(view: LiquidGlassProView, color: Int?) { if (color != null) view.setGlowColor(color) }
    
    @ReactProp(name = "glowIntensity", defaultFloat = 0.15f)
    fun setGlowIntensity(view: LiquidGlassProView, intensity: Float) { view.setGlowIntensity(intensity) }
    
    @ReactProp(name = "animated", defaultBoolean = true)
    fun setAnimated(view: LiquidGlassProView, animated: Boolean) { view.setAnimated(animated) }
    
    @ReactProp(name = "interactive", defaultBoolean = false)
    fun setInteractive(view: LiquidGlassProView, interactive: Boolean) { view.setInteractive(interactive) }
}

// LiquidGlassButtonManager
class LiquidGlassButtonManager : SimpleViewManager<LiquidGlassButton>() {
    override fun getName() = "LiquidGlassButton"
    override fun createViewInstance(reactContext: ThemedReactContext) = LiquidGlassButton(reactContext)
    
    @ReactProp(name = "cornerRadius", defaultFloat = 24f)
    fun setCornerRadius(view: LiquidGlassButton, radius: Float) { view.setCornerRadius(radius) }
    
    @ReactProp(name = "tintColor")
    fun setTintColor(view: LiquidGlassButton, color: Int?) { if (color != null) view.setTintColor(color) }
    
    @ReactProp(name = "glowColor")
    fun setGlowColor(view: LiquidGlassButton, color: Int?) { if (color != null) view.setGlowColor(color) }
    
    @ReactProp(name = "glowIntensity", defaultFloat = 0.2f)
    fun setGlowIntensity(view: LiquidGlassButton, intensity: Float) { view.setGlowIntensity(intensity) }
    
    @ReactProp(name = "iconName", defaultString = "play")
    fun setIconName(view: LiquidGlassButton, name: String) { view.setIconName(name) }
    
    @ReactProp(name = "iconColor")
    fun setIconColor(view: LiquidGlassButton, color: Int?) { if (color != null) view.setIconColor(color) }
    
    @ReactProp(name = "animated", defaultBoolean = true)
    fun setAnimated(view: LiquidGlassButton, animated: Boolean) { view.setAnimated(animated) }
}

// ============================================================================
// Phase 2: Performance-Optimized Native Components
// ============================================================================

// LiquidHeroViewManager
class LiquidHeroViewManager : SimpleViewManager<LiquidHeroView>() {
    override fun getName() = "LiquidHeroView"
    override fun createViewInstance(reactContext: ThemedReactContext) = LiquidHeroView(reactContext)
    
    @ReactProp(name = "accentColor")
    fun setAccentColor(view: LiquidHeroView, color: Int?) { if (color != null) view.setAccentColor(color) }
    
    @ReactProp(name = "secondaryColor")
    fun setSecondaryColor(view: LiquidHeroView, color: Int?) { if (color != null) view.setSecondaryColor(color) }
    
    @ReactProp(name = "glowIntensity", defaultFloat = 0.4f)
    fun setGlowIntensity(view: LiquidHeroView, intensity: Float) { view.setGlowIntensity(intensity) }
    
    @ReactProp(name = "animated", defaultBoolean = true)
    fun setAnimated(view: LiquidHeroView, animated: Boolean) { view.setAnimated(animated) }
}

// LiquidRatingBadgeManager
class LiquidRatingBadgeManager : SimpleViewManager<LiquidRatingBadge>() {
    override fun getName() = "LiquidRatingBadge"
    override fun createViewInstance(reactContext: ThemedReactContext) = LiquidRatingBadge(reactContext)
    
    @ReactProp(name = "rating", defaultFloat = 0f)
    fun setRating(view: LiquidRatingBadge, rating: Float) { view.setRating(rating) }
    
    @ReactProp(name = "accentColor")
    fun setAccentColor(view: LiquidRatingBadge, color: Int?) { if (color != null) view.setAccentColor(color) }
    
    @ReactProp(name = "showStar", defaultBoolean = true)
    fun setShowStar(view: LiquidRatingBadge, show: Boolean) { view.setShowStar(show) }
}

// LiquidWaveformViewManager
class LiquidWaveformViewManager : SimpleViewManager<LiquidWaveformView>() {
    override fun getName() = "LiquidWaveformView"
    override fun createViewInstance(reactContext: ThemedReactContext) = LiquidWaveformView(reactContext)
    
    @ReactProp(name = "barColor")
    fun setBarColor(view: LiquidWaveformView, color: Int?) { if (color != null) view.setBarColor(color) }
    
    @ReactProp(name = "secondaryColor")
    fun setSecondaryColor(view: LiquidWaveformView, color: Int?) { if (color != null) view.setSecondaryColor(color) }
    
    @ReactProp(name = "barCount", defaultInt = 48)
    fun setBarCount(view: LiquidWaveformView, count: Int) { view.setBarCount(count) }
    
    @ReactProp(name = "isPlaying", defaultBoolean = false)
    fun setIsPlaying(view: LiquidWaveformView, playing: Boolean) { view.setPlaying(playing) }
}

// LiquidChipViewManager
class LiquidChipViewManager : SimpleViewManager<LiquidChipView>() {
    override fun getName() = "LiquidChipView"
    override fun createViewInstance(reactContext: ThemedReactContext) = LiquidChipView(reactContext)
    
    @ReactProp(name = "text", defaultString = "")
    fun setText(view: LiquidChipView, text: String) { view.setText(text) }
    
    @ReactProp(name = "accentColor")
    fun setAccentColor(view: LiquidChipView, color: Int?) { if (color != null) view.setAccentColor(color) }
    
    @ReactProp(name = "selected", defaultBoolean = false)
    fun setSelected(view: LiquidChipView, selected: Boolean) { view.setSelected(selected) }
}

// ============================================================================
// Phase 3: Additional Native Components
// ============================================================================

// LiquidLiveBadgeManager
class LiquidLiveBadgeManager : SimpleViewManager<LiquidLiveBadge>() {
    override fun getName() = "LiquidLiveBadge"
    override fun createViewInstance(reactContext: ThemedReactContext) = LiquidLiveBadge(reactContext)
    
    @ReactProp(name = "isLive", defaultBoolean = true)
    fun setIsLive(view: LiquidLiveBadge, live: Boolean) { view.setIsLive(live) }
    
    @ReactProp(name = "viewerCount", defaultInt = 0)
    fun setViewerCount(view: LiquidLiveBadge, count: Int) { view.setViewerCount(count) }
    
    @ReactProp(name = "accentColor")
    fun setAccentColor(view: LiquidLiveBadge, color: Int?) { if (color != null) view.setAccentColor(color) }
}

// LiquidKeyboardKeyManager
class LiquidKeyboardKeyManager : SimpleViewManager<LiquidKeyboardKey>() {
    override fun getName() = "LiquidKeyboardKey"
    override fun createViewInstance(reactContext: ThemedReactContext) = LiquidKeyboardKey(reactContext)
    
    @ReactProp(name = "keyLabel", defaultString = "")
    fun setKeyLabel(view: LiquidKeyboardKey, label: String) { view.setKeyLabel(label) }
    
    @ReactProp(name = "keyValue", defaultString = "")
    fun setKeyValue(view: LiquidKeyboardKey, value: String) { view.setKeyValue(value) }
    
    @ReactProp(name = "accentColor")
    fun setAccentColor(view: LiquidKeyboardKey, color: Int?) { if (color != null) view.setAccentColor(color) }
    
    @ReactProp(name = "flex", defaultInt = 1)
    fun setFlex(view: LiquidKeyboardKey, flex: Int) { view.setFlex(flex) }
}

// LiquidProgressBarManager
class LiquidProgressBarManager : SimpleViewManager<LiquidProgressBar>() {
    override fun getName() = "LiquidProgressBar"
    override fun createViewInstance(reactContext: ThemedReactContext) = LiquidProgressBar(reactContext)
    
    @ReactProp(name = "progress", defaultFloat = 0f)
    fun setProgress(view: LiquidProgressBar, progress: Float) { view.setProgress(progress) }
    
    @ReactProp(name = "accentColor")
    fun setAccentColor(view: LiquidProgressBar, color: Int?) { if (color != null) view.setAccentColor(color) }
    
    @ReactProp(name = "trackColor")
    fun setTrackColor(view: LiquidProgressBar, color: Int?) { if (color != null) view.setTrackColor(color) }
    
    @ReactProp(name = "showGlow", defaultBoolean = true)
    fun setShowGlow(view: LiquidProgressBar, show: Boolean) { view.setShowGlow(show) }
    
    @ReactProp(name = "cornerRadius", defaultFloat = 4f)
    fun setCornerRadius(view: LiquidProgressBar, radius: Float) { view.setCornerRadius(radius) }
}
