package com.movieflix.app

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.view.View
import android.view.animation.LinearInterpolator
import kotlin.math.max

class NativeWaveformView(context: Context) : View(context) {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private var accentColor = Color.parseColor("#e50914")
    private var isPlaying = false
    private var animator: ValueAnimator? = null
    private val bars = FloatArray(10) { 0.3f }

    init {
        paint.style = Paint.Style.FILL
        startAnimator()
    }

    private fun startAnimator() {
        animator?.cancel()
        animator = ValueAnimator.ofFloat(0f, 1f).apply {
            duration = 520
            repeatCount = ValueAnimator.INFINITE
            interpolator = LinearInterpolator()
            addUpdateListener {
                if (isPlaying) {
                    for (i in bars.indices) {
                        val base = 0.25f + (i % 5) * 0.05f
                        bars[i] = base + Math.random().toFloat() * 0.65f
                    }
                } else {
                    for (i in bars.indices) {
                        bars[i] = 0.25f
                    }
                }
                invalidate()
            }
            start()
        }
    }

    fun setAccentColor(color: Int) {
        accentColor = color
        invalidate()
    }

    fun setPlaying(playing: Boolean) {
        isPlaying = playing
        invalidate()
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        animator?.cancel()
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val w = width.toFloat()
        val h = height.toFloat()
        if (w <= 0 || h <= 0) return

        paint.color = accentColor
        val count = bars.size
        val gap = w * 0.02f
        val barWidth = max(6f, (w - gap * (count - 1)) / count)
        val centerY = h / 2f

        var x = 0f
        for (i in 0 until count) {
            val amp = bars[i]
            val barHeight = max(6f, h * 0.4f * amp)
            val top = centerY - barHeight / 2f
            val bottom = centerY + barHeight / 2f
            canvas.drawRoundRect(x, top, x + barWidth, bottom, barWidth / 2f, barWidth / 2f, paint)
            x += barWidth + gap
        }
    }
}
