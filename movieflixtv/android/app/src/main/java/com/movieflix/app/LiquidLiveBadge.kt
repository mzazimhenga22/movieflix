package com.movieflix.app

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.*
import android.util.AttributeSet
import android.view.View
import android.view.animation.AccelerateDecelerateInterpolator
import kotlin.math.*

/**
 * LiquidLiveBadge - Premium "LIVE" Indicator for Streams
 * 
 * Features:
 * 1. Animated pulsing red dot
 * 2. Glowing "LIVE" text
 * 3. Viewer count with animated digits
 * 4. Heartbeat pulse ring
 */
class LiquidLiveBadge @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null
) : View(context, attrs) {

    private var isLive = true
    private var viewerCount = 0
    private var displayCount = 0
    private var accentColor = Color.parseColor("#ff4b4b")
    
    private var pulsePhase = 0f
    private var heartPhase = 0f
    private var glowPhase = 0f
    
    private val density = resources.displayMetrics.density
    private val bgPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val dotPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val ringPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val glowPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        textAlign = Paint.Align.CENTER
        typeface = Typeface.DEFAULT_BOLD
        isAllCaps = true
    }
    private val countPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        textAlign = Paint.Align.CENTER
        typeface = Typeface.DEFAULT_BOLD
    }
    
    private var pulseAnimator: ValueAnimator? = null
    private var heartAnimator: ValueAnimator? = null
    private var glowAnimator: ValueAnimator? = null
    private var countAnimator: ValueAnimator? = null

    init {
        setLayerType(LAYER_TYPE_HARDWARE, null)
        startAnimations()
    }

    fun setIsLive(live: Boolean) {
        isLive = live
        invalidate()
    }

    fun setViewerCount(count: Int) {
        if (viewerCount == count) return
        val oldCount = viewerCount
        viewerCount = count
        
        countAnimator?.cancel()
        countAnimator = ValueAnimator.ofInt(displayCount, count).apply {
            duration = 800
            interpolator = AccelerateDecelerateInterpolator()
            addUpdateListener {
                displayCount = it.animatedValue as Int
                invalidate()
            }
            start()
        }
    }

    fun setAccentColor(color: Int) {
        accentColor = color
        invalidate()
    }

    private fun startAnimations() {
        // Dot pulse
        pulseAnimator = ValueAnimator.ofFloat(0f, 1f).apply {
            duration = 1000
            repeatCount = ValueAnimator.INFINITE
            repeatMode = ValueAnimator.REVERSE
            addUpdateListener {
                pulsePhase = it.animatedValue as Float
                invalidate()
            }
            start()
        }
        
        // Heartbeat ring
        heartAnimator = ValueAnimator.ofFloat(0f, 1f).apply {
            duration = 1500
            repeatCount = ValueAnimator.INFINITE
            repeatMode = ValueAnimator.RESTART
            addUpdateListener {
                heartPhase = it.animatedValue as Float
                invalidate()
            }
            start()
        }
        
        // Glow shimmer
        glowAnimator = ValueAnimator.ofFloat(0f, 1f).apply {
            duration = 3000
            repeatCount = ValueAnimator.INFINITE
            repeatMode = ValueAnimator.REVERSE
            interpolator = AccelerateDecelerateInterpolator()
            addUpdateListener {
                glowPhase = it.animatedValue as Float
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

        val cornerRadius = h * 0.4f
        
        // Background glass
        bgPaint.shader = LinearGradient(
            0f, 0f, 0f, h,
            intArrayOf(
                Color.argb(180, 30, 10, 10),
                Color.argb(140, 20, 5, 5)
            ),
            floatArrayOf(0f, 1f),
            Shader.TileMode.CLAMP
        )
        val rect = RectF(1f * density, 1f * density, w - 1f * density, h - 1f * density)
        canvas.drawRoundRect(rect, cornerRadius, cornerRadius, bgPaint)
        
        // Glow pulse
        val glowAlpha = (40 + glowPhase * 30).toInt()
        glowPaint.shader = RadialGradient(
            w * 0.3f, h * 0.5f, w * 0.5f,
            intArrayOf(
                Color.argb(glowAlpha, Color.red(accentColor), Color.green(accentColor), Color.blue(accentColor)),
                Color.TRANSPARENT
            ),
            floatArrayOf(0f, 1f),
            Shader.TileMode.CLAMP
        )
        canvas.drawRoundRect(rect, cornerRadius, cornerRadius, glowPaint)
        
        // Border with accent
        val borderPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeWidth = 1.5f * density
            color = Color.argb(180, Color.red(accentColor), Color.green(accentColor), Color.blue(accentColor))
        }
        canvas.drawRoundRect(rect, cornerRadius, cornerRadius, borderPaint)
        
        // Heartbeat ring (expands from dot)
        if (isLive) {
            val dotX = h * 0.2f
            val dotY = h * 0.5f
            val heartRadius = h * 0.4f * heartPhase
            val heartAlpha = (80 * (1 - heartPhase)).toInt()
            
            ringPaint.style = Paint.Style.STROKE
            ringPaint.strokeWidth = 2f * density
            ringPaint.color = Color.argb(heartAlpha, Color.red(accentColor), Color.green(accentColor), Color.blue(accentColor))
            canvas.drawCircle(dotX, dotY, heartRadius, ringPaint)
        }
        
        // Pulsing dot
        val dotX = h * 0.2f
        val dotY = h * 0.5f
        val dotRadius = (h * 0.12f) * (1 + pulsePhase * 0.2f)
        val dotAlpha = (200 + pulsePhase * 55).toInt().coerceAtMost(255)
        
        // Dot glow
        glowPaint.shader = RadialGradient(
            dotX, dotY, dotRadius * 2,
            intArrayOf(
                Color.argb(dotAlpha, Color.red(accentColor), Color.green(accentColor), Color.blue(accentColor)),
                Color.TRANSPARENT
            ),
            floatArrayOf(0f, 1f),
            Shader.TileMode.CLAMP
        )
        canvas.drawCircle(dotX, dotY, dotRadius * 2, glowPaint)
        
        // Solid dot
        dotPaint.color = Color.argb(dotAlpha, Color.red(accentColor), Color.green(accentColor), Color.blue(accentColor))
        canvas.drawCircle(dotX, dotY, dotRadius, dotPaint)
        
        // "LIVE" text
        val textSize = h * 0.32f
        textPaint.textSize = textSize
        textPaint.color = Color.WHITE
        textPaint.letterSpacing = 0.15f
        val liveX = dotX + h * 0.18f
        val liveY = h * 0.5f - (textPaint.descent() + textPaint.ascent()) / 2
        canvas.drawText(if (isLive) "LIVE" else "OFFLINE", liveX, liveY, textPaint)
        
        // Viewer count
        if (viewerCount > 0) {
            val countText = formatCount(displayCount)
            val countSize = h * 0.28f
            countPaint.textSize = countSize
            countPaint.color = Color.argb(200, 255, 255, 255)
            
            // Count background
            val countWidth = countPaint.measureText(countText) + 16 * density
            val countX = w - countWidth - 10 * density
            val countRect = RectF(countX, 4 * density, countX + countWidth, h - 4 * density)
            
            bgPaint.shader = RadialGradient(
                countRect.centerX(), countRect.centerY(), countWidth / 2,
                intArrayOf(
                    Color.argb(60, 255, 255, 255),
                    Color.TRANSPARENT
                ),
                floatArrayOf(0f, 1f),
                Shader.TileMode.CLAMP
            )
            canvas.drawRoundRect(countRect, cornerRadius, cornerRadius, bgPaint)
            
            val countTextY = h * 0.5f - (countPaint.descent() + countPaint.ascent()) / 2
            canvas.drawText(countText, countRect.centerX(), countTextY, countPaint)
        }
    }
    
    private fun formatCount(count: Int): String {
        return when {
            count >= 1_000_000 -> "${(count / 1_000_000f).let { if (it < 10) "%.1fM".format(it) else "${it.toInt()}M" }}"
            count >= 10_000 -> "${count / 1_000}K"
            count >= 1_000 -> "${(count / 1_000f).let { "%.1fK".format(it) }}"
            else -> count.toString()
        }
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val desiredHeight = (36 * density).toInt()
        val desiredWidth = (120 * density + (if (viewerCount > 0) 60 * density else 0f)).toInt()
        
        val w = resolveSize(desiredWidth, widthMeasureSpec)
        val h = resolveSize(desiredHeight, heightMeasureSpec)
        setMeasuredDimension(w, h)
    }

    override fun onDetachedFromWindow() {
        pulseAnimator?.cancel()
        heartAnimator?.cancel()
        glowAnimator?.cancel()
        countAnimator?.cancel()
        super.onDetachedFromWindow()
    }
}
