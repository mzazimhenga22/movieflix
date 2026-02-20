package com.movieflix.app.app

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.*
import android.provider.Settings
import android.view.MotionEvent
import android.view.View
import android.view.animation.AccelerateDecelerateInterpolator
import android.view.animation.PathInterpolator
import kotlin.math.*

/**
 * LiquidGlassView — Enhanced iOS 26 Liquid Glass implementation for MovieFlix
 *
 * Features:
 * - Cinematic multi-layer composition
 * - Adaptive lighting with spring physics
 * - Touch/Focus responsive morphing
 * - Content awareness for movie posters
 * - Chromatic refraction effects
 * - Accessibility support
 */
class LiquidGlassView(context: Context) : View(context) {

    enum class InteractionState {
        IDLE, PRESSED, HOVERED, SCROLLING, FOCUSED
    }

    // Configurable Properties
    private var glowColor = Color.parseColor("#e50914")
    private var tintColor = Color.parseColor("#0d0d12")
    private var tintOpacity = 0.65f
    private var cornerRad = 24f
    private var glowIntensity = 0.8f
    private var borderW = 1.5f
    private var animated = true

    // Environment Awareness
    private var ambientLight = 0.85f
    private var contentColor = Color.TRANSPARENT
    private var scrollOpacity = 1.0f
    private var posterDominantColor = Color.TRANSPARENT

    // Drawing Objects
    private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val borderPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
    private val innerGlowPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val noisePaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val outerGlowPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val streakPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val shadowPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val chromaticPaint = Paint(Paint.ANTI_ALIAS_FLAG)

    private val rect = RectF()
    private val rectL = RectF()
    private val streakPath = Path()

    // Animation Values
    private var animProgress = 0f
    private var glowValue = 1f
    private var wobblePhase = 0.0
    private var distortionPhase = 0.0
    private var breathePhase = 0.0
    private var animator: ValueAnimator? = null
    private var secondaryAnimator: ValueAnimator? = null

    // Interaction State
    private var interactionState = InteractionState.IDLE
    private var pressScale = 1f
    private var focusScale = 1f
    private var touchDownTime = 0L

    // Accessibility
    private var reducedMotion = false
    private var reducedTransparency = false

    private val density = context.resources.displayMetrics.density
    private var noiseBitmap: Bitmap? = null

    init {
        setLayerType(LAYER_TYPE_HARDWARE, null)
        checkAccessibilitySettings()
        createNoiseTexture()
        if (animated && !reducedMotion) startAnimation()
    }

    private fun checkAccessibilitySettings() {
        try {
            val animScale = Settings.Global.getFloat(
                context.contentResolver,
                Settings.Global.ANIMATOR_DURATION_SCALE, 1f
            )
            reducedMotion = animScale == 0f
            val transScale = Settings.Global.getFloat(
                context.contentResolver,
                Settings.Global.TRANSITION_ANIMATION_SCALE, 1f
            )
            reducedTransparency = transScale == 0f
        } catch (e: Exception) {
            reducedMotion = false
            reducedTransparency = false
        }
    }

    private fun createNoiseTexture() {
        val size = 64
        noiseBitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val pixels = IntArray(size * size)
        for (i in pixels.indices) {
            val gray = (Math.random() * 128).toInt() + 64
            pixels[i] = Color.argb(40, gray, gray, gray)
        }
        noiseBitmap?.setPixels(pixels, 0, size, 0, 0, size, size)
        noisePaint.shader = BitmapShader(noiseBitmap!!, Shader.TileMode.REPEAT, Shader.TileMode.REPEAT)
        noisePaint.alpha = 15
    }

    // Public Setters
    fun setGlowColor(color: Int) {
        glowColor = color
        posterDominantColor = color
        invalidate()
    }

    fun setTintColor(color: Int) { tintColor = color; invalidate() }

    fun setTintOpacity(opacity: Float) {
        tintOpacity = opacity.coerceIn(0f, 1f)
        if (reducedTransparency) tintOpacity = 0.9f
        invalidate()
    }

