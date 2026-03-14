package com.movieflix.app

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.*
import android.util.AttributeSet
import android.view.View
import android.view.animation.AccelerateDecelerateInterpolator
import kotlin.math.*

/**
 * LiquidProgressBar - Premium Progress Bar with Glass Effect
 * 
 * Features:
 * 1. Glass container with glow
 * 2. Animated fill with shimmer
 * 3. Edge chromatic aberration
 * 4. Smooth progress interpolation
 * 5. Pulse on complete
 */
class LiquidProgressBar @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null
) : View(context, attrs) {

    private var progress = 0f
    private var displayProgress = 0f
    private var accentColor = Color.parseColor("#e50914")
    private var trackColor = Color.parseColor("#1a1a2e")
    private var animated = true
    private var showGlow = true
    private var cornerRadius = 4f
    
    private var shimmerPhase = 0f
    private var pulsePhase = 0f
    private var isComplete = false
    
    private val density = resources.displayMetrics.density
    private val trackPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val glowPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val shimmerPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    
    private var progressAnimator: ValueAnimator? = null
    private var shimmerAnimator: ValueAnimator? = null
    private var pulseAnimator: ValueAnimator? = null

    init {
        setLayerType(LAYER_TYPE_HARDWARE, null)
        if (animated) startAnimations()
    }

    fun setProgress(newProgress: Float) {
        val clamped = newProgress.coerceIn(0f, 1f)
        if (progress == clamped) return
        
        progress = clamped
        isComplete = progress >= 0.99f
        
        if (isComplete) {
            startPulseAnimation()
        }
        
        // Smooth interpolation
        progressAnimator?.cancel()
        progressAnimator = ValueAnimator.ofFloat(displayProgress, clamped).apply {
            duration = 400
            interpolator = AccelerateDecelerateInterpolator()
            addUpdateListener {
                displayProgress = it.animatedValue as Float
                invalidate()
            }
            start()
        }
    }

    fun setAccentColor(color: Int) {
        accentColor = color
        invalidate()
    }

    fun setTrackColor(color: Int) {
        trackColor = color
        invalidate()
    }

    fun setShowGlow(show: Boolean) {
        showGlow = show
        invalidate()
    }

    fun setCornerRadius(radius: Float) {
        cornerRadius = radius
        invalidate()
    }

    private fun startAnimations() {
        // Shimmer sweep
        shimmerAnimator = ValueAnimator.ofFloat(0f, 1f).apply {
            duration = 2000
            repeatCount = ValueAnimator.INFINITE
            repeatMode = ValueAnimator.RESTART
            addUpdateListener {
                shimmerPhase = it.animatedValue as Float
                invalidate()
            }
            start()
        }
    }

    private fun startPulseAnimation() {
        pulseAnimator?.cancel()
        pulseAnimator = ValueAnimator.ofFloat(0f, 1f).apply {
            duration = 500
            repeatCount = 2
            repeatMode = ValueAnimator.REVERSE
            addUpdateListener {
                pulsePhase = it.animatedValue as Float
                invalidate()
            }
            start()
        }
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        
        val w = width.toFloat()
        val h = height.toFloat()
        if (w <= 0f || h <= 0f) return

        val cornerPx = cornerRadius * density
        val fillWidth = w * displayProgress
        
        // Track background
        trackPaint.shader = LinearGradient(
            0f, 0f, 0f, h,
            intArrayOf(
                Color.argb(180, Color.red(trackColor), Color.green(trackColor), Color.blue(trackColor)),
                Color.argb(120, Color.red(trackColor) / 2, Color.green(trackColor) / 2, Color.blue(trackColor) / 2)
            ),
            floatArrayOf(0f, 1f),
            Shader.TileMode.CLAMP
        )
        val trackRect = RectF(0f, 0f, w, h)
        canvas.drawRoundRect(trackRect, cornerPx, cornerPx, trackPaint)
        
        // Fill with gradient
        if (fillWidth > 0) {
            fillPaint.shader = LinearGradient(
                0f, 0f, fillWidth, 0f,
                intArrayOf(
                    Color.argb(255, Color.red(accentColor) / 2, Color.green(accentColor) / 2, Color.blue(accentColor) / 2),
                    Color.argb(255, Color.red(accentColor), Color.green(accentColor), Color.blue(accentColor)),
                    Color.argb(200, Color.red(accentColor), Color.green(accentColor), Color.blue(accentColor))
                ),
                floatArrayOf(0f, 0.7f, 1f),
                Shader.TileMode.CLAMP
            )
            val fillRect = RectF(0f, 0f, fillWidth, h)
            canvas.drawRoundRect(fillRect, cornerPx, cornerPx, fillPaint)
            
            // Shimmer sweep over fill
            if (animated && displayProgress < 1f) {
                val shimmerX = fillWidth * shimmerPhase
                shimmerPaint.shader = LinearGradient(
                    shimmerX - 40 * density, 0f, shimmerX + 40 * density, 0f,
                    intArrayOf(
                        Color.TRANSPARENT,
                        Color.argb(80, 255, 255, 255),
                        Color.TRANSPARENT
                    ),
                    floatArrayOf(0f, 0.5f, 1f),
                    Shader.TileMode.CLAMP
                )
                canvas.save()
                canvas.clipRect(0f, 0f, fillWidth, h)
                canvas.drawRect(0f, 0f, fillWidth, h, shimmerPaint)
                canvas.restore()
            }
            
            // Edge glow
            if (showGlow && displayProgress > 0.05f) {
                glowPaint.shader = RadialGradient(
                    fillWidth, h / 2f, h * 2f,
                    intArrayOf(
                        Color.argb(60, Color.red(accentColor), Color.green(accentColor), Color.blue(accentColor)),
                        Color.TRANSPARENT
                    ),
                    floatArrayOf(0f, 1f),
                    Shader.TileMode.CLAMP
                )
                canvas.drawCircle(fillWidth, h / 2f, h * 2f, glowPaint)
            }
        }
        
        // Complete pulse
        if (isComplete && pulsePhase > 0) {
            val pulseAlpha = (40 * pulsePhase).toInt()
            glowPaint.shader = RadialGradient(
                w / 2f, h / 2f, w * pulsePhase,
                intArrayOf(
                    Color.argb(pulseAlpha, Color.red(accentColor), Color.green(accentColor), Color.blue(accentColor)),
                    Color.TRANSPARENT
                ),
                floatArrayOf(0f, 1f),
                Shader.TileMode.CLAMP
            )
            canvas.drawRect(0f, 0f, w, h, glowPaint)
        }
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val desiredHeight = (6 * density).toInt()
        val h = resolveSize(desiredHeight, heightMeasureSpec)
        val w = resolveSize(200, widthMeasureSpec)
        setMeasuredDimension(w, h)
    }

    override fun onDetachedFromWindow() {
        progressAnimator?.cancel()
        shimmerAnimator?.cancel()
        pulseAnimator?.cancel()
        super.onDetachedFromWindow()
    }
}
