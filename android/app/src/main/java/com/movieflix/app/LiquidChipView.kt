package com.movieflix.app

import android.animation.AnimatorSet
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
 * LiquidChipView - Premium Category/Genre Chip with Liquid Glass
 * 
 * Features:
 * 1. Morphing glass container
 * 2. Animated selection glow
 * 3. Press ripple effect
 * 4. Focus ring for TV navigation
 */
class LiquidChipView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null
) : View(context, attrs) {

    private var text = ""
    private var accentColor = Color.parseColor("#e50914")
    private var isSelected = false
    private var isFocused = false
    
    private var selectionProgress = 0f
    private var focusProgress = 0f
    private var pressProgress = 0f
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
    
    private var selectionAnimator: ValueAnimator? = null
    private var focusAnimator: ValueAnimator? = null
    private var pressAnimator: ValueAnimator? = null
    private var rippleAnimator: ValueAnimator? = null
    private var shimmerAnimator: ValueAnimator? = null

    init {
        isClickable = true
        isFocusable = true
        startShimmerAnimation()
    }

    fun setText(text: String) {
        this.text = text
        invalidate()
    }

    fun setAccentColor(color: Int) {
        accentColor = color
        invalidate()
    }

    fun setSelected(selected: Boolean) {
        if (isSelected == selected) return
        isSelected = selected
        animateSelection(if (selected) 1f else 0f)
    }

    override fun onFocusChanged(gainFocus: Boolean, direction: Int, previouslyFocusedRect: Rect?) {
        super.onFocusChanged(gainFocus, direction, previouslyFocusedRect)
        isFocused = gainFocus
        animateFocus(if (gainFocus) 1f else 0f)
    }

    private fun animateSelection(to: Float) {
        selectionAnimator?.cancel()
        selectionAnimator = ValueAnimator.ofFloat(selectionProgress, to).apply {
            duration = 250
            interpolator = OvershootInterpolator(1.2f)
            addUpdateListener {
                selectionProgress = it.animatedValue as Float
                invalidate()
            }
            start()
        }
    }

    private fun animateFocus(to: Float) {
        focusAnimator?.cancel()
        focusAnimator = ValueAnimator.ofFloat(focusProgress, to).apply {
            duration = 180
            addUpdateListener {
                focusProgress = it.animatedValue as Float
                invalidate()
            }
            start()
        }
    }

    private fun animatePress(to: Float) {
        pressAnimator?.cancel()
        pressAnimator = ValueAnimator.ofFloat(pressProgress, to).apply {
            duration = if (to > 0.5f) 80 else 200
            addUpdateListener {
                pressProgress = it.animatedValue as Float
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
            duration = 400
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
            duration = 4000
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
                performHapticFeedback(HapticFeedbackConstants.CONTEXT_CLICK)
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

        val cornerRadius = h * 0.5f // Pill shape
        val shimmer = sin(shimmerPhase * Math.PI * 2).toFloat()
        
        // Scale on press
        val scale = 1f - pressProgress * 0.03f
        canvas.save()
        canvas.scale(scale, scale, w / 2f, h / 2f)
        
        // Background glass
        val bgAlpha = (if (isSelected) 140 + selectionProgress * 50 else 80 + focusProgress * 40).toInt()
        val baseBgColor = if (isSelected) {
            Color.argb(bgAlpha, Color.red(accentColor), Color.green(accentColor), Color.blue(accentColor))
        } else {
            Color.argb(bgAlpha, 15, 18, 30)
        }
        
        bgPaint.shader = LinearGradient(
            0f, 0f, 0f, h,
            intArrayOf(baseBgColor, Color.argb((bgAlpha * 0.7f).toInt(), 10, 12, 20)),
            floatArrayOf(0f, 1f),
            Shader.TileMode.CLAMP
        )
        val rect = RectF(1f * density, 1f * density, w - 1f * density, h - 1f * density)
        canvas.drawRoundRect(rect, cornerRadius, cornerRadius, bgPaint)
        
        // Selection glow
        if (selectionProgress > 0) {
            glowPaint.shader = RadialGradient(
                w * (0.3f + shimmer * 0.1f), h * 0.5f, w * 0.6f,
                intArrayOf(
                    Color.argb((selectionProgress * 80).toInt(), Color.red(accentColor), Color.green(accentColor), Color.blue(accentColor)),
                    Color.TRANSPARENT
                ),
                floatArrayOf(0f, 1f),
                Shader.TileMode.CLAMP
            )
            canvas.drawRoundRect(rect, cornerRadius, cornerRadius, glowPaint)
        }
        
        // Focus ring
        if (focusProgress > 0) {
            val focusRingPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                style = Paint.Style.STROKE
                strokeWidth = 2.5f * density * focusProgress
                color = Color.WHITE
            }
            canvas.drawRoundRect(
                RectF(2f * density, 2f * density, w - 2f * density, h - 2f * density),
                cornerRadius, cornerRadius, focusRingPaint
            )
        }
        
        // Border
        val borderAlpha = ((if (isSelected) 200 + shimmer * 50 else 50) * (1 + focusProgress * 0.5f)).toInt()
        val borderColor = if (isSelected) {
            Color.argb((borderAlpha * selectionProgress).toInt(), Color.red(accentColor), Color.green(accentColor), Color.blue(accentColor))
        } else {
            Color.argb(borderAlpha, 255, 255, 255)
        }
        borderPaint.strokeWidth = 1.5f * density
        borderPaint.color = borderColor
        canvas.drawRoundRect(rect, cornerRadius, cornerRadius, borderPaint)
        
        // Ripple effect
        if (rippleProgress > 0 && rippleProgress < 1) {
            val rippleRadius = max(w, h) * rippleProgress * 1.2f
            ripplePaint.shader = RadialGradient(
                rippleX, rippleY, rippleRadius,
                intArrayOf(
                    Color.argb((60 * (1 - rippleProgress)).toInt(), 255, 255, 255),
                    Color.TRANSPARENT
                ),
                floatArrayOf(0f, 1f),
                Shader.TileMode.CLAMP
            )
            canvas.drawRoundRect(rect, cornerRadius, cornerRadius, ripplePaint)
        }
        
        // Draw text
        val textSize = h * 0.38f
        textPaint.textSize = textSize
        textPaint.color = if (isSelected) Color.WHITE else Color.argb(220, 255, 255, 255)
        val textY = h / 2f - (textPaint.descent() + textPaint.ascent()) / 2
        canvas.drawText(text, w / 2f, textY, textPaint)
        
        canvas.restore()
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val textWidth = textPaint.measureText(text)
        val desiredWidth = (textWidth + 40 * density).toInt()
        val desiredHeight = (36 * density).toInt()
        
        val w = resolveSize(desiredWidth, widthMeasureSpec)
        val h = resolveSize(desiredHeight, heightMeasureSpec)
        setMeasuredDimension(w, h)
    }

    override fun onDetachedFromWindow() {
        selectionAnimator?.cancel()
        focusAnimator?.cancel()
        pressAnimator?.cancel()
        rippleAnimator?.cancel()
        shimmerAnimator?.cancel()
        super.onDetachedFromWindow()
    }
}
