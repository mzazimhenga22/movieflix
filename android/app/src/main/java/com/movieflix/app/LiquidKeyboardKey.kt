package com.movieflix.app

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.*
import android.util.AttributeSet
import android.view.HapticFeedbackConstants
import android.view.MotionEvent
import android.view.View
import android.view.animation.OvershootInterpolator
import kotlin.math.*

/**
 * LiquidKeyboardKey - Single Glass Keyboard Key
 * 
 * Features:
 * 1. Glass morphism background
 * 2. Press ripple effect
 * 3. Haptic feedback
 * 4. Focus glow for TV
 * 5. Gradient text
 */
class LiquidKeyboardKey @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null
) : View(context, attrs) {

    private var keyLabel = ""
    private var keyValue = ""
    private var accentColor = Color.parseColor("#e50914")
    private var isFocused = false
    private var flex = 1
    
    private var pressProgress = 0f
    private var focusProgress = 0f
    private var rippleProgress = 0f
    private var rippleX = 0f
    private var rippleY = 0f
    private var shimmerPhase = 0f
    
    private val density = resources.displayMetrics.density
    private val bgPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val borderPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
    private val glowPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val ripplePaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        textAlign = Paint.Align.CENTER
        typeface = Typeface.DEFAULT_BOLD
    }
    
    private var pressAnimator: ValueAnimator? = null
    private var focusAnimator: ValueAnimator? = null
    private var rippleAnimator: ValueAnimator? = null
    private var shimmerAnimator: ValueAnimator? = null

    init {
        isClickable = true
        isFocusable = true
        startShimmerAnimation()
    }

    fun setKeyLabel(label: String) {
        keyLabel = label
        invalidate()
    }

    fun setKeyValue(value: String) {
        keyValue = value
    }

    fun setAccentColor(color: Int) {
        accentColor = color
        invalidate()
    }

    fun setFlex(flexValue: Int) {
        flex = flexValue.coerceAtLeast(1)
        requestLayout()
    }

    override fun onFocusChanged(gainFocus: Boolean, direction: Int, previouslyFocusedRect: Rect?) {
        super.onFocusChanged(gainFocus, direction, previouslyFocusedRect)
        isFocused = gainFocus
        animateFocus(if (gainFocus) 1f else 0f)
    }

    private fun animatePress(to: Float) {
        pressAnimator?.cancel()
        pressAnimator = ValueAnimator.ofFloat(pressProgress, to).apply {
            duration = if (to > 0.5f) 80 else 200
            interpolator = if (to > 0.5f) null else OvershootInterpolator(1.5f)
            addUpdateListener {
                pressProgress = it.animatedValue as Float
                invalidate()
            }
            start()
        }
    }

    private fun animateFocus(to: Float) {
        focusAnimator?.cancel()
        focusAnimator = ValueAnimator.ofFloat(focusProgress, to).apply {
            duration = 150
            addUpdateListener {
                focusProgress = it.animatedValue as Float
                invalidate()
            }
            start()
        }
    }

    private fun startRipple(x: Float, y: Float) {
        rippleX = x
        rippleY = y
        rippleProgress = 0f
        rippleAnimator?.cancel()
        rippleAnimator = ValueAnimator.ofFloat(0f, 1f).apply {
            duration = 350
            addUpdateListener {
                rippleProgress = it.animatedValue as Float
                invalidate()
            }
            start()
        }
    }

    private fun startShimmerAnimation() {
        shimmerAnimator?.cancel()
        shimmerAnimator = ValueAnimator.ofFloat(0f, 1f).apply {
            duration = 3000
            repeatCount = ValueAnimator.INFINITE
            repeatMode = ValueAnimator.RESTART
            addUpdateListener {
                shimmerPhase = it.animatedValue as Float
                invalidate()
            }
            start()
        }
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                animatePress(1f)
                startRipple(event.x, event.y)
                performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)
            }
            MotionEvent.ACTION_UP -> {
                animatePress(0f)
                performClick()
            }
            MotionEvent.ACTION_CANCEL -> {
                animatePress(0f)
            }
        }
        return true
    }

    override fun performClick(): Boolean {
        super.performClick()
        return true
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        
        val w = width.toFloat()
        val h = height.toFloat()
        if (w <= 0f || h <= 0f) return

        val cornerRadius = h * 0.3f
        val shimmer = sin(shimmerPhase * Math.PI * 2).toFloat()
        
        // Scale on press
        val scale = 1f - pressProgress * 0.04f
        canvas.save()
        canvas.scale(scale, scale, w / 2f, h / 2f)
        
        // Background glass
        val bgAlpha = (if (isFocused) 100 + focusProgress * 80 else 20 + shimmer * 10).toInt()
        val bgColor = if (isFocused) {
            Color.argb(bgAlpha, Color.red(accentColor), Color.green(accentColor), Color.blue(accentColor))
        } else {
            Color.argb(bgAlpha, 255, 255, 255)
        }
        
        bgPaint.shader = LinearGradient(
            0f, 0f, 0f, h,
            intArrayOf(
                Color.argb((Color.alpha(bgColor) * 0.8f).toInt(), Color.red(bgColor), Color.green(bgColor), Color.blue(bgColor)),
                Color.argb((Color.alpha(bgColor) * 0.5f).toInt(), Color.red(bgColor), Color.green(bgColor), Color.blue(bgColor))
            ),
            floatArrayOf(0f, 1f),
            Shader.TileMode.CLAMP
        )
        val rect = RectF(1f * density, 1f * density, w - 1f * density, h - 1f * density)
        canvas.drawRoundRect(rect, cornerRadius, cornerRadius, bgPaint)
        
        // Focus glow
        if (focusProgress > 0) {
            glowPaint.shader = RadialGradient(
                w / 2f, h / 2f, max(w, h) * 0.7f,
                intArrayOf(
                    Color.argb((focusProgress * 60).toInt(), Color.red(accentColor), Color.green(accentColor), Color.blue(accentColor)),
                    Color.TRANSPARENT
                ),
                floatArrayOf(0f, 1f),
                Shader.TileMode.CLAMP
            )
            canvas.drawRoundRect(rect, cornerRadius, cornerRadius, glowPaint)
        }
        
        // Border
        val borderAlpha = (if (isFocused) 200 + focusProgress * 55 else 36 + shimmer * 15).toInt()
        borderPaint.strokeWidth = 1.5f * density
        borderPaint.color = if (isFocused) {
            Color.WHITE
        } else {
            Color.argb(borderAlpha, 255, 255, 255)
        }
        canvas.drawRoundRect(rect, cornerRadius, cornerRadius, borderPaint)
        
        // Ripple
        if (rippleProgress > 0 && rippleProgress < 1) {
            val rippleRadius = max(w, h) * rippleProgress * 0.8f
            ripplePaint.shader = RadialGradient(
                rippleX, rippleY, rippleRadius,
                intArrayOf(
                    Color.argb((50 * (1 - rippleProgress)).toInt(), 255, 255, 255),
                    Color.TRANSPARENT
                ),
                floatArrayOf(0f, 1f),
                Shader.TileMode.CLAMP
            )
            canvas.drawRoundRect(rect, cornerRadius, cornerRadius, ripplePaint)
        }
        
        // Text with gradient
        val textSize = h * 0.38f
        textPaint.textSize = textSize
        textPaint.letterSpacing = 0.05f
        
        // Text color based on focus
        if (isFocused) {
            textPaint.color = Color.WHITE
        } else {
            // Gradient text effect
            textPaint.shader = LinearGradient(
                0f, 0f, w, h,
                intArrayOf(
                    Color.argb(240, 255, 255, 255),
                    Color.argb(180, 255, 255, 255)
                ),
                floatArrayOf(0f, 1f),
                Shader.TileMode.CLAMP
            )
        }
        
        val textY = h / 2f - (textPaint.descent() + textPaint.ascent()) / 2
        canvas.drawText(keyLabel, w / 2f, textY, textPaint)
        
        canvas.restore()
    }

    override fun onDetachedFromWindow() {
        pressAnimator?.cancel()
        focusAnimator?.cancel()
        rippleAnimator?.cancel()
        shimmerAnimator?.cancel()
        super.onDetachedFromWindow()
    }
}
