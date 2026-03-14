package com.movieflix.app

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.*
import android.os.Build
import android.util.AttributeSet
import android.view.MotionEvent
import android.view.View
import android.view.animation.AccelerateDecelerateInterpolator
import androidx.annotation.RequiresApi
import kotlin.math.*

/**
 * LiquidGlassCard — Premium Card with Advanced Glass Morphism
 * 
 * Features:
 * 1. Full AGSL shader-based rendering with SDF
 * 2. Interactive malleability - surface deforms under touch
 * 3. Edge Fresnel glow with color bleeding
 * 4. Chromatic aberration refraction
 * 5. Animated light source with breathing
 * 6. Specular highlights that follow interaction
 * 7. Magnetic attraction on focus/hover
 * 8. Premium grain texture
 */
@RequiresApi(Build.VERSION_CODES.TIRAMISU)
class LiquidGlassCard @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null
) : View(context, attrs) {

    // Configuration
    private var cornerRadius = 24f
    private var tintColor = Color.parseColor("#0d1220")
    private var glowColor = Color.parseColor("#e50914")
    private var borderColor = Color.WHITE
    private var tintOpacity = 0.22f
    private var glowIntensity = 0.18f
    private var borderOpacity = 0.28f
    private var borderWidth = 1.5f
    private var refractionStrength = 15f
    private var chromaticAberration = 0.85f
    private var grainStrength = 0.025f
    private var interactive = true
    private var animated = true
    private var magneticPull = true
    
    // Animation state
    private var time = 0f
    private var animPhase = 0f
    private var lightX = 0.35f
    private var lightY = 0.3f
    private var touchX = -1f
    private var touchY = -1f
    private var pressProgress = 0f
    private var isPressed = false
    private var isTouching = false
    private var focusProgress = 0f
    private var isFocused = false
    private var hoverProgress = 0f
    private var isHovered = false
    
    private val density = resources.displayMetrics.density
    
    // Paints
    private val shaderPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val borderPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
    private val glowPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val highlightPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    
    private var breatheAnimator: ValueAnimator? = null
    private var pressAnimator: ValueAnimator? = null
    private var focusAnimator: ValueAnimator? = null
    private var hoverAnimator: ValueAnimator? = null

    // Advanced AGSL shader with SDF, refraction, and all effects
    private val cardShaderSource = """
        uniform shader content;
        uniform float2 size;
        uniform float cornerRadius;
        uniform float4 tintColor;
        uniform float4 glowColor;
        uniform float glowIntensity;
        uniform float borderOpacity;
        uniform float2 lightPos;
        uniform float2 touchPos;
        uniform float time;
        uniform float isTouching;
        uniform float pressProgress;
        uniform float focusProgress;
        uniform float hoverProgress;
        uniform float refractionStrength;
        uniform float chromaticAberration;
        uniform float grainStrength;
        
        // Premium noise functions
        float hash(float2 p) {
            float3 p3 = fract(float3(p.xyx) * 0.1031);
            p3 += dot(p3, p3.yzx + 33.33);
            return fract((p3.x + p3.y) * p3.z);
        }
        
        float noise(float2 p) {
            float2 i = floor(p);
            float2 f = fract(p);
            float2 u = f * f * (3.0 - 2.0 * f);
            return mix(
                mix(hash(i), hash(i + float2(1.0, 0.0)), u.x),
                mix(hash(i + float2(0.0, 1.0)), hash(i + float2(1.0, 1.0)), u.x),
                u.y
            );
        }
        
        float fbm(float2 p) {
            float v = 0.0;
            float a = 0.5;
            float2 shift = float2(100.0);
            mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
            for (int i = 0; i < 4; i++) {
                v += a * noise(p);
                p = rot * p * 2.0 + shift;
                a *= 0.5;
            }
            return v;
        }
        
        float sdRoundedRect(float2 p, float2 b, float r) {
            float2 q = abs(p) - b + r;
            return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
        }
        
        float2 calcNormal(float2 p, float2 halfSize, float cr) {
            float eps = 1.5;
            float d = sdRoundedRect(p, halfSize, cr);
            return normalize(float2(
                sdRoundedRect(p + float2(eps, 0), halfSize, cr) - sdRoundedRect(p - float2(eps, 0), halfSize, cr),
                sdRoundedRect(p + float2(0, eps), halfSize, cr) - sdRoundedRect(p - float2(0, eps), halfSize, cr)
            ));
        }
        
        half4 main(float2 coord) {
            float2 halfSize = size * 0.5;
            float2 p = coord - halfSize;
            
            // Morphing corner radius based on press
            float morphR = cornerRadius * (1.0 + pressProgress * 0.2);
            float d = sdRoundedRect(p, halfSize, morphR);
            
            if (d > 1.0) return half4(0.0);
            
            // Edge fade for smooth edges
            float edgeFade = smoothstep(1.0, -2.0, d);
            
            // Normal with organic perturbation
            float2 normal = calcNormal(p, halfSize, morphR);
            float grainNoise = fbm(coord * 0.5 + time * 0.15);
            normal += float2(grainNoise - 0.5, noise(coord * 0.6 + time * 0.2) - 0.5) * grainStrength * 0.8;
            normal = normalize(normal);
            
            // Touch malleability
            if (isTouching > 0.5) {
                float distToTouch = length(coord - touchPos);
                float touchInfluence = smoothstep(180.0, 0.0, distToTouch);
                float2 touchDir = normalize(coord - touchPos + float2(0.001));
                normal += touchDir * touchInfluence * 0.15 * pressProgress;
                normal = normalize(normal);
            }
            
            // Refraction with edge-based strength
            float edgeFactor = smoothstep(0.0, -40.0, d);
            float refract = refractionStrength * edgeFactor;
            float2 refractedCoord = coord + normal * refract;
            
            // Chromatic aberration
            half4 bg;
            float ca = chromaticAberration * edgeFactor;
            bg.r = content.eval(coord + normal * refract * (1.0 + ca * 0.1)).r;
            bg.g = content.eval(refractedCoord).g;
            bg.b = content.eval(coord + normal * refract * (1.0 - ca * 0.1)).b;
            bg.a = content.eval(refractedCoord).a;
            
            // Dynamic light position
            float2 effectiveLight = lightPos;
            if (isTouching > 0.5) {
                effectiveLight = mix(lightPos, touchPos / size, 0.5 * pressProgress);
            }
            float2 lightDir = normalize(effectiveLight - coord / size);
            
            // Multi-lobe specular for premium look
            float spec1 = pow(max(dot(normal, lightDir), 0.0), 128.0) * 0.7;
            float spec2 = pow(max(dot(normal, lightDir), 0.0), 32.0) * 0.2;
            float spec = spec1 + spec2;
            
            // Fresnel edge glow
            float fresnel = pow(1.0 - abs(d) / 35.0, 3.5) * edgeFactor;
            
            // Focus/hover glow boost
            float interactionGlow = focusProgress * 0.6 + hoverProgress * 0.3;
            
            // Combine base color
            half4 color = mix(bg, tintColor, tintColor.a);
            
            // Glow color influence with interaction boost
            float glowFactor = glowIntensity * (1.0 + interactionGlow);
            color.rgb += glowColor.rgb * fresnel * glowFactor * 2.5;
            
            // Add specular
            color.rgb += spec * half3(1.0, 0.98, 0.95);
            
            // Animated shimmer across surface
            float shimmer = sin(coord.x * 0.015 + coord.y * 0.015 + time * 1.5) * 0.5 + 0.5;
            shimmer = pow(shimmer, 3.0) * 0.06;
            color.rgb += shimmer * half3(0.95, 0.97, 1.0) * (1.0 + interactionGlow);
            
            // Premium grain texture
            float grain = (grainNoise - 0.5) * grainStrength;
            color.rgb += grain;
            
            // Inner glow at top edge (highlight)
            float topHighlight = smoothstep(halfSize.y * 0.6, halfSize.y * 0.95, -p.y) * 0.15;
            color.rgb += topHighlight * half3(1.0, 1.0, 1.0) * edgeFade;
            
            // Apply edge fade
            color *= edgeFade;
            
            return color;
        }
    """

    private var cardShader: RuntimeShader? = null

    init {
        setLayerType(LAYER_TYPE_HARDWARE, null)
        isClickable = true
        isFocusable = true
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            try {
                cardShader = RuntimeShader(cardShaderSource)
                shaderPaint.shader = cardShader
                updateShaderUniforms()
            } catch (e: Exception) { }
        }
        
        if (animated) startBreathingAnimation()
    }

    private fun updateShaderUniforms() {
        val shader = cardShader ?: return
        val w = width.toFloat()
        val h = height.toFloat()
        if (w <= 0f || h <= 0f) return
        
        shader.setFloatUniform("size", w, h)
        shader.setFloatUniform("cornerRadius", cornerRadius * density)
        shader.setColorUniform("tintColor", Color.argb(
            (tintOpacity * 255).toInt().coerceIn(0, 255),
            Color.red(tintColor), Color.green(tintColor), Color.blue(tintColor)
        ))
        shader.setColorUniform("glowColor", Color.argb(255, Color.red(glowColor), Color.green(glowColor), Color.blue(glowColor)))
        shader.setFloatUniform("glowIntensity", glowIntensity)
        shader.setFloatUniform("borderOpacity", borderOpacity)
        shader.setFloatUniform("refractionStrength", refractionStrength)
        shader.setFloatUniform("chromaticAberration", chromaticAberration)
        shader.setFloatUniform("grainStrength", grainStrength)
    }

    fun setCornerRadius(radius: Float) {
        cornerRadius = radius
        updateShaderUniforms()
        invalidate()
    }

    fun setTintColor(color: Int) {
        tintColor = color
        updateShaderUniforms()
        invalidate()
    }

    fun setGlowColor(color: Int) {
        glowColor = color
        updateShaderUniforms()
        invalidate()
    }

    fun setGlowIntensity(intensity: Float) {
        glowIntensity = intensity.coerceIn(0f, 1f)
        updateShaderUniforms()
        invalidate()
    }

    fun setInteractive(enabled: Boolean) {
        interactive = enabled
    }

    fun setAnimated(enabled: Boolean) {
        if (animated == enabled) return
        animated = enabled
        if (enabled) startBreathingAnimation() else {
            breatheAnimator?.cancel()
            breatheAnimator = null
        }
    }

    private fun startBreathingAnimation() {
        breatheAnimator?.cancel()
        breatheAnimator = ValueAnimator.ofFloat(0f, 1f).apply {
            duration = 8000
            repeatCount = ValueAnimator.INFINITE
            repeatMode = ValueAnimator.REVERSE
            interpolator = AccelerateDecelerateInterpolator()
            addUpdateListener {
                animPhase = it.animatedValue as Float
                time = animPhase * 25f
                
                // Breathing light position
                lightX = 0.35f + (sin(animPhase * Math.PI * 2).toFloat() * 0.15f)
                lightY = 0.3f + (cos(animPhase * Math.PI * 2).toFloat() * 0.1f)
                
                invalidate()
            }
            start()
        }
    }

    private fun animatePress(to: Float) {
        pressAnimator?.cancel()
        pressAnimator = ValueAnimator.ofFloat(pressProgress, to).apply {
            duration = if (to > 0.5f) 120 else 350
            interpolator = AccelerateDecelerateInterpolator()
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
            duration = 200
            interpolator = AccelerateDecelerateInterpolator()
            addUpdateListener {
                focusProgress = it.animatedValue as Float
                invalidate()
            }
            start()
        }
    }

    private fun animateHover(to: Float) {
        hoverAnimator?.cancel()
        hoverAnimator = ValueAnimator.ofFloat(hoverProgress, to).apply {
            duration = 150
            interpolator = AccelerateDecelerateInterpolator()
            addUpdateListener {
                hoverProgress = it.animatedValue as Float
                invalidate()
            }
            start()
        }
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        updateShaderUniforms()
        applyRenderEffect()
    }

    private fun applyRenderEffect() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val blurRadius = 12f * density
            val blur = RenderEffect.createBlurEffect(blurRadius, blurRadius, Shader.TileMode.CLAMP)
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && cardShader != null) {
                val glassEffect = RenderEffect.createRuntimeShaderEffect(cardShader!!, "content")
                setRenderEffect(RenderEffect.createChainEffect(glassEffect, blur))
            } else {
                setRenderEffect(blur)
            }
        }
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        
        val w = width.toFloat()
        val h = height.toFloat()
        if (w <= 0f || h <= 0f) return

        val cornerPx = cornerRadius * density * (1f + pressProgress * 0.15f)
        
        // Update dynamic shader uniforms
        cardShader?.let { shader ->
            shader.setFloatUniform("lightPos", lightX, lightY)
            shader.setFloatUniform("touchPos", touchX, touchY)
            shader.setFloatUniform("time", time)
            shader.setFloatUniform("isTouching", if (isTouching && interactive) 1f else 0f)
            shader.setFloatUniform("pressProgress", pressProgress)
            shader.setFloatUniform("focusProgress", focusProgress)
            shader.setFloatUniform("hoverProgress", hoverProgress)
        }
        
        // Draw glass background
        if (cardShader != null) {
            canvas.drawRect(0f, 0f, w, h, shaderPaint)
        } else {
            // Fallback gradient
            val gradient = LinearGradient(
                0f, 0f, w, h,
                intArrayOf(
                    Color.argb((tintOpacity * 255).toInt(), Color.red(tintColor), Color.green(tintColor), Color.blue(tintColor)),
                    Color.argb((tintOpacity * 180).toInt(), 8, 12, 22)
                ),
                floatArrayOf(0f, 1f),
                Shader.TileMode.CLAMP
            )
            shaderPaint.shader = gradient
            val path = Path().apply {
                addRoundRect(RectF(0f, 0f, w, h), cornerPx, cornerPx, Path.Direction.CW)
            }
            canvas.drawPath(path, shaderPaint)
            
            // Glow overlay
            glowPaint.shader = RadialGradient(
                w * lightX, h * lightY,
                min(w, h) * 0.9f,
                intArrayOf(
                    Color.argb((glowIntensity * 80 * (1 + focusProgress * 0.5)).toInt(), Color.red(glowColor), Color.green(glowColor), Color.blue(glowColor)),
                    Color.TRANSPARENT
                ),
                floatArrayOf(0f, 1f),
                Shader.TileMode.CLAMP
            )
            canvas.drawPath(path, glowPaint)
        }
        
        // Focus ring effect
        if (focusProgress > 0.1f) {
            val focusPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                style = Paint.Style.STROKE
                strokeWidth = 3f * density * focusProgress
                shader = LinearGradient(
                    0f, 0f, w, h,
                    intArrayOf(
                        Color.argb((180 * focusProgress).toInt(), 255, 255, 255),
                        Color.argb((150 * focusProgress).toInt(), Color.red(glowColor), Color.green(glowColor), Color.blue(glowColor)),
                        Color.argb((180 * focusProgress).toInt(), 255, 255, 255)
                    ),
                    floatArrayOf(0f, 0.5f, 1f),
                    Shader.TileMode.CLAMP
                )
            }
            val inset = focusPaint.strokeWidth / 2f
            canvas.drawRoundRect(RectF(inset, inset, w - inset, h - inset), cornerPx, cornerPx, focusPaint)
        }
        
        // Draw premium border
        if (borderOpacity > 0 && borderWidth > 0) {
            val shimmer = sin(time * 0.3f).toFloat() * 0.5f + 0.5f
            val interactionBoost = focusProgress * 0.3f + hoverProgress * 0.15f
            val effectiveOpacity = borderOpacity * (1f + shimmer * 0.2f + interactionBoost)
            
            borderPaint.strokeWidth = borderWidth * density
            borderPaint.shader = LinearGradient(
                0f, 0f, w, h,
                intArrayOf(
                    Color.argb((effectiveOpacity * 255 * 0.9f).toInt(), Color.red(borderColor), Color.green(borderColor), Color.blue(borderColor)),
                    Color.argb((effectiveOpacity * 100).toInt(), 255, 255, 255),
                    Color.argb((effectiveOpacity * 180).toInt(), Color.red(glowColor), Color.green(glowColor), Color.blue(glowColor)),
                    Color.argb((effectiveOpacity * 220).toInt(), Color.red(borderColor), Color.green(borderColor), Color.blue(borderColor))
                ),
                floatArrayOf(0f, 0.3f, 0.6f, 1f),
                Shader.TileMode.CLAMP
            )
            
            val inset = borderWidth * density / 2f
            canvas.drawRoundRect(RectF(inset, inset, w - inset, h - inset), cornerPx, cornerPx, borderPaint)
        }
        
        // Top highlight edge
        highlightPaint.shader = LinearGradient(
            0f, 0f, w, 0f,
            intArrayOf(
                Color.argb((40 + focusProgress * 20).toInt(), 255, 255, 255),
                Color.argb((15 + focusProgress * 10).toInt(), 255, 255, 255),
                Color.TRANSPARENT
            ),
            floatArrayOf(0f, 0.5f, 1f),
            Shader.TileMode.CLAMP
        )
        val highlightPath = Path().apply {
            moveTo(0f, cornerPx)
            lineTo(0f, cornerPx * 0.3f)
            quadTo(0f, 0f, cornerPx * 0.3f, 0f)
            lineTo(w - cornerPx * 0.3f, 0f)
            quadTo(w, 0f, w, cornerPx * 0.3f)
            lineTo(w, cornerPx)
        }
        canvas.drawPath(highlightPath, highlightPaint)
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        if (!interactive) return super.onTouchEvent(event)
        
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                isPressed = true
                isTouching = true
                touchX = event.x
                touchY = event.y
                animatePress(1f)
                invalidate()
            }
            MotionEvent.ACTION_MOVE -> {
                touchX = event.x
                touchY = event.y
                invalidate()
            }
            MotionEvent.ACTION_UP -> {
                isPressed = false
                isTouching = false
                animatePress(0f)
                invalidate()
                performClick()
            }
            MotionEvent.ACTION_CANCEL -> {
                isPressed = false
                isTouching = false
                animatePress(0f)
                invalidate()
            }
        }
        return true
    }

    override fun onHoverEvent(event: MotionEvent): Boolean {
        if (!interactive) return super.onHoverEvent(event)
        
        when (event.actionMasked) {
            MotionEvent.ACTION_HOVER_ENTER -> {
                isHovered = true
                animateHover(1f)
                invalidate()
            }
            MotionEvent.ACTION_HOVER_EXIT -> {
                isHovered = false
                animateHover(0f)
                invalidate()
            }
        }
        return true
    }

    override fun onFocusChanged(gainFocus: Boolean, direction: Int, previouslyFocusedRect: Rect?) {
        super.onFocusChanged(gainFocus, direction, previouslyFocusedRect)
        isFocused = gainFocus
        animateFocus(if (gainFocus) 1f else 0f)
    }

    override fun onDetachedFromWindow() {
        breatheAnimator?.cancel()
        pressAnimator?.cancel()
        focusAnimator?.cancel()
        hoverAnimator?.cancel()
        super.onDetachedFromWindow()
    }
}
