package com.example.voiceapp3

import android.animation.AnimatorSet
import android.animation.ObjectAnimator
import android.animation.ValueAnimator
import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.view.animation.AccelerateDecelerateInterpolator
import android.view.animation.LinearInterpolator
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.localbroadcastmanager.content.LocalBroadcastManager

/**
 * Окно «Слушаю» — стеклянная плашка сверху.
 * Обычный Activity + Theme.Translucent: AppCompat сюда не подмешиваем,
 * иначе появится непрозрачный фон. Цвета берём из AppTheme.isLight().
 */
class OverlayActivity : Activity() {

    private lateinit var statusText: TextView
    private lateinit var localBroadcastManager: LocalBroadcastManager
    private lateinit var root: View
    private lateinit var pal: Palette

    private val running = mutableListOf<android.animation.Animator>()
    private val barAnimators = mutableListOf<ValueAnimator>()

    private val autoCloseHandler = Handler(Looper.getMainLooper())
    private val autoClose = Runnable {
        Log.w(TAG, "Автозакрытие: сервис не прислал команду скрыть")
        finish()
    }

    private val updateReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            when (intent?.action) {
                ACTION_OVERLAY_UPDATE -> {
                    val text = intent.getStringExtra(EXTRA_TEXT).orEmpty()
                    if (text.isNotBlank()) {
                        statusText.animate().alpha(0.4f).setDuration(80).withEndAction {
                            statusText.text = text
                            statusText.animate().alpha(1f).setDuration(120).start()
                        }.start()
                        restartAutoClose()
                    }
                }
                ACTION_OVERLAY_HIDE -> finish()
            }
        }
    }

    private class Palette(
        val islandStart: Int,
        val islandEnd: Int,
        val islandStroke: Int,
        val status: Int,
        val live: Int,
        val bar: Int,
        val textShadow: Int
    )

    companion object {
        private const val TAG = "OverlayActivity"
        const val ACTION_OVERLAY_UPDATE = "com.example.voiceapp3.OVERLAY_UPDATE"
        const val ACTION_OVERLAY_HIDE = "com.example.voiceapp3.OVERLAY_HIDE"
        const val EXTRA_TEXT = "text"
        private const val AUTO_CLOSE_MS = 15_000L
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        pal = if (AppTheme.isLight(this)) lightPalette() else darkPalette()

        // Не вызываем AppTheme.applySaved: смена night mode перекрашивает
        // полосу ГУ в чёрный. Тема Translucent, статусбар прозрачный.
        window.setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
        window.setDimAmount(0f)
        window.statusBarColor = Color.TRANSPARENT
        window.navigationBarColor = Color.TRANSPARENT
        window.addFlags(
            WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
                    WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                    WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                    WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
                    WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS or
                    WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
                    WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS
        )
        window.clearFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND)
        window.decorView.systemUiVisibility = (
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE or
                        View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
                        if (AppTheme.isLight(this)) View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR else 0
                )
        window.attributes = window.attributes.apply {
            gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
            width = WindowManager.LayoutParams.MATCH_PARENT
            height = WindowManager.LayoutParams.WRAP_CONTENT
            y = dp(20)
        }

        root = buildUi()
        setContentView(root)
        playEnter()

        localBroadcastManager = LocalBroadcastManager.getInstance(this)
        localBroadcastManager.registerReceiver(updateReceiver, IntentFilter().apply {
            addAction(ACTION_OVERLAY_UPDATE)
            addAction(ACTION_OVERLAY_HIDE)
        })

        intent?.getStringExtra(EXTRA_TEXT)?.takeIf { it.isNotBlank() }?.let {
            statusText.text = prettyStatus(it)
        }

        restartAutoClose()
        Log.i(TAG, "Экран «Слушаю» показан light=${AppTheme.isLight(this)}")
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        intent?.getStringExtra(EXTRA_TEXT)?.takeIf { it.isNotBlank() }?.let {
            statusText.text = prettyStatus(it)
        }
        restartAutoClose()
    }

    override fun onDestroy() {
        super.onDestroy()
        autoCloseHandler.removeCallbacks(autoClose)
        running.forEach { it.cancel() }
        running.clear()
        barAnimators.forEach { it.cancel() }
        barAnimators.clear()
        runCatching { localBroadcastManager.unregisterReceiver(updateReceiver) }
        Log.i(TAG, "Экран «Слушаю» закрыт")
    }

    override fun onBackPressed() {
        finish()
    }

    private fun restartAutoClose() {
        autoCloseHandler.removeCallbacks(autoClose)
        autoCloseHandler.postDelayed(autoClose, AUTO_CLOSE_MS)
    }

    private fun prettyStatus(text: String): String {
        val t = text.trim()
        if (t.isEmpty() || t == "..." || t == "...слушаю..." || t.equals("слушаю...", true)) {
            return "Говорите…"
        }
        return t
    }

    private fun lightPalette() = Palette(
        islandStart = Color.parseColor("#F8FFFFFF"),
        islandEnd = Color.parseColor("#F5F4F7FB"),
        islandStroke = Color.parseColor("#332563EB"),
        status = Color.parseColor("#0F172A"),
        live = Color.parseColor("#059669"),
        bar = Color.parseColor("#2563EB"),
        textShadow = Color.parseColor("#14000000")
    )

    private fun darkPalette() = Palette(
        islandStart = Color.parseColor("#F21A2334"),
        islandEnd = Color.parseColor("#F2141C2B"),
        islandStroke = Color.parseColor("#664ADE80"),
        status = Color.parseColor("#F8FAFC"),
        live = Color.parseColor("#4ADE80"),
        bar = Color.parseColor("#93C5FD"),
        textShadow = Color.parseColor("#66000000")
    )

    // ------------------------------------------------------------------
    //  Разметка
    // ------------------------------------------------------------------

    private fun buildUi(): View {
        val island = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(22), dp(18), dp(26), dp(18))
            background = islandBg()
            elevation = dp(12).toFloat()
        }

        island.addView(buildMic(), LinearLayout.LayoutParams(dp(88), dp(88)))

        val texts = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(8), 0, dp(16), 0)
        }

        val liveRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        liveRow.addView(liveDot())
        liveRow.addView(TextView(this).apply {
            text = "СЛУШАЮ"
            setTextColor(pal.live)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
            typeface = Typeface.create("sans-serif-medium", Typeface.BOLD)
            letterSpacing = 0.22f
            setPadding(dp(8), 0, 0, 0)
        })
        texts.addView(liveRow)

        statusText = TextView(this).apply {
            text = "Говорите…"
            setTextColor(pal.status)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 28f)
            typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
            maxLines = 2
            setPadding(0, dp(6), 0, 0)
            setShadowLayer(8f, 0f, 2f, pal.textShadow)
        }
        texts.addView(statusText)

        island.addView(
            texts,
            LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        )
        island.addView(buildEqualizer())

        val wrap = FrameLayout(this).apply {
            setBackgroundColor(Color.TRANSPARENT)
            setPadding(dp(36), dp(8), dp(36), dp(16))
            addView(
                island,
                FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.MATCH_PARENT,
                    FrameLayout.LayoutParams.WRAP_CONTENT,
                    Gravity.CENTER_HORIZONTAL
                )
            )
        }
        return wrap
    }

    private fun buildMic(): View {
        val box = FrameLayout(this)

        val ring2 = ovalStroke("#334ADE80", 2)
        val ring1 = ovalStroke("#664ADE80", 2)
        box.addView(ring2, frameCenter(dp(88), dp(88)))
        box.addView(ring1, frameCenter(dp(88), dp(88)))
        pulseRing(ring2, 0)
        pulseRing(ring1, 400)

        val glow = View(this).apply {
            background = ovalFill("#552563EB")
            alpha = 0.9f
        }
        box.addView(glow, frameCenter(dp(70), dp(70)))
        breathe(glow)

        val disc = View(this).apply { background = ovalFill("#2563EB") }
        box.addView(disc, frameCenter(dp(58), dp(58)))

        val mic = ImageView(this).apply {
            setImageResource(R.drawable.ic_mic)
            setColorFilter(Color.WHITE)
            scaleType = ImageView.ScaleType.CENTER_INSIDE
            setPadding(dp(4), dp(4), dp(4), dp(4))
        }
        box.addView(mic, frameCenter(dp(34), dp(34)))
        return box
    }

    private fun liveDot(): View {
        val dot = View(this).apply {
            background = ovalFill(String.format("#%08X", pal.live))
        }
        val lp = LinearLayout.LayoutParams(dp(8), dp(8))
        dot.layoutParams = lp
        ObjectAnimator.ofFloat(dot, View.ALPHA, 1f, 0.25f, 1f).apply {
            duration = 1100
            repeatCount = ValueAnimator.INFINITE
            interpolator = LinearInterpolator()
            start()
            running += this
        }
        return dot
    }

    private fun buildEqualizer(): View {
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            setPadding(dp(8), 0, 0, 0)
        }
        val heights = intArrayOf(18, 28, 22, 32, 20)
        val delays = longArrayOf(0, 90, 40, 130, 70)
        for (i in heights.indices) {
            val bar = View(this).apply {
                background = GradientDrawable().apply {
                    cornerRadius = dp(3).toFloat()
                    setColor(pal.bar)
                }
            }
            val lp = LinearLayout.LayoutParams(dp(5), dp(heights[i])).apply {
                leftMargin = dp(4)
                gravity = Gravity.CENTER_VERTICAL
            }
            row.addView(bar, lp)
            bar.post {
                bar.pivotY = bar.height.toFloat()
                val anim = ValueAnimator.ofFloat(0.35f, 1f).apply {
                    duration = 380L + i * 35
                    startDelay = delays[i]
                    repeatMode = ValueAnimator.REVERSE
                    repeatCount = ValueAnimator.INFINITE
                    interpolator = AccelerateDecelerateInterpolator()
                    addUpdateListener { bar.scaleY = it.animatedValue as Float }
                    start()
                }
                barAnimators += anim
            }
        }
        return row
    }

    // ------------------------------------------------------------------
    //  Анимация и фон
    // ------------------------------------------------------------------

    private fun playEnter() {
        root.alpha = 0f
        root.translationY = -dp(28).toFloat()
        root.scaleX = 0.96f
        root.scaleY = 0.96f
        root.animate()
            .alpha(1f)
            .translationY(0f)
            .scaleX(1f)
            .scaleY(1f)
            .setDuration(320)
            .setInterpolator(AccelerateDecelerateInterpolator())
            .start()
    }

    private fun pulseRing(view: View, delay: Long) {
        view.post {
            val set = AnimatorSet().apply {
                playTogether(
                    ObjectAnimator.ofFloat(view, View.SCALE_X, 0.72f, 1.15f),
                    ObjectAnimator.ofFloat(view, View.SCALE_Y, 0.72f, 1.15f),
                    ObjectAnimator.ofFloat(view, View.ALPHA, 0.7f, 0f)
                )
                duration = 1600
                startDelay = delay
                interpolator = LinearInterpolator()
            }
            set.addListener(object : android.animation.AnimatorListenerAdapter() {
                override fun onAnimationEnd(animation: android.animation.Animator) {
                    if (!isDestroyed) pulseRing(view, 0)
                }
            })
            set.start()
            running += set
        }
    }

    private fun breathe(view: View) {
        ObjectAnimator.ofFloat(view, View.ALPHA, 0.35f, 0.85f).apply {
            duration = 900
            repeatMode = ValueAnimator.REVERSE
            repeatCount = ValueAnimator.INFINITE
            interpolator = AccelerateDecelerateInterpolator()
            start()
            running += AnimatorSet().apply { play(this@apply) }
        }
    }

    private fun islandBg(): GradientDrawable = GradientDrawable(
        GradientDrawable.Orientation.LEFT_RIGHT,
        intArrayOf(pal.islandStart, pal.islandEnd)
    ).apply {
        cornerRadius = dp(28).toFloat()
        setStroke(dp(1), pal.islandStroke)
    }

    private fun ovalFill(color: String) = GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setColor(Color.parseColor(color))
    }

    private fun ovalStroke(color: String, widthDp: Int) = View(this).apply {
        background = GradientDrawable().apply {
            shape = GradientDrawable.OVAL
            setColor(Color.TRANSPARENT)
            setStroke(dp(widthDp), Color.parseColor(color))
        }
    }

    private fun frameCenter(w: Int, h: Int) = FrameLayout.LayoutParams(w, h).apply {
        gravity = Gravity.CENTER
    }

    private fun dp(value: Int): Int =
        (value * resources.displayMetrics.density).toInt()
}
