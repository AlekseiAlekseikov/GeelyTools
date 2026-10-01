package com.example.voiceapp3.ui

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.util.Log
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebView
import com.example.voiceapp3.AppUpdater
import com.example.voiceapp3.BuildConfig
import com.example.voiceapp3.VoiceAssistantService
import com.google.gson.JsonObject
import com.google.gson.JsonParser

/**
 * Мост между HTML-интерфейсом (assets/ui/index.html) и нативной частью.
 *
 * Фаза 1 (сейчас): интерфейс работает автономно на демо-данных из макета.
 * Все действия пользователя приходят в [onEvent] и логируются —
 * полный протокол виден в logcat по тегу UiBridge.
 *
 * Фаза 2 (маршрутизация к существующей логике проекта):
 *   car.trunk / car.hood  -> handlers/TrunkControlHandler
 *   car.lock              -> Ex2Vehicle (центральный замок)
 *   car.color             -> PREF_CAR_PAINT (SharedPreferences)
 *   car.charging          -> ограничения заряда / ток (car/Ex2Vehicle)
 *   drive.mode            -> handlers/DriveModeHandler
 *   drive.recup           -> handlers/RecupModeHandler
 *   climate.air/recirc    -> car/HuClimate (направление обдува)
 *   climate.heat          -> HuClimate + ExteriorLightControlHandler (макс)
 *   climate.seat          -> handlers/SeatClimateHandler
 *   voice.request         -> VoiceAssistantService (старт прослушивания)
 *   voice.micRestart      -> MicPump (перезапуск микрофона)
 *   settings.change       -> SharedPreferences (ключи SET.* как в макете)
 *   tab.change            -> вкладки, вкл. CarPlay/AA (SET.proj)
 *   update.*              -> AppUpdater
 *
 * Обратный канал (Kotlin → JS): [pushToUi] вызывает
 *   window.__nativeEvent(name, json)
 * интерфейс диспатчит CustomEvent 'native:<name>' (см. конец index.html).
 */
private const val PREF_CAR_PAINT = "pref_car_paint"

/* Stage SCR: настройки приложения (SharedPreferences "voiceapp3").
   Имя ключа immersive — как в capy (AppExperienceController._immersiveKey),
   чтобы семантика и значение по умолчанию совпадали один в один. */
private const val PREF_IMMERSIVE = "app_immersive_mode_enabled"
private const val PREF_LAUNCH_ON_WAKE = "app_launch_on_wake_enabled"

