package com.movieflix.app

import android.animation.ValueAnimator
import android.annotation.SuppressLint
import android.content.Context
import android.graphics.*
import android.os.Build
import android.view.MotionEvent
import android.view.VelocityTracker
import android.view.View
import android.view.animation.AccelerateDecelerateInterpolator
import android.view.animation.OvershootInterpolator
import androidx.annotation.RequiresApi
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.uimanager.events.RCTEventEmitter
import kotlin.math.*

/**
 * LiquidSliderView — Next-Gen High-Fidelity AGSL
 * 
 * Enhancements:
 * 1. Normalized velocity (-1.0 to 1.0) for stable stretch.
 * 2. Symmetric normal sampling for correct lighting.
 * 3. Metaball Merging (Magnetic attraction).
 */
@RequiresApi(Build.VERSION_CODES.TIRAMISU)
class LiquidSliderView(context: Context) : View(context) {

    private var progress = 0.5f
    private var isDragging = false
    
    private val density = resources.displayMetrics.density
    private var thumbRadius = 22f * density
    private var trackHeight = 12f * density
    private var currentThumbX = 0f
    private var currentThumbY = 0f
    private var velocityX = 0f
    
    private var audioAmplitude = 0f
    private var rippleTime = 0f
    private var lastTouchX = -1f
    private var lastTouchY = -1f
    
    // Magnetic / Metaball Merger point
    private var magneticX = -1f
    private var magneticY = -1f
    private var magneticRadius = 0f

    private var trackLeft = 0f
    private var trackRight = 0f
    private var cy = 0f
    private var tintColor = Color.WHITE

    private var lastEmitTime = 0L
    private var velocityTracker: VelocityTracker? = null
    private var rippleAnimator: ValueAnimator? = null
    private var tensionAnimator: ValueAnimator? = null
    private var thumbAnimator: ValueAnimator? = null

    private val liquidShaderSource = """
        uniform float2 size;
        uniform float2 thumbPos;
        uniform float thumbRadius;
        uniform float2 trackRange;
        uniform float trackHeight;
        uniform float tension;
        uniform float velocity;
        uniform float audioAmplitude;
        uniform float2 lastTouch;
        uniform float rippleTime;
        uniform float2 magneticPos;
        uniform float magneticRadius;
        uniform float4 thumbColor;

        float smin(float a, float b, float k) {
            float h = max(k - abs(a - b), 0.0) / k;
            return min(a, b) - h * h * k * 0.25;
        }

        float sdEllipse(float2 p, float2 r) {
            float k0 = length(p/r);
            float k1 = length(p/(r*r));
            return k0*(k0-1.0)/k1;
        }

        float sdLine(float2 p, float2 a, float2 b, float r) {
            float2 pa = p - a, ba = b - a;
            float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
            return length(pa - ba * h) - r;
        }

        float getDist(float2 p, float2 thumbPos, float2 ellipseRadii, float2 trackStart, float2 trackEnd, float k) {
            float dTrack = sdLine(p, trackStart, trackEnd, (trackHeight + audioAmplitude * 3.0) * 0.5);
            float dThumb = sdEllipse(p - thumbPos, ellipseRadii);
            float d = smin(dTrack, dThumb, k);
            
            // Magnetic Merger (Metaball bridge)
            if (magneticRadius > 0.0) {
                float dMag = length(p - magneticPos) - magneticRadius;
                d = smin(d, dMag, k * 1.5);
            }
            return d;
        }

        half4 main(float2 coord) {
            float2 p = coord;
            float centerY = size.y * 0.5;
            float2 trackStart = float2(trackRange.x, centerY);
            float2 trackEnd = float2(trackRange.y, centerY);
            
            float stretch = clamp(abs(velocity) * 0.4, 0.0, 0.5);
            float2 ellipseRadii = float2(thumbRadius * (1.0 + stretch), thumbRadius * (1.0 - stretch * 0.4));
            
            float k = tension;
            float d = getDist(p, thumbPos, ellipseRadii, trackStart, trackEnd, k);
            
            // Interaction Ripples
            float distToFinger = length(p - lastTouch);
            float ripple = sin(distToFinger * 0.15 - rippleTime * 15.0) * exp(-rippleTime * 3.0) * 4.0;
            d += (ripple * step(distToFinger, 150.0));

            if (d > 1.0) return half4(0.0);
            
            // Symmetric Normal Calculation
            float eps = 0.5;
            float dx = getDist(p + float2(eps,0), thumbPos, ellipseRadii, trackStart, trackEnd, k) -
                       getDist(p - float2(eps,0), thumbPos, ellipseRadii, trackStart, trackEnd, k);
            float dy = getDist(p + float2(0,eps), thumbPos, ellipseRadii, trackStart, trackEnd, k) -
                       getDist(p - float2(0,eps), thumbPos, ellipseRadii, trackStart, trackEnd, k);
            float2 n = normalize(float2(dx, dy));
            
            float3 lightDir = normalize(float3(-0.5, -0.8, 1.0));
            float spec = pow(max(dot(float3(n, 1.0), lightDir), 0.0), 40.0);
            float rim = smoothstep(-2.0, 0.0, d);
            
            half4 finalColor = thumbColor;
            finalColor.rgb += half3(spec * 0.5 + rim * 0.3);
            return finalColor * smoothstep(1.0, 0.0, d);
        }
    """

    private var liquidShader: RuntimeShader? = null
    private val shaderPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private var surfaceTension = 35f