    fun setCornerRadius(radius: Float) { cornerRad = radius; invalidate() }

    fun setGlowIntensity(intensity: Float) {
        glowIntensity = intensity.coerceIn(0f, 1f)
        if (reducedTransparency) glowIntensity *= 0.6f
        invalidate()
    }

    fun setBorderWidth(width: Float) { borderW = width; invalidate() }

    fun setAnimated(anim: Boolean) {
        animated = anim && !reducedMotion
        if (anim && animator == null) startAnimation()
        else if (!anim) {
            animator?.cancel()
            secondaryAnimator?.cancel()
            animator = null
            secondaryAnimator = null
        }
    }

    fun setContentColor(color: Int) { contentColor = color; invalidate() }
    fun setAmbientLight(level: Float) { ambientLight = level.coerceIn(0f, 1f); invalidate() }
    fun setScrollOpacity(opacity: Float) { scrollOpacity = opacity.coerceIn(0f, 1f); invalidate() }

    fun setInteractionState(state: InteractionState) {
        interactionState = state
        when (state) {
            InteractionState.FOCUSED -> animateFocusIn()
            InteractionState.PRESSED -> animatePressIn()
            InteractionState.IDLE -> { animatePressOut(); animateFocusOut() }
            else -> {}
        }
        invalidate()
    }

