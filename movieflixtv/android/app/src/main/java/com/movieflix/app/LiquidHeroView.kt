package com.movieflix.app

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.*
import android.os.Build
import android.util.AttributeSet
import android.view.View
import android.view.animation.AccelerateDecelerateInterpolator
import kotlin.math.*

/**
 * LiquidHeroView - Cinematic Hero Background with Multi-Layer Glass Effect
 * 
 * Premium hero component for movie/show details:
 * 1. Multi-layer parallax gradients
 * 2. Animated light rays
 * 3. Cinematic vignette with color bleeding
 * 4. Particle dust overlay
 * 5. Breathing glow effect
 * 
 * Offloads heavy rendering from JS to native
 */
class LiquidHeroView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null
) : View(context, attrs) {

    // Configuration
    private var accentColor = Color.parseColor("#e50914")
    private var secondaryColor = Color.parseColor("#22d3ee")
    private var glowIntensity = 0.4f
    private var animated = true
    
    // Animation state
    private var time = 0f
    private var phase = 0f
    private var lightAngle = 0f
    private var dustPhase = 0f
    
    // Paints
    private val bgPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val glowPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val rayPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val dustPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val vignettePaint = Paint(Paint.ANTI_ALIAS_FLAG)
    
    // Dust particles
    private data class DustParticle(
        var x: Float = 0f,
        var y: Float = 0f,
        var size: Float = 0f,
        var alpha: Float = 0f,
        var speed: Float = 0f
    )
    private val dustParticles = List(30) { DustParticle() }
    
    private var animator: ValueAnimator? = null

    init {
        setLayerType(LAYER_TYPE_HARDWARE, null)
        initDustParticles()
        if (animated) startAnimation()
    }

    private fun initDustParticles() {
        for (i in dustParticles.indices) {
            dustParticles[i].apply {
                x = (Math.random() * 1000).toFloat()
                y = (Math.random() * 1000).toFloat()
                size = (1 + Math.random() * 2).toFloat()
                alpha = (0.1 + Math.random() * 0.3).toFloat()
                speed = (0.2 + Math.random() * 0.5).toFloat()
            }
        }
    }

    fun setAccentColor(color: Int) {
        accentColor = color
        invalidate()
    }

    fun setSecondaryColor(color: Int) {
        secondaryColor = color
        invalidate()
    }

    fun setGlowIntensity(intensity: Float) {
        glowIntensity = intensity.coerceIn(0f, 1f)
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

    private fun startAnimation() {
        animator?.cancel()
        animator = ValueAnimator.ofFloat(0f, 1f).apply {
            duration = 15000
            repeatCount = ValueAnimator.INFINITE
            repeatMode = ValueAnimator.RESTART
            interpolator = AccelerateDecelerateInterpolator()
            addUpdateListener {
                phase = it.animatedValue as Float
                time = phase * 30f
                lightAngle = phase * 360f
                dustPhase = phase * 2f
                updateDustParticles()
                invalidate()
            }
            start()
        }
    }

    private fun updateDustParticles() {
        val w = width.toFloat()
        val h = height.toFloat()
        for (particle in dustParticles) {
            particle.y -= particle.speed * density
            particle.x += sin(time * 0.1 + particle.y * 0.01).toFloat() * 0.3f
            
            if (particle.y < -10) {
                particle.y = h + 10
                particle.x = (Math.random() * w).toFloat()
            }
        }
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        
        val w = width.toFloat()
        val h = height.toFloat()
        if (w <= 0f || h <= 0f) return

        // 1. Base gradient with accent color bleed
        val bgGradient = LinearGradient(
            0f, 0f, w, h,
            intArrayOf(
                Color.argb(40, Color.red(accentColor), Color.green(accentColor), Color.blue(accentColor)),
                Color.parseColor("#05060f"),
                Color.parseColor("#030408")
            ),
            floatArrayOf(0f, 0.6f, 1f),
            Shader.TileMode.CLAMP
        )
        bgPaint.shader = bgGradient
        canvas.drawRect(0f, 0f, w, h, bgPaint)

        // 2. Animated light rays
        val rayCount = 3
        for (i in 0 until rayCount) {
            val rayPhase = (phase + i * 0.33f) % 1f
            val rayAngle = Math.toRadians(lightAngle + i * 120.0)
            val rayX = w * (0.3f + cos(rayAngle).toFloat() * 0.2f)
            val rayY = h * (0.2f + sin(rayAngle).toFloat() * 0.15f)
            val rayAlpha = (sin(rayPhase * Math.PI) * 0.15).toFloat()
            
            rayPaint.shader = RadialGradient(
                rayX, rayY, min(w, h) * 0.8f,
                intArrayOf(
                    Color.argb((rayAlpha * 255).toInt(), Color.red(accentColor), Color.green(accentColor), Color.blue(accentColor)),
                    Color.TRANSPARENT
                ),
                floatArrayOf(0f, 1f),
                Shader.TileMode.CLAMP
            )
            canvas.drawRect(0f, 0f, w, h, rayPaint)
        }

        // 3. Primary glow spot
        val glowX = w * (0.25f + sin(phase * Math.PI * 2).toFloat() * 0.1f)
        val glowY = h * (0.3f + cos(phase * Math.PI * 2).toFloat() * 0.08f)
        glowPaint.shader = RadialGradient(
            glowX, glowY, min(w, h) * 0.7f,
            intArrayOf(
                Color.argb((glowIntensity * 80).toInt(), Color.red(accentColor), Color.green(accentColor), Color.blue(accentColor)),
                Color.argb((glowIntensity * 30).toInt(), Color.red(accentColor), Color.green(accentColor), Color.blue(accentColor)),
                Color.TRANSPARENT
            ),
            floatArrayOf(0f, 0.5f, 1f),
            Shader.TileMode.CLAMP
        )
        canvas.drawRect(0f, 0f, w, h, glowPaint)

        // 4. Secondary accent glow (cool tone for depth)
        val coolGlowX = w * 0.85f
        val coolGlowY = h * 0.7f
        glowPaint.shader = RadialGradient(
            coolGlowX, coolGlowY, min(w, h) * 0.5f,
            intArrayOf(
                Color.argb(20, Color.red(secondaryColor), Color.green(secondaryColor), Color.blue(secondaryColor)),
                Color.TRANSPARENT
            ),
            floatArrayOf(0f, 1f),
            Shader.TileMode.CLAMP
        )
        canvas.drawRect(0f, 0f, w, h, glowPaint)

        // 5. Floating dust particles
        for (particle in dustParticles) {
            dustPaint.color = Color.argb((particle.alpha * 255).toInt(), 255, 255, 255)
            canvas.drawCircle(particle.x, particle.y, particle.size * density, dustPaint)
        }

        // 6. Cinematic vignette
        vignettePaint.shader = RadialGradient(
            w * 0.5f, h * 0.5f, max(w, h) * 0.8f,
            intArrayOf(
                Color.TRANSPARENT,
                Color.argb(60, 0, 0, 0),
                Color.argb(120, 0, 0, 0)
            ),
            floatArrayOf(0.5f, 0.8f, 1f),
            Shader.TileMode.CLAMP
        )
        canvas.drawRect(0f, 0f, w, h, vignettePaint)

        // 7. Top fade for header overlap
        val topFade = LinearGradient(
            0f, 0f, 0f, h * 0.3f,
            intArrayOf(
                Color.argb(180, 5, 6, 15),
                Color.TRANSPARENT
            ),
            floatArrayOf(0f, 1f),
            Shader.TileMode.CLAMP
        )
        bgPaint.shader = topFade
        canvas.drawRect(0f, 0f, w, h * 0.3f, bgPaint)
    }

    override fun onDetachedFromWindow() {
        animator?.cancel()
        animator = null
        super.onDetachedFromWindow()
    }
}
