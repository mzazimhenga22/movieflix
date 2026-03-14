package com.movieflix.app

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RadialGradient
import android.graphics.RectF
import android.graphics.Shader
import android.util.AttributeSet
import android.view.View
import android.view.animation.AccelerateDecelerateInterpolator
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.sin

class LiquidGlassView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null
) : View(context, attrs) {

    private var cornerRad = 28f
    private var tintOpacityValue = 0.16f
    private var borderOpacityValue = 0.22f
    private var tintColorValue = Color.parseColor("#10131A")
    private var borderColorValue = Color.WHITE
    private var glowColorValue = Color.parseColor("#E50914")
    private var glowIntensityValue = 0.22f
    private var borderWidthValue = 1.25f
    private var animated = false

    private var animPhase = 0f
    private var animator: ValueAnimator? = null

    private val density = resources.displayMetrics.density
    private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val borderPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
    private val rimPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
    private val glowPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val rect = RectF()
    private val path = Path()

    init {
        setLayerType(LAYER_TYPE_HARDWARE, null)
    }

    fun setCornerRadius(radius: Float) {
        cornerRad = radius
        invalidate()
    }

    fun setTintOpacity(opacity: Float) {
        tintOpacityValue = opacity.coerceIn(0f, 1f)
        invalidate()
    }

    fun setTintColor(color: Int) {
        tintColorValue = color
        invalidate()
    }

    fun setGlowColor(color: Int) {
        glowColorValue = color
        invalidate()
    }

    fun setGlowIntensity(intensity: Float) {
        glowIntensityValue = intensity.coerceIn(0f, 1f)
        invalidate()
    }

    fun setBorderWidth(width: Float) {
        borderWidthValue = width.coerceAtLeast(0f)
        invalidate()
    }

    fun setBorderOpacity(opacity: Float) {
        borderOpacityValue = opacity.coerceIn(0f, 1f)
        invalidate()
    }

    fun setBorderColor(color: Int) {
        borderColorValue = color
        invalidate()
    }

    fun setAnimated(enabled: Boolean) {
        if (animated == enabled) return
        animated = enabled
        if (enabled) {
            startAnimation()
        } else {
            animator?.cancel()
            animator = null
            animPhase = 0f
            invalidate()
        }
    }

    fun setBlurRadius(radius: Int) = Unit
    fun setChromaticAberration(enabled: Boolean) = Unit
    fun setBreathingEffect(enabled: Boolean) = setAnimated(enabled)
    fun setInteractiveMalleability(enabled: Boolean) = Unit

    private fun startAnimation() {
        animator?.cancel()
        animator = ValueAnimator.ofFloat(0f, 1f).apply {
            duration = 12000
            repeatCount = ValueAnimator.INFINITE
            repeatMode = ValueAnimator.REVERSE
            interpolator = AccelerateDecelerateInterpolator()
            addUpdateListener {
                animPhase = it.animatedValue as Float
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

        val cornerPx = cornerRad * density
        val inset = maxOf(borderWidthValue * density, 1f)
        rect.set(inset, inset, w - inset, h - inset)
        updateRoundedPath(rect, cornerPx)

        val shimmerOffset = if (animated) sin(animPhase * Math.PI).toFloat() else 0f
        val rimAlpha = (50 + (shimmerOffset * 24f)).toInt().coerceIn(22, 90)
        val accentAlpha = (glowIntensityValue * 110f + if (animated) cos(animPhase * Math.PI * 2).toFloat() * 12f else 0f)
            .toInt()
            .coerceIn(0, 130)

        fillPaint.shader = LinearGradient(
            0f,
            0f,
            w,
            h,
            intArrayOf(
                Color.argb((tintOpacityValue * 255).toInt().coerceIn(0, 255), Color.red(tintColorValue), Color.green(tintColorValue), Color.blue(tintColorValue)),
                Color.argb((tintOpacityValue * 235).toInt().coerceIn(0, 255), 6, 10, 18)
            ),
            floatArrayOf(0f, 1f),
            Shader.TileMode.CLAMP
        )
        canvas.drawPath(path, fillPaint)

        glowPaint.shader = RadialGradient(
            w * (0.28f + shimmerOffset * 0.04f),
            h * 0.2f,
            min(w, h) * 0.9f,
            intArrayOf(
                Color.argb(accentAlpha, Color.red(glowColorValue), Color.green(glowColorValue), Color.blue(glowColorValue)),
                Color.TRANSPARENT
            ),
            floatArrayOf(0f, 1f),
            Shader.TileMode.CLAMP
        )
        canvas.drawPath(path, glowPaint)

        rimPaint.strokeWidth = density
        rimPaint.shader = LinearGradient(
            0f,
            0f,
            w,
            h,
            intArrayOf(
                Color.argb(rimAlpha, 255, 255, 255),
                Color.argb((rimAlpha * 0.45f).toInt(), 255, 255, 255),
                Color.argb((rimAlpha * 0.35f).toInt(), 0, 0, 0)
            ),
            floatArrayOf(0f, 0.45f, 1f),
            Shader.TileMode.CLAMP
        )
        canvas.drawPath(path, rimPaint)

        if (borderOpacityValue > 0f && borderWidthValue > 0f) {
            borderPaint.strokeWidth = borderWidthValue * density
            borderPaint.color = Color.argb(
                (borderOpacityValue * 255).toInt().coerceIn(0, 255),
                Color.red(borderColorValue),
                Color.green(borderColorValue),
                Color.blue(borderColorValue)
            )
            borderPaint.shader = null
            canvas.drawRoundRect(rect, cornerPx, cornerPx, borderPaint)
        }
    }

    private fun updateRoundedPath(bounds: RectF, radius: Float) {
        path.reset()
        path.addRoundRect(bounds, radius, radius, Path.Direction.CW)
    }

    override fun onDetachedFromWindow() {
        animator?.cancel()
        animator = null
        super.onDetachedFromWindow()
    }
}
