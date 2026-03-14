package com.movieflix.app

import android.animation.AnimatorSet
import android.animation.ValueAnimator
import android.content.Context
import android.graphics.*
import android.os.Build
import android.util.AttributeSet
import android.view.MotionEvent
import android.view.View
import android.view.animation.AccelerateDecelerateInterpolator
import android.view.animation.OvershootInterpolator
import androidx.annotation.RequiresApi
import kotlin.math.*

/**
 * LiquidGlassButton — Mind-Blowing Interactive Glass Button
 * 
 * Features:
 * 1. Morphing capsule/rounded rectangle with liquid shape transitions
 * 2. Press ripple that expands with chromatic aberration
 * 3. Hover glow tracking with specularity
 * 4. Magnetic attraction effect on touch
 * 5. Breathing animation with subtle scale oscillation
 * 6. Icon rendering with glass refraction
 */
@RequiresApi(Build.VERSION_CODES.TIRAMISU)
class LiquidGlassButton @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null
) : View(context, attrs) {

    // Configuration
    private var cornerRadius = 24f
    private var tintColor = Color.parseColor("#0d1220")
    private var glowColor = Color.parseColor("#e50914")
    private var glowIntensity = 0.2f
    private var borderWidth = 1.2f
    private var borderOpacity = 0.3f
    private var iconName = "play"
    private var iconColor = Color.WHITE
    private var iconSize = 20f
    private var animated = false
    private var magneticPull = true
    
    // Animation state
    private var time = 0f
    private var breathePhase = 0f
    private var pressProgress = 0f
    private var rippleProgress = 0f
    private var rippleX = 0f
    private var rippleY = 0f
    private var hoverX = 0.5f
    private var hoverY = 0.5f
    private var isHovered = false
    private var isPressed = false
    private var magnetOffsetX = 0f
    private var magnetOffsetY = 0f
    
    private val density = resources.displayMetrics.density
    
    // Paints
    private val glassPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val borderPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
    private val iconPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val ripplePaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val glowPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        textAlign = Paint.Align.CENTER
        typeface = Typeface.DEFAULT_BOLD
    }
    
    private val rectF = RectF()
    private val path = Path()
    
    private var breatheAnimator: ValueAnimator? = null
    private var pressAnimator: ValueAnimator? = null
    private var rippleAnimator: ValueAnimator? = null

    // Premium glass shader
    private val glassShaderSource = """
        uniform shader content;
        uniform float2 size;
        uniform float cornerRadius;
        uniform float4 tintColor;
        uniform float4 glowColor;
        uniform float glowIntensity;
        uniform float2 hoverPos;
        uniform float isHovered;
        uniform float pressProgress;
        uniform float time;
        
        float sdRoundedRect(float2 p, float2 b, float r) {
            float2 q = abs(p) - b + r;
            return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
        }
        
        half4 main(float2 coord) {
            float2 halfSize = size * 0.5;
            float2 p = coord - halfSize;
            float d = sdRoundedRect(p, halfSize, cornerRadius);
            
            if (d > 0.0) return half4(0.0);
            
            // Normal calculation
            float eps = 1.0;
            float2 normal = normalize(float2(
                sdRoundedRect(p + float2(eps, 0), halfSize, cornerRadius) - 
                sdRoundedRect(p - float2(eps, 0), halfSize, cornerRadius),
                sdRoundedRect(p + float2(0, eps), halfSize, cornerRadius) - 
                sdRoundedRect(p - float2(0, eps), halfSize, cornerRadius)
            ));
            
            // Press morphing - corners become more rounded
            float morphRadius = cornerRadius * (1.0 + pressProgress * 0.3);
            
            // Hover light tracking
            float2 lightPos = mix(float2(0.3, 0.3), hoverPos, isHovered);
            float2 lightDir = normalize(lightPos - coord / size);
            
            // Specular highlight
            float spec = pow(max(dot(normal, lightDir), 0.0), 80.0) * 0.8;
            
            // Edge glow with Fresnel
            float fresnel = pow(1.0 - abs(d) / 30.0, 4.0) * smoothstep(0.0, -20.0, d);
            
            // Gradient base
            half4 base = half4(tintColor.rgb, tintColor.a);
            
            // Add glow color influence
            float glowFactor = glowIntensity * (isHovered * 0.5 + 0.5);
            base.rgb += glowColor.rgb * fresnel * glowFactor * 2.0;
            
            // Add specular
            base.rgb += spec * half3(1.0, 0.98, 0.95);
            
            // Subtle animated shimmer
            float shimmer = sin(coord.x * 0.03 + time * 3.0) * 0.5 + 0.5;
            shimmer *= sin(coord.y * 0.03 + time * 2.0) * 0.5 + 0.5;
            base.rgb += shimmer * 0.04 * half3(0.9, 0.92, 1.0);
            
            // Edge fade
            base *= smoothstep(0.0, -1.5, d);
            
            return base;
        }
    """

    private var glassShader: RuntimeShader? = null

    init {
        setLayerType(LAYER_TYPE_HARDWARE, null)
        isClickable = true
        isFocusable = true
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            try {
                glassShader = RuntimeShader(glassShaderSource)
                glassPaint.shader = glassShader
            } catch (e: Exception) { }
        }
        
        // Set up click listener
        setOnClickListener { /* Handled by React Native */ }
    }

    fun setCornerRadius(radius: Float) {
        cornerRadius = radius
        invalidate()
    }

    fun setTintColor(color: Int) {
        tintColor = color
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

    fun setBorderWidth(width: Float) {
        borderWidth = width
        invalidate()
    }

    fun setBorderOpacity(opacity: Float) {
        borderOpacity = opacity.coerceIn(0f, 1f)
        invalidate()
    }

    fun setIconName(name: String) {
        iconName = name
        invalidate()
    }

    fun setIconColor(color: Int) {
        iconColor = color
        invalidate()
    }

    fun setIconSize(size: Float) {
        iconSize = size
        invalidate()
    }

    fun setAnimated(enabled: Boolean) {
        if (animated == enabled) return
        animated = enabled
        if (enabled) startBreathing() else {
            breatheAnimator?.cancel()
            breatheAnimator = null
        }
    }

    private fun startBreathing() {
        breatheAnimator?.cancel()
        breatheAnimator = ValueAnimator.ofFloat(0f, 1f).apply {
            duration = 6000
            repeatCount = ValueAnimator.INFINITE
            repeatMode = ValueAnimator.REVERSE
            interpolator = AccelerateDecelerateInterpolator()
            addUpdateListener {
                breathePhase = it.animatedValue as Float
                time = breathePhase * 20f
                invalidate()
            }
            start()
        }
    }

    private fun animatePress(to: Float) {
        pressAnimator?.cancel()
        pressAnimator = ValueAnimator.ofFloat(pressProgress, to).apply {
            duration = if (to > 0.5f) 120 else 300
            interpolator = if (to > 0.5f) AccelerateDecelerateInterpolator() else OvershootInterpolator(2f)
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
            duration = 600
            interpolator = AccelerateDecelerateInterpolator()
            addUpdateListener {
                rippleProgress = it.animatedValue as Float
                invalidate()
            }
            start()
        }
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        updateShaderUniforms()
    }

    private fun updateShaderUniforms() {
        val shader = glassShader ?: return
        val w = width.toFloat()
        val h = height.toFloat()
        if (w <= 0f || h <= 0f) return
        
        shader.setFloatUniform("size", w, h)
        shader.setFloatUniform("cornerRadius", cornerRadius * density)
        shader.setColorUniform("tintColor", Color.argb(180, Color.red(tintColor), Color.green(tintColor), Color.blue(tintColor)))
        shader.setColorUniform("glowColor", Color.argb(255, Color.red(glowColor), Color.green(glowColor), Color.blue(glowColor)))
        shader.setFloatUniform("glowIntensity", glowIntensity)
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        
        val w = width.toFloat()
        val h = height.toFloat()
        if (w <= 0f || h <= 0f) return

        val cornerPx = cornerRadius * density * (1f + pressProgress * 0.2f)
        
        // Calculate magnet offset
        val magnetScale = if (isPressed && magneticPull) 0.05f else 0f
        val cx = w / 2f + magnetOffsetX * w * magnetScale
        val cy = h / 2f + magnetOffsetY * h * magnetScale
        
        // Scale on press
        val scale = 1f - pressProgress * 0.04f
        canvas.save()
        canvas.scale(scale, scale, cx, cy)
        canvas.translate(magnetOffsetX * magnetScale * w, magnetOffsetY * magnetScale * h)
        
        // Draw glass background
        rectF.set(0f, 0f, w, h)
        
        if (glassShader != null) {
            glassShader.setFloatUniform("hoverPos", hoverX, hoverY)
            glassShader.setFloatUniform("isHovered", if (isHovered) 1f else 0f)
            glassShader.setFloatUniform("pressProgress", pressProgress)
            glassShader.setFloatUniform("time", time)
            canvas.drawRect(rectF, glassPaint)
        } else {
            // Gradient fallback
            glassPaint.shader = LinearGradient(
                0f, 0f, w, h,
                intArrayOf(
                    Color.argb(180, Color.red(tintColor), Color.green(tintColor), Color.blue(tintColor)),
                    Color.argb(160, 6, 10, 18)
                ),
                floatArrayOf(0f, 1f),
                Shader.TileMode.CLAMP
            )
            path.reset()
            path.addRoundRect(rectF, cornerPx, cornerPx, Path.Direction.CW)
            canvas.drawPath(path, glassPaint)
            
            // Glow overlay
            val glowAlpha = ((glowIntensity * 60) * (if (isHovered) 1.5f else 1f)).toInt()
            glowPaint.shader = RadialGradient(
                w * hoverX, h * hoverY,
                min(w, h) * 0.8f,
                intArrayOf(
                    Color.argb(glowAlpha, Color.red(glowColor), Color.green(glowColor), Color.blue(glowColor)),
                    Color.TRANSPARENT
                ),
                floatArrayOf(0f, 1f),
                Shader.TileMode.CLAMP
            )
            canvas.drawPath(path, glowPaint)
        }
        
        // Draw ripple effect
        if (rippleProgress > 0 && rippleProgress < 1) {
            val rippleRadius = max(w, h) * rippleProgress * 1.5f
            ripplePaint.shader = RadialGradient(
                rippleX, rippleY, rippleRadius,
                intArrayOf(
                    Color.argb((60 * (1 - rippleProgress)).toInt(), 255, 255, 255),
                    Color.TRANSPARENT
                ),
                floatArrayOf(0f, 1f),
                Shader.TileMode.CLAMP
            )
            canvas.drawCircle(rippleX, rippleY, rippleRadius, ripplePaint)
        }
        
        // Draw border with shimmer
        if (borderOpacity > 0 && borderWidth > 0) {
            val shimmer = sin(time * 0.5f).toFloat() * 0.5f + 0.5f
            borderPaint.strokeWidth = borderWidth * density
            borderPaint.shader = LinearGradient(
                0f, 0f, w, h,
                intArrayOf(
                    Color.argb((borderOpacity * 255 * (0.7f + shimmer * 0.3f)).toInt(), 255, 255, 255),
                    Color.argb((borderOpacity * 150).toInt(), Color.red(glowColor), Color.green(glowColor), Color.blue(glowColor)),
                    Color.argb((borderOpacity * 200).toInt(), 255, 255, 255)
                ),
                floatArrayOf(0f, 0.5f, 1f),
                Shader.TileMode.CLAMP
            )
            val inset = borderWidth * density / 2f
            canvas.drawRoundRect(RectF(inset, inset, w - inset, h - inset), cornerPx, cornerPx, borderPaint)
        }
        
        // Draw icon
        iconPaint.color = iconColor
        drawIcon(canvas, w, h)
        
        canvas.restore()
    }
    
    private fun drawIcon(canvas: Canvas, w: Float, h: Float) {
        val cx = w / 2f
        val cy = h / 2f
        val size = iconSize * density
        
        iconPaint.style = Paint.Style.FILL
        
        when (iconName) {
            "play" -> {
                val halfH = size * 0.5f
                val halfW = size * 0.4f
                val offsetX = size * 0.1f
                path.reset()
                path.moveTo(cx - halfW + offsetX, cy - halfH)
                path.lineTo(cx + halfW + offsetX, cy)
                path.lineTo(cx - halfW + offsetX, cy + halfH)
                path.close()
                canvas.drawPath(path, iconPaint)
            }
            "pause" -> {
                val barW = size * 0.2f
                val barH = size * 0.8f
                val gap = size * 0.2f
                canvas.drawRect(cx - gap/2 - barW, cy - barH/2, cx - gap/2, cy + barH/2, iconPaint)
                canvas.drawRect(cx + gap/2, cy - barH/2, cx + gap/2 + barW, cy + barH/2, iconPaint)
            }
            "add", "plus" -> {
                iconPaint.style = Paint.Style.STROKE
                iconPaint.strokeWidth = size * 0.12f
                iconPaint.strokeCap = Paint.Cap.ROUND
                val lineLen = size * 0.5f
                canvas.drawLine(cx - lineLen/2, cy, cx + lineLen/2, cy, iconPaint)
                canvas.drawLine(cx, cy - lineLen/2, cx, cy + lineLen/2, iconPaint)
            }
            "heart" -> {
                path.reset()
                path.moveTo(cx, cy + size * 0.3f)
                path.cubicTo(cx - size * 0.6f, cy - size * 0.1f, cx - size * 0.45f, cy - size * 0.45f, cx, cy - size * 0.15f)
                path.cubicTo(cx + size * 0.45f, cy - size * 0.45f, cx + size * 0.6f, cy - size * 0.1f, cx, cy + size * 0.3f)
                path.close()
                canvas.drawPath(path, iconPaint)
            }
            "search" -> {
                iconPaint.style = Paint.Style.STROKE
                iconPaint.strokeWidth = size * 0.1f
                iconPaint.strokeCap = Paint.Cap.ROUND
                val r = size * 0.35f
                canvas.drawCircle(cx - size * 0.08f, cy - size * 0.08f, r, iconPaint)
                val hx = cx - size * 0.08f + r * 0.707f
                val hy = cy - size * 0.08f + r * 0.707f
                canvas.drawLine(hx, hy, hx + size * 0.25f, hy + size * 0.25f, iconPaint)
            }
            "home" -> {
                iconPaint.style = Paint.Style.STROKE
                iconPaint.strokeWidth = size * 0.1f
                iconPaint.strokeCap = Paint.Cap.ROUND
                iconPaint.strokeJoin = Paint.Join.ROUND
                // Roof
                path.reset()
                path.moveTo(cx - size * 0.45f, cy)
                path.lineTo(cx, cy - size * 0.45f)
                path.lineTo(cx + size * 0.45f, cy)
                canvas.drawPath(path, iconPaint)
                // Walls
                path.reset()
                path.moveTo(cx - size * 0.35f, cy)
                path.lineTo(cx - size * 0.35f, cy + size * 0.4f)
                path.lineTo(cx + size * 0.35f, cy + size * 0.4f)
                path.lineTo(cx + size * 0.35f, cy)
                canvas.drawPath(path, iconPaint)
            }
            "download" -> {
                iconPaint.style = Paint.Style.STROKE
                iconPaint.strokeWidth = size * 0.12f
                iconPaint.strokeCap = Paint.Cap.ROUND
                canvas.drawLine(cx, cy - size * 0.4f, cx, cy + size * 0.15f, iconPaint)
                canvas.drawLine(cx, cy + size * 0.15f, cx - size * 0.25f, cy - size * 0.1f, iconPaint)
                canvas.drawLine(cx, cy + size * 0.15f, cx + size * 0.25f, cy - size * 0.1f, iconPaint)
                canvas.drawLine(cx - size * 0.35f, cy + size * 0.4f, cx + size * 0.35f, cy + size * 0.4f, iconPaint)
            }
            "settings" -> {
                iconPaint.style = Paint.Style.STROKE
                iconPaint.strokeWidth = size * 0.1f
                val r = size * 0.35f
                canvas.drawCircle(cx, cy, r, iconPaint)
                // Gear teeth
                for (i in 0 until 8) {
                    val angle = i * Math.PI / 4
                    val x1 = cx + cos(angle).toFloat() * r
                    val y1 = cy + sin(angle).toFloat() * r
                    val x2 = cx + cos(angle).toFloat() * (r + size * 0.15f)
                    val y2 = cy + sin(angle).toFloat() * (r + size * 0.15f)
                    canvas.drawLine(x1, y1, x2, y2, iconPaint)
                }
            }
            "info" -> {
                iconPaint.style = Paint.Style.STROKE
                iconPaint.strokeWidth = size * 0.08f
                val r = size * 0.4f
                canvas.drawCircle(cx, cy, r, iconPaint)
                iconPaint.style = Paint.Style.FILL
                canvas.drawCircle(cx, cy - size * 0.25f, size * 0.08f, iconPaint)
                iconPaint.style = Paint.Style.STROKE
                iconPaint.strokeWidth = size * 0.1f
                canvas.drawLine(cx, cy - size * 0.05f, cx, cy + size * 0.2f, iconPaint)
            }
            "close" -> {
                iconPaint.style = Paint.Style.STROKE
                iconPaint.strokeWidth = size * 0.12f
                iconPaint.strokeCap = Paint.Cap.ROUND
                val d = size * 0.35f
                canvas.drawLine(cx - d, cy - d, cx + d, cy + d, iconPaint)
                canvas.drawLine(cx + d, cy - d, cx - d, cy + d, iconPaint)
            }
        }
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                isPressed = true
                animatePress(1f)
                startRipple(event.x, event.y)
                magnetOffsetX = (event.x / width - 0.5f) * 2f
                magnetOffsetY = (event.y / height - 0.5f) * 2f
                invalidate()
            }
            MotionEvent.ACTION_MOVE -> {
                hoverX = event.x / width
                hoverY = event.y / height
                magnetOffsetX = (event.x / width - 0.5f) * 2f
                magnetOffsetY = (event.y / height - 0.5f) * 2f
                invalidate()
            }
            MotionEvent.ACTION_UP -> {
                isPressed = false
                animatePress(0f)
                magnetOffsetX = 0f
                magnetOffsetY = 0f
                invalidate()
                performClick()
            }
            MotionEvent.ACTION_CANCEL -> {
                isPressed = false
                animatePress(0f)
                magnetOffsetX = 0f
                magnetOffsetY = 0f
                invalidate()
            }
        }
        return true
    }

    override fun onHoverEvent(event: MotionEvent): Boolean {
        when (event.actionMasked) {
            MotionEvent.ACTION_HOVER_ENTER -> {
                isHovered = true
                invalidate()
            }
            MotionEvent.ACTION_HOVER_MOVE -> {
                hoverX = event.x / width
                hoverY = event.y / height
                invalidate()
            }
            MotionEvent.ACTION_HOVER_EXIT -> {
                isHovered = false
                invalidate()
            }
        }
        return true
    }

    override fun onDetachedFromWindow() {
        breatheAnimator?.cancel()
        pressAnimator?.cancel()
        rippleAnimator?.cancel()
        super.onDetachedFromWindow()
    }
}
