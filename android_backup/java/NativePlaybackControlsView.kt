package com.movieflix.app

import android.content.Context
import android.graphics.Color
import android.os.Build
import android.view.Gravity
import android.widget.LinearLayout
import android.widget.SeekBar
import android.widget.TextView
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.uimanager.events.RCTEventEmitter
import kotlin.math.max

class NativePlaybackControlsView(context: Context) : LinearLayout(context) {
    private val seekBar = SeekBar(context)
    private val timeRow = LinearLayout(context)
    private val currentTime = TextView(context)
    private val totalTime = TextView(context)

    private var durationMs: Long = 0
    private var positionMs: Long = 0
    private var accentColor: Int = Color.parseColor("#e50914")
    private var isTracking = false

    init {
        orientation = VERTICAL
        gravity = Gravity.CENTER_VERTICAL

        seekBar.max = 1
        seekBar.setPadding(0, 0, 0, 0)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            seekBar.progressTintList = android.content.res.ColorStateList.valueOf(accentColor)
            seekBar.thumbTintList = android.content.res.ColorStateList.valueOf(accentColor)
        }

        timeRow.orientation = HORIZONTAL
        timeRow.gravity = Gravity.CENTER_VERTICAL
        timeRow.layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT)

        currentTime.setTextColor(Color.parseColor("#bfbfbf"))
        totalTime.setTextColor(Color.parseColor("#bfbfbf"))
        currentTime.textSize = 12f
        totalTime.textSize = 12f

        val spacer = TextView(context)
        spacer.layoutParams = LayoutParams(0, LayoutParams.WRAP_CONTENT, 1f)

        timeRow.addView(currentTime)
        timeRow.addView(spacer)
        timeRow.addView(totalTime)

        addView(seekBar, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT))
        val timeParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT)
        timeParams.topMargin = (6 * resources.displayMetrics.density).toInt()
        addView(timeRow, timeParams)

        seekBar.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onStartTrackingTouch(bar: SeekBar) {
                isTracking = true
                emitEvent("onSeekStart", bar.progress.toDouble())
            }

            override fun onProgressChanged(bar: SeekBar, progress: Int, fromUser: Boolean) {
                if (fromUser) {
                    positionMs = progress.toLong()
                    updateTimeLabels()
                    emitEvent("onSeek", progress.toDouble())
                }
            }

            override fun onStopTrackingTouch(bar: SeekBar) {
                isTracking = false
                emitEvent("onSeekComplete", bar.progress.toDouble())
            }
        })
    }

    fun setDurationMs(value: Double) {
        durationMs = max(0, value.toLong())
        seekBar.max = max(1, durationMs.toInt())
        updateTimeLabels()
    }

    fun setPositionMs(value: Double) {
        positionMs = max(0, value.toLong())
        if (!isTracking) {
            seekBar.progress = positionMs.toInt().coerceAtMost(seekBar.max)
        }
        updateTimeLabels()
    }

    fun setAccentColorHex(color: String?) {
        accentColor = try {
            Color.parseColor(color ?: "#e50914")
        } catch (_: Throwable) {
            Color.parseColor("#e50914")
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            seekBar.progressTintList = android.content.res.ColorStateList.valueOf(accentColor)
            seekBar.thumbTintList = android.content.res.ColorStateList.valueOf(accentColor)
        }
    }

    private fun updateTimeLabels() {
        currentTime.text = formatTime(positionMs)
        totalTime.text = formatTime(durationMs)
    }

    private fun formatTime(ms: Long): String {
        val totalSeconds = ms / 1000
        val minutes = totalSeconds / 60
        val seconds = totalSeconds % 60
        return String.format("%d:%02d", minutes, seconds)
    }

    private fun emitEvent(name: String, value: Double) {
        val reactContext = context as? ReactContext ?: return
        val payload = Arguments.createMap()
        payload.putDouble("positionMs", value)
        reactContext.getJSModule(RCTEventEmitter::class.java).receiveEvent(id, name, payload)
    }
}
