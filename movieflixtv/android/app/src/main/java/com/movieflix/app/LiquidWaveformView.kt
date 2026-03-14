package com.movieflix.app

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.*
import android.util.AttributeSet
import android.view.View
import android.view.animation.AccelerateDecelerateInterpolator
import kotlin.math.*
import kotlin.random.Random

/**
 * LiquidWaveformView - Real-time Audio Waveform Visualization
 * 
 * Features:
 * 1. Multi-layer liquid bars with glow
 * 2. Smooth interpolation between states
 * 3. Chromatic aberration edges
 * 4. Reactive to audio amplitude
 * 5. Idle breathing animation
 */
class LiquidWaveformView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null
) : View(context, attrs) {

    private var barColor = Color.parseColor("#ff2d55")
    private var secondaryColor = Color.parseColor("#22d3ee")
    private var barCount = 48
    private var barWidth = 3f
    private var barGap = 4f
    private var cornerRadius = 6f
    private var animated = true
    private var isPlaying = false
    
    // Amplitude data (normalized 0-1)
    private var amplitudes = FloatArray(barCount) { 0.2f }
    private var targetAmplitudes = FloatArray(barCount) { 0.2f }
    
    // Animation state
    private var phase = 0f
    private var breathePhase = 0f
    
    private val density = resources.displayMetrics.density
    private val barPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val glowPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val rectF = RectF()
    
    private var animator: ValueAnimator? = null
    private var breatheAnimator: ValueAnimator? = null
    private var interpolateRunnable: Runnable? = null

    init {
        setLayerType(LAYER_TYPE_HARDWARE, null)
        initAmplitudes()
        if (animated) startAnimation()
    }

    private fun initAmplitudes() {
        // Initialize with random low values for idle state
        for (i in 0 until barCount) {
            amplitudes[i] = 0.15f + Random.nextFloat() * 0.1f
            targetAmplitudes[i] = amplitudes[i]
        }
    }

    fun setBarColor(color: Int) {
        barColor = color
        invalidate()
    }

    fun setSecondaryColor(color: Int) {
        secondaryColor = color
        invalidate()
    }

    fun setBarCount(count: Int) {
        barCount = count.coerceIn(8, 128)
        amplitudes = FloatArray(barCount) { 0.2f }
        targetAmplitudes = FloatArray(barCount) { 0.2f }
        requestLayout()
        invalidate()
    }

    fun setAmplitudes(newAmplitudes: FloatArray) {
        for (i in 0 until min(barCount, newAmplitudes.size)) {
            targetAmplitudes[i] = newAmplitudes[i].coerceIn(0.05f, 1f)
        }
        isPlaying = true
    }

    fun setPlaying(playing: Boolean) {
        isPlaying = playing
        if (!playing) {
            // Smoothly transition to idle state
            for (i in 0 until barCount) {
                targetAmplitudes[i] = 0.15f + Random.nextFloat() * 0.1f
            }
        }
    }

    private fun startAnimation() {
        // Phase animation for glow movement
        animator?.cancel()
        animator = ValueAnimator.ofFloat(0f, 1f).apply {
            duration = 2000
            repeatCount = ValueAnimator.INFINITE
            repeatMode = ValueAnimator.RESTART
            addUpdateListener {
                phase = it.animatedValue as Float
                invalidate()
            }
            start()
        }
        
        // Breathing animation for idle state
        breatheAnimator?.cancel()
        breatheAnimator = ValueAnimator.ofFloat(0f, 1f).apply {
            duration = 3000
            repeatCount = ValueAnimator.INFINITE
            repeatMode = ValueAnimator.REVERSE
            interpolator = AccelerateDecelerateInterpolator()
            addUpdateListener {
                breathePhase = it.animatedValue as Float
                if (!isPlaying) {
                    updateIdleAmplitudes()
                }
                interpolateAmplitudes()
                invalidate()
            }
            start()
        }
    }

    private fun updateIdleAmplitudes() {
        val breathe = sin(breathePhase * Math.PI).toFloat()
        for (i in 0 until barCount) {
            // Create gentle wave pattern
            val wave = sin(phase * Math.PI * 2 + i * 0.15).toFloat()
            targetAmplitudes[i] = 0.15f + wave * 0.08f + breathe * 0.05f
        }
    }

    private fun interpolateAmplitudes() {
        for (i in 0 until barCount) {
            amplitudes[i] += (targetAmplitudes[i] - amplitudes[i]) * 0.15f
        }
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        
        val w = width.toFloat()
        val h = height.toFloat()
        if (w <= 0f || h <= 0f) return

        val totalBarSpace = barWidth * density + barGap * density
        val totalWidth = barCount * totalBarSpace - barGap * density
        val startX = (w - totalWidth) / 2f
        
        val maxBarHeight = h * 0.85f
        val minBarHeight = h * 0.08f
        val centerY = h / 2f
        
        for (i in 0 until barCount) {
            val x = startX + i * totalBarSpace
            val barHeight = minBarHeight + amplitudes[i] * (maxBarHeight - minBarHeight)
            val barHalfHeight = barHeight / 2f
            
            // Calculate color interpolation
            val colorPhase = (phase + i.toFloat() / barCount) % 1f
            val interpolatedColor = lerpColor(barColor, secondaryColor, colorPhase)
            
            // Draw glow
            val glowAlpha = (amplitudes[i] * 60).toInt().coerceIn(10, 80)
            glowPaint.shader = RadialGradient(
                x + barWidth * density / 2f, centerY, barHeight * 0.6f,
                intArrayOf(
                    Color.argb(glowAlpha, Color.red(interpolatedColor), Color.green(interpolatedColor), Color.blue(interpolatedColor)),
                    Color.TRANSPARENT
                ),
                floatArrayOf(0.3f, 1f),
                Shader.TileMode.CLAMP
            )
            rectF.set(
                x - barWidth * density,
                centerY - barHalfHeight - 4f * density,
                x + barWidth * density * 2,
                centerY + barHalfHeight + 4f * density
            )
            canvas.drawRoundRect(rectF, cornerRadius * density, cornerRadius * density, glowPaint)
            
            // Draw bar with gradient
            barPaint.shader = LinearGradient(
                x, centerY - barHalfHeight,
                x, centerY + barHalfHeight,
                intArrayOf(
                    Color.argb(255, Color.red(interpolatedColor), Color.green(interpolatedColor), Color.blue(interpolatedColor)),
                    Color.argb(200, Color.red(interpolatedColor) / 2, Color.green(interpolatedColor) / 2, Color.blue(interpolatedColor) / 2)
                ),
                floatArrayOf(0f, 1f),
                Shader.TileMode.CLAMP
            )
            
            rectF.set(
                x, centerY - barHalfHeight,
                x + barWidth * density, centerY + barHalfHeight
            )
            canvas.drawRoundRect(rectF, cornerRadius * density, cornerRadius * density, barPaint)
            
            // Add highlight on top
            barPaint.shader = LinearGradient(
                x, centerY - barHalfHeight,
                x, centerY - barHalfHeight + barHeight * 0.15f,
                intArrayOf(
                    Color.argb(80, 255, 255, 255),
                    Color.TRANSPARENT
                ),
                floatArrayOf(0f, 1f),
                Shader.TileMode.CLAMP
            )
            rectF.set(
                x, centerY - barHalfHeight,
                x + barWidth * density, centerY - barHalfHeight + barHeight * 0.15f
            )
            canvas.drawRoundRect(rectF, cornerRadius * density, cornerRadius * density, barPaint)
        }
    }

    private fun lerpColor(color1: Int, color2: Int, fraction: Float): Int {
        val r = (Color.red(color1) + (Color.red(color2) - Color.red(color1)) * fraction).toInt()
        val g = (Color.green(color1) + (Color.green(color2) - Color.green(color1)) * fraction).toInt()
        val b = (Color.blue(color1) + (Color.blue(color2) - Color.blue(color1)) * fraction).toInt()
        return Color.rgb(r, g, b)
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val desiredWidth = (barCount * (barWidth + barGap) * density).toInt()
        val w = resolveSize(desiredWidth, widthMeasureSpec)
        val h = resolveSize(120, heightMeasureSpec)
        setMeasuredDimension(w, h)
    }

    override fun onDetachedFromWindow() {
        animator?.cancel()
        breatheAnimator?.cancel()
        super.onDetachedFromWindow()
    }
}
