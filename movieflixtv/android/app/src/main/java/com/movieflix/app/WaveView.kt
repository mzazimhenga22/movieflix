package com.movieflix.app

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Shader
import android.view.View
import android.view.animation.LinearInterpolator

class WaveView(context: Context) : View(context) {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val path = Path()
    private var waveOffset = 0f
    private var waveColor = Color.parseColor("#e50914") // Default
    private var animator: ValueAnimator? = null

    init {
        paint.style = Paint.Style.FILL
        startAnimation()
    }

    fun setColor(color: Int) {
        waveColor = color
        invalidate()
    }

    private fun startAnimation() {
        animator = ValueAnimator.ofFloat(0f, 1f).apply {
            duration = 5000
            repeatCount = ValueAnimator.INFINITE
            interpolator = LinearInterpolator()
            addUpdateListener {
                waveOffset = it.animatedValue as Float
                invalidate()
            }
            start()
        }
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

        // Wave 1
        drawWave(canvas, w, h, 1.0f, 0.15f, 60, 10)
        // Wave 2 (offset)
        drawWave(canvas, w, h, 1.5f, 0.12f, 40, 5)
    }

    private fun drawWave(canvas: Canvas, w: Float, h: Float, frequencyMult: Float, amplitudeScale: Float, alphaTop: Int, alphaBottom: Int) {
        path.reset()
        val amplitude = h * amplitudeScale
        val angularFrequency = (2 * Math.PI / w).toFloat() * frequencyMult
        val phase = waveOffset * 2 * Math.PI

        path.moveTo(0f, h)
        // Start at mid-height roughly
        val baseHeight = h * 0.4f
        path.lineTo(0f, baseHeight)

        // Draw sine
        val step = 20
        for (x in 0..w.toInt() step step) {
            val y = baseHeight + amplitude * Math.sin(angularFrequency * x + phase).toFloat()
            path.lineTo(x.toFloat(), y)
        }
        path.lineTo(w, baseHeight + amplitude * Math.sin(angularFrequency * w + phase).toFloat())
        
        path.lineTo(w, h)
        path.lineTo(0f, h)
        path.close()

        val r = Color.red(waveColor)
        val g = Color.green(waveColor)
        val b = Color.blue(waveColor)

        paint.shader = LinearGradient(0f, 0f, 0f, h, 
            Color.argb(alphaTop, r, g, b),
            Color.argb(alphaBottom, r, g, b),
            Shader.TileMode.CLAMP)
        
        canvas.drawPath(path, paint)
    }
}
