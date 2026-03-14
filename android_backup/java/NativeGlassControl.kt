package com.movieflix.app

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.view.View
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.uimanager.events.RCTEventEmitter

class NativeGlassControl(context: Context) : View(context) {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val textPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private var iconName = "play"
    private var iconColor = Color.WHITE
    private var showGlassBg = false
    private var glassColor = Color.parseColor("#1A1A2E")
    private var glassGlowColor = Color.parseColor("#FF9500")
    
    private val path = Path()
    private val rectF = RectF()
    private val bgPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val borderPaint = Paint(Paint.ANTI_ALIAS_FLAG)

    init {
        // Enable circular clipping so borderRadius from RN styles is respected
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.LOLLIPOP) {
            clipToOutline = true
            outlineProvider = object : android.view.ViewOutlineProvider() {
                override fun getOutline(view: View, outline: android.graphics.Outline) {
                    // Use the smaller dimension to create a circle
                    val size = Math.min(view.width, view.height)
                    val left = (view.width - size) / 2
                    val top = (view.height - size) / 2
                    outline.setOval(left, top, left + size, top + size)
                }
            }
        }
        
        // Native ripple effect via foreground (allows background color to be set by RN)
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
            val attrs = intArrayOf(android.R.attr.selectableItemBackgroundBorderless)
            val typedArray = context.obtainStyledAttributes(attrs)
            val ripple = typedArray.getDrawable(0)
            foreground = ripple
            typedArray.recycle()
        } else {
             // Fallback for older android
             val attrs = intArrayOf(android.R.attr.selectableItemBackgroundBorderless)
             val typedArray = context.obtainStyledAttributes(attrs)
             val backgroundResource = typedArray.getResourceId(0, 0)
             setBackgroundResource(backgroundResource)
             typedArray.recycle()
        }

        isClickable = true
        isFocusable = true
        
        textPaint.color = Color.WHITE
        textPaint.textAlign = Paint.Align.CENTER
        textPaint.typeface = android.graphics.Typeface.DEFAULT_BOLD
        
        // Ensure onPress works (guard the context cast in case view is ever created outside RN)
        setOnClickListener {
            val reactContext = if (context is ReactContext) context as ReactContext else null
            try {
                reactContext?.getJSModule(RCTEventEmitter::class.java)?.receiveEvent(id, "onPress", Arguments.createMap())
            } catch (_: Exception) {
                // Ignore if event cannot be delivered
            }
        }
    }

    fun setIconName(name: String) {
        this.iconName = name
        invalidate()
    }
    
    fun setShowGlassBackground(show: Boolean) {
        this.showGlassBg = show
        invalidate()
    }
    
    fun setGlassColor(color: Int) {
        this.glassColor = color
        invalidate()
    }
    
    fun setGlassGlowColor(color: Int) {
        this.glassGlowColor = color
        invalidate()
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        paint.color = iconColor
        paint.style = Paint.Style.FILL

        val w = width.toFloat()
        val h = height.toFloat()
        val cx = w / 2
        val cy = h / 2
        
        val radius = Math.min(w, h) / 2f

        if (showGlassBg) {
            // Draw frosted glass circle background
            bgPaint.style = Paint.Style.FILL
            bgPaint.shader = android.graphics.RadialGradient(
                cx, cy, radius,
                intArrayOf(Color.argb(160, Color.red(glassColor), Color.green(glassColor), Color.blue(glassColor)), 
                           Color.argb(200, Color.red(glassColor) / 2, Color.green(glassColor) / 2, Color.blue(glassColor) / 2)),
                floatArrayOf(0f, 1f),
                android.graphics.Shader.TileMode.CLAMP
            )
            canvas.drawCircle(cx, cy, radius, bgPaint)
            bgPaint.shader = null

            // Subtle warm light center
            bgPaint.shader = android.graphics.RadialGradient(
                cx - radius * 0.3f, cy - radius * 0.3f, radius * 1.5f,
                intArrayOf(Color.argb(40, Color.red(glassGlowColor), Color.green(glassGlowColor), Color.blue(glassGlowColor)), Color.TRANSPARENT),
                floatArrayOf(0f, 1f),
                android.graphics.Shader.TileMode.CLAMP
            )
            canvas.drawCircle(cx, cy, radius, bgPaint)
            bgPaint.shader = null

            // Glass border
            borderPaint.style = Paint.Style.STROKE
            borderPaint.strokeWidth = 1f * context.resources.displayMetrics.density
            borderPaint.shader = android.graphics.LinearGradient(
                0f, 0f, w, h,
                intArrayOf(Color.argb(100, 255, 255, 255), Color.TRANSPARENT, Color.argb(120, Color.red(glassGlowColor), Color.green(glassGlowColor), Color.blue(glassGlowColor))),
                floatArrayOf(0f, 0.5f, 1f),
                android.graphics.Shader.TileMode.CLAMP
            )
            canvas.drawCircle(cx, cy, radius - borderPaint.strokeWidth / 2f, borderPaint)
            borderPaint.shader = null
        }
        
        // Use 45% of min dimension as base size for the icon itself
        val size = Math.min(w, h) * 0.45f

        path.reset()

        when (iconName) {
            "play" -> {
                val halfH = size * 0.5f
                val halfW = size * 0.4f
                val offsetX = size * 0.1f
                path.moveTo(cx - halfW + offsetX, cy - halfH)
                path.lineTo(cx + halfW + offsetX, cy)
                path.lineTo(cx - halfW + offsetX, cy + halfH)
                path.close()
                canvas.drawPath(path, paint)
            }
            "pause" -> {
                val barW = size * 0.25f
                val barH = size * 0.9f
                val gap = size * 0.25f
                canvas.drawRect(cx - gap/2 - barW, cy - barH/2, cx - gap/2, cy + barH/2, paint)
                canvas.drawRect(cx + gap/2, cy - barH/2, cx + gap/2 + barW, cy + barH/2, paint)
            }
            "play-forward", "forward-10", "seek-forward" -> {
                paint.style = Paint.Style.STROKE
                paint.strokeWidth = size * 0.12f
                paint.strokeCap = Paint.Cap.ROUND
                val r = size * 0.7f
                rectF.set(cx - r, cy - r, cx + r, cy + r)
                canvas.drawArc(rectF, -80f, 260f, false, paint)
                paint.style = Paint.Style.FILL
                val arrowSize = size * 0.35f
                path.moveTo(cx, cy - r - arrowSize/2)
                path.lineTo(cx + arrowSize, cy - r)
                path.lineTo(cx, cy - r + arrowSize/2)
                path.close()
                canvas.drawPath(path, paint)
                textPaint.textSize = size * 0.6f
                val textY = cy - (textPaint.descent() + textPaint.ascent()) / 2
                canvas.drawText("10", cx, textY, textPaint)
            }
            "play-back", "replay-10", "seek-back" -> {
                paint.style = Paint.Style.STROKE
                paint.strokeWidth = size * 0.12f
                paint.strokeCap = Paint.Cap.ROUND
                val r = size * 0.7f
                rectF.set(cx - r, cy - r, cx + r, cy + r)
                canvas.drawArc(rectF, -100f, -260f, false, paint)
                paint.style = Paint.Style.FILL
                val arrowSize = size * 0.35f
                path.moveTo(cx, cy - r - arrowSize/2)
                path.lineTo(cx - arrowSize, cy - r)
                path.lineTo(cx, cy - r + arrowSize/2)
                path.close()
                canvas.drawPath(path, paint)
                textPaint.textSize = size * 0.6f
                val textY = cy - (textPaint.descent() + textPaint.ascent()) / 2
                canvas.drawText("10", cx, textY, textPaint)
            }
            "download" -> {
                // Downward arrow with base line
                paint.style = Paint.Style.STROKE
                paint.strokeWidth = size * 0.14f
                paint.strokeCap = Paint.Cap.ROUND
                // Vertical line
                canvas.drawLine(cx, cy - size * 0.45f, cx, cy + size * 0.15f, paint)
                // Arrow head
                canvas.drawLine(cx, cy + size * 0.15f, cx - size * 0.3f, cy - size * 0.15f, paint)
                canvas.drawLine(cx, cy + size * 0.15f, cx + size * 0.3f, cy - size * 0.15f, paint)
                // Base line
                canvas.drawLine(cx - size * 0.4f, cy + size * 0.45f, cx + size * 0.4f, cy + size * 0.45f, paint)
            }
            "share" -> {
                // Share/export arrow (upward arrow with box)
                paint.style = Paint.Style.STROKE
                paint.strokeWidth = size * 0.12f
                paint.strokeCap = Paint.Cap.ROUND
                paint.strokeJoin = Paint.Join.ROUND
                // Upward arrow
                canvas.drawLine(cx, cy + size * 0.2f, cx, cy - size * 0.4f, paint)
                canvas.drawLine(cx, cy - size * 0.4f, cx - size * 0.25f, cy - size * 0.15f, paint)
                canvas.drawLine(cx, cy - size * 0.4f, cx + size * 0.25f, cy - size * 0.15f, paint)
                // Box bottom
                path.moveTo(cx - size * 0.4f, cy - size * 0.1f)
                path.lineTo(cx - size * 0.4f, cy + size * 0.45f)
                path.lineTo(cx + size * 0.4f, cy + size * 0.45f)
                path.lineTo(cx + size * 0.4f, cy - size * 0.1f)
                canvas.drawPath(path, paint)
            }
            "info" -> {
                // Circle with i
                paint.style = Paint.Style.STROKE
                paint.strokeWidth = size * 0.1f
                val r = size * 0.7f
                canvas.drawCircle(cx, cy, r, paint)
                // Dot
                paint.style = Paint.Style.FILL
                canvas.drawCircle(cx, cy - size * 0.3f, size * 0.09f, paint)
                // Line
                paint.style = Paint.Style.STROKE
                paint.strokeWidth = size * 0.12f
                paint.strokeCap = Paint.Cap.ROUND
                canvas.drawLine(cx, cy - size * 0.1f, cx, cy + size * 0.35f, paint)
            }
            "plus" -> {
                // Plus sign
                paint.style = Paint.Style.STROKE
                paint.strokeWidth = size * 0.14f
                paint.strokeCap = Paint.Cap.ROUND
                val lineLen = size * 0.6f
                canvas.drawLine(cx - lineLen/2, cy, cx + lineLen/2, cy, paint)
                canvas.drawLine(cx, cy - lineLen/2, cx, cy + lineLen/2, paint)
            }
            "home" -> {
                // House shape
                paint.style = Paint.Style.STROKE
                paint.strokeWidth = size * 0.12f
                paint.strokeCap = Paint.Cap.ROUND
                paint.strokeJoin = Paint.Join.ROUND
                // Roof
                path.moveTo(cx - size * 0.5f, cy)
                path.lineTo(cx, cy - size * 0.5f)
                path.lineTo(cx + size * 0.5f, cy)
                canvas.drawPath(path, paint)
                // Walls
                path.reset()
                path.moveTo(cx - size * 0.4f, cy)
                path.lineTo(cx - size * 0.4f, cy + size * 0.45f)
                path.lineTo(cx + size * 0.4f, cy + size * 0.45f)
                path.lineTo(cx + size * 0.4f, cy)
                canvas.drawPath(path, paint)
            }
            "search" -> {
                // Magnifying glass
                paint.style = Paint.Style.STROKE
                paint.strokeWidth = size * 0.12f
                paint.strokeCap = Paint.Cap.ROUND
                val r = size * 0.4f
                canvas.drawCircle(cx - size * 0.1f, cy - size * 0.1f, r, paint)
                // Handle
                val hx = cx - size * 0.1f + r * 0.707f
                val hy = cy - size * 0.1f + r * 0.707f
                canvas.drawLine(hx, hy, hx + size * 0.3f, hy + size * 0.3f, paint)
            }
            "music" -> {
                // Music note
                paint.style = Paint.Style.FILL
                // Note head (oval)
                rectF.set(cx - size * 0.35f, cy + size * 0.1f, cx + size * 0.05f, cy + size * 0.45f)
                canvas.drawOval(rectF, paint)
                // Stem
                paint.style = Paint.Style.STROKE
                paint.strokeWidth = size * 0.1f
                canvas.drawLine(cx + size * 0.05f, cy + size * 0.28f, cx + size * 0.05f, cy - size * 0.45f, paint)
                // Flag
                paint.style = Paint.Style.FILL
                path.moveTo(cx + size * 0.05f, cy - size * 0.45f)
                path.quadTo(cx + size * 0.4f, cy - size * 0.35f, cx + size * 0.15f, cy - size * 0.1f)
                path.lineTo(cx + size * 0.05f, cy - size * 0.15f)
                path.close()
                canvas.drawPath(path, paint)
            }
            "heart" -> {
                // Heart shape
                paint.style = Paint.Style.FILL
                path.moveTo(cx, cy + size * 0.35f)
                // Left curve
                path.cubicTo(cx - size * 0.7f, cy - size * 0.1f, cx - size * 0.55f, cy - size * 0.55f, cx, cy - size * 0.2f)
                // Right curve
                path.cubicTo(cx + size * 0.55f, cy - size * 0.55f, cx + size * 0.7f, cy - size * 0.1f, cx, cy + size * 0.35f)
                path.close()
                canvas.drawPath(path, paint)
            }
            "grid" -> {
                // 4-square grid
                paint.style = Paint.Style.FILL
                val boxSize = size * 0.35f
                val gap = size * 0.12f
                // Top-left
                rectF.set(cx - gap/2 - boxSize, cy - gap/2 - boxSize, cx - gap/2, cy - gap/2)
                canvas.drawRoundRect(rectF, boxSize * 0.2f, boxSize * 0.2f, paint)
                // Top-right
                rectF.set(cx + gap/2, cy - gap/2 - boxSize, cx + gap/2 + boxSize, cy - gap/2)
                canvas.drawRoundRect(rectF, boxSize * 0.2f, boxSize * 0.2f, paint)
                // Bottom-left
                rectF.set(cx - gap/2 - boxSize, cy + gap/2, cx - gap/2, cy + gap/2 + boxSize)
                canvas.drawRoundRect(rectF, boxSize * 0.2f, boxSize * 0.2f, paint)
                // Bottom-right
                rectF.set(cx + gap/2, cy + gap/2, cx + gap/2 + boxSize, cy + gap/2 + boxSize)
                canvas.drawRoundRect(rectF, boxSize * 0.2f, boxSize * 0.2f, paint)
            }
            "close" -> {
                // X mark
                paint.style = Paint.Style.STROKE
                paint.strokeWidth = size * 0.14f
                paint.strokeCap = Paint.Cap.ROUND
                val d = size * 0.4f
                canvas.drawLine(cx - d, cy - d, cx + d, cy + d, paint)
                canvas.drawLine(cx + d, cy - d, cx - d, cy + d, paint)
            }
        }
    }
}
