package com.example.voiceapp3

import android.Manifest
import android.animation.AnimatorSet
import android.animation.ObjectAnimator
import android.animation.ValueAnimator
import android.app.ActivityManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.net.ConnectivityManager
import android.os.BatteryManager
import android.os.Bundle
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.os.StatFs
import android.util.Log
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.animation.AccelerateDecelerateInterpolator
import android.widget.Button
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.PopupWindow
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.widget.SwitchCompat
import androidx.core.content.ContextCompat
import androidx.core.view.isVisible
import androidx.localbroadcastmanager.content.LocalBroadcastManager

class MainActivity : AppCompatActivity() {

    private lateinit var localBroadcastManager: LocalBroadcastManager
    private lateinit var loadingLayout: View
    private lateinit var mainContent: View

    private lateinit var micIcon: ImageView
    private var micPulse: AnimatorSet? = null

    private lateinit var serviceReadyReceiver: BroadcastReceiver

    private var statusPill: TextView? = null
    private var statusDot: View? = null
    private var stateTitle: TextView? = null
    private var wakeSwitch: SwitchCompat? = null
    private var wakeHint: TextView? = null
    private var themeSystem: Button? = null
    private var themeDark: Button? = null
    private var themeLight: Button? = null
    private var testButton: Button? = null
    private var commandsButton: Button? = null
    private var updateButton: Button? = null
    private var updateStatus: TextView? = null
    private var creditText: TextView? = null
    private var railVersion: TextView? = null
    private var aboutBody: TextView? = null

    private var pageHome: View? = null
    private var pageVoice: View? = null
    private var pageTools: View? = null
    private var pagePlaceholder: View? = null
    private var pageSettings: View? = null
    private var pageAbout: View? = null
    private var placeholderTitle: TextView? = null
    private var toolsTitle: TextView? = null

    private val navItems = ArrayList<TextView>(9)

    private var driveEco: Button? = null
    private var driveComfort: Button? = null
    private var driveSport: Button? = null
    private var recupLow: Button? = null
    private var recupMid: Button? = null
    private var recupHigh: Button? = null
    private var carImage: ImageView? = null
    private var statusStorage: TextView? = null
    private var statusBattery: TextView? = null
    private var statusVoltage: TextView? = null
    private var statusWifi: TextView? = null
    private var aaStatus: TextView? = null
    private var carplayStatus: TextView? = null

    private var carPaint = 0
    private var paintPopup: PopupWindow? = null

    private var pendingUpdate: AppUpdater.Remote? = null
    private var updateBusy = false
    private var selectedDrive: String? = null
    private var selectedRecup: String? = null

    private val handler = Handler(Looper.getMainLooper())

