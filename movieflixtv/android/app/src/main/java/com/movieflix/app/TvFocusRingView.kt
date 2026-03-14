package com.movieflix.app

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.view.View

class TvFocusRingView(context: Context) : View(context) {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val rect = RectF()
    private var cornerRadius = 16f

    init {
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = 4f * context.resources.displayMetrics.density
        paint.color = Color.WHITE
        setWillNotDraw(false)
        isClickable = false
        isFocusable = false
        importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO
    }

    fun setColor(color: Int) {
        paint.color = color
        invalidate()
    }

    fun setCornerRadius(radius: Float) {
        cornerRadius = radius
        invalidate()
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        rect.set(
            paint.strokeWidth,
            paint.strokeWidth,
            width - paint.strokeWidth,
            height - paint.strokeWidth
        )
        canvas.drawRoundRect(rect, cornerRadius, cornerRadius, paint)
    }
}
