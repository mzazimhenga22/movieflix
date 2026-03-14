package com.movieflix.app

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.*
import android.os.Build
import android.util.AttributeSet
import android.view.MotionEvent
import android.view.View
import android.view.animation.AccelerateDecelerateInterpolator
import android.view.animation.OvershootInterpolator
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.uimanager.events.RCTEventEmitter
import kotlin.math.*

/**
 * LiquidGlassSlider — Mind-Blowing Liquid Glass Slider
 * 
 * Features:
 * 1. Liquid thumb that morphs on drag
 * 2. Chromatic aberration on glass edges
 * 3. Glow trail following the thumb
 * 4. Ripple effect on value change
 * 5. Animated track with gradient fill
 * 6. Haptic-like press feedback via visual effects
 */
class LiquidGlassSlider @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null
) : View(context, attrs) {

    // Configuration
    private var accentColor = Color.parseColor("#e50914")
    private var trackColor = Color.parseColor("#1a1a2e")
    private var glowColor = Color.parseColor("#e50914")
    private var glowIntensity = 0.3f
    private var cornerRadius = 14f
    private var trackHeight = 6f
    private var thumbSize = 40f
    private var minValue = 0f
    private var maxValue = 1f
    private var value = 0.5f
    private var animated = true
    private var showValue = false
    
    // Animation state
    private var pressProgress = 0f
    private var dragProgress = 0f
    private var rippleProgress = 0f
    private var rippleX = 0f
    private var rippleY = 0f
    private var time = 0f
    private var isPressed = false
    private var isDragging = false
    
    private val density = resources.displayMetrics.density
    
    // Paints
    private val trackPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val trackFillPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val thumbPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val glowPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val ripplePaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        textAlign = Paint.Align.CENTER
        typeface = Typeface.DEFAULT_BOLD
        color = Color.WHITE
    }
    
    private val rectF = RectF()
    private val path = Path()
    
    private var pressAnimator: ValueAnimator? = null
    private var rippleAnimator: ValueAnimator? = null
    private var timeAnimator: ValueAnimator? = null

    init {
        setLayerType(LAYER_TYPE_HARDWARE, null)
        startTimeAnimation()
    }

    fun setAccentColor(color: Int) {
        accentColor = color
        invalidate()
    }

    fun setTrackColor(color: Int) {
        trackColor = color
        invalidate()
    }

    fun setGlowColor(color: Int) {
        glowColor = color
        invalidate()
    }

    fun setGlowIntensity(intensity: Float) {
        glowIntensity = intensity.coerceIn(0f, 1f)
        invalidate()
    }

    fun setTrackHeight(height: Float) {
        trackHeight = height
        invalidate()
    }

    fun setThumbSize(size: Float) {
        thumbSize = size
        invalidate()
    }

    fun setMinValue(min: Float) {
        minValue = min
        invalidate()
    }

    fun setMaxValue(max: Float) {
        maxValue = max
        invalidate()
    }

    fun setValue(newValue: Float) {
        value = newValue.coerceIn(minValue, maxValue)
        invalidate()
    }

    fun setAnimated(enabled: Boolean) {
        animated = enabled
        if (enabled) startTimeAnimation() else {
            timeAnimator?.cancel()
            timeAnimator = null
        }
    }

    fun setShowValue(show: Boolean) {
        showValue = show
        invalidate()
    }

    private fun startTimeAnimation() {
        timeAnimator?.cancel()
        timeAnimator = ValueAnimator.ofFloat(0f, 1f).apply {
            duration = 8000
            repeatCount = ValueAnimator.INFINITE
            repeatMode = ValueAnimator.REVERSE
            addUpdateListener {
                time = it.animatedValue as Float
                invalidate()
            }
            start()
        }
    }

    private fun animatePress(to: Float) {
        pressAnimator?.cancel()
        pressAnimator = ValueAnimator.ofFloat(pressProgress, to).apply {
            duration = if (to > 0.5f) 150 else 400
            interpolator = if (to > 0.5f) AccelerateDecelerateInterpolator() else OvershootInterpolator(1.5f)
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
            duration = 500
            interpolator = AccelerateDecelerateInterpolator()
            addUpdateListener {
                rippleProgress = it.animatedValue as Float
                invalidate()
            }
            start()
        }
    }

    private fun emitValueChange() {
        val reactContext = context as? ReactContext ?: return
        val event = Arguments.createMap().apply {
            putDouble("value", value.toDouble())
        }
        reactContext.getJSModule(RCTEventEmitter::class.java)
            .receiveEvent(id, "onValueChange", event)
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        
        val w = width.toFloat()
        val h = height.toFloat()
        if (w <= 0f || h <= 0f) return

        val cx = w / 2f
        val cy = h / 2f
        val trackH = trackHeight * density
        val thumbR = thumbSize * density / 2f * (1f + pressProgress * 0.25f)
        
        // Calculate thumb position
        val normalizedValue = (value - minValue) / (maxValue - minValue)
        val trackWidth = w - thumbSize * density - 20f * density
        val thumbX = thumbSize * density / 2f + 10f * density + trackWidth * normalizedValue
        
        // Draw track background (glass effect)
        trackPaint.shader = LinearGradient(
            0f, cy - trackH / 2f, 0f, cy + trackH / 2f,
            intArrayOf(
                Color.argb(120, Color.red(trackColor), Color.green(trackColor), Color.blue(trackColor)),
                Color.argb(80, Color.red(trackColor), Color.green(trackColor), Color.blue(trackColor)),
                Color.argb(120, Color.red(trackColor), Color.green(trackColor), Color.blue(trackColor))
            ),
            floatArrayOf(0f, 0.5f, 1f),
            Shader.TileMode.CLAMP
        )
        
        rectF.set(10f * density, cy - trackH / 2f, w - 10f * density, cy + trackH / 2f)
        canvas.drawRoundRect(rectF, trackH / 2f, trackH / 2f, trackPaint)
        
        // Draw filled portion
        trackFillPaint.shader = LinearGradient(
            10f * density, cy, thumbX, cy,
            intArrayOf(
                Color.argb(255, Color.red(accentColor), Color.green(accentColor), Color.blue(accentColor)),
                Color.argb(200, Color.red(accentColor), Color.green(accentColor), Color.blue(accentColor))
            ),
            floatArrayOf(0f, 1f),
            Shader.TileMode.CLAMP
        )
        rectF.set(10f * density, cy - trackH / 2f, thumbX, cy + trackH / 2f)
        canvas.drawRoundRect(rectF, trackH / 2f, trackH / 2f, trackFillPaint)
        
        // Draw glow trail behind thumb
        val glowRadius = thumbR * 1.5f
        glowPaint.shader = RadialGradient(
            thumbX, cy, glowRadius,
            intArrayOf(
                Color.argb((glowIntensity * 100).toInt(), Color.red(glowColor), Color.green(glowColor), Color.blue(glowColor)),
                Color.TRANSPARENT
            ),
            floatArrayOf(0f, 1f),
            Shader.TileMode.CLAMP
        )
        canvas.drawCircle(thumbX, cy, glowRadius, glowPaint)
        
        // Draw liquid thumb with morphing effect
        val morphFactor = pressProgress * 0.15f
        val aspectRatio = 1f + morphFactor
        
        // Glass thumb
        thumbPaint.shader = RadialGradient(
            thumbX, cy, thumbR,
            intArrayOf(
                Color.argb(200, 30, 35, 50),
                Color.argb(180, 15, 18, 28),
                Color.argb(160, 10, 12, 20)
            ),
            floatArrayOf(0f, 0.7f, 1f),
            Shader.TileMode.CLAMP
        )
        
        canvas.save()
        canvas.scale(1f, aspectRatio, thumbX, cy)
        canvas.drawCircle(thumbX, cy, thumbR, thumbPaint)
        
        // Inner glow
        thumbPaint.shader = RadialGradient(
            thumbX - thumbR * 0.2f, cy - thumbR * 0.2f, thumbR * 0.6f,
            intArrayOf(
                Color.argb(60, Color.red(glowColor), Color.green(glowColor), Color.blue(glowColor)),
                Color.TRANSPARENT
            ),
            floatArrayOf(0f, 1f),
            Shader.TileMode.CLAMP
        )
        canvas.drawCircle(thumbX, cy, thumbR, thumbPaint)
        
        // Specular highlight
        thumbPaint.shader = RadialGradient(
            thumbX - thumbR * 0.3f, cy - thumbR * 0.3f, thumbR * 0.4f,
            intArrayOf(
                Color.argb(80, 255, 255, 255),
                Color.TRANSPARENT
            ),
            floatArrayOf(0f, 1f),
            Shader.TileMode.CLAMP
        )
        canvas.drawCircle(thumbX, cy, thumbR, thumbPaint)
        
        // Animated shimmer
        val shimmerAngle = time * Math.PI * 2
        val shimmerX = thumbX + cos(shimmerAngle).toFloat() * thumbR * 0.3f
        val shimmerY = cy + sin(shimmerAngle).toFloat() * thumbR * 0.3f
        thumbPaint.shader = RadialGradient(
            shimmerX, shimmerY, thumbR * 0.25f,
            intArrayOf(
                Color.argb(40, 255, 255, 255),
                Color.TRANSPARENT
            ),
            floatArrayOf(0f, 1f),
            Shader.TileMode.CLAMP
        )
        canvas.drawCircle(thumbX, cy, thumbR, thumbPaint)
        
        canvas.restore()
        
        // Draw thumb border with chromatic aberration
        val borderPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeWidth = 1.5f * density
            shader = LinearGradient(
                thumbX - thumbR, cy - thumbR,
                thumbX + thumbR, cy + thumbR,
                intArrayOf(
                    Color.argb(150, 255, 255, 255),
                    Color.argb(100, Color.red(glowColor), Color.green(glowColor), Color.blue(glowColor)),
                    Color.argb(180, 255, 255, 255)
                ),
                floatArrayOf(0f, 0.5f, 1f),
                Shader.TileMode.CLAMP
            )
        }
        canvas.save()
        canvas.scale(1f, aspectRatio, thumbX, cy)
        canvas.drawCircle(thumbX, cy, thumbR - borderPaint.strokeWidth / 2f, borderPaint)
        canvas.restore()
        
        // Draw ripple if active
        if (rippleProgress > 0 && rippleProgress < 1) {
            val rippleR = thumbR * 2f * rippleProgress
            ripplePaint.shader = RadialGradient(
                rippleX, rippleY, rippleR,
                intArrayOf(
                    Color.argb((80 * (1 - rippleProgress)).toInt(), 255, 255, 255),
                    Color.TRANSPARENT
                ),
                floatArrayOf(0f, 1f),
                Shader.TileMode.CLAMP
            )
            canvas.drawCircle(rippleX, rippleY, rippleR, ripplePaint)
        }
        
        // Draw value label if enabled
        if (showValue) {
            textPaint.textSize = 14f * density
            val displayValue = ((value - minValue) / (maxValue - minValue) * 100).toInt()
            canvas.drawText("$displayValue%", thumbX, cy + thumbR + 24f * density, textPaint)
        }
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                isPressed = true
                isDragging = true
                animatePress(1f)
                startRipple(event.x, event.y)
                updateValueFromTouch(event.x)
                invalidate()
                return true
            }
            MotionEvent.ACTION_MOVE -> {
                if (isDragging) {
                    updateValueFromTouch(event.x)
                    invalidate()
                }
                return true
            }
            MotionEvent.ACTION_UP -> {
                isPressed = false
                isDragging = false
                animatePress(0f)
                emitValueChange()
                invalidate()
                return true
            }
            MotionEvent.ACTION_CANCEL -> {
                isPressed = false
                isDragging = false
                animatePress(0f)
                invalidate()
                return true
            }
        }
        return super.onTouchEvent(event)
    }

    private fun updateValueFromTouch(x: Float) {
        val trackWidth = width - thumbSize * density - 20f * density
        val normalizedX = (x - thumbSize * density / 2f - 10f * density).coerceIn(0f, trackWidth) / trackWidth
        value = minValue + normalizedX * (maxValue - minValue)
    }

    override fun onDetachedFromWindow() {
        pressAnimator?.cancel()
        rippleAnimator?.cancel()
        timeAnimator?.cancel()
        super.onDetachedFromWindow()
    }
}