    init {
        setLayerType(LAYER_TYPE_HARDWARE, null)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            liquidShader = RuntimeShader(liquidShaderSource)
            shaderPaint.shader = liquidShader
        }
    }

    fun setAudioAmplitude(amplitude: Float) { audioAmplitude = amplitude; invalidate() }
    fun setProgress(value: Float) { if (!isDragging) { this.progress = value.coerceIn(0f, 1f); invalidate() } }
    fun setTintColor(color: Int) { this.tintColor = color; invalidate() }
    
    fun setMagneticPoint(x: Float, y: Float, radius: Float) {
        magneticX = x; magneticY = y; magneticRadius = radius
        invalidate()
    }

    private fun updateStaticUniforms() {
        val w = width.toFloat()
        val h = height.toFloat()
        if (w <= 0f || h <= 0f) return
        liquidShader?.let {
            it.setFloatUniform("size", w, h)
            it.setFloatUniform("trackRange", trackLeft, trackRight)
            it.setFloatUniform("trackHeight", trackHeight)
            it.setFloatUniform("thumbRadius", thumbRadius)
        }
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        if (w > 0 && h > 0) {
            trackLeft = thumbRadius + 15f * density
            trackRight = w - thumbRadius - 15f * density
            cy = h / 2f
            currentThumbX = trackLeft + progress * (trackRight - trackLeft)
            currentThumbY = cy
            updateStaticUniforms()
        }
    }

    override fun onDraw(canvas: Canvas) {
        if (liquidShader == null) return
        if (!isDragging && thumbAnimator?.isRunning != true) {
             currentThumbX = trackLeft + progress * (trackRight - trackLeft)
             currentThumbY = cy
             velocityX = 0f
        }
        liquidShader?.let { shader ->
            shader.setFloatUniform("thumbPos", currentThumbX, currentThumbY)
            shader.setFloatUniform("tension", surfaceTension)
            shader.setFloatUniform("velocity", velocityX)
            shader.setFloatUniform("audioAmplitude", audioAmplitude)
            shader.setFloatUniform("lastTouch", lastTouchX, lastTouchY)
            shader.setFloatUniform("rippleTime", rippleTime)
            shader.setFloatUniform("magneticPos", magneticX, magneticY)
            shader.setFloatUniform("magneticRadius", magneticRadius)
            shader.setColorUniform("thumbColor", tintColor)
        }
        canvas.drawRect(0f, 0f, width.toFloat(), height.toFloat(), shaderPaint)
    }

    @SuppressLint("ClickableViewAccessibility")
    override fun onTouchEvent(event: MotionEvent): Boolean {
        when (event.action) {
            MotionEvent.ACTION_DOWN -> {
                parent?.requestDisallowInterceptTouchEvent(true)
                isDragging = true
                lastTouchX = event.x; lastTouchY = event.y
                startRippleAnimation()
                velocityTracker = VelocityTracker.obtain()
                velocityTracker?.addMovement(event)
                animateTension(55f)
                handleTouch(event)
            }
            MotionEvent.ACTION_MOVE -> {
                if (isDragging) {
                    velocityTracker?.addMovement(event)
                    velocityTracker?.computeCurrentVelocity(1000)
                    // Normalize velocity by 3000px/s
                    velocityX = (velocityTracker?.xVelocity ?: 0f) / 3000f
                    lastTouchX = event.x; lastTouchY = event.y
                    handleTouch(event)
                    throttleEmit(progress)
                }
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                parent?.requestDisallowInterceptTouchEvent(false)
                isDragging = false
                animateTension(35f)
                velocityX = 0f
                velocityTracker?.recycle(); velocityTracker = null
                thumbAnimator = ValueAnimator.ofFloat(currentThumbY, cy).apply {
                    duration = 500; interpolator = OvershootInterpolator(2.0f)
                    addUpdateListener { currentThumbY = it.animatedValue as Float; invalidate() }
                    start()
                }
                emitOnSlidingComplete(progress)
            }
        }
        return true
    }

    private fun startRippleAnimation() {
        rippleTime = 0f
        rippleAnimator?.cancel()
        rippleAnimator = ValueAnimator.ofFloat(0f, 5f).apply {
            duration = 1200; interpolator = AccelerateDecelerateInterpolator()
            addUpdateListener { rippleTime = it.animatedValue as Float; invalidate() }
            start()
        }
    }

    private fun handleTouch(event: MotionEvent) {
        currentThumbX = event.x.coerceIn(trackLeft, trackRight)
        currentThumbY = event.y.coerceIn(cy - thumbRadius * 2.5f, cy + thumbRadius * 2.5f)
        progress = (currentThumbX - trackLeft) / (trackRight - trackLeft)
        invalidate()
    }

    private fun throttleEmit(value: Float) {
        val now = System.currentTimeMillis()
        if (now - lastEmitTime > 16) { emitOnValueChange(value); lastEmitTime = now }
    }

    private fun animateTension(target: Float) {
        tensionAnimator?.cancel()
        tensionAnimator = ValueAnimator.ofFloat(surfaceTension, target).apply {
            duration = 250
            addUpdateListener { surfaceTension = it.animatedValue as Float; invalidate() }
            start()
        }
    }

    override fun onDetachedFromWindow() {
        thumbAnimator?.cancel(); tensionAnimator?.cancel(); rippleAnimator?.cancel()
        velocityTracker?.recycle(); velocityTracker = null
        super.onDetachedFromWindow()
    }

    private fun emitOnValueChange(value: Float) {
        (context as? ReactContext)?.getJSModule(RCTEventEmitter::class.java)?.receiveEvent(id, "onValueChange", Arguments.createMap().apply { putDouble("value", value.toDouble()) })
    }

    private fun emitOnSlidingComplete(value: Float) {
        (context as? ReactContext)?.getJSModule(RCTEventEmitter::class.java)?.receiveEvent(id, "onSlidingComplete", Arguments.createMap().apply { putDouble("value", value.toDouble()) })
    }
}
