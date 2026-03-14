package com.movieflix.app

import android.content.Context
import android.content.res.Configuration
import android.graphics.*
import android.os.Build
import android.util.AttributeSet
import android.view.View
import androidx.annotation.RequiresApi

@RequiresApi(Build.VERSION_CODES.S)
class LiquidGlassView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null
) : View(context, attrs) {

    private var cornerRadius = 40f
    private var tintOpacity = 0.22f
    private var borderOpacity = 0.3f

    private val backgroundPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val borderPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val highlightPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val noisePaint = Paint(Paint.ANTI_ALIAS_FLAG.or(Paint.FILTER_BITMAP_FLAG))
    private val shadowPaint = Paint(Paint.ANTI_ALIAS_FLAG)

    init {
        // Hardware acceleration required for RenderEffect and shaders
        setLayerType(LAYER_TYPE_HARDWARE, null)
        
        setBackgroundBlurRadius(80)

        borderPaint.style = Paint.Style.STROKE
        borderPaint.strokeWidth = 1f * resources.displayMetrics.density

        highlightPaint.style = Paint.Style.FILL

        // Subtle Depth Shadow (Apple Trick)
        shadowPaint.color = Color.argb(12, 0, 0, 0)
        shadowPaint.maskFilter = BlurMaskFilter(30f, BlurMaskFilter.Blur.NORMAL)

        updateColors()
        
        // Optimized micro-grain noise tile
        val noiseTile = generateNoiseTile(100, 100)
        noisePaint.shader = BitmapShader(noiseTile, Shader.TileMode.REPEAT, Shader.TileMode.REPEAT)
    }

    private fun isDarkMode(): Boolean {
        return (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
    }

    private fun updateColors() {
        val dark = isDarkMode()
        
        // Adaptive base opacities
        val baseBgAlpha = if (dark) 35 else 55
        val baseBorderAlpha = if (dark) 25 else 45

        // Scale by React Native opacities if provided (defaults expected to be 0.22 and 0.3)
        val tintScale = tintOpacity / 0.22f
        val borderScale = borderOpacity / 0.3f
        
        val finalBgAlpha = (baseBgAlpha * tintScale).toInt().coerceIn(0, 255)
        val finalBorderAlpha = (baseBorderAlpha * borderScale).toInt().coerceIn(0, 255)

        backgroundPaint.color = Color.argb(finalBgAlpha, 255, 255, 255)
        borderPaint.color = Color.argb(finalBorderAlpha, 255, 255, 255)
    }

    override fun onConfigurationChanged(newConfig: Configuration?) {
        super.onConfigurationChanged(newConfig)
        updateColors()
        invalidate()
    }

    fun setCornerRadius(radius: Float) {
        cornerRadius = radius * resources.displayMetrics.density
        invalidate()
    }

    fun setTintOpacity(opacity: Float) {
        tintOpacity = opacity
        updateColors()
        invalidate()
    }

    fun setBlurRadius(radius: Int) {
        setBackgroundBlurRadius(radius)
    }

    fun setBorderOpacity(opacity: Float) {
        borderOpacity = opacity
        updateColors()
        invalidate()
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        if (w > 0 && h > 0) {
            // Diagonal highlight mimicking soft top-left ambient light
            highlightPaint.shader = LinearGradient(
                -w * 0.2f, 0f,
                w.toFloat(), h * 0.6f,
                intArrayOf(
                    Color.argb(70, 255, 255, 255),
                    Color.argb(20, 255, 255, 255),
                    Color.TRANSPARENT
                ),
                floatArrayOf(0f, 0.4f, 1f),
                Shader.TileMode.CLAMP
            )
        }
    }

    private fun generateNoiseTile(w: Int, h: Int): Bitmap {
        val bitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val pixels = IntArray(w * h)
        for (i in pixels.indices) {
            // Soft organic micro-grain
            val noise = (Math.random() * 40 + 100).toInt()
            pixels[i] = Color.argb(8, noise, noise, noise)
        }
        bitmap.setPixels(pixels, 0, w, 0, 0, w, h)
        return bitmap
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)

        val w = width.toFloat()
        val h = height.toFloat()
        if (w <= 0f || h <= 0f) return

        val rect = RectF(0f, 0f, w, h)
        val path = Path().apply {
            addRoundRect(rect, cornerRadius, cornerRadius, Path.Direction.CW)
        }

        // Ambient depth shadow drawn globally BEFORE clipping
        canvas.drawRoundRect(
            RectF(4f, 4f, w - 4f, h - 4f),
            cornerRadius,
            cornerRadius,
            shadowPaint
        )

        // Clip constraints for all glass layers
        canvas.save()
        canvas.clipPath(path)

        // 1. Frosted Translucent Tint
        canvas.drawRoundRect(rect, cornerRadius, cornerRadius, backgroundPaint)

        // 2. Secret Sauce: Diagonal Highlight
        canvas.drawRect(rect, highlightPaint)

        // 3. Tiled Perlin-style Grain Overlay
        canvas.drawRect(rect, noisePaint)

        canvas.restore()

        // Soft Edge Lighting (1px white border) drawn outside the clip 
        // to render full strokeWidth rather than half
        canvas.drawRoundRect(rect, cornerRadius, cornerRadius, borderPaint)
    }

    // Real Native Press Physics
    override fun setPressed(pressed: Boolean) {
        super.setPressed(pressed)
        animate()
            .scaleX(if (pressed) 0.97f else 1f)
            .scaleY(if (pressed) 0.97f else 1f)
            .alpha(if (pressed) 0.92f else 1f)
            .setDuration(120)
            .start()
    }
}