package com.movieflix.app.app

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RadialGradient
import android.graphics.Shader
import android.view.View
import android.view.animation.PathInterpolator
import kotlin.math.sin

/**
 * TvGlowView — Cinematic ambient glow for movie app background
 *
 * Features:
 * - Multi-point radial gradients
 * - Animated breathing effect
 * - Poster color adaptation
 * - Smooth spring-like interpolation
 */
class TvGlowView(context: Context) : View(context) {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private var glowColor = Color.parseColor("#e50914")
    private var animValue = 0f
    private var breatheValue = 0f
    private var animator: ValueAnimator? = null
    private var secondaryAnimator: ValueAnimator? = null
    
    // Multiple glow points for cinematic depth
    private val glowPoints = listOf(
        Triple(0.1f, 0.2f, 0.8f),  // Top-left corner (primary)
        Triple(0.9f, 0.8f, 0.5f),  // Bottom-right (secondary)
        Triple(0.5f, 0.0f, 0.3f)   // Top center (tertiary)
    )

    init {
        startAnimation()
    }

    fun setColor(color: Int) {
        glowColor = color
        invalidate()
    }

    private fun startAnimation() {
        // Primary breathing animation
        animator = ValueAnimator.ofFloat(0f, 1f).apply {
            duration = 8000 // Slow cinematic breathing
            repeatCount = ValueAnimator.INFINITE
            repeatMode = ValueAnimator.REVERSE
            interpolator = PathInterpolator(0.45f, 0f, 0.55f, 1f) // Smooth sine-like
            
            addUpdateListener {
                animValue = it.animatedValue as Float
                // Breathing curve - slow rise, slow fall
                breatheValue = 0.6f + 0.4f * sin(animValue * Math.PI).toFloat()
                invalidate()
            }
            start()
        }
        
        // Secondary offset animation for organic feel
        secondaryAnimator = ValueAnimator.ofFloat(0f, 1f).apply {
            duration = 12000
            repeatCount = ValueAnimator.INFINITE
            repeatMode = ValueAnimator.RESTART
            
            addUpdateListener {
                invalidate()
            }
            start()
        }
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        animator?.cancel()
        secondaryAnimator?.cancel()
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val w = width.toFloat()
        val h = height.toFloat()
        if (w <= 0 || h <= 0) return

        val r = Color.red(glowColor)
        val g = Color.green(glowColor)
        val b = Color.blue(glowColor)

        // Draw multiple cinematic glow spots
        glowPoints.forEachIndexed { index, (relX, relY, intensity) ->
            val cx = w * relX
            val cy = h * relY
            
            // Each point has slightly different timing for organic feel
            val pointPhase = (animValue + index * 0.33f) % 1f
            val pointBreathe = 0.7f + 0.3f * sin(pointPhase * Math.PI).toFloat()
            
            val radius = when (index) {
                0 -> w * 0.7f * breatheValue * pointBreathe // Primary large
                1 -> w * 0.5f * breatheValue * pointBreathe // Secondary medium
                else -> w * 0.4f * breatheValue // Tertiary small
            }
            
            val alpha = when (index) {
                0 -> (45 * intensity * breatheValue).toInt()
                1 -> (25 * intensity * breatheValue).toInt()
                else -> (15 * intensity).toInt()
            }.coerceIn(0, 80)

            paint.shader = RadialGradient(
                cx, cy, radius,
                intArrayOf(
                    Color.argb(alpha, r, g, b),
                    Color.argb((alpha * 0.4f).toInt(), r, g, b),
                    Color.TRANSPARENT
                ),
                floatArrayOf(0f, 0.5f, 1f),
                Shader.TileMode.CLAMP
            )
            
            canvas.drawRect(0f, 0f, w, h, paint)
        }
        
        // Subtle vignette overlay for cinematic depth
        val vignettePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            shader = RadialGradient(
                w * 0.5f, h * 0.5f, w * 0.8f,
                intArrayOf(Color.TRANSPARENT, Color.argb(40, 0, 0, 0)),
                floatArrayOf(0.6f, 1f),
                Shader.TileMode.CLAMP
            )
        }
        canvas.drawRect(0f, 0f, w, h, vignettePaint)
    }
}
