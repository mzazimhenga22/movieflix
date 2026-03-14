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
 * LiquidGlassProView — Premium AGSL-Powered Liquid Glass
 * 
 * Features:
 * 1. SDF-based rendering for perfect rounded rectangles
 * 2. Chromatic aberration refraction with lens distortion
 * 3. Interactive malleability - surface deforms under touch
 * 4. Animated light source with breathing effect
 * 5. Noise-based premium grain texture
 * 6. Edge glow with Fresnel-like falloff
 * 7. Specular highlights that follow touch
 */
@RequiresApi(Build.VERSION_CODES.TIRAMISU)
class LiquidGlassProView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null
) : View(context, attrs) {

    // Configuration
    private var cornerRadius = 28f
    private var tintOpacity = 0.18f
    private var borderOpacity = 0.25f
    private var borderWidth = 1.5f
    private var tintColor = Color.parseColor("#0a0e18")
    private var borderColor = Color.WHITE
    private var glowColor = Color.parseColor("#e50914")
    private var glowIntensity = 0.15f
    private var refractionStrength = 12f
    private var chromaticAberration = 0.8f
    private var grainStrength = 0.02f
    private var animated = false
    private var interactive = false
    private var morphOnPress = true
    
    // Animation state
    private var time = 0f
    private var animPhase = 0f
    private var lightX = 0.3f
    private var lightY = 0.25f
    private var pressProgress = 0f
    private var touchX = -1f
    private var touchY = -1f
    private var isPressed = false
    private var isTouching = false
    
    private val density = resources.displayMetrics.density
    
    // Paints
    private val shaderPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val borderPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
    private val glowPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val glassShader: RuntimeShader? = null
    private var animator: ValueAnimator? = null
    private var pressAnimator: ValueAnimator? = null

    // Premium AGSL shader with SDF, refraction, and interactive malleability
    private val glassShaderSource = """
        uniform shader content;
        uniform float2 size;
        uniform float cornerRadius;
        uniform float4 tintColor;
        uniform float4 glowColor;
        uniform float glowIntensity;
        uniform float2 lightPos;
        uniform float2 touchPos;
        uniform float time;
        uniform float isTouching;
        uniform float pressProgress;
        uniform float refractionStrength;
        uniform float chromaticAberration;
        uniform float grainStrength;

        // Hash function for procedural noise
        float hash(float2 p) {
            p = fract(p * 0.3183099 + 0.1);
            p *= 17.0;
            return fract(p.x * p.y * (p.x + p.y));
        }

        // Smooth noise for grain
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

        // SDF for rounded rectangle with press morphing
        float sdRoundedRect(float2 p, float2 b, float r) {
            // Morph corners on press
            float morphR = r * (1.0 + pressProgress * 0.15);
            float2 q = abs(p) - b + morphR;
            return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - morphR;
        }

        // Calculate normal from SDF gradient
        float2 calcNormal(float2 p, float2 halfSize, float cornerRadius) {
            float eps = 1.0;
            float d = sdRoundedRect(p, halfSize, cornerRadius);
            float dx = sdRoundedRect(p + float2(eps, 0), halfSize, cornerRadius) - sdRoundedRect(p - float2(eps, 0), halfSize, cornerRadius);
            float dy = sdRoundedRect(p + float2(0, eps), halfSize, cornerRadius) - sdRoundedRect(p - float2(0, eps), halfSize, cornerRadius);
            return normalize(float2(dx, dy));
        }

        half4 main(float2 coord) {
            float2 halfSize = size * 0.5;
            float2 p = coord - halfSize;
            
            // SDF distance
            float d = sdRoundedRect(p, halfSize, cornerRadius);
            
            // Early exit for outside
            if (d > 0.0) return half4(0.0);
            
            // Calculate normal for refraction
            float2 normal = calcNormal(p, halfSize, cornerRadius);
            
            // Add procedural noise to normal for organic feel
            float grain = noise(coord * 0.8 + time * 0.3);
            normal += float2(grain - 0.5, noise(coord * 0.8 + 100.0 + time * 0.3) - 0.5) * grainStrength;
            normal = normalize(normal);
            
            // Touch-based malleability
            if (isTouching > 0.5) {
                float distToTouch = length(coord - touchPos);
                float touchInfluence = smoothstep(150.0, 0.0, distToTouch);
                float2 touchDir = normalize(coord - touchPos);
                normal += touchDir * touchInfluence * 0.12 * pressProgress;
                normal = normalize(normal);
            }
            
            // Refraction offset
            float edgeFactor = smoothstep(0.0, -30.0, d);
            float refraction = refractionStrength * edgeFactor;
            float2 refractedCoord = coord + normal * refraction;
            
            // Chromatic aberration - RGB channels refract differently
            half4 bg;
            float2 redOffset = normal * refraction * (1.0 + chromaticAberration * 0.08);
            float2 blueOffset = normal * refraction * (1.0 - chromaticAberration * 0.08);
            
            bg.r = content.eval(coord + redOffset).r;
            bg.g = content.eval(refractedCoord).g;
            bg.b = content.eval(coord + blueOffset).b;
            bg.a = content.eval(refractedCoord).a;
            
            // Fresnel-like edge glow
            float fresnel = pow(1.0 - abs(d) / 40.0, 3.0) * edgeFactor;
            
            // Light tracking for specular
            float2 effectiveLight = mix(lightPos, touchPos / size, isTouching * 0.6);
            float2 lightDir = normalize(effectiveLight - coord / size);
            float spec = pow(max(dot(normal, lightDir), 0.0), 64.0) * 0.6;
            
            // Animated shimmer
            float shimmer = sin(coord.x * 0.02 + coord.y * 0.02 + time * 2.0) * 0.5 + 0.5;
            shimmer = shimmer * shimmer * 0.08;
            
            // Combine base color with tint
            half4 color = mix(bg, tintColor, tintColor.a);
            
            // Add edge glow with accent color
            color.rgb += glowColor.rgb * fresnel * glowIntensity * 1.5;
            
            // Add specular highlight
            color.rgb += spec * half3(1.0, 0.98, 0.95);
            
            // Add shimmer
            color.rgb += shimmer * half3(0.9, 0.92, 1.0);
            
            // Add subtle grain for premium texture
            color.rgb += (grain - 0.5) * grainStrength * 0.5;
            
            // Edge fade for anti-aliasing
            float edgeFade = smoothstep(0.0, -2.0, d);
            color *= edgeFade;
            
            return color;
        }
    """

    init {
        setLayerType(LAYER_TYPE_HARDWARE, null)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            try {
                val shader = RuntimeShader(glassShaderSource)
                shaderPaint.shader = shader
                updateShaderUniforms()
            } catch (e: Exception) {
                // Fallback to gradient-based rendering
            }
        }
    }

    private fun updateShaderUniforms() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
        val shader = (shaderPaint.shader as? RuntimeShader) ?: return
        
        val w = width.toFloat()
        val h = height.toFloat()
        if (w <= 0f || h <= 0f) return
        
        shader.setFloatUniform("size", w, h)
        shader.setFloatUniform("cornerRadius", cornerRadius * density)
        shader.setColorUniform("tintColor", Color.argb(
            (tintOpacity * 255).toInt().coerceIn(0, 255),
            Color.red(tintColor), Color.green(tintColor), Color.blue(tintColor)
        ))
        shader.setColorUniform("glowColor", Color.argb(
            (glowIntensity * 255).toInt().coerceIn(0, 255),
            Color.red(glowColor), Color.green(glowColor), Color.blue(glowColor)
        ))
        shader.setFloatUniform("glowIntensity", glowIntensity)
        shader.setFloatUniform("refractionStrength", refractionStrength)
        shader.setFloatUniform("chromaticAberration", chromaticAberration)
        shader.setFloatUniform("grainStrength", grainStrength)
    }

    fun setCornerRadius(radius: Float) {
        cornerRadius = radius
        updateShaderUniforms()
        invalidate()
    }

    fun setTintOpacity(opacity: Float) {
        tintOpacity = opacity.coerceIn(0f, 1f)
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

    fun setBorderWidth(width: Float) {
        borderWidth = width.coerceAtLeast(0f)
        invalidate()
    }

    fun setBorderOpacity(opacity: Float) {
        borderOpacity = opacity.coerceIn(0f, 1f)
        invalidate()
    }

    fun setBorderColor(color: Int) {
        borderColor = color
        invalidate()
    }

    fun setAnimated(enabled: Boolean) {
        if (animated == enabled) return
        animated = enabled
        if (enabled) startAnimation() else {
            animator?.cancel()
            animator = null
        }
    }

    fun setInteractive(enabled: Boolean) {
        interactive = enabled
    }

    fun setMorphOnPress(enabled: Boolean) {
        morphOnPress = enabled
    }

    fun setRefractionStrength(strength: Float) {
        refractionStrength = strength
        updateShaderUniforms()
        invalidate()
    }

    fun setChromaticAberration(amount: Float) {
        chromaticAberration = amount.coerceIn(0f, 1f)
        updateShaderUniforms()
        invalidate()
    }

    private fun startAnimation() {
        animator?.cancel()
        animator = ValueAnimator.ofFloat(0f, 1f).apply {
            duration = 10000
            repeatCount = ValueAnimator.INFINITE
            repeatMode = ValueAnimator.REVERSE
            interpolator = AccelerateDecelerateInterpolator()
            addUpdateListener {
                animPhase = it.animatedValue as Float
                time = animPhase * 25f
                
                // Breathing light position
                lightX = 0.3f + (sin(animPhase * Math.PI * 2).toFloat() * 0.2f)
                lightY = 0.25f + (cos(animPhase * Math.PI * 2).toFloat() * 0.15f)
                
                invalidate()
            }
            start()
        }
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        updateShaderUniforms()
        
        // Apply blur effect if supported
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val blurRadius = 15f * density
            val blur = RenderEffect.createBlurEffect(blurRadius, blurRadius, Shader.TileMode.CLAMP)
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && shaderPaint.shader is RuntimeShader) {
                val glassEffect = RenderEffect.createRuntimeShaderEffect(shaderPaint.shader as RuntimeShader, "content")
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

        val cornerPx = cornerRadius * density

        // Draw glass background with gradient fallback
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && shaderPaint.shader is RuntimeShader) {
            val shader = shaderPaint.shader as RuntimeShader
            shader.setFloatUniform("lightPos", lightX, lightY)
            shader.setFloatUniform("touchPos", touchX, touchY)
            shader.setFloatUniform("time", time)
            shader.setFloatUniform("isTouching", if (isTouching && interactive) 1f else 0f)
            shader.setFloatUniform("pressProgress", pressProgress)
            canvas.drawRect(0f, 0f, w, h, shaderPaint)
        } else {
            // Gradient fallback
            val gradient = LinearGradient(
                0f, 0f, w, h,
                intArrayOf(
                    Color.argb((tintOpacity * 255).toInt(), Color.red(tintColor), Color.green(tintColor), Color.blue(tintColor)),
                    Color.argb((tintOpacity * 200).toInt(), 6, 10, 18)
                ),
                floatArrayOf(0f, 1f),
                Shader.TileMode.CLAMP
            )
            val fallbackPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { shader = gradient }
            val path = Path().apply {
                addRoundRect(RectF(0f, 0f, w, h), cornerPx, cornerPx, Path.Direction.CW)
            }
            canvas.drawPath(path, fallbackPaint)
            
            // Glow overlay
            val glowGradient = RadialGradient(
                w * lightX, h * lightY,
                min(w, h) * 0.8f,
                intArrayOf(
                    Color.argb((glowIntensity * 80).toInt(), Color.red(glowColor), Color.green(glowColor), Color.blue(glowColor)),
                    Color.TRANSPARENT
                ),
                floatArrayOf(0f, 1f),
                Shader.TileMode.CLAMP
            )
            glowPaint.shader = glowGradient
            canvas.drawPath(path, glowPaint)
        }

        // Draw animated border
        if (borderOpacity > 0 && borderWidth > 0) {
            val shimmerOffset = sin(animPhase * Math.PI * 2).toFloat()
            val borderAlpha = ((borderOpacity * 255) * (1f + shimmerOffset * 0.15f)).toInt().coerceIn(0, 255)
            
            borderPaint.strokeWidth = borderWidth * density
            borderPaint.shader = LinearGradient(
                0f, 0f, w, h,
                intArrayOf(
                    Color.argb((borderAlpha * 0.8f).toInt(), Color.red(borderColor), Color.green(borderColor), Color.blue(borderColor)),
                    Color.argb((borderAlpha * 0.3f).toInt(), 255, 255, 255),
                    Color.argb((borderAlpha * 0.6f).toInt(), Color.red(glowColor), Color.green(glowColor), Color.blue(glowColor))
                ),
                floatArrayOf(0f, 0.5f, 1f),
                Shader.TileMode.CLAMP
            )
            
            val inset = borderWidth * density / 2f
            canvas.drawRoundRect(RectF(inset, inset, w - inset, h - inset), cornerPx, cornerPx, borderPaint)
        }
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
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                isPressed = false
                isTouching = false
                animatePress(0f)
                invalidate()
            }
        }
        return true
    }

    private fun animatePress(target: Float) {
        if (!morphOnPress) {
            pressProgress = target
            return
        }
        pressAnimator?.cancel()
        pressAnimator = ValueAnimator.ofFloat(pressProgress, target).apply {
            duration = 150
            interpolator = AccelerateDecelerateInterpolator()
            addUpdateListener {
                pressProgress = it.animatedValue as Float
                invalidate()
            }
            start()
        }
    }

    override fun onDetachedFromWindow() {
        animator?.cancel()
        animator = null
        pressAnimator?.cancel()
        pressAnimator = null
        super.onDetachedFromWindow()
    }
}