class UiBridge(
    private val activity: Activity,
    private val webView: WebView,
    private val telemetry: TelemetryUiAdapter? = null
) {

    /**
     * Stage B7: управление кузовом (капот/багажник) — тот же путь VHAL,
     * что у голосового TrunkControlHandler. Замок — только индикатор
     * (управления нет ни в проекте, ни в источниках телеметрии).
     */
    private val bodyControl by lazy {
        BodyControlAdapter(activity) { name, json -> pushToUi(name, json) }
    }

    /**
     * Stage UPD: последний релиз, найденный проверкой (update.check).
     * Команда «Установить» (update.install) ставит именно его — как
     * «Сначала проверьте обновление» у любого апдейтера.
     */
    @Volatile
    private var lastRemote: AppUpdater.Remote? = null

    /**
     * Stage CPv2: рендер-мост CarPlay/Android Auto. Ставится MainActivity
     * сразу после создания этого моста (как configureFlutterEngine в capy
     * строит CarplayBridge/AndroidAutoBridge/ProjectionTouchBridge).
     */
    @Volatile
    var projectionRender: ProjectionRenderBridge? = null

    /* ── Stage QA: отправка HUB-команд в VoiceAssistantService ── */

    /** Простая команда с одним строковым режимом (drive/recup/ac_direction/listen). */
    private fun hub(kind: String, mode: String? = null) {
        val i = Intent(VoiceAssistantService.ACTION_HUB)
            .putExtra(VoiceAssistantService.EXTRA_HUB, kind)
        mode?.let { i.putExtra(VoiceAssistantService.EXTRA_MODE, it) }
        activity.sendBroadcast(i)
    }

    /** Универсальная команда: intent + текст + entities (как голосовая фраза). */
    private fun hubIntent(
        intentName: String,
        text: String,
        action: String? = null,
        value: Int? = null,
        direction: String? = null
    ) {
        val i = Intent(VoiceAssistantService.ACTION_HUB)
            .putExtra(VoiceAssistantService.EXTRA_HUB, VoiceAssistantService.HUB_INTENT)
            .putExtra(VoiceAssistantService.EXTRA_INTENT, intentName)
            .putExtra(VoiceAssistantService.EXTRA_TEXT, text)
        action?.let { i.putExtra(VoiceAssistantService.EXTRA_ACTION, it) }
        value?.let { i.putExtra(VoiceAssistantService.EXTRA_VALUE, it) }
        direction?.let { i.putExtra(VoiceAssistantService.EXTRA_DIRECTION, it) }
        activity.sendBroadcast(i)
    }

    /** Режим «Полный экран» из настроек интерфейса (Экран → Полный экран). */
    @Volatile
    var immersive: Boolean = false
        private set

    /**
     * Последняя вкладка, о которой сказал JS (tab.change). Stage B5:
     * признак для запроса данных при старте; Stage B6 — живой поток
     * больше не привязан к вкладке (карточка батареи в шелле видна
     * везде), см. [onAppResumed].
     */
    @Volatile
    var lastUiTab: String? = null
        private set

    /** Приложение на экране? (для решения: анимация в интерфейсе или плашка) */
    @Volatile
    var appResumed: Boolean = true
        private set

    /** Вкладка «Голос» сейчас на экране — анимировать микрофон интерфейса. */
    val isVoiceTabActive: Boolean
        get() = appResumed && lastUiTab == "voice"

    /** Приложение ушло с экрана — погасить живой поток. */
    fun onAppPaused() {
        appResumed = false
        telemetry?.stopLive()
    }

    /** Приложение вернулось — возобновить живой поток. */
    fun onAppResumed() {
        appResumed = true
        // Stage B6: карточка батареи живёт в шелле на каждой вкладке,
        // поэтому поток привязан к видимости приложения, а не к вкладке.
        telemetry?.startLive()
    }

    /** Единый канал событий из интерфейса. */
    @JavascriptInterface
    fun onEvent(name: String, data: String) {
        Log.d(TAG, "event: $name $data")
        when (name) {
            // Вкладка телеметрии / настройки: движок собирает пакет данных
            // на фоне и сам вернёт его в JS через pushToUi("telemetry.data").
            // Stage B5: живой поток стартует только когда вкладка телеметрии
            // живёт с видимостью приложения (Stage B6: карточка батареи
            // в шелле видна на каждой вкладке).
            "telemetry.request", "settings.request" -> {
                telemetry?.request()
                if (name == "telemetry.request") telemetry?.startLive()
                // CarPlay/AA: страница перезагрузилась и её состояние сброшено —
                // отдаём последний известный снимок присутствия (как onListen
                // в мосте capy, который всегда начинает с текущего снимка).
                if (name == "telemetry.request") {
                    com.timhss.capyenergy.projection.ProjectionPresenceBridge
                        .get(activity)?.publishLatest()
                    // Stage CPv2: и статусы рендер-мостов (перезагрузка страницы)
                    projectionRender?.publishStatuses()
                }
            }
            // Stage B7: капот/багажник из карточки машины. Открывает через
            // BodyControlAdapter (порт TrunkControlHandler); закрытие
            // электроприводом на EX2 невозможно — честно отказываем.
            "car.hood", "car.trunk" -> {
                runCatching {
                    val obj: JsonObject = JsonParser.parseString(data).asJsonObject
                    val open = obj.get("open")?.asBoolean == true
                    if (open) {
                        bodyControl.open(if (name == "car.hood") "hood" else "trunk")
                    } else {
                        Log.w(TAG, "$name: закрытие электроприводом недоступно")
                    }
                }.onFailure { Log.w(TAG, "car body parse failed", it) }
            }
            // ── Stage QA: быстрые действия (панель «Быстрый доступ») ──
            // Маршрутизация через HUB-броадкаст VoiceAssistantService:
            // команды проходят тот же IntentHandlerRegistry, что и голос.
            "drive.mode" -> {
                runCatching {
                    val mode = when (JsonParser.parseString(data).asJsonObject.get("mode")?.asString) {
                        "Эко" -> "eco"
                        "Комфорт" -> "comfort"
                        "Спорт" -> "sport"
                        else -> null
                    }
                    if (mode != null) hub(VoiceAssistantService.HUB_DRIVE, mode)
                }.onFailure { Log.w(TAG, "drive.mode parse failed", it) }
            }
            "drive.recup" -> {
                runCatching {
                    val mode = when (JsonParser.parseString(data).asJsonObject.get("value")?.asString) {
                        "Низкая" -> "weak"
                        "Средняя" -> "medium"
                        "Высокая" -> "strong"
                        else -> null
                    }
                    if (mode != null) hub(VoiceAssistantService.HUB_RECUP, mode)
                }.onFailure { Log.w(TAG, "drive.recup parse failed", it) }
            }
            "climate.air" -> {
                runCatching {
                    val mode = when (JsonParser.parseString(data).asJsonObject.get("value")?.asString) {
                        "Лицо" -> "face"
                        "Ноги" -> "floor"
                        "Лицо+Ноги" -> "face_floor"
                        "Стекло" -> "windshield"
                        "Ноги+Стекло" -> "floor_windshield"
                        else -> null
                    }
                    if (mode != null) hub(VoiceAssistantService.HUB_AC_DIRECTION, mode)
                }.onFailure { Log.w(TAG, "climate.air parse failed", it) }
            }
            "climate.recirc" -> {
                runCatching {
                    val on = JsonParser.parseString(data).asJsonObject.get("on")?.asBoolean == true
                    hubIntent(
                        "ac_control",
                        if (on) "рециркуляция" else "выключи рециркуляцию",
                        action = if (on) "set" else "unset"
                    )
                }.onFailure { Log.w(TAG, "climate.recirc parse failed", it) }
            }
            "climate.heat" -> {
                runCatching {
                    val obj = JsonParser.parseString(data).asJsonObject
                    val on = obj.get("on")?.asBoolean == true
                    val act = if (on) "set" else "unset"
                    when (obj.get("name")?.asString) {
                        "Руль" -> hubIntent(
                            "steering_heat",
                            if (on) "включи подогрев руля" else "выключи подогрев руля",
                            action = act
                        )
                        "Лобовое стекло" -> hubIntent(
                            "hvac_defrost",
                            if (on) "включи подогрев лобового стекла" else "выключи подогрев лобового стекла",
                            action = act
                        )
                        "Заднее стекло" -> hubIntent(
                            "hvac_defrost",
                            if (on) "включи подогрев заднего стекла" else "выключи подогрев заднего стекла",
                            action = act
                        )
                        "Стекло Макс" -> hubIntent(
                            "hvac_defrost",
                            if (on) "максимальный обдув стекла" else "выключи максимальный обдув стекла",
                            action = act
                        )
                    }
                }.onFailure { Log.w(TAG, "climate.heat parse failed", it) }
            }
            "climate.seat" -> {
                runCatching {
                    val obj = JsonParser.parseString(data).asJsonObject
                    val name = obj.get("name")?.asString ?: return@runCatching
                    val level = obj.get("level")?.asInt ?: 0
                    val side = if (name.contains("пассаж")) "right" else "left"
                    if (level <= 0) {
                        hubIntent("seat_heat", "выключи подогрев сиденья",
                            action = "unset", direction = side)
                    } else {
                        hubIntent("seat_heat", "подогрев сиденья на $level",
                            action = "set", value = level, direction = side)
                    }
                }.onFailure { Log.w(TAG, "climate.seat parse failed", it) }
            }
            // ── Stage CPv2: команды рендер-моста (эквиваленты методов
            // CarplayBridge/AndroidAutoBridge: activate/deactivate/refresh).
            // Вкладка активна → activate (binding касаний + Surface + рендер),
            // ушла → deactivate (подъём пальцев, R8-освобождение, unbind).
            "projection.activate" -> projectionRender?.activate(
                ProjectionRenderBridge.stackFromWire(
                    JsonParser.parseString(data).asJsonObject.get("stack")?.asString ?: return
                ) ?: return
            )
            "projection.deactivate" -> projectionRender?.deactivate(
                ProjectionRenderBridge.stackFromWire(
                    JsonParser.parseString(data).asJsonObject.get("stack")?.asString ?: return
                ) ?: return
            )
            "projection.refresh" -> projectionRender?.refresh(
                ProjectionRenderBridge.stackFromWire(
                    JsonParser.parseString(data).asJsonObject.get("stack")?.asString ?: return
                ) ?: return
            )
            "voice.request" -> hub(VoiceAssistantService.HUB_LISTEN)
            "voice.micRestart" -> hub(VoiceAssistantService.HUB_RESTART_MIC)
            // Stage NAV: голосовая подсказка навигатора — произносится TTS
            // ассистента (в UI она уже показана карточкой манёвра).
            "nav.speak" -> {
                runCatching {
                    val text = JsonParser.parseString(data).asJsonObject.get("text")?.asString
                    if (!text.isNullOrBlank()) {
                        val i = Intent(VoiceAssistantService.ACTION_HUB)
                            .putExtra(VoiceAssistantService.EXTRA_HUB, VoiceAssistantService.HUB_SPEAK)
                            .putExtra(VoiceAssistantService.EXTRA_TEXT, text)
                        activity.sendBroadcast(i)
                    }
                }.onFailure { Log.w(TAG, "nav.speak parse failed", it) }
            }
            // ── Stage UPD: вкладка «Обновления» — GitHub Releases ──
            "update.check" -> {
                pushUpdateState("checking")
                AppUpdater.check(activity, object : AppUpdater.Listener {
                    override fun onCheck(result: AppUpdater.CheckResult) {
                        when (result) {
                            is AppUpdater.CheckResult.Available -> {
                                lastRemote = result.remote
                                pushUpdateState(
                                    "available",
                                    versionName = result.remote.versionName,
                                    changelog = result.remote.changelog
                                )
                            }
                            is AppUpdater.CheckResult.UpToDate ->
                                pushUpdateState("uptodate", versionName = AppUpdater.currentVersionName(activity))
                            is AppUpdater.CheckResult.Error ->
                                pushUpdateState("error", message = result.message)
                        }
                    }
                    override fun onProgress(percent: Int, message: String) = Unit
                    override fun onInstallStarted() = Unit
                    override fun onFailure(message: String) = Unit
                })
            }
            "update.install" -> {
                val remote = lastRemote
                if (remote == null) {
                    pushUpdateState("error", message = "Сначала проверьте обновление")
                    return
                }
                pushUpdateState("downloading", percent = 0, message = "Скачиваю ${remote.versionName}…")
                AppUpdater.downloadAndInstall(activity, remote, object : AppUpdater.Listener {
                    override fun onCheck(result: AppUpdater.CheckResult) = Unit
                    override fun onProgress(percent: Int, message: String) {
                        // percent = -1 — сообщение без прогресса (докачка/повтор)
                        pushUpdateState(
                            if (percent >= 100) "installing" else "downloading",
                            percent = percent,
                            message = message
                        )
                    }
                    override fun onInstallStarted() {
                        pushUpdateState("installing", message = "Устанавливаю… приложение перезапустится")
                    }
                    override fun onFailure(message: String) {
                        pushUpdateState("error", message = message)
                    }
                })
            }
            "car.color" -> {
                runCatching {
                    val color = JsonParser.parseString(data).asJsonObject.get("color")?.asString
                    if (color != null) {
                        activity.getSharedPreferences("voiceapp3", Context.MODE_PRIVATE)
                            .edit().putString(PREF_CAR_PAINT, color).apply()
                    }
                }.onFailure { Log.w(TAG, "car.color parse failed", it) }
            }
            // Stage B6: вкладки поток больше не гасят — только onPause
            // приложения; lastUiTab хранится для возобновления контекста.
            "tab.change" -> {
                runCatching {
                    val obj: JsonObject = JsonParser.parseString(data).asJsonObject
                    val id = obj.get("id")?.asString
                    if (id != null) {
                        lastUiTab = id
                        telemetry?.startLive()
                    }
                }.onFailure { Log.w(TAG, "tab.change parse failed", it) }
            }
            "sync.now" -> telemetry?.syncNow()
            // ── Stage B8–B12: команды телеметрии v2 (порт вызовов capy) ──
            "charge.target" -> {
                runCatching {
                    val obj: JsonObject = JsonParser.parseString(data).asJsonObject
                    obj.get("percent")?.asNumber?.toInt()?.let { telemetry?.setChargeTarget(it) }
                }.onFailure { Log.w(TAG, "charge.target parse failed", it) }
            }
            "charge.amps" -> {
                runCatching {
                    val obj: JsonObject = JsonParser.parseString(data).asJsonObject
                    obj.get("amps")?.asNumber?.toInt()?.let { telemetry?.setChargeAmps(it) }
                }.onFailure { Log.w(TAG, "charge.amps parse failed", it) }
            }
            "charge.force" -> {
                runCatching {
                    val obj: JsonObject = JsonParser.parseString(data).asJsonObject
                    val on = obj.get("on")?.asBoolean == true
                    telemetry?.setChargeForce(on)
                }.onFailure { Log.w(TAG, "charge.force parse failed", it) }
            }
            "charge.stop" -> telemetry?.stopCharging()
            "charge.cost" -> {
                runCatching {
                    val obj: JsonObject = JsonParser.parseString(data).asJsonObject
                    val id = obj.get("sessionId")?.asString
                    if (id != null) {
                        val rate = if (obj.has("costPerKwh") && !obj.get("costPerKwh").isJsonNull)
                            obj.get("costPerKwh").asDouble else null
                        val paid = if (obj.has("paidAmount") && !obj.get("paidAmount").isJsonNull)
                            obj.get("paidAmount").asDouble else null
                        val cur = if (obj.has("currency") && !obj.get("currency").isJsonNull)
                            obj.get("currency").asString else null
                        telemetry?.updateChargeCost(id, rate, paid, cur)
                    }
                }.onFailure { Log.w(TAG, "charge.cost parse failed", it) }
            }
            "charges.merge" -> {
                runCatching {
                    val obj: JsonObject = JsonParser.parseString(data).asJsonObject
                    val ids = obj.get("ids")?.asJsonArray?.mapNotNull { it.takeIf { e -> !e.isJsonNull }?.asString }
                    if (!ids.isNullOrEmpty()) telemetry?.mergeCharges(ids)
                }.onFailure { Log.w(TAG, "charges.merge parse failed", it) }
            }
            "energy.window" -> {
                runCatching {
                    val obj: JsonObject = JsonParser.parseString(data).asJsonObject
                    val minutes = obj.get("minutes")?.asNumber?.toLong() ?: 60L
                    val parked = obj.get("parked")?.asBoolean == true
                    telemetry?.energyWindow(minutes, parked)
                }.onFailure { Log.w(TAG, "energy.window parse failed", it) }
            }
            "history.series" -> {
                runCatching {
                    val obj: JsonObject = JsonParser.parseString(data).asJsonObject
                    obj.get("sessionId")?.asString?.let { telemetry?.sessionSeries(it) }
                }.onFailure { Log.w(TAG, "history.series parse failed", it) }
            }
            "cycle.sessions" -> {
                runCatching {
                    val obj: JsonObject = JsonParser.parseString(data).asJsonObject
                    obj.get("ordinal")?.asNumber?.toLong()?.let { telemetry?.cycleSessions(it) }
                }.onFailure { Log.w(TAG, "cycle.sessions parse failed", it) }
            }
            "places.save" -> {
                runCatching {
                    val obj: JsonObject = JsonParser.parseString(data).asJsonObject
                    val name = obj.get("name")?.takeIf { !it.isJsonNull }?.asString ?: return@runCatching
                    telemetry?.savePlace(
                        id = obj.get("id")?.takeIf { !it.isJsonNull }?.asString,
                        name = name,
                        lat = obj.get("lat")?.asDouble ?: 0.0,
                        lon = obj.get("lon")?.asDouble ?: 0.0,
                        radius = obj.get("radius")?.asDouble ?: 150.0,
                        autoName = obj.get("auto")?.takeIf { !it.isJsonNull }?.asString
                    )
                }.onFailure { Log.w(TAG, "places.save parse failed", it) }
            }
            "places.delete" -> {
                runCatching {
                    val obj: JsonObject = JsonParser.parseString(data).asJsonObject
                    obj.get("id")?.asString?.let { telemetry?.deletePlace(it) }
                }.onFailure { Log.w(TAG, "places.delete parse failed", it) }
            }
            // Stage B4: инженерные экраны ⚙ → Разработчик. Данные потекут
            // обратными пушами lab.schema / lab.base / lab.tick / lab.sensor.
            "lab.open", "lab.close" -> {
                runCatching {
                    val obj: JsonObject = JsonParser.parseString(data).asJsonObject
                    val screen = obj.get("screen")?.asString
                    if (screen != null) {
                        if (name == "lab.open") telemetry?.openLab(screen)
                        else telemetry?.closeLab(screen)
                    }
                }.onFailure { Log.w(TAG, "lab parse failed", it) }
            }
            "tool.act" -> {
                runCatching {
                    val obj: JsonObject = JsonParser.parseString(data).asJsonObject
                    obj.get("act")?.asString?.let { telemetry?.action(it) }
                }.onFailure { Log.w(TAG, "tool.act parse failed", it) }
            }
            "settings.change" -> {
                // Тумблеры ⚙ с data-k: телеметрические ключи пишем в движок,
                // UI-локальные (cb/rm/...) игнорируем — они остаются в JS.
                // Stage SCR: «Полный экран» и «Запуск при пробуждении» —
                // настройки приложения: персистентно + применяются живьём.
                runCatching {
                    val obj: JsonObject = JsonParser.parseString(data).asJsonObject
                    val key = obj.get("key")?.asString
                    val value = obj.get("value")?.asBoolean
                    if (key != null && value != null) {
                        when (key) {
                            "imm" -> {
                                prefs().edit().putBoolean(PREF_IMMERSIVE, value).apply()
                                // Как applyImmersiveMode в capy: смена настройки
                                // говорит окну немедленно (sticky-режим/панели).
                                setImmersive(value)
                            }
                            "wake" -> prefs().edit().putBoolean(PREF_LAUNCH_ON_WAKE, value).apply()
                            else -> telemetry?.setSetting(key, value)
                        }
                    }
                }.onFailure { Log.w(TAG, "settings.change parse failed", it) }
            }
            "settings.apply" -> {
                runCatching {
                    val obj: JsonObject = JsonParser.parseString(data).asJsonObject
                    val key = obj.get("key")?.asString
                    val value = if (obj.has("value") && !obj.get("value").isJsonNull)
                        obj.get("value").asDouble else null
                    if (key != null) telemetry?.applySettings(key, value)
                }.onFailure { Log.w(TAG, "settings.apply parse failed", it) }
            }
        }
    }

    /** Версия APK для верхней строки («· EX2 v…»). */
    @JavascriptInterface
    fun appVersion(): String = BuildConfig.VERSION_NAME

    /** Stage T5: номер сборки для «О приложении»
     *  (settingsAppVersion(version, build) из SettingsV2). */
    @JavascriptInterface
    fun appBuild(): Int = BuildConfig.VERSION_CODE

    /**
     * Stage SCR: состояние настроек приложения для JS-инициализации страницы
     * (SET.imm/SET.wake при загрузке — до того, как рендер покажет тумблеры).
     */
    @JavascriptInterface
    fun appState(): String = JsonObject().apply {
        addProperty("imm", prefs().getBoolean(PREF_IMMERSIVE, true))
        addProperty("wake", prefs().getBoolean(PREF_LAUNCH_ON_WAKE, false))
    }.toString()

    /** Настройки приложения живут в тех же prefs, что и цвет машины. */
    private fun prefs() = activity.getSharedPreferences("voiceapp3", Context.MODE_PRIVATE)

    /** Дубликат тостов интерфейса — сам тост уже показан в HTML. */
    /**
     * Stage CPv2: прямоугольник видео-области projection-вкладки, в
     * физических пикселях окна (JS: getBoundingClientRect × devicePixelRatio;
     * WebView занимает всё окно, системы координат совпадают). Мост кладёт
     * TextureView-оверлей ровно по этому прямоугольнику.
     */
    @JavascriptInterface
    fun projectionFrame(stack: String, x: Float, y: Float, w: Float, h: Float) {
        projectionRender?.frame(stack, x, y, w, h)
    }

    @JavascriptInterface
    fun toast(message: String) {
        Log.d(TAG, "toast: $message")
    }

    /** Настройка «Полный экран»: скрыть/показать системные панели ГУ. */
    @JavascriptInterface
    fun setImmersive(enabled: Boolean) {
        immersive = enabled
        activity.runOnUiThread { applyImmersive() }
    }

    /**
     * Stage UPD: состояние вкладки «Обновления» в JS.
     * Фазы: checking / available / uptodate / downloading / installing / error.
     */
    private fun pushUpdateState(
        phase: String,
        versionName: String? = null,
        changelog: String? = null,
        percent: Int? = null,
        message: String? = null
    ) {
        val obj = JsonObject()
        obj.addProperty("phase", phase)
        obj.addProperty("current", appVersion())
        versionName?.let { obj.addProperty("version", it) }
        changelog?.let { obj.addProperty("changelog", it) }
        percent?.let { obj.addProperty("percent", it) }
        message?.let { obj.addProperty("message", it) }
        pushToUi("update.state", obj.toString())
    }

    /**
     * Пуш данных из Kotlin в интерфейс.
     * [json] — строка JSON-объекта, например {"battPct":78}.
     */
    fun pushToUi(name: String, json: String) {
        val script = "window.__nativeEvent && window.__nativeEvent('$name', $json)"
        webView.post { webView.evaluateJavascript(script, null) }
    }

    /** Применить текущий режим системных панелей. Вызывать на UI-потоке. */
    fun applyImmersive() {
        val decor = activity.window.decorView
        @Suppress("DEPRECATION") // API 28: WindowInsetsController ещё нет, ГУ на Android 9
        decor.systemUiVisibility = if (immersive) {
            (View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                or View.SYSTEM_UI_FLAG_FULLSCREEN
                or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION)
        } else {
            View.SYSTEM_UI_FLAG_VISIBLE
        }
    }

    /**
     * Stage VO: анимация вызова голоса «точь-в-точь как в макете» рисуется
     * самим интерфейсом (панель «Голос»: микрофон + кольца + «Слушаю…» + эквалайзер).
     * Сервис ищет живой мост через [instance]; если интерфейс мёртв —
     * показывает прежний OverlayActivity.
     */
    fun voiceUi(
        phase: String,
        text: String? = null,
        phrase: String? = null,
        reply: String? = null
    ) {
        val obj = JsonObject()
        obj.addProperty("phase", phase)
        text?.let { obj.addProperty("text", it) }
        phrase?.let { obj.addProperty("phrase", it) }
        reply?.let { obj.addProperty("reply", it) }
        pushToUi("voice.ui", obj.toString())
    }

    /** MainActivity.onDestroy: сервис больше не должен считать мост живым. */
    fun dispose() {
        if (companionInstance == this) companionInstance = null
    }

    init { companionInstance = this }

    companion object {
        private const val TAG = "UiBridge"

        /** Единственный живой мост UI (сервис голоса ищет его для voice.ui). */
        @Volatile
        var companionInstance: UiBridge? = null
            private set
    }
}
