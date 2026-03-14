package com.movieflix.app

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.*
import android.util.AttributeSet
import android.view.View
import android.view.animation.AccelerateDecelerateInterpolator
import kotlin.math.*

/**
 * LiquidRatingBadge - Premium Rating Badge with Animated Glow
 * 
 * Features:
 * 1. Morphing glass container
 * 2. Animated star glow pulse
 * 3. Chromatic edge highlights
 * 4. Score-based color adaptation
 */
class LiquidRatingBadge @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null
) : View(context, attrs) {

    private var rating = 0f
    private var accentColor = Color.parseColor("#e50914")
    private var showStar = true
    private var animated = true
    
    private var phase = 0f
    private var displayRating = 0f
    
    private val density = resources.displayMetrics.density
    private val bgPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val borderPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
    private val glowPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val starPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        textAlign = Paint.Align.CENTER
        typeface = Typeface.DEFAULT_BOLD
    }
    private val path = Path()
    
    private var animator: ValueAnimator? = null
    private var ratingAnimator: ValueAnimator? = null

    init {
        setLayerType(LAYER_TYPE_HARDWARE, null)
        if (animated) startAnimation()
    }

    fun setRating(rating: Float) {
        val newRating = rating.coerceIn(0f, 10f)
        if (this.rating == newRating) return
        
        val oldRating = this.rating
        this.rating = newRating
        
        // Animate rating change
        ratingAnimator?.cancel()
        ratingAnimator = ValueAnimator.ofFloat(displayRating, newRating).apply {
            duration = 600
            interpolator = AccelerateDecelerateInterpolator()
            addUpdateListener {
                displayRating = it.animatedValue as Float
                invalidate()
            }
            start()
        }
    }

    fun setAccentColor(color: Int) {
        accentColor = color
        invalidate()
    }

    fun setShowStar(show: Boolean) {
        showStar = show
        invalidate()
    }

    private fun startAnimation() {
        animator?.cancel()
        animator = ValueAnimator.ofFloat(0f, 1f).apply {
            duration = 3000
            repeatCount = ValueAnimator.INFINITE
            repeatMode = ValueAnimator.REVERSE
            addUpdateListener {
                phase = it.animatedValue as Float
                invalidate()
            }
            start()
        }
    }

    private fun isHighRated(): Boolean = rating >= 7.5f

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        
        val w = width.toFloat()
        val h = height.toFloat()
        if (w <= 0f || h <= 0f) return

        val cornerRadius = h * 0.4f
        val shimmer = sin(phase * Math.PI).toFloat()
        
        // Determine colors based on rating
        val starColor = if (isHighRated()) Color.parseColor("#ffd700") else Color.WHITE
        val glowColor = if (isHighRated()) Color.parseColor("#ffd700") else accentColor
        val borderColor = if (isHighRated()) Color.parseColor("#ffd700") else Color.WHITE
        
        // Background glass
        bgPaint.shader = LinearGradient(
            0f, 0f, 0f, h,
            intArrayOf(
                Color.argb(160, 0, 0, 0),
                Color.argb(120, 20, 20, 30)
            ),
            floatArrayOf(0f, 1f),
            Shader.TileMode.CLAMP
        )
        val rect = RectF(1f * density, 1f * density, w - 1f * density, h - 1f * density)
        canvas.drawRoundRect(rect, cornerRadius, cornerRadius, bgPaint)
        
        // Glow pulse
        val glowAlpha = ((glowIntensity(rating) * 40 + shimmer * 15)).toInt().coerceIn(0, 80)
        glowPaint.shader = RadialGradient(
            w * 0.3f, h * 0.5f, w * 0.8f,
            intArrayOf(
                Color.argb(glowAlpha, Color.red(glowColor), Color.green(glowColor), Color.blue(glowColor)),
                Color.TRANSPARENT
            ),
            floatArrayOf(0f, 1f),
            Shader.TileMode.CLAMP
        )
        canvas.drawRoundRect(rect, cornerRadius, cornerRadius, glowPaint)
        
        // Border with shimmer
        borderPaint.strokeWidth = 1.5f * density
        borderPaint.color = Color.argb(
            ((60 + shimmer * 30) * borderOpacity(rating)).toInt().coerceIn(0, 255),
            Color.red(borderColor),
            Color.green(borderColor),
            Color.blue(borderColor)
        )
        canvas.drawRoundRect(rect, cornerRadius, cornerRadius, borderPaint)
        
        // Draw star if enabled
        val textStartX = if (showStar) {
            drawStar(canvas, w, h, starColor, shimmer)
            h * 0.35f
        } else {
            h * 0.15f
        }
        
        // Draw rating text
        val textSize = h * 0.45f
        textPaint.textSize = textSize
        textPaint.color = Color.WHITE
        val textX = textStartX + (if (showStar) h * 0.25f else 0f)
        val textY = h * 0.5f - (textPaint.descent() + textPaint.ascent()) / 2
        canvas.drawText(String.format("%.1f", displayRating), textX, textY, textPaint)
    }

    private fun drawStar(canvas: Canvas, w: Float, h: Float, color: Int, shimmer: Float) {
        val cx = h * 0.22f
        val cy = h * 0.5f
        val size = h * 0.25f
        
        starPaint.color = color
        
        // Animated pulse
        val pulse = 1f + shimmer * 0.08f
        canvas.save()
        canvas.scale(pulse, pulse, cx, cy)
        
        // Draw 5-point star
        path.reset()
        for (i in 0 until 5) {
            val angle = Math.toRadians(-90.0 + i * 72.0)
            val outerX = cx + cos(angle).toFloat() * size
            val outerY = cy + sin(angle).toFloat() * size
            
            val innerAngle = Math.toRadians(-90.0 + i * 72.0 + 36.0)
            val innerX = cx + cos(innerAngle).toFloat() * (size * 0.4f)
            val innerY = cy + sin(innerAngle).toFloat() * (size * 0.4f)
            
            if (i == 0) {
                path.moveTo(outerX, outerY)
            } else {
                path.lineTo(outerX, outerY)
            }
            path.lineTo(innerX, innerY)
        }
        path.close()
        canvas.drawPath(path, starPaint)
        
        // Glow
        glowPaint.shader = RadialGradient(
            cx, cy, size * 1.5f,
            intArrayOf(
                Color.argb((40 + shimmer * 30).toInt(), Color.red(color), Color.green(color), Color.blue(color)),
                Color.TRANSPARENT
            ),
            floatArrayOf(0f, 1f),
            Shader.TileMode.CLAMP
        )
        canvas.drawPath(path, glowPaint)
        
        canvas.restore()
    }

    private fun glowIntensity(rating: Float): Float {
        return when {
            rating >= 8f -> 0.6f
            rating >= 7f -> 0.4f
            rating >= 6f -> 0.3f
            else -> 0.2f
        }
    }

    private fun borderOpacity(rating: Float): Float {
        return when {
            rating >= 8f -> 1f
            rating >= 7f -> 0.8f
            rating >= 6f -> 0.6f
            else -> 0.5f
        }
    }

    override fun onDetachedFromWindow() {
        animator?.cancel()
        ratingAnimator?.cancel()
        super.onDetachedFromWindow()
    }
}