    // Touch Handling
    override fun onTouchEvent(event: MotionEvent): Boolean {
        when (event.action) {
            MotionEvent.ACTION_DOWN -> {
                interactionState = InteractionState.PRESSED
                touchDownTime = System.currentTimeMillis()
                animatePressIn()
                parent?.requestDisallowInterceptTouchEvent(true)
                return true
            }
            MotionEvent.ACTION_UP -> {
                interactionState = InteractionState.IDLE
                animatePressOut()
                parent?.requestDisallowInterceptTouchEvent(false)
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
                    performHapticFeedback(android.view.HapticFeedbackConstants.CONTEXT_CLICK)
                }
                return true
            }
            MotionEvent.ACTION_CANCEL -> {
                interactionState = InteractionState.IDLE
                animatePressOut()
                parent?.requestDisallowInterceptTouchEvent(false)
                return true
            }
        }
        return super.onTouchEvent(event)
    }

    // Animations
    private fun animatePressIn() {
        if (reducedMotion) { pressScale = 0.96f; invalidate(); return }
        ValueAnimator.ofFloat(1f, 0.94f).apply {
            duration = 180
            interpolator = PathInterpolator(0.34f, 1.56f, 0.64f, 1f)
            addUpdateListener { pressScale = it.animatedValue as Float; invalidate() }
            start()
        }
    }

    private fun animatePressOut() {
        if (reducedMotion) { pressScale = 1f; invalidate(); return }
        ValueAnimator.ofFloat(pressScale, 1.03f, 1f).apply {
            duration = 350
            interpolator = PathInterpolator(0.34f, 1.56f, 0.64f, 1f)
            addUpdateListener { pressScale = it.animatedValue as Float; invalidate() }
            start()
        }
    }

    private fun animateFocusIn() {
        if (reducedMotion) { focusScale = 1.05f; invalidate(); return }
        ValueAnimator.ofFloat(1f, 1.08f).apply {
            duration = 300
            interpolator = PathInterpolator(0.34f, 1.56f, 0.64f, 1f)
            addUpdateListener { focusScale = it.animatedValue as Float; invalidate() }
            start()
        }
    }

    private fun animateFocusOut() {
        if (reducedMotion) { focusScale = 1f; invalidate(); return }
        ValueAnimator.ofFloat(focusScale, 1f).apply {
            duration = 250
            interpolator = AccelerateDecelerateInterpolator()
            addUpdateListener { focusScale = it.animatedValue as Float; invalidate() }
            start()
        }
    }

    private fun startAnimation() {
        animator?.cancel()
        secondaryAnimator?.cancel()

        animator = ValueAnimator.ofFloat(0f, 1f).apply {
            duration = if (reducedMotion) 0 else 6000
            repeatCount = if (reducedMotion) 0 else ValueAnimator.INFINITE
            repeatMode = ValueAnimator.REVERSE
            interpolator = PathInterpolator(0.45f, 0f, 0.55f, 1f)
            addUpdateListener {
                animProgress = it.animatedValue as Float
                val baseGlow = when (interactionState) {
                    InteractionState.PRESSED -> 1.4f
                    InteractionState.FOCUSED -> 1.25f
                    InteractionState.SCROLLING -> 0.75f
                    else -> 1.0f
                }
                glowValue = baseGlow + 0.12f * sin(animProgress * Math.PI * 2).toFloat() * sin(animProgress * Math.PI * 0.5).toFloat()
                wobblePhase = animProgress * Math.PI * 2
                distortionPhase = animProgress * Math.PI * 3
                breathePhase = animProgress * Math.PI
                glowValue *= (0.7f + 0.3f * ambientLight)
                invalidate()
            }
            start()
        }

        secondaryAnimator = ValueAnimator.ofFloat(0f, 1f).apply {
            duration = if (reducedMotion) 0 else 8000
            repeatCount = if (reducedMotion) 0 else ValueAnimator.INFINITE
            repeatMode = ValueAnimator.RESTART
            interpolator = AccelerateDecelerateInterpolator()
            start()
        }
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        animator?.cancel()
        secondaryAnimator?.cancel()
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        if (animated && !reducedMotion && (animator == null || !animator!!.isRunning)) {
            startAnimation()
        }
    }

    private fun getOptimalCornerRadius(): Float {
        val screenDiagonal = Math.sqrt(
            Math.pow(resources.displayMetrics.widthPixels.toDouble(), 2.0) +
            Math.pow(resources.displayMetrics.heightPixels.toDouble(), 2.0)
        )
        val dpDiagonal = (screenDiagonal / density).toFloat()
        return when {
            dpDiagonal > 700f -> min(cornerRad * 1.2f, cornerRad * density * 1.5f)
            dpDiagonal > 500f -> cornerRad * 1.1f
            else -> cornerRad
        }
    }

    // Enhanced Drawing
    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)

        val w = width.toFloat()
        val h = height.toFloat()
        if (w <= 0f || h <= 0f) return

        val cr = getOptimalCornerRadius()
        val bw = borderW * density
        val halfBw = bw / 2f

        val wobbleIntensity = when (interactionState) {
            InteractionState.PRESSED -> 1.5
            InteractionState.FOCUSED -> 2.0
            InteractionState.SCROLLING -> 1.2
            else -> 0.8
        }

        val wobbleX = sin(wobblePhase) * 3.0 * wobbleIntensity
        val wobbleY = cos(wobblePhase * 0.7) * 2.5 * wobbleIntensity
        val distortAmount = (sin(distortionPhase) * 0.015).toFloat()
        val breatheScale = 1f + (sin(breathePhase) * 0.005f)

        val scale = pressScale * focusScale * breatheScale
        val scaledW = w * scale
        val scaledH = h * scale
        val offsetX = (w - scaledW) / 2
        val offsetY = (h - scaledH) / 2

        canvas.save()
        canvas.translate(offsetX, offsetY)

        val path = createPath(scaledW, scaledH, cr, halfBw, wobbleX, wobbleY, distortAmount)

        // Layer 1: Shadow
        drawShadow(canvas, path, bw)

        // Layer 2: Outer Glow
        if (glowIntensity > 0.2f && !reducedTransparency) {
            drawOuterGlow(canvas, path, scaledW, scaledH, bw)
        }

        // Layer 3: Base Tint
        drawBaseTint(canvas, path)

        // Layer 4: Noise
        if (!reducedTransparency) drawNoise(canvas, path, scaledW, scaledH)

        // Layer 5: Inner Highlight
        drawInnerHighlight(canvas, path, scaledW, scaledH, cr)

        // Layer 6: Chromatic Refraction
        if (!reducedTransparency && Color.alpha(contentColor) >= 20) {
            drawChromaticRefraction(canvas, path, scaledW, scaledH)
        }

        // Layer 7: Border
        drawBorder(canvas, path, scaledW, scaledH, bw)

        // Layer 8: Streaks
        if (!reducedTransparency) drawStreaks(canvas, path, scaledW, scaledH)

        // Layer 9: Scroll Edge
        if (scrollOpacity < 1f && !reducedTransparency) drawScrollEdge(canvas, path, scaledW, scaledH)

        // Layer 10: Focus Ring
        if (interactionState == InteractionState.FOCUSED) {
            drawFocusRing(canvas, scaledW, scaledH, cr, bw)
        }

        canvas.restore()
    }

    private fun createPath(sw: Float, sh: Float, cr: Float, hbw: Float, wx: Double, wy: Double, da: Float): Path {
        val path = Path()
        rectL.set(hbw + wx.toFloat(), hbw + wy.toFloat(), sw - hbw + wx.toFloat(), sh - hbw + wy.toFloat())
        val cp1x = rectL.left + cr * (1f + da * 0.3f)
        val cp1y = rectL.top + cr * (1f + da * 0.2f)
        val cp2x = rectL.right - cr * (1f - da * 0.3f)

        path.moveTo(rectL.left + cr, rectL.top)
        path.lineTo(rectL.right - cr, rectL.top)
        path.quadTo(cp2x, cp1y, rectL.right, rectL.top + cr)
        path.lineTo(rectL.right, rectL.bottom - cr)
        path.quadTo(cp2x, rectL.bottom - cr * 0.95f, rectL.right - cr, rectL.bottom)
        path.lineTo(rectL.left + cr, rectL.bottom)
        path.quadTo(cp1x, rectL.bottom - cr * 0.95f, rectL.left, rectL.bottom - cr)
        path.lineTo(rectL.left, rectL.top + cr)
        path.quadTo(cp1x, cp1y, rectL.left + cr, rectL.top)
        path.close()
        return path
    }

    private fun drawShadow(canvas: Canvas, path: Path, bw: Float) {
        val shadowOpacity = (25 * glowValue * ambientLight).toInt().coerceIn(0, 45)
        shadowPaint.apply {
            color = Color.argb(shadowOpacity, 0, 0, 0)
            style = Paint.Style.FILL
            maskFilter = BlurMaskFilter(bw * 10f, BlurMaskFilter.Blur.NORMAL)
        }
        val shadowPath = Path().apply { addPath(path); offset(6f, 12f) }
        canvas.drawPath(shadowPath, shadowPaint)
        shadowPaint.maskFilter = BlurMaskFilter(bw * 20f, BlurMaskFilter.Blur.NORMAL)
        shadowPaint.color = Color.argb((shadowOpacity * 0.5f).toInt(), 0, 0, 0)
        val softPath = Path().apply { addPath(path); offset(2f, 4f) }
        canvas.drawPath(softPath, shadowPaint)
        shadowPaint.maskFilter = null
    }

    private fun drawOuterGlow(canvas: Canvas, path: Path, sw: Float, sh: Float, bw: Float) {
        val gr = Color.red(glowColor)
        val gg = Color.green(glowColor)
        val gb = Color.blue(glowColor)
        val multiplier = when (interactionState) {
            InteractionState.FOCUSED -> 1.6f
            InteractionState.PRESSED -> 1.4f
            else -> 1.0f
        }
        outerGlowPaint.apply {
            style = Paint.Style.FILL
            color = Color.argb((glowIntensity * glowValue * multiplier * 35).toInt().coerceIn(0, 80), gr, gg, gb)
            maskFilter = BlurMaskFilter(bw * (8f * multiplier), BlurMaskFilter.Blur.NORMAL)
        }
        canvas.drawPath(path, outerGlowPaint)
        outerGlowPaint.maskFilter = null
    }

    private fun drawBaseTint(canvas: Canvas, path: Path) {
        val contentBlend = if (Color.alpha(contentColor) < 20) 0f else 0.12f
        val posterBlend = if (Color.alpha(posterDominantColor) < 20) 0f else 0.08f
        var effectiveTint = blendColors(tintColor, contentColor, contentBlend)
        effectiveTint = blendColors(effectiveTint, posterDominantColor, posterBlend)
        val warmTint = Color.argb(Color.alpha(effectiveTint), (Color.red(effectiveTint) * 1.02f).toInt().coerceIn(0, 255), Color.green(effectiveTint), (Color.blue(effectiveTint) * 0.98f).toInt().coerceIn(0, 255))
        val alpha = ((tintOpacity * scrollOpacity * 255).toInt()).coerceIn(0, 255)
        fillPaint.color = Color.argb(if (reducedTransparency) 245 else alpha, Color.red(warmTint), Color.green(warmTint), Color.blue(warmTint))
        canvas.drawPath(path, fillPaint)
    }

    private fun drawNoise(canvas: Canvas, path: Path, sw: Float, sh: Float) {
        noiseBitmap?.let {
            noisePaint.alpha = (15 * scrollOpacity).toInt()
            canvas.Save()
            canvas.clipPath(path)
            canvas.drawBitmap(it, 0f, 0f, noisePaint)
            canvas.restore()
        }
    }

    private fun drawInnerHighlight(canvas: Canvas, path: Path, sw: Float, sh: Float, cr: Float) {
        val multiplier = when (interactionState) {
            InteractionState.FOCUSED -> 1.4f
            InteractionState.PRESSED -> 1.2f
            else -> 1.0f
        }
        val opacity = (35 * glowIntensity * glowValue * ambientLight * multiplier).toInt()
        innerGlowPaint.shader = RadialGradient(sw * 0.25f, sh * 0.15f, min(sw, sh) * 0.75f, intArrayOf(Color.argb(opacity, 255, 255, 255), Color.argb((opacity * 0.4f).toInt(), 255, 255, 248), Color.TRANSPARENT), floatArrayOf(0f, 0.35f, 1f), Shader.TileMode.CLAMP)
        canvas.Save()
        canvas.clipPath(path)
        canvas.drawPaint(innerGlowPaint)
        canvas.restore()
        innerGlowPaint.shader = null
    }

    private fun drawChromaticRefraction(canvas: Canvas, path: Path, sw: Float, sh: Float) {
        val intensity = 0.12f * glowValue
        canvas.Save()
        canvas.clipPath(path)
        canvas.translate(1f, 0f)
        chromaticPaint.color = Color.argb((25 * intensity).toInt(), 255, 100, 100)
        canvas.drawPath(path, chromaticPaint)
        canvas.translate(-2f, 0f)
        chromaticPaint.color = Color.argb((25 * intensity).toInt(), 100, 100, 255)
        canvas.drawPath(path, chromaticPaint)
        canvas.restore()
    }

    private fun drawBorder(canvas: Canvas, path: Path, sw: Float, sh: Float, bw: Float) {
        val gr = Color.red(glowColor)
        val gg = Color.green(glowColor)
        val gb = Color.blue(glowColor)
        val multiplier = when (interactionState) {
            InteractionState.FOCUSED -> 2.0f
            InteractionState.PRESSED -> 1.6f
            else -> 1f
        }
        val alpha = ((glowIntensity * glowValue * multiplier * 200).toInt()).coerceIn(60, 255)
        borderPaint.strokeWidth = bw * when (interactionState) {
            InteractionState.FOCUSED -> 2.5f
            InteractionState.PRESSED -> 2.0f
            else -> 1f
        }
        borderPaint.shader = LinearGradient(0f, 0f, sw, sh, intArrayOf(Color.argb(alpha, gr, gg, gb), Color.argb((alpha * 0.7f).toInt(), (gr * 1.1f).toInt().coerceIn(0, 255), gg, (gb * 1.2f).toInt().coerceIn(0, 255)), Color.argb((alpha * 0.5f).toInt(), gr, (gg * 1.1f).toInt().coerceIn(0, 255), gb), Color.argb((alpha * 0.8f).toInt(), (gr * 1.2f).toInt().coerceIn(0, 255), gg, gb)), floatArrayOf(0f, 0.3f, 0.7f, 1f), Shader.TileMode.CLAMP)
        canvas.drawPath(path, borderPaint)
        borderPaint.shader = null
    }

    private fun drawStreaks(canvas: Canvas, path: Path, sw: Float, sh: Float) {
        val alpha = (20 * glowIntensity * glowValue).toInt()
        if (alpha < 5) return
        streakPaint.color = Color.argb(alpha.coerceIn(0, 40), 255, 255, 255)
        val width = 4f * glowValue
        streakPath.reset()
        streakPath.moveTo(sw * 0.15f, sh * 0.05f)
        streakPath.lineTo(sw * 0.3f, sh * 0.35f)
        streakPath.lineTo(sw * 0.3f + width, sh * 0.35f)
        streakPath.lineTo(sw * 0.15f + width, sh * 0.05f)
        streakPath.close()
        canvas.Save()
        canvas.clipPath(path)
        canvas.drawPath(streakPath, streakPaint)
        streakPaint.color = Color.argb((alpha * 0.5f).toInt().coerceIn(0, 25), 255, 255, 255)
        streakPath.reset()
        streakPath.moveTo(sw * 0.6f, sh * 0.02f)
        streakPath.lineTo(sw * 0.7f, sh * 0.15f)
        streakPath.lineTo(sw * 0.7f + width * 0.7f, sh * 0.15f)
        streakPath.lineTo(sw * 0.6f + width * 0.7f, sh * 0.02f)
        streakPath.close()
        canvas.drawPath(streakPath, streakPaint)
        canvas.restore()
    }

    private fun drawScrollEdge(canvas: Canvas, path: Path, sw: Float, sh: Float) {
        val edgePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.FILL
            color = Color.argb(((1f - scrollOpacity) * 80).toInt().coerceIn(0, 120), 0, 0, 0)
        }
        canvas.Save()
        canvas.clipPath(path)
        canvas.drawRect(0f, 0f, sw, sh, edgePaint)
        canvas.restore()
    }

    private fun drawFocusRing(canvas: Canvas, sw: Float, sh: Float, cr: Float, bw: Float) {
        val padding = 4f * density
        val focusPath = Path().apply { addRoundRect(RectF(-padding, -padding, sw + padding, sh + padding), cr + padding, cr + padding, Path.Direction.CW) }
        val gr = Color.red(glowColor)
        val gg = Color.green(glowColor)
        val gb = Color.blue(glowColor)
        val focusPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeWidth = 3f * density
            color = Color.argb(180, gr, gg, gb)
            maskFilter = BlurMaskFilter(8f * density, BlurMaskFilter.Blur.NORMAL)
        }
        canvas.drawPath(focusPath, focusPaint)
        focusPaint.apply { strokeWidth = 1.5f * density; color = Color.argb(220, 255, 255, 255); maskFilter = BlurMaskFilter(2f * density, BlurMaskFilter.Blur.NORMAL) }
        canvas.drawPath(focusPath, focusPaint)
    }

    private fun blendColors(c1: Int, c2: Int, factor: Float): Int {
        val f = factor.coerceIn(0f, 1f)
        return Color.argb((Color.alpha(c1) + (Color.alpha(c2) - Color.alpha(c1)) * f).toInt(), (Color.red(c1) + (Color.red(c2) - Color.red(c1)) * f).toInt(), (Color.green(c1) + (Color.green(c2) - Color.green(c1)) * f).toInt(), (Color.blue(c1) + (Color.blue(c2) - Color.blue(c1)) * f).toInt())
    }
}
