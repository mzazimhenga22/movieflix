package com.movieflix.app

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.view.View
import android.view.animation.LinearInterpolator
import java.net.URL
import kotlin.concurrent.thread

class NativeVinylView(context: Context) : View(context) {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val ringPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val clipPath = Path()
    private var accentColor = Color.parseColor("#e50914")
    private var rotationDeg = 0f
    private var animator: ValueAnimator? = null
    private var isPlaying = false
    private var imageUrl: String? = null
    private var centerBitmap: Bitmap? = null

    init {
        paint.style = Paint.Style.FILL
        ringPaint.style = Paint.Style.STROKE
        ringPaint.color = Color.parseColor("#2b2b2b")
        ringPaint.strokeWidth = 2f * context.resources.displayMetrics.density
        startAnimator()
    }

    private fun startAnimator() {
        animator?.cancel()
        animator = ValueAnimator.ofFloat(0f, 360f).apply {
            duration = 3200
            repeatCount = ValueAnimator.INFINITE
            interpolator = LinearInterpolator()
            addUpdateListener {
                rotationDeg = it.animatedValue as Float
                if (isPlaying) invalidate()
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

    fun setImageUrl(url: String?) {
        if (url == imageUrl) return
        imageUrl = url
        centerBitmap = null
        if (url.isNullOrBlank()) {
            invalidate()
            return
        }
        thread {
            try {
                val stream = URL(url).openStream()
                val bmp = BitmapFactory.decodeStream(stream)
                stream.close()
                centerBitmap = bmp
                postInvalidate()
            } catch (_: Throwable) {
                // ignore
            }
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

        val size = minOf(w, h)
        val cx = w / 2f
        val cy = h / 2f
        val radius = size * 0.48f

        canvas.save()
        canvas.rotate(rotationDeg, cx, cy)

        // Base disc
        paint.color = Color.parseColor("#0a0a0a")
        canvas.drawCircle(cx, cy, radius, paint)

        // Accent ring
        ringPaint.color = accentColor
        ringPaint.alpha = 40
        ringPaint.strokeWidth = size * 0.03f
        canvas.drawCircle(cx, cy, radius * 0.88f, ringPaint)

        // Inner ring
        ringPaint.color = Color.parseColor("#1a1a1a")
        ringPaint.alpha = 255
        ringPaint.strokeWidth = size * 0.015f
        canvas.drawCircle(cx, cy, radius * 0.65f, ringPaint)

        canvas.restore()

        // Center image
        centerBitmap?.let { bmp ->
            val centerRadius = radius * 0.28f
            clipPath.reset()
            clipPath.addCircle(cx, cy, centerRadius, Path.Direction.CW)
            canvas.save()
            canvas.clipPath(clipPath)
            val dest = RectF(cx - centerRadius, cy - centerRadius, cx + centerRadius, cy + centerRadius)
            canvas.drawBitmap(bmp, null, dest, null)
            canvas.restore()
        }
    }
}
