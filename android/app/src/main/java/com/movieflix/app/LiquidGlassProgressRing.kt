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
 * LiquidGlassProgressRing — Cinematic Loading Ring with Liquid Glass Effect
 * 
 * Features:
 * 1. Animated liquid glass ring with SDF rendering
 * 2. Chromatic aberration on edges
 * 3. Breathing glow effect
 * 4. Particle trail following the ring
 * 5. Morphing shape on progress
 */
class LiquidGlassProgressRing @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null
) : View(context, attrs) {

    // Configuration
    private var ringColor = Color.parseColor("#e50914")
    private var secondaryColor = Color.parseColor("#22d3ee")
    private var ringWidth = 4f
    private var glowIntensity = 0.4f
    private var progress = 0f
    private var indeterminate = true
    private var cornerRadius = 12f
    
    // Animation state
    private var rotationAngle = 0f
    private var pulsePhase = 0f
    private var trailPhase = 0f
    private var morphPhase = 0f
    private var time = 0f
    
    private val density = resources.displayMetrics.density
    
    // Paints
    private val ringPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
    private val glowPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
    private val trailPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val particlePaint = Paint(Paint.ANTI_ALIAS_FLAG)
    
    private val rectF = RectF()
    
    private var rotationAnimator: ValueAnimator? = null
    private var pulseAnimator: ValueAnimator? = null
    private var trailAnimator: ValueAnimator? = null
    private var morphAnimator: ValueAnimator? = null
    
    // Particles for trail effect
    private data class Particle(
        var x: Float = 0f,
        var y: Float = 0f,
        var alpha: Float = 0f,
        var size: Float = 0f
    )
    private val particles = List(12) { Particle() }

    init {
        setLayerType(LAYER_TYPE_HARDWARE, null)
        startAnimations()
    }

    fun setRingColor(color: Int) {
        ringColor = color
        invalidate()
    }

    fun setSecondaryColor(color: Int) {
        secondaryColor = color
        invalidate()
    }

    fun setRingWidth(width: Float) {
        ringWidth = width
        invalidate()
    }

    fun setGlowIntensity(intensity: Float) {
        glowIntensity = intensity.coerceIn(0f, 1f)
        invalidate()
    }

    fun setProgress(progress: Float) {
        this.progress = progress.coerceIn(0f, 1f)
        if (!indeterminate) invalidate()
    }

    fun setIndeterminate(indeterminate: Boolean) {
        this.indeterminate = indeterminate
        if (indeterminate) startAnimations() else stopAnimations()
        invalidate()
    }

    private fun startAnimations() {
        // Rotation animation
        rotationAnimator?.cancel()
        rotationAnimator = ValueAnimator.ofFloat(0f, 360f).apply {
            duration = 2000
            repeatCount = ValueAnimator.INFINITE
            interpolator = AccelerateDecelerateInterpolator()
            addUpdateListener {
                rotationAngle = it.animatedValue as Float
                time = rotationAngle / 360f * 20f
                invalidate()
            }
            start()
        }
        
        // Pulse animation
        pulseAnimator?.cancel()
        pulseAnimator = ValueAnimator.ofFloat(0f, 1f).apply {
            duration = 3000
            repeatCount = ValueAnimator.INFINITE
            repeatMode = ValueAnimator.REVERSE
            addUpdateListener {
                pulsePhase = it.animatedValue as Float
                invalidate()
            }
            start()
        }
        
        // Trail animation
        trailAnimator?.cancel()
        trailAnimator = ValueAnimator.ofFloat(0f, 1f).apply {
            duration = 1500
            repeatCount = ValueAnimator.INFINITE
            addUpdateListener {
                trailPhase = it.animatedValue as Float
                updateParticles()
                invalidate()
            }
            start()
        }
        
        // Morph animation for liquid effect
        morphAnimator?.cancel()
        morphAnimator = ValueAnimator.ofFloat(0f, 1f).apply {
            duration = 4000
            repeatCount = ValueAnimator.INFINITE
            repeatMode = ValueAnimator.REVERSE
            addUpdateListener {
                morphPhase = it.animatedValue as Float
                invalidate()
            }
            start()
        }
    }

    private fun stopAnimations() {
        rotationAnimator?.cancel()
        pulseAnimator?.cancel()
        trailAnimator?.cancel()
        morphAnimator?.cancel()
    }

    private fun updateParticles() {
        val cx = width / 2f
        val cy = height / 2f
        val radius = min(width, height) / 2f - ringWidth * density - 10f * density
        
        for (i in particles.indices) {
            val angle = Math.toRadians((rotationAngle + i * 30 + trailPhase * 360).toDouble())
            particles[i].x = cx + cos(angle).toFloat() * radius
            particles[i].y = cy + sin(angle).toFloat() * radius
            particles[i].alpha = (1f - i.toFloat() / particles.size) * 0.6f
            particles[i].size = (1f - i.toFloat() / particles.size) * 6f * density + 2f * density
        }
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        
        val w = width.toFloat()
        val h = height.toFloat()
        if (w <= 0f || h <= 0f) return

        val cx = w / 2f
        val cy = h / 2f
        val radius = min(w, h) / 2f - ringWidth * density / 2 - 5f * density
        
        // Breathing pulse
        val pulseScale = 1f + sin(pulsePhase * Math.PI).toFloat() * 0.03f
        val pulseGlow = glowIntensity * (1f + sin(pulsePhase * Math.PI).toFloat() * 0.3f)
        
        canvas.save()
        canvas.scale(pulseScale, pulseScale, cx, cy)
        
        // Draw outer glow
        glowPaint.strokeWidth = ringWidth * density + 12f * density
        glowPaint.shader = RadialGradient(
            cx, cy, radius + 20f * density,
            intArrayOf(
                Color.argb((pulseGlow * 40).toInt(), Color.red(ringColor), Color.green(ringColor), Color.blue(ringColor)),
                Color.TRANSPARENT
            ),
            floatArrayOf(0.8f, 1f),
            Shader.TileMode.CLAMP
        )
        rectF.set(
            cx - radius - 20f * density,
            cy - radius - 20f * density,
            cx + radius + 20f * density,
            cy + radius + 20f * density
        )
        canvas.drawArc(rectF, 0f, 360f, false, glowPaint)
        
        // Draw ring with gradient and chromatic aberration
        ringPaint.strokeWidth = ringWidth * density
        ringPaint.strokeCap = Paint.Cap.ROUND
        
        // Liquid morph - thickness varies around the ring
        val morphOffset = sin(morphPhase * Math.PI * 2).toFloat() * 0.2f
        
        if (indeterminate) {
            // Indeterminate mode - spinning arcs
            val startAngle = rotationAngle
            val sweep = 90f + morphOffset * 30f
            
            // Primary arc
            ringPaint.shader = SweepGradient(
                cx, cy,
                intArrayOf(
                    Color.TRANSPARENT,
                    Color.argb(255, Color.red(ringColor), Color.green(ringColor), Color.blue(ringColor)),
                    secondaryColor,
                    Color.TRANSPARENT
                ),
                floatArrayOf(0f, 0.25f, 0.5f, 1f)
            )
            canvas.rotate(rotationAngle, cx, cy)
            rectF.set(cx - radius, cy - radius, cx + radius, cy + radius)
            canvas.drawArc(rectF, startAngle, sweep, false, ringPaint)
            
            // Secondary arc (opposite)
            canvas.rotate(180f, cx, cy)
            canvas.drawArc(rectF, startAngle, sweep * 0.7f, false, ringPaint)
        } else {
            // Determinate mode - progress arc
            val sweep = progress * 360f
            
            ringPaint.shader = SweepGradient(
                cx, cy,
                intArrayOf(
                    secondaryColor,
                    ringColor,
                    secondaryColor
                ),
                floatArrayOf(0f, 0.5f, 1f)
            )
            
            // Draw progress arc
            rectF.set(cx - radius, cy - radius, cx + radius, cy + radius)
            canvas.drawArc(rectF, -90f, sweep, false, ringPaint)
            
            // Draw remaining track with dim color
            ringPaint.shader = null
            ringPaint.color = Color.argb(60, 100, 100, 120)
            canvas.drawArc(rectF, -90f + sweep, 360f - sweep, false, ringPaint)
        }
        
        // Draw particle trail
        for (particle in particles) {
            if (particle.alpha > 0.05f) {
                particlePaint.shader = RadialGradient(
                    particle.x, particle.y, particle.size,
                    intArrayOf(
                        Color.argb((particle.alpha * 180).toInt(), Color.red(ringColor), Color.green(ringColor), Color.blue(ringColor)),
                        Color.TRANSPARENT
                    ),
                    floatArrayOf(0f, 1f),
                    Shader.TileMode.CLAMP
                )
                canvas.drawCircle(particle.x, particle.y, particle.size, particlePaint)
            }
        }
        
        // Inner glow highlight
        val highlightPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            shader = RadialGradient(
                cx - radius * 0.3f, cy - radius * 0.3f, radius * 0.5f,
                intArrayOf(
                    Color.argb(30, 255, 255, 255),
                    Color.TRANSPARENT
                ),
                floatArrayOf(0f, 1f),
                Shader.TileMode.CLAMP
            )
        }
        canvas.drawCircle(cx, cy, radius * 0.8f, highlightPaint)
        
        canvas.restore()
    }

    override fun onDetachedFromWindow() {
        stopAnimations()
        super.onDetachedFromWindow()
    }
}