    /**
     * Сервис сообщает, что активацию переключили не отсюда: голосом или
     * через adb. Обновляем тумблер молча, без обратной посылки.
     */
    private val wakeStateReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            val enabled = intent?.getBooleanExtra(
                VoiceAssistantService.EXTRA_ENABLED, true
            ) ?: return
            applyWakeState(enabled, notifyService = false)
        }
    }

    private var wakeStateReceiverRegistered = false

    companion object {
        const val ACTION_SERVICE_READY = "com.example.voiceapp3.SERVICE_READY"
        private const val TAG = "MainActivity"
        private const val PREFS = "voiceapp3"
        private const val PREF_WAKE_WORD = "wake_word_enabled"
        private const val REQ_PERMISSIONS = 1001
        private val AA_PKGS = arrayOf(
            "com.google.android.projection.gearhead",
            "com.google.android.embedded.projection",
        )
        private val CP_PKGS = arrayOf(
            "com.geely.linkhmi",
            "com.ecarx.carplay",
        )
        private const val PREF_CAR_PAINT = "car_paint"
        /** Заводские EX2. Чёрного и синего в каталоге нет. */
        private val CAR_PAINTS = intArrayOf(
            0xFFF2F0EA.toInt(),
            0xFF8A9098.toInt(),
            0xFFD5D8DC.toInt(),
            0xFFE6D3B5.toInt(),
            0xFFE8B8B8.toInt(),
            0xFFC5D4C0.toInt(),
        )
        private val CAR_PAINT_NAMES = arrayOf(
            "Moon White",
            "Comet Grey",
            "Star Silver",
            "Nebula Beige",
            "Aurora Pink",
            "Aurora Green",
        )
        private val CAR_PAINT_DRAWABLES = intArrayOf(
            R.drawable.car_ex2_white,
            R.drawable.car_ex2_grey,
            R.drawable.car_ex2_silver,
            R.drawable.car_ex2_beige,
            R.drawable.car_ex2_pink,
            R.drawable.car_ex2_green,
        )
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        AppTheme.applySaved(this)
        super.onCreate(savedInstanceState)

        supportActionBar?.hide()
        AppTheme.applyToWindow(this)
        if (android.os.Build.VERSION.SDK_INT >= 29) {
            window.decorView.isForceDarkAllowed = false
        }

        setContentView(R.layout.activity_main)

        localBroadcastManager = LocalBroadcastManager.getInstance(this)

        loadingLayout = findViewById(R.id.loading_layout)
        mainContent = findViewById(R.id.main_content)
        micIcon = findViewById(R.id.mic_animation)

        statusPill = findViewById(R.id.status_pill)
        statusDot = findViewById(R.id.status_dot)
        stateTitle = findViewById(R.id.state_title)
        wakeSwitch = findViewById(R.id.wake_word_switch)
        wakeHint = findViewById(R.id.wake_word_hint)
        themeSystem = findViewById(R.id.theme_system)
        themeDark = findViewById(R.id.theme_dark)
        themeLight = findViewById(R.id.theme_light)
        testButton = findViewById(R.id.test_button)
        commandsButton = findViewById(R.id.commands_button)
        updateButton = findViewById(R.id.update_button)
        updateStatus = findViewById(R.id.update_status)
        creditText = findViewById(R.id.credit_text)
        railVersion = findViewById(R.id.rail_version)
        aboutBody = findViewById(R.id.about_body)

        pageHome = findViewById(R.id.page_home)
        pageVoice = findViewById(R.id.page_voice)
        pageTools = findViewById(R.id.page_tools)
        pagePlaceholder = findViewById(R.id.page_placeholder)
        pageSettings = findViewById(R.id.page_settings)
        pageAbout = findViewById(R.id.page_about)
        placeholderTitle = findViewById(R.id.placeholder_title)
        toolsTitle = findViewById(R.id.tools_title)

        driveEco = findViewById(R.id.drive_eco)
        driveComfort = findViewById(R.id.drive_comfort)
        driveSport = findViewById(R.id.drive_sport)
        recupLow = findViewById(R.id.recup_low)
        recupMid = findViewById(R.id.recup_mid)
        recupHigh = findViewById(R.id.recup_high)
        carImage = findViewById(R.id.car_image)
        statusStorage = findViewById(R.id.status_storage)
        statusBattery = findViewById(R.id.status_battery)
        statusVoltage = findViewById(R.id.status_voltage)
        statusWifi = findViewById(R.id.status_wifi)
        aaStatus = findViewById(R.id.aa_status)
        carplayStatus = findViewById(R.id.carplay_status)

        bindNav(R.id.nav_home, "home")
        bindNav(R.id.nav_voice, "voice")
        bindNav(R.id.nav_tools, "tools")
        bindNav(R.id.nav_net, "net")
        bindNav(R.id.nav_audio, "audio")
        bindNav(R.id.nav_apps, "apps")
        bindNav(R.id.nav_quick, "quick")
        bindNav(R.id.nav_settings, "settings")
        bindNav(R.id.nav_about, "about")

        val version = AppUpdater.currentVersionName(this)
        creditText?.let { tv ->
            if (!tv.text.contains(version)) tv.append("  ·  v$version")
        }
        railVersion?.text = "EX2 · v$version"
        aboutBody?.text =
            "Голосовой ассистент и центр Geely EX2.\nТолько IHU629G. Платформенная подпись.\nВерсия $version"

        setupWakeWordSwitch()
        setupThemeSwitch()
        setupTestButton()
        setupCommandsButton()
        setupUpdateButton()
        setupHubActions()
        setupPhone()
        setupColorPick()
        refreshStatus()
        handler.post(statusTick)

        if (VoiceAssistantService.isServiceReady()) {
            showContent()
        } else {
            showLoading()
        }

        serviceReadyReceiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                if (intent?.action == ACTION_SERVICE_READY) {
                    runOnUiThread { showContent() }
                }
            }
        }

        localBroadcastManager.registerReceiver(
            serviceReadyReceiver, IntentFilter(ACTION_SERVICE_READY)
        )

        ensurePermissions()

        handler.postDelayed({
            Log.i(TAG, "Starting service after UI render")
            val serviceIntent = Intent(applicationContext, VoiceAssistantService::class.java)
            applicationContext.startForegroundService(serviceIntent)
        }, 100)
    }

    private fun bindNav(id: Int, key: String) {
        val tv = findViewById<TextView>(id)
        tv.tag = key
        navItems += tv
        tv.setOnClickListener { showPage(key) }
    }

    private fun showPage(key: String) {
        pageHome?.visibility = View.GONE
        pageVoice?.visibility = View.GONE
        pageTools?.visibility = View.GONE
        pagePlaceholder?.visibility = View.GONE
        pageSettings?.visibility = View.GONE
        pageAbout?.visibility = View.GONE

        when (key) {
            "home" -> pageHome?.visibility = View.VISIBLE
            "voice" -> pageVoice?.visibility = View.VISIBLE
            "tools" -> {
                toolsTitle?.text = "Инструменты"
                pageTools?.visibility = View.VISIBLE
            }
            "quick" -> {
                toolsTitle?.text = "Быстрые действия"
                pageTools?.visibility = View.VISIBLE
            }
            "settings" -> pageSettings?.visibility = View.VISIBLE
            "about" -> pageAbout?.visibility = View.VISIBLE
            else -> {
                placeholderTitle?.text = when (key) {
                    "net" -> "Сеть и Auto"
                    "audio" -> "Аудио"
                    "apps" -> "Приложения"
                    else -> "Раздел"
                }
                pagePlaceholder?.visibility = View.VISIBLE
            }
        }

        for (item in navItems) {
            val on = item.tag == key
            item.setBackgroundResource(if (on) R.drawable.bg_nav_on else R.drawable.bg_nav_off)
            val color = ContextCompat.getColor(
                this, if (on) R.color.text_primary else R.color.text_secondary
            )
            item.setTextColor(color)
            item.compoundDrawablesRelative[0]?.mutate()?.setTint(color)
        }

        if (key == "voice" && wakeSwitch?.isChecked != false) startMicPulse()
        else stopMicPulse()
    }

    override fun onResume() {
        super.onResume()
        AppTheme.applyToWindow(this)
        refreshStatus()
        if (mainContent.isVisible && pageVoice?.isVisible == true && wakeSwitch?.isChecked != false) {
            startMicPulse()
        }
    }

    override fun onPause() {
        super.onPause()
        stopMicPulse()
    }

    override fun onDestroy() {
        super.onDestroy()
        stopMicPulse()
        runCatching { localBroadcastManager.unregisterReceiver(serviceReadyReceiver) }
        if (wakeStateReceiverRegistered) {
            runCatching { unregisterReceiver(wakeStateReceiver) }
            wakeStateReceiverRegistered = false
        }
        handler.removeCallbacksAndMessages(null)
        paintPopup?.dismiss()
        paintPopup = null
    }

    private fun ensurePermissions() {
        OverlayPermission.ensure(this)

        val needed = mutableListOf<String>()

        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO)
            != PackageManager.PERMISSION_GRANTED
        ) {
            needed += Manifest.permission.RECORD_AUDIO
        }

        if (needed.isNotEmpty()) {
            Log.i(TAG, "Запрашиваю разрешения: $needed")
            requestPermissions(needed.toTypedArray(), REQ_PERMISSIONS)
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != REQ_PERMISSIONS) return

        val granted = grantResults.isNotEmpty() &&
                grantResults.all { it == PackageManager.PERMISSION_GRANTED }

        if (granted) {
            Log.i(TAG, "Разрешения выданы, перезапускаю сервис")
            Toast.makeText(this, "Микрофон разрешён", Toast.LENGTH_SHORT).show()
            restartService()
        } else {
            Log.w(TAG, "Микрофон запрещён — ассистент работать не будет")
            Toast.makeText(
                this,
                "Без доступа к микрофону ассистент не работает",
                Toast.LENGTH_LONG
            ).show()
        }
    }

    private fun restartService() {
        val intent = Intent(applicationContext, VoiceAssistantService::class.java)
        runCatching { applicationContext.stopService(intent) }
        showLoading()
        handler.postDelayed({
            applicationContext.startForegroundService(intent)
        }, 500)
    }

    private fun startMicPulse() {
        if (micPulse?.isRunning == true) return
        if (!::micIcon.isInitialized) return

        val scaleX = ObjectAnimator.ofFloat(micIcon, View.SCALE_X, 1f, 1.12f)
        val scaleY = ObjectAnimator.ofFloat(micIcon, View.SCALE_Y, 1f, 1.12f)
        val alpha = ObjectAnimator.ofFloat(micIcon, View.ALPHA, 0.75f, 1f)

        listOf(scaleX, scaleY, alpha).forEach {
            it.duration = 1100
            it.repeatCount = ValueAnimator.INFINITE
            it.repeatMode = ValueAnimator.REVERSE
            it.interpolator = AccelerateDecelerateInterpolator()
        }

        micPulse = AnimatorSet().apply {
            playTogether(scaleX, scaleY, alpha)
            start()
        }
    }

    private fun stopMicPulse() {
        micPulse?.cancel()
        micPulse = null
        if (::micIcon.isInitialized) {
            micIcon.scaleX = 1f
            micIcon.scaleY = 1f
        }
    }

    private fun setupWakeWordSwitch() {
        val prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        applyWakeState(prefs.getBoolean(PREF_WAKE_WORD, true), notifyService = false)

        wakeSwitch?.setOnCheckedChangeListener { _, checked ->
            applyWakeState(checked, notifyService = true)
        }

        registerReceiver(
            wakeStateReceiver,
            IntentFilter(VoiceAssistantService.ACTION_WAKE_WORD_STATE)
        )
        wakeStateReceiverRegistered = true
    }

    private fun applyWakeState(enabled: Boolean, notifyService: Boolean) {
        wakeSwitch?.let { sw ->
            if (sw.isChecked != enabled) {
                sw.setOnCheckedChangeListener(null)
                sw.isChecked = enabled
                sw.setOnCheckedChangeListener { _, checked ->
                    applyWakeState(checked, notifyService = true)
                }
            }
        }

        wakeHint?.text = if (enabled) {
            "Скажите «Привет джили» или нажмите кнопку на руле"
        } else {
            "Микрофон свободен, ассистент вызывается только кнопкой"
        }

        stateTitle?.text = if (enabled) "Жду обращения" else "Активация выключена"

        if (::micIcon.isInitialized) {
            micIcon.alpha = if (enabled) 1f else 0.3f
            if (enabled && mainContent.isVisible && pageVoice?.isVisible == true) startMicPulse()
            else stopMicPulse()
        }

        if (notifyService) {
            sendBroadcast(
                Intent(VoiceAssistantService.ACTION_WAKE_WORD)
                    .putExtra(VoiceAssistantService.EXTRA_ENABLED, enabled)
            )
        }
    }

    private fun setupThemeSwitch() {
        themeSystem?.setOnClickListener { AppTheme.setMode(this, AppTheme.Mode.SYSTEM) }
        themeDark?.setOnClickListener { AppTheme.setMode(this, AppTheme.Mode.DARK) }
        themeLight?.setOnClickListener { AppTheme.setMode(this, AppTheme.Mode.LIGHT) }
        refreshThemeButtons()
    }

    private fun refreshThemeButtons() {
        val mode = AppTheme.mode(this)
        styleThemeButton(themeSystem, mode == AppTheme.Mode.SYSTEM)
        styleThemeButton(themeDark, mode == AppTheme.Mode.DARK)
        styleThemeButton(themeLight, mode == AppTheme.Mode.LIGHT)
    }

    private fun styleThemeButton(button: Button?, selected: Boolean) {
        val btn = button ?: return
        if (selected) {
            btn.setBackgroundResource(R.drawable.bg_theme_on)
            btn.setTextColor(ContextCompat.getColor(this, R.color.seg_on_text))
        } else {
            btn.setBackgroundResource(R.drawable.bg_theme_off)
            btn.setTextColor(ContextCompat.getColor(this, R.color.text_primary))
        }
    }

    private fun setupTestButton() {
        testButton?.setOnClickListener {
            sendBroadcast(Intent("ecarx.intent.action.ECARX_KEY_RVOICEASSIST_EVENT"))
            Log.i(TAG, "Ассистент вызван кнопкой в интерфейсе")
        }
    }

    private fun setupCommandsButton() {
        commandsButton?.setOnClickListener {
            startActivity(Intent(this, CommandsActivity::class.java))
        }
    }

    private fun setupHubActions() {
        driveEco?.setOnClickListener { setDrive("eco") }
        driveComfort?.setOnClickListener { setDrive("comfort") }
        driveSport?.setOnClickListener { setDrive("sport") }
        recupLow?.setOnClickListener { setRecup("weak") }
        recupMid?.setOnClickListener { setRecup("medium") }
        recupHigh?.setOnClickListener { setRecup("strong") }

        findViewById<Button>(R.id.dump_button).setOnClickListener {
            sendBroadcast(
                Intent(VoiceAssistantService.ACTION_HUB)
                    .putExtra(VoiceAssistantService.EXTRA_HUB, VoiceAssistantService.HUB_DUMP)
            )
        }
        findViewById<Button>(R.id.mic_restart_button).setOnClickListener {
            sendBroadcast(
                Intent(VoiceAssistantService.ACTION_HUB)
                    .putExtra(VoiceAssistantService.EXTRA_HUB, VoiceAssistantService.HUB_RESTART_MIC)
            )
            Toast.makeText(this, "Пересоздаю вход", Toast.LENGTH_SHORT).show()
        }
        paintDrive()
        paintRecup()
    }

    private val statusTick = object : Runnable {
        override fun run() {
            refreshStatus()
            handler.postDelayed(this, 5000)
        }
    }

    private fun refreshStatus() {
        runCatching {
            val stat = StatFs(Environment.getDataDirectory().path)
            val gb = stat.availableBytes / 1_000_000_000L
            statusStorage?.text = "$gb ГБ"
        }
        val bm = getSystemService(Context.BATTERY_SERVICE) as BatteryManager
        val pct = bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
        statusBattery?.text = if (pct >= 0) "$pct%" else "—%"
        val stick = registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        val mv = stick?.getIntExtra(BatteryManager.EXTRA_VOLTAGE, -1) ?: -1
        statusVoltage?.text = if (mv > 0) String.format("%.1fV", mv / 1000f) else "— V"
        val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        @Suppress("DEPRECATION")
        val wifiOn = cm.getNetworkInfo(ConnectivityManager.TYPE_WIFI)?.isConnected == true
        statusWifi?.text = if (wifiOn) "Wi-Fi" else "Нет Wi-Fi"
        aaStatus?.text = if (hasPkg(AA_PKGS)) "Установлен" else "—"
        carplayStatus?.text = if (hasPkg(CP_PKGS)) "Установлен" else "Не подключено"
    }

    private fun setupColorPick() {
        carPaint = getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getInt(PREF_CAR_PAINT, 0)
        applyCarPaint(carPaint, persist = false)
        findViewById<TextView>(R.id.color_pick).setOnClickListener { anchor ->
            showPaintMenu(anchor)
        }
    }

    private fun applyCarPaint(index: Int, persist: Boolean) {
        val i = index.coerceIn(0, CAR_PAINTS.lastIndex)
        carPaint = i
        carImage?.colorFilter = null
        carImage?.setImageResource(CAR_PAINT_DRAWABLES[i])
        if (persist) {
            getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .putInt(PREF_CAR_PAINT, i)
                .apply()
        }
    }

    private fun showPaintMenu(anchor: View) {
        paintPopup?.dismiss()
        val names = CAR_PAINT_NAMES
        val swatches = CAR_PAINTS
        val pad = (8 * resources.displayMetrics.density).toInt()
        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.WHITE)
            setPadding(pad, pad, pad, pad)
        }
        for (i in names.indices) {
            val row = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    (40 * resources.displayMetrics.density).toInt()
                )
                setPadding(
                    (10 * resources.displayMetrics.density).toInt(),
                    0,
                    (10 * resources.displayMetrics.density).toInt(),
                    0
                )
                setOnClickListener {
                    applyCarPaint(i, persist = true)
                    paintPopup?.dismiss()
                }
            }
            val dot = View(this).apply {
                val s = (16 * resources.displayMetrics.density).toInt()
                layoutParams = LinearLayout.LayoutParams(s, s)
                setBackgroundColor(swatches[i])
            }
            val label = TextView(this).apply {
                text = names[i]
                setTextColor(Color.parseColor("#0F172A"))
                setPadding((10 * resources.displayMetrics.density).toInt(), 0, 0, 0)
            }
            row.addView(dot)
            row.addView(label)
            content.addView(row)
        }
        val pop = PopupWindow(
            content,
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT,
            true
        )
        pop.setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
        pop.elevation = 12f
        pop.isOutsideTouchable = true
        paintPopup = pop
        pop.showAsDropDown(anchor, 0, 4)
    }

    private fun setupPhone() {
        findViewById<Button>(R.id.aa_off).setOnClickListener { stopPkgs(AA_PKGS) }
        findViewById<Button>(R.id.aa_restart).setOnClickListener { launchPkgs(AA_PKGS) }
        findViewById<Button>(R.id.carplay_off).setOnClickListener { stopPkgs(CP_PKGS) }
        findViewById<Button>(R.id.carplay_restart).setOnClickListener { launchPkgs(CP_PKGS) }
    }

    private fun hasPkg(pkgs: Array<String>): Boolean {
        val pm = packageManager
        return pkgs.any { pkg ->
            runCatching { pm.getPackageInfo(pkg, 0); true }.getOrDefault(false)
        }
    }

    private fun launchPkgs(pkgs: Array<String>) {
        for (pkg in pkgs) {
            val launch = packageManager.getLaunchIntentForPackage(pkg)
            if (launch != null) {
                launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                runCatching { startActivity(launch) }
                return
            }
        }
        Toast.makeText(this, "Приложение на ГУ не найдено", Toast.LENGTH_SHORT).show()
    }

    private fun stopPkgs(pkgs: Array<String>) {
        val am = getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        var any = false
        for (pkg in pkgs) {
            runCatching { am.killBackgroundProcesses(pkg); any = true }
        }
        Toast.makeText(
            this,
            if (any) "Остановлено" else "Нечего останавливать",
            Toast.LENGTH_SHORT
        ).show()
    }

    private fun setDrive(mode: String) {
        selectedDrive = mode
        paintDrive()
        sendBroadcast(
            Intent(VoiceAssistantService.ACTION_HUB)
                .putExtra(VoiceAssistantService.EXTRA_HUB, VoiceAssistantService.HUB_DRIVE)
                .putExtra(VoiceAssistantService.EXTRA_MODE, mode)
        )
    }

    private fun setRecup(mode: String) {
        selectedRecup = mode
        paintRecup()
        sendBroadcast(
            Intent(VoiceAssistantService.ACTION_HUB)
                .putExtra(VoiceAssistantService.EXTRA_HUB, VoiceAssistantService.HUB_RECUP)
                .putExtra(VoiceAssistantService.EXTRA_MODE, mode)
        )
    }

    private fun paintDrive() {
        styleSeg(driveEco, selectedDrive == "eco")
        styleSeg(driveComfort, selectedDrive == "comfort")
        styleSeg(driveSport, selectedDrive == "sport")
    }

    private fun paintRecup() {
        styleSeg(recupLow, selectedRecup == "weak")
        styleSeg(recupMid, selectedRecup == "medium")
        styleSeg(recupHigh, selectedRecup == "strong")
    }

    private fun styleSeg(button: Button?, on: Boolean) {
        val btn = button ?: return
        if (on) {
            btn.setBackgroundResource(R.drawable.bg_seg_on)
            btn.setTextColor(ContextCompat.getColor(this, R.color.seg_on_text))
        } else {
            btn.setBackgroundResource(R.drawable.bg_seg_off)
            btn.setTextColor(ContextCompat.getColor(this, R.color.text_primary))
        }
    }

    private fun setupUpdateButton() {
        updateButton?.setOnClickListener {
            if (updateBusy) return@setOnClickListener
            val remote = pendingUpdate
            if (remote != null) {
                startDownload(remote)
            } else {
                checkForUpdates(manual = true)
            }
        }
    }

    private fun checkForUpdates(manual: Boolean) {
        if (updateBusy) return
        updateStatus?.text = "Проверяю GitHub…"
        AppUpdater.check(this, object : AppUpdater.Listener {
            override fun onCheck(result: AppUpdater.CheckResult) {
                if (isFinishing) return
                when (result) {
                    is AppUpdater.CheckResult.Available -> {
                        pendingUpdate = result.remote
                        updateButton?.text = "Обновить до ${result.remote.versionName}"
                        val log = result.remote.changelog.trim().take(80)
                        updateStatus?.text = if (log.isNotEmpty()) log
                        else "Доступна ${result.remote.versionName}"
                    }
                    AppUpdater.CheckResult.UpToDate -> {
                        pendingUpdate = null
                        updateButton?.text = "Проверить обновления"
                        updateStatus?.text = "Установлена последняя версия"
                        if (manual) {
                            Toast.makeText(
                                this@MainActivity,
                                "Обновлений нет",
                                Toast.LENGTH_SHORT
                            ).show()
                        }
                    }
                    is AppUpdater.CheckResult.Error -> {
                        pendingUpdate = null
                        updateButton?.text = "Проверить обновления"
                        updateStatus?.text = result.message
                    }
                }
            }

            override fun onProgress(percent: Int, message: String) {
                if (isFinishing) return
                updateStatus?.text = message
                updateButton?.text = if (percent in 1..99) "Скачивание $percent%" else message
            }

            override fun onInstallStarted() {
                if (isFinishing) return
                updateBusy = false
                updateStatus?.text = "Система устанавливает пакет…"
            }

            override fun onFailure(message: String) {
                if (isFinishing) return
                updateBusy = false
                updateButton?.isEnabled = true
                updateButton?.text = pendingUpdate?.let { "Обновить до ${it.versionName}" }
                    ?: "Проверить обновления"
                updateStatus?.text = message
                Toast.makeText(this@MainActivity, message, Toast.LENGTH_LONG).show()
            }
        })
    }

    private fun startDownload(remote: AppUpdater.Remote) {
        updateBusy = true
        updateButton?.isEnabled = false
        AppUpdater.downloadAndInstall(this, remote, object : AppUpdater.Listener {
            override fun onCheck(result: AppUpdater.CheckResult) {}
            override fun onProgress(percent: Int, message: String) {
                if (isFinishing) return
                updateStatus?.text = message
                updateButton?.text = if (percent in 1..99) "Скачивание $percent%" else message
            }
            override fun onInstallStarted() {
                if (isFinishing) return
                updateBusy = false
                updateButton?.isEnabled = true
                updateStatus?.text = "Система устанавливает пакет…"
            }
            override fun onFailure(message: String) {
                if (isFinishing) return
                updateBusy = false
                updateButton?.isEnabled = true
                updateButton?.text = "Обновить до ${remote.versionName}"
                updateStatus?.text = message
                Toast.makeText(this@MainActivity, message, Toast.LENGTH_LONG).show()
            }
        })
    }

    private fun showLoading() {
        loadingLayout.visibility = View.VISIBLE
        mainContent.visibility = View.GONE
        statusDot?.visibility = View.GONE
        statusPill?.apply {
            text = "Загрузка"
            setTextColor(ContextCompat.getColor(this@MainActivity, R.color.text_secondary))
        }
    }

    private fun showContent() {
        loadingLayout.visibility = View.GONE
        mainContent.visibility = View.VISIBLE
        statusDot?.visibility = View.VISIBLE
        statusPill?.apply {
            text = "Подключено к машине"
            setTextColor(ContextCompat.getColor(this@MainActivity, R.color.status_ok))
        }
        showPage("home")
        Log.i(TAG, "Main content shown")
        handler.postDelayed({ checkForUpdates(manual = false) }, 1500)
    }
}
