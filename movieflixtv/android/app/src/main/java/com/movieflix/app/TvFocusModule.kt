package com.movieflix.app

import android.media.AudioManager
import android.media.ToneGenerator
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import kotlin.math.max

class TvFocusModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    private var focusView: TvFocusRingView? = null
    private var toneGenerator: ToneGenerator? = null

    override fun getName(): String {
        return "TvFocusModule"
    }

    private fun ensureFocusView(root: ViewGroup): TvFocusRingView {
        if (focusView == null) {
            focusView = TvFocusRingView(root.context)
            focusView?.visibility = View.GONE
            root.addView(
                focusView,
                FrameLayout.LayoutParams(1, 1)
            )
        }
        return focusView!!
    }

    private fun playFocusTone() {
        if (toneGenerator == null) {
            toneGenerator = ToneGenerator(AudioManager.STREAM_MUSIC, 50)
        }
        toneGenerator?.startTone(ToneGenerator.TONE_PROP_BEEP, 20)
    }

    @ReactMethod
    fun showFocusRect(x: Double, y: Double, width: Double, height: Double, color: String?) {
        val activity = reactApplicationContext.currentActivity ?: return
        activity.runOnUiThread {
            val root = activity.window?.decorView as? ViewGroup ?: return@runOnUiThread
            val focus = ensureFocusView(root)
            val density = root.resources.displayMetrics.density
            val pad = (6f * density)
            val left = (x - pad).toInt()
            val top = (y - pad).toInt()
            val w = max(1, (width + pad * 2).toInt())
            val h = max(1, (height + pad * 2).toInt())

            val params = focus.layoutParams as? FrameLayout.LayoutParams
                ?: FrameLayout.LayoutParams(w, h)
            params.width = w
            params.height = h
            params.leftMargin = left
            params.topMargin = top
            focus.layoutParams = params
            focus.setColor(android.graphics.Color.parseColor(color ?: "#FFFFFF"))
            focus.setCornerRadius(16f * density)
            focus.visibility = View.VISIBLE
            playFocusTone()
        }
    }

    @ReactMethod
    fun hideFocusRect() {
        val activity = reactApplicationContext.currentActivity ?: return
        activity.runOnUiThread {
            focusView?.visibility = View.GONE
        }
    }
}
