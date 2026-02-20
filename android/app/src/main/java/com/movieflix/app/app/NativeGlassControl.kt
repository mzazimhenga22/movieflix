package com.movieflix.app.app

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
    private val path = Path()
    private val rectF = RectF()

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

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        paint.color = iconColor
        paint.style = Paint.Style.FILL

        val w = width.toFloat()
        val h = height.toFloat()
        val cx = w / 2
        val cy = h / 2
        
        // Use 45% of min dimension as base size
        val size = Math.min(w, h) * 0.45f

        path.reset()

        when (iconName) {
            "play" -> {
                // Triangle
                val halfH = size * 0.5f // half height of triangle
                val halfW = size * 0.4f // half width
                // Offset to center visually
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
                // Circular Arrow CW
                paint.style = Paint.Style.STROKE
                paint.strokeWidth = size * 0.12f
                paint.strokeCap = Paint.Cap.ROUND
                
                val r = size * 0.7f
                rectF.set(cx - r, cy - r, cx + r, cy + r)
                // Draw arc from top (-90) for 270 degrees
                canvas.drawArc(rectF, -80f, 260f, false, paint)
                
                // Arrow head
                paint.style = Paint.Style.FILL
                val arrowSize = size * 0.35f
                // Position near top (approx cx, cy - r)
                // Need to match end of arc or start? 
                // Usually "Forward" implies CW motion. 
                // Let's put arrow at the END of the arc (bottom-right ish? or top?)
                // Standard "10s" icon: arrow at top, circling CW.
                
                // Simplified: Draw arrow at 12 o'clock, pointing right
                path.moveTo(cx, cy - r - arrowSize/2)
                path.lineTo(cx + arrowSize, cy - r)
                path.lineTo(cx, cy - r + arrowSize/2)
                path.close()
                canvas.drawPath(path, paint)
                
                // Text 10
                textPaint.textSize = size * 0.6f
                // Adjust text y to center
                val textY = cy - (textPaint.descent() + textPaint.ascent()) / 2
                canvas.drawText("10", cx, textY, textPaint)
            }
            "play-back", "replay-10", "seek-back" -> {
                // Circular Arrow CCW
                paint.style = Paint.Style.STROKE
                paint.strokeWidth = size * 0.12f
                paint.strokeCap = Paint.Cap.ROUND
                
                val r = size * 0.7f
                rectF.set(cx - r, cy - r, cx + r, cy + r)
                // Start -100, sweep -260
                canvas.drawArc(rectF, -100f, -260f, false, paint)
                
                // Arrow head
                paint.style = Paint.Style.FILL
                val arrowSize = size * 0.35f
                
                path.moveTo(cx, cy - r - arrowSize/2)
                path.lineTo(cx - arrowSize, cy - r)
                path.lineTo(cx, cy - r + arrowSize/2)
                path.close()
                canvas.drawPath(path, paint)
                
                // Text 10
                textPaint.textSize = size * 0.6f
                 val textY = cy - (textPaint.descent() + textPaint.ascent()) / 2
                canvas.drawText("10", cx, textY, textPaint)
            }
        }
    }
}
