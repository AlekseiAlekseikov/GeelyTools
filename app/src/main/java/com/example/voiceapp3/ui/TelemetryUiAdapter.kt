package com.example.voiceapp3.ui

import android.content.Context
import android.util.Log
import com.google.gson.GsonBuilder
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.timhss.capyenergy.telemetry.TelemetryRuntime
import io.flutter.plugin.common.EventChannel
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

/**
 * Мост данных телеметрии для WebView-интерфейса (Stage B).
 *
 * Забирает данные из движка Capy Energy через публичный API
 * [TelemetryRuntime] (сессии, статус, запас хода, настройки, sync)
 * и отдаёт их в JS одним пакетом `telemetry.data`.
 *
 * Потоковая модель: все запросы к Room/движку выполняются на одном
 * фоновом потоке (JS-мост WebView вызывает [request] на своём потоке,
 * UI не блокируется). Формат пакета:
 *
 * {
 *   trips:   [{id,start,end,km,kwh,min,soc0,soc1,cost,currency,sp0,sp1}],
 *   charges: [{id,start,end,kwh,cost,currency,min,soc0,soc1,kw}],
 *   status:  {running,activity,tripState,chargeState,signals,lastUpdate,
 *             tripsTotal,chargesTotal},
 *   range:   {carKm,soc,effKmPerKwh,capacityKwh},
 *   sync:    {total,dirty,pending,cloudEnabled},
 *   settings:{packWh,rate,currency,autoStart,gps,continuous,replaceOem,
 *             chargeTargetSoc}
 * }
 *
 * Времена — utc-millis; JS сам форматирует подписи (Сегодня/Вчера, чч:мм).
 */
class TelemetryUiAdapter(
    context: Context,
    private val push: (name: String, json: String) -> Unit
) {

    private val appContext = context.applicationContext
    private val executor =
        Executors.newSingleThreadExecutor { r -> Thread(r, "tel-ui-adapter") }

    /** Stage B4: инженерные экраны ⚙ → Разработчик. */
    val devLab: DevLabController by lazy { DevLabController(appContext, push) }

    /** UI открыл экран разработчика (trace / signallab / sensorlab). */
    fun openLab(screen: String) = devLab.open(screen)

    /** UI закрыл экран разработчика. */
    fun closeLab(screen: String) = devLab.close(screen)

    // ── Stage B5: живой поток телеметрии ───────────────────────────────────
    //
    // Порт канала capy `com.timhss.capyenergy/telemetry/live`: движковый
    // [com.timhss.capyenergy.telemetry.LiveTelemetryPublisher] — это и есть
    // StreamHandler; в capy мост подключал его к Flutter одним вызовом
    // setStreamHandler. Здесь роль EventSink играет наш пуш в WebView.
    //
    // Пейлоад кадра — точь-в-точь как уходит во Flutter (см.
    // LiveTelemetryPublisher.publishSnapshot + TelemetryFacade.liveMetadataMap):
    // {timestampMillis, updatedSignalId, signals:[…], status, trip, charge,
    //  location, sessions, frames, events, retention, database,
    //  persistenceWriter, helpers, roadcast, recentEvents}.
    //
    // Адаптации (документируются сознательно):
    //  1. coalesceLatest у capy схлопывает всплеск кадров до последнего
    //     «за виток event loop» — до парсинга. Наша дорогая граница —
    //     JSON-строка + evaluateJavascript, поэтому коалесценция сдвинута
    //     сюда, на сторону моста, с окном LIVE_FLUSH_MS.
    //  2. Узкий канал vehicle-speed (60 Гц для «пилюли» скорости) не
    //     подключён: у нашего макета нет 60-Гц поверхности, скорость читается
    //     из signals[] кадра — тот же путь, что у LiveTripVhalReadings capy.
    //  3. Тяжёлый пакет telemetry.data в capy живой экран не перечитывает
    //     (серии buckets — по действию); наш макет показывает их постоянно,
    //     поэтому пока поток активен, пакет мягко перечитывается раз в
    //     HEAVY_INTERVAL_S секунд.

    @Volatile
    private var liveActive = false

    /** Последний кадр, ждущий отправки (коалесценция всплесков). */
    private val pendingFrame = AtomicReference<Any?>(null)

    @Volatile
    private var flushScheduled = false
    private var heavyFuture: ScheduledFuture<*>? = null

    /** Stage B9/B11: 1-секундный опрос живых корзин энергии и курса. */
    private var energyFuture: ScheduledFuture<*>? = null

    private val liveFlush =
        Executors.newSingleThreadScheduledExecutor { r -> Thread(r, "tel-live-flush") }

    /** Сериализатор кадра: null-поля как null, как их получает Flutter. */
    private val liveGson = GsonBuilder().serializeNulls().create()

    private val liveSink = object : EventChannel.EventSink {
        override fun success(event: Any?) {
            // Вызывается на главном потоке (LiveTelemetryPublisher постит в main):
            // только запоминаем кадр и планируем сброс — сериализация вне UI.
            pendingFrame.set(event)
            if (!flushScheduled) {
                flushScheduled = true
                runCatching {
                    liveFlush.schedule(::flushLive, LIVE_FLUSH_MS, TimeUnit.MILLISECONDS)
                }
            }
        }

        // error() у живого канала не вызывается; shim даёт no-op по умолчанию.
    }

    private fun flushLive() {
        flushScheduled = false
        if (!liveActive) {
            pendingFrame.set(null)
            return
        }
        val frame = pendingFrame.getAndSet(null) ?: return
        runCatching { push("telemetry.live", liveGson.toJson(frame)) }
            .onFailure { Log.e(TAG, "live frame push failed", it) }
    }

    /**
     * Вкладка телеметрии открыта: подписаться на живой поток движка
     * (порт initState/subscribe экранов capy) + мягкая перечитка тяжёлого
     * пакета, пока вкладка на экране.
     */
    fun startLive() {
        executor.execute {
            if (liveActive) return@execute
            runCatching {
                TelemetryRuntime.get(appContext).publisher.onListen(null, liveSink)
            }.onFailure {
                Log.e(TAG, "live subscribe failed", it)
                return@execute
            }
            liveActive = true
            heavyFuture = liveFlush.scheduleAtFixedRate({
                if (liveActive) {
                    executor.execute {
                        runCatching { pushData() }
                            .onFailure { Log.e(TAG, "live heavy refresh failed", it) }
                    }
                }
            }, HEAVY_INTERVAL_S, HEAVY_INTERVAL_S, TimeUnit.SECONDS)
            // Stage B9/B11: живые корзины энергии и курс — порт livePollInterval
            // EnergyMonitorController/CompassReadout из capy (1 с, чтение из
            // памяти движка, БД не трогается).
            energyFuture = liveFlush.scheduleAtFixedRate({
                if (liveActive) {
                    executor.execute {
                        runCatching { pushEnergyLive() }
                            .onFailure { Log.d(TAG, "energy live poll failed: ${'$'}{it.message}") }
                    }
                }
            }, ENERGY_POLL_S, ENERGY_POLL_S, TimeUnit.SECONDS)
            wireChargeBroadcasts()
            Log.i(TAG, "live telemetry stream started")
        }
    }

    /**
     * Вкладка закрыта/ушли с приложения: отписаться (порт dispose экранов
     * capy — канал один, слушатель один, держать его за закрытым экраном
     * значит сэмплить шину в никуда).
     */
    fun stopLive() {
        executor.execute {
            energyFuture?.cancel(false); energyFuture = null
            if (!liveActive) return@execute
            liveActive = false
            heavyFuture?.cancel(false)
            heavyFuture = null
            pendingFrame.set(null)
            runCatching { TelemetryRuntime.get(appContext).publisher.onCancel(null) }
            Log.i(TAG, "live telemetry stream stopped")
        }
    }

    /** UI открыл вкладку телеметрии / запросил настройки. */
    fun request() {
        executor.execute {
            runCatching { pushData() }
                .onFailure { Log.e(TAG, "telemetry.data build failed", it) }
        }
    }

    /**
     * Тумблер в настройках ⚙: пишем в движок типизированным сеттером
     * (тот же путь, что у capy), затем возвращаем канонический пакет.
     */
    fun setSetting(key: String, enabled: Boolean) {
        executor.execute {
            val runtime = TelemetryRuntime.get(appContext)
            runCatching {
                when (key) {
                    "auto" -> runtime.setAutoStartOnBoot(enabled)
                    "gps" -> runtime.setGpsEnabled(enabled)
                    "cont" -> runtime.setContinuousModeEnabled(enabled)
                    "evf" -> runtime.setDebugEventFileEnabled(enabled)
                    "ext" -> runtime.setExternalChargeControlEnabled(enabled)
                    "roem" -> runtime.setReplaceOemChargingEnabled(enabled)
                    "bt" -> runtime.setKeepBluetoothOnEnabled(enabled)
                    // Тумблер «CarPlay / Android Auto» (capy: ключ
                    // projection_beta_enabled, один на оба протокола).
                    // Переключение живьём перестраивает обе половины: сервисную
                    // (авто-открытие приложения на вкладке телефона) и экранную
                    // (вкладки в UI читают presence только пока тумблер включён).
                    "proj" -> {
                        runtime.setProjectionBetaEnabled(enabled)
                        com.timhss.capyenergy.service.ProjectionAutoOpenSupervisor
                            .get(appContext).setEnabled(enabled)
                        com.timhss.capyenergy.projection.ProjectionPresenceBridge
                            .get(appContext)?.setEnabled(enabled)
                    }
                    else -> return@execute // UI-локальные ключи движок не интересуют
                }
            }.onFailure { Log.e(TAG, "setSetting failed: $key=$enabled", it) }
            pushData()
        }
    }

    /**
     * Кнопки-действия настроек ⚙ и блока Roadcast (вкладка «Обновления»).
     * Всё блокирующее — на фоновом потоке; результат уходит в JS
     * пакетом telemetry.actionDone {act, ok, message, extra}.
     */
    fun action(act: String) {
        executor.execute {
            val runtime = TelemetryRuntime.get(appContext)
            runCatching {
                when (act) {
                    "applyprice" -> {
                        val r = runtime.applyDefaultChargeCostToUnpriced()
                        /* Stage T5: extra для arb-фразы SettingsV2
                           (settingsChargeCostApplied(count)); message — тост. */
                        if (r.ok) done(act, true,
                            "${r.updatedRows} зарядок теперь имеют ставку " +
                                "${r.costPerKwh ?: "?"} ${r.currency}",
                            extra = obj { put("count", r.updatedRows) })
                        else done(act, false, "Ошибка: ${r.error ?: "неизвестно"}")
                    }
                    "storage" -> {
                        val r = runtime.storageUsage()
                        push("telemetry.storage", obj {
                            put("bytes", (r["bytes"] as? Number)?.toLong() ?: 0L)
                            put("databaseBytes", (r["databaseBytes"] as? Number)?.toLong() ?: 0L)
                        }.toString())
                        done(act, true, null)
                    }
                    "retention" -> {
                        val r = runtime.runTelemetryRetention()
                        /* Stage T5: extra для v2SettingsRetentionDone(frames, days) */
                        done(act, r["ok"] == true,
                            if (r["ok"] == true) "Очистка завершена: сырые данные хранятся 30 дн."
                            else "Ошибка: ${r["lastError"] ?: "неизвестно"}",
                            extra = obj {
                                put("frames", (r["telemetryFramesDeleted"] as? Number)?.toInt() ?: 0)
                                put("days", (r["retentionDays"] as? Number)?.toInt() ?: 30)
                            })
                    }
                    "wipe" -> {
                        val r = runtime.clearTelemetryDatabase()
                        // clearTelemetryDatabase() останавливает сбор — поднимаем обратно
                        runCatching { runtime.start() }
                        /* Stage T5: extra для v2SettingsWipeDone(trips, charges, frames) */
                        done(act, r["ok"] == true,
                            "Удалено: поездок ${r["sessionsDeleted"]}, " +
                                "зарядок в поездках ${r["intervalsDeleted"]}, " +
                                "кадров ${r["telemetryFramesDeleted"]}",
                            extra = obj {
                                put("trips", (r["sessionsDeleted"] as? Number)?.toInt() ?: 0)
                                put("charges", (r["intervalsDeleted"] as? Number)?.toInt() ?: 0)
                                put("frames", (r["telemetryFramesDeleted"] as? Number)?.toInt() ?: 0)
                            })
                        pushData()
                    }
                    "resend" -> {
                        val r = runtime.markCloudHistoryDirty()
                        val marked = (r["markedRows"] as? Number)?.toLong() ?: 0L
                        /* Stage T5: extra для v2SettingsResendHistoryDone(count) */
                        done(act, true,
                            "Отмечено записей: $marked. Они выгрузятся при следующем sync.",
                            extra = obj { put("count", marked) })
                    }
                    "restart" -> {
                        val r = runtime.restartRoadcast()
                        done(act, r["running"] == true,
                            if (r["running"] == true) "Демон Roadcast перезапущен"
                            else "Roadcast не поднялся: ${r["error"] ?: "сокет недоступен"}")
                    }
                    "checkrc" -> {
                        val r = runtime.checkRoadcastUpdate()
                        val available = r["updateAvailable"] == true
                        val sha = r["availableSha256"] as? String
                        val short = sha?.take(11)
                        done(act, true,
                            if (!available && r["error"] == null) "Обновлений edge нет"
                            else "Доступно обновление edge: $short",
                            extra = obj { put("available", available); put("sha", short) })
                    }
                    "updrc" -> {
                        val r = runtime.updateRoadcast()
                        val sha = (r["availableSha256"] ?: r["sha256"]) as? String
                        done(act, true, "Roadcast обновлён до ${sha?.take(11) ?: "edge"}",
                            extra = obj { put("sha", sha?.take(11)) })
                    }
                    else -> return@execute
                }
                // Каноническое состояние после действия (настройки, хранилище,
                // установленный sha Roadcast) — пакетом в JS.
                pushData()
            }.onFailure { done(act, false, "Ошибка: ${it.message}") }
        }
    }

    private fun done(act: String, ok: Boolean, message: String?, extra: JsonObject? = null) {
        val payload = obj {
            put("act", act)
            put("ok", ok)
            put("message", message)
            add("extra", extra)
        }
        push("telemetry.actionDone", payload.toString())
    }

    /** Кнопка «Синхронизировать сейчас»: прогон выгрузки в облако. */
    fun syncNow() {
        executor.execute {
            runCatching {
                val res = TelemetryRuntime.get(appContext).forceCloudSyncNow()
                val moved = (res["movedRows"] as? Long)
                    ?: (res["movedRows"] as? Int)?.toLong() ?: 0L
                val payload = obj {
                    put("movedRows", moved)
                    put("failed", res["failed"] == true)
                    put("cloudReady", res["cloudReady"] == true)
                }
                push("telemetry.syncDone", payload.toString())
                pushData()
            }.onFailure { Log.e(TAG, "sync failed", it) }
        }
    }

    /**
     * Клавиатура настроек сохранила значение (ёмкость/цена).
     * Пишем через движок (applyPreferenceWrite — тот же путь, что у capy),
     * затем отдаём пакет заново, чтобы UI увидел каноническое значение.
     */
    fun applySettings(key: String, value: Double?) {
        executor.execute {
            runCatching {
                TelemetryRuntime.get(appContext)
                    .applyPreferenceWrite(key, value?.toString())
                pushData()
            }.onFailure { Log.e(TAG, "settings apply failed: $key=$value", it) }
        }
    }

    private fun pushData() {
        val runtime = TelemetryRuntime.get(appContext)
        val root = JsonObject()

        // ----- Поездки -----
        val tripPage = runtime.recentTripSessions(LIMIT)
        val settingsRate = (runtime.settingsMap()["defaultChargeCostPerKwh"] as? Double)
        /* Stage T4: геометрия поездок (InsightTripRow: концы + прореженный
           путь "lat,lon;..."), чтобы карточки истории рисовали маршрут. */
        val insightById = runCatching {
            runtime.insightTrips(null).trips.associateBy { it.id }
        }.getOrDefault(emptyMap())
        root.add("trips", buildJsonArray {
            tripPage.sessions.forEach { row ->
                val s = row.session
                val insight = insightById[s.id]
                val kwh = s.rollupTractionWh?.let { (it - (s.rollupRegenWh ?: 0.0)) / 1000.0 }
                val minutes = (row.durationMillis ?: (s.endedAtUtcMillis?.minus(s.startedAtUtcMillis)))
                    ?.let { it / 60000.0 }
                val cost = s.paidAmount ?: kwh?.let { k ->
                    (s.costPerKwh ?: settingsRate)?.let { r -> k * r }
                }
                add(obj {
                    put("id", s.id)
                    put("start", s.startedAtUtcMillis)
                    put("end", s.endedAtUtcMillis ?: row.updatedAtUtcMillis)
                    put("km", s.rollupDistanceKm)
                    put("kwh", kwh)
                    put("min", minutes)
                    put("soc0", s.startSocPercent)
                    put("soc1", row.endSoc ?: s.endSocPercent ?: s.lastSoc)
                    put("cost", cost)
                    put("currency", s.costCurrency)
                    put("sp0", s.startLatitude?.let { lat ->
                        "${fmt(lat)}, ${fmt(s.startLongitude ?: 0.0)}"
                    })
                    put("sp1", null as String?)
                    /* Stage T4 (TripSessionEntry): места — числами и путём. */
                    put("startLat", insight?.startLatitude ?: s.startLatitude)
                    put("startLon", insight?.startLongitude ?: s.startLongitude)
                    put("endLat", insight?.endLatitude)
                    put("endLon", insight?.endLongitude)
                    put("path", insight?.path)
                    put("regen", s.rollupRegenWh)
                    put("dur", row.durationMillis)
                    put("tmp0", s.startAmbientTempC?.toDouble())
                    put("tmp1", s.endAmbientTempC?.toDouble())
                })
            }
        })

        // ----- Зарядки -----
        val chargePage = runtime.recentChargeSessions(LIMIT)
        root.add("charges", buildJsonArray {
            chargePage.sessions.forEach { row ->
                val s = row.session
                val kwh = row.estimatedEnergyKwh ?: s.rollupDeliveredWh?.div(1000.0)
                val minutes = (row.durationMillis ?: (s.endedAtUtcMillis?.minus(s.startedAtUtcMillis)))
                    ?.let { it / 60000.0 }
                val cost = s.paidAmount ?: kwh?.let { k ->
                    (s.costPerKwh ?: settingsRate)?.let { r -> k * r }
                }
                add(obj {
                    put("id", s.id)
                    put("start", s.startedAtUtcMillis)
                    put("end", s.endedAtUtcMillis ?: row.updatedAtUtcMillis)
                    put("kwh", kwh)
                    put("cost", cost)
                    put("currency", s.costCurrency)
                    put("min", minutes)
                    put("soc0", s.startSocPercent)
                    put("soc1", row.endSoc ?: s.endSocPercent ?: s.lastSoc)
                    put("kw", s.startPowerKw)
                    /* Stage T4 (HistoryRow): статус и разъём. */
                    put("status", s.status)
                    put("plug", s.plugType)
                    /* Stage T4 (детейл зарядки): точка подключения + цена + температура. */
                    put("startLat", s.startLatitude)
                    put("startLon", s.startLongitude)
                    put("costPerKwh", s.costPerKwh)
                    put("paidAmount", s.paidAmount)
                    put("tmp0", s.startAmbientTempC?.toDouble())
                    put("tmp1", s.endAmbientTempC?.toDouble())
                })
            }
        })

        // ----- Статус сборщика -----
        val status = runtime.status()
        root.add("status", obj {
            put("running", status.running)
            put("activity", status.vehicleActivity.name)
            put("tripState", status.tripState.name)
            put("chargeState", status.chargeState.name)
            put("signals", status.signalCount)
            put("lastUpdate", status.lastUpdateMillis)
            put("tripsTotal", tripPage.totalCount)
            put("chargesTotal", chargePage.totalCount)
        })

        // ----- Запас хода -----
        val range = runtime.rangeEstimate()
        root.add("range", obj {
            put("carKm", range.carRangeKm)
            put("soc", range.socPercent)
            put("effKmPerKwh", range.efficiencyKmPerKwh)
            put("capacityKwh", range.capacityKwh)
            /* Stage T3 (ChargingEnergyPanel): полный запас и оценка приложения
               с качеством (RangeEstimate wire: fullRangeKm/ownRangeKm/ownRangeQuality). */
            put("fullKm", range.fullRangeKm)
            put("ownKm", range.ownRangeKm)
            put("ownQuality", range.ownRangeQuality.name)
        })

        // ----- Синхронизация -----
        val sync = runtime.cloudSyncProgress()
        root.add("sync", obj {
            put("total", (sync["totalCount"] as? Long) ?: (sync["totalCount"] as? Int)?.toLong() ?: 0L)
            put("dirty", (sync["dirtyCount"] as? Long) ?: (sync["dirtyCount"] as? Int)?.toLong() ?: 0L)
            put("pending", (sync["pendingCount"] as? Long) ?: (sync["pendingCount"] as? Int)?.toLong() ?: 0L)
            put("cloudEnabled", com.example.voiceapp3.BuildConfig.CLOUD_SYNC_ENABLED)
        })

        // ----- Live-серии (минутные корзины энергии: Roadcast/VHAL) -----
        val energy = runtime.liveEnergySeries()
        val charge = runtime.liveChargeEnergySeries()
        root.add("series", obj {
            add("energy", bucketsJson(energy) { it.tractionWh - it.regeneratedWh + it.auxiliaryWh })
            add("charge", bucketsJson(charge) { it.deliveredWh }
            )
        })

        // ----- Гейджи (Вт·ч/км, уклон, компас, скорость) -----
        val signals = (runtime.latestSnapshotMap()["signals"] as? List<Map<String, Any?>>)
            ?.associate { (it["signalId"] as? String) to it["value"] }
            ?: emptyMap()
        fun dbl(x: Any?): Double? = (x as? Number)?.toDouble()
        val heading = runtime.heading()
        root.add("gauges", obj {
            put("gradient", dbl(signals["ROAD_INCLINE"]))
            put("heading", heading.bearingDeg)
            put("speedKmh", heading.speedMps?.let { it * 3.6 } ?: dbl(signals["VEHICLE_SPEED"]))
            // Stage NAV: живая позиция машины для карты и «заряд на финише» —
            // координаты из GPS-приёмника движка, наружная температура из
            // сигналов (температуры батареи стек ГУ не отдаёт — честно показываем
            // наружную, она и влияет на запас хода).
            runCatching {
                val loc = runtime.locationStatus()
                put("lat", loc["latitude"] as? Double)
                put("lon", loc["longitude"] as? Double)
                put("fixAgeMs", loc["lastFixAgeMillis"] as? Long)
            }
            put("outsideTemp", dbl(signals["OUTSIDE_TEMPERATURE"])
                ?: dbl(signals["AMBIENT_AIR_TEMPERATURE"]))
            put("eff", runtime.rangeEstimate().efficiencyKmPerKwh)
            add("whPerKm", buildJsonArray {
                energy?.buckets?.forEach { b ->
                    if (b.speedDistanceKm > 0.05) {
                        add(Math.round(
                            (b.tractionWh - b.regeneratedWh + b.auxiliaryWh) / b.speedDistanceKm
                        ).toInt())
                    }
                }
            })
        })

        // ----- Настройки -----
        val settings = runtime.settingsMap()
        root.add("settings", obj {
            put("packWh", (settings["packCapacityWh"] as? Double)?.toLong() ?: 39600L)
            put("rate", settings["defaultChargeCostPerKwh"] as? Double)
            put("currency", settings["chargeCostCurrency"] as? String ?: "$")
            put("autoStart", settings["autoStartOnBoot"] as? Boolean ?: true)
            put("gps", settings["gpsEnabled"] as? Boolean ?: true)
            put("continuous", settings["continuousModeEnabled"] as? Boolean ?: false)
            put("replaceOem", settings["replaceOemChargingEnabled"] as? Boolean ?: false)
            put("chargeTargetSoc", settings["chargeTargetSoc"] as? Int)
            put("ext", settings["externalChargeControlEnabled"] as? Boolean ?: false)
            put("bt", settings["keepBluetoothOnEnabled"] as? Boolean ?: false)
            put("evf", settings["debugEventFileEnabled"] as? Boolean ?: false)
            put("proj", settings["projectionBetaEnabled"] as? Boolean ?: false)
        })

        // ----- Stage B8: детайл последней зарядки (график SoC/мощность) -----
        // Порт storeGetSeries/storeGetSession из TelemetryWireHandler capy:
        // минутные интервалы + события CHARGE_LIMIT_REACHED («лимит достигнут»
        // решает машина, это событие, а не порог на графике).
        runCatching {
            chargePage.sessions.firstOrNull()?.let { row ->
                val s = row.session
                val intervals = runtime.database.intervalDao().forSession(s.id)
                val events = runtime.database.telemetryEventDao().forSession(s.id)
                root.add("chargeDetail", obj {
                    put("sessionId", s.id)
                    put("status", s.status)
                    put("start", s.startedAtUtcMillis)
                    put("chargeStart", s.chargeStartedAtUtcMillis)
                    put("chargeEnd", s.chargeEndedAtUtcMillis)
                    put("plugEnd", s.plugDisconnectedAtUtcMillis ?: s.endedAtUtcMillis)
                    put("soc0", s.startSocPercent?.toDouble())
                    put("soc1", row.endSoc?.toDouble() ?: s.endSocPercent?.toDouble() ?: s.lastSoc?.toDouble())
                    put("kwh", row.estimatedEnergyKwh ?: s.rollupDeliveredWh?.div(1000.0))
                    put("cost", s.paidAmount)
                    put("costPerKwh", s.costPerKwh)
                    put("currency", s.costCurrency)
                    add("intervals", buildJsonArray { intervals.forEach { add(intervalJson(it)) } })
                    add("limitReachedAt", buildJsonArray {
                        events.filter { it.type == "CHARGE_LIMIT_REACHED" }
                            .forEach { add(it.occurredAtUtcMillis) }
                    })
                })
            }
        }.onFailure { Log.w(TAG, "chargeDetail failed: ${'$'}{it.message}") }

        // ----- Stage B10: состояние внешнего управления зарядкой -----
        // Опрашивается только при включённом переключателе — как у capy:
        // выключенный переключатель не порождает ни контролов, ни запросов.
        if (settings["externalChargeControlEnabled"] as? Boolean == true) {
            runCatching {
                val cc = runtime.getChargeControlState()
                root.add("chargeControl", obj {
                    put("targetSoc", (cc["targetSoc"] as? Number)?.toInt())
                    put("amps", (cc["amps"] as? Number)?.toInt())
                    put("minAmps", (cc["minAmps"] as? Number)?.toInt() ?: 5)
                    put("maxAmps", (cc["maxAmps"] as? Number)?.toInt() ?: 32)
                    put("forceCharging", cc["forceCharging"] as? Boolean ?: false)
                    put("lastCommandOk", cc["lastCommandOk"] as? Boolean ?: true)
                    put("lastError", cc["lastError"] as? String)
                })
            }.onFailure { Log.w(TAG, "chargeControl failed: ${'$'}{it.message}") }
        }

        // ----- Stage B9: окна энергии 15 мин / 1 ч / 8 ч (+ стоянка) -----
        // Порт energyBucketsInWindow/parkedEnergyBucketsInWindow. Живые окна
        // (текущая поездка / с включения) идут отдельным 1-секундным каналом
        // telemetry.energyLive — порт livePollInterval контроллера capy.
        runCatching {
            val now = System.currentTimeMillis()
            fun win(parked: Boolean, minutes: Long) =
                if (parked) runtime.parkedEnergySeriesInWindow(now - minutes * 60_000, now)
                else runtime.energySeriesInWindow(now - minutes * 60_000, now)
            root.add("windows", obj {
                add("m15", windowJson(win(false, 15)))
                add("m60", windowJson(win(false, 60)))
                add("m480", windowJson(win(false, 480)))
                add("p15", windowJson(win(true, 15)))
                add("p60", windowJson(win(true, 60)))
                add("p480", windowJson(win(true, 480)))
            })
        }.onFailure { Log.w(TAG, "windows failed: ${'$'}{it.message}") }

        // ----- Stage T2: спаны сеансов для разметки «С момента включения» -----
        // Порт listSessions(from=null,to=now,limit=500) из
        // EnergyMonitorController._readStored: все сеансы, пересекающие
        // последние 24 ч (включая открытые), с полями sleep-оценки.
        // Фильтр «kind != CONTINUOUS и пересечение с окном» JS делает сам —
        // как клиентский фильтр в Dart.
        runCatching {
            val now = System.currentTimeMillis()
            val dayAgo = now - 24L * 60 * 60 * 1000
            root.add("spans", buildJsonArray {
                runtime.database.sessionDao().inWindowAll(dayAgo, now).forEach { s ->
                    add(obj {
                        put("kind", s.kind)
                        put("startedAtUtcMillis", s.startedAtUtcMillis)
                        put("endedAtUtcMillis", s.endedAtUtcMillis)
                        put("sleepSeconds", s.sleepSeconds)
                        put("sleepSocDeltaPercent", s.sleepSocDeltaPercent)
                        put("sleepEnergyWhEstimate", s.sleepEnergyWhEstimate)
                    })
                }
            })
        }.onFailure { Log.w(TAG, "spans failed: ${'$'}{it.message}") }

        // ----- Stage B12: циклы батареи, места, слияние зарядок -----
        runCatching {
            val page = runtime.batteryCycles(LIMIT)
            root.add("cycles", obj {
                put("total", page.totalCount)
                add("list", buildJsonArray {
                    page.cycles.forEach { c ->
                        add(obj {
                            put("ordinal", c.ordinal)
                            put("start", c.startUtcMillis)
                            put("end", c.endUtcMillis)
                            put("discharge", c.dischargePercent)
                            put("km", c.distanceKm)
                            put("tripKwh", c.tripEnergyKwh)
                            put("parkedKwh", c.parkedEnergyKwh)
                            put("cost", c.cost)
                            put("currency", c.costCurrency)
                            put("open", c.isOpen)
                            put("partial", c.isPartial)
                            put("incomplete", c.energyIncomplete)
                            /* Stage T4 (заметки _Heading): доля оплаченной
                               энергии, смешение валют, заморозка. */
                            put("priced", c.pricedEnergyKwh)
                            put("unpriced", c.unpricedEnergyKwh)
                            put("mixed", c.mixedCurrency)
                            put("frozen", c.frozenAtUtcMillis != null)
                        })
                    }
                })
            })
        }.onFailure { Log.w(TAG, "cycles failed: ${'$'}{it.message}") }
        runCatching {
            root.add("places", buildJsonArray {
                runtime.insightPlaces().forEach { pl ->
                    add(obj {
                        put("id", pl.id)
                        put("name", pl.name)
                        put("auto", pl.autoName)
                        put("lat", pl.latitude)
                        put("lon", pl.longitude)
                    })
                }
            })
        }.onFailure { Log.w(TAG, "places failed: ${'$'}{it.message}") }
        runCatching {
            /* Stage T4: корпус инсайта (compareTripToOwnAverage): CAN-поля,
               выживающие ретенцию — как InsightTrip в telemetry_core. */
            root.add("insightTrips", buildJsonArray {
                runtime.insightTrips(null).trips.forEach { t ->
                    add(obj {
                        put("id", t.id)
                        put("end", t.endedAtUtcMillis)
                        put("km", t.rollupDistanceKm)
                        put("pack", t.rollupTractionWh?.let { tr -> tr - (t.rollupRegenWh ?: 0.0) })
                        put("agrees", when (t.socAgreesWithIntegral) {
                            "agrees" -> true; "contradicts" -> false; else -> null
                        })
                        put("buckets", t.hasMinuteBuckets)
                        put("meanTemp", t.meanAmbientTempC)
                    })
                }
            })
        }.onFailure { Log.w(TAG, "insightTrips failed: ${'$'}{it.message}") }
        runCatching {
            val m = runtime.chargeMergeCandidates(10)
            root.add("merge", obj {
                put("total", m.totalCount.toLong())
                add("candidates", buildJsonArray {
                    m.candidates.forEach { c ->
                        add(obj {
                            add("ids", buildJsonArray { c.sessionIds.forEach { add(it) } })
                            put("start", c.startUtcMillis)
                            put("end", c.endUtcMillis)
                            put("gaps", c.breaks.size)
                        })
                    }
                })
            })
        }.onFailure { Log.w(TAG, "merge failed: ${'$'}{it.message}") }

        // ----- Хранилище + Roadcast (для плитки настроек и блока в «Обновлениях») -----
        val storage = runCatching { runtime.storageUsage() }.getOrDefault(emptyMap())
        val roadcast = runCatching { runtime.roadcastStatusMap() }.getOrDefault(emptyMap())
        val rcUpdate = runCatching { runtime.roadcastUpdateStatusMap() }.getOrDefault(emptyMap())
        root.add("storage", obj {
            put("bytes", (storage["bytes"] as? Number)?.toLong() ?: 0L)
        })
        root.add("roadcast", obj {
            put("installed", rcUpdate["installedSha256"] as? String)
            put("running", roadcast["running"] == true)
            put("socketReachable", roadcast["socketReachable"] == true)
            put("signalCount", (roadcast["signalCount"] as? Number)?.toInt() ?: 0)
            put("frameCount", (roadcast["frameCount"] as? Number)?.toLong() ?: 0L)
            put("hz", (roadcast["hz"] as? Number)?.toDouble() ?: 0.0)
        })

        push("telemetry.data", root.toString())
        Log.d(TAG, "telemetry.data pushed: ${tripPage.sessions.size} trips, ${chargePage.sessions.size} charges")
    }

    // ── Stage B9–B12: живые корзины 1 Гц, бродкасты зарядки, запросы UI ────

    /** 1-секундный опрос живых корзин энергии + курса (порт cadence capy). */
    private fun pushEnergyLive() {
        val runtime = TelemetryRuntime.get(appContext)
        val o = obj {
            add("energy", liveSeriesJson(runtime.liveEnergySeries()))
            add("cont", liveSeriesJson(runtime.liveContinuousEnergySeries()))
            // Минуты климата открытой зарядки — для баннера-предупреждения
            // (порт getLiveChargeEnergyBuckets экрана зарядки capy).
            add("chargeClimate", liveSeriesJson(runCatching { runtime.liveChargeEnergySeries() }.getOrNull()))
            val h = runCatching { runtime.heading() }.getOrNull()
            put("bearing", h?.bearingDeg)
            put("speedMps", h?.speedMps)
        }
        push("telemetry.energyLive", o.toString())
    }

    /** Бродкасты управления зарядкой (порт onChargeTargetSocChanged /
     *  onChargeControlStateChanged из TelemetryBridge capy). */
    @Volatile
    private var chargeBroadcastsWired = false

    private fun wireChargeBroadcasts() {
        if (chargeBroadcastsWired) return
        chargeBroadcastsWired = true
        val runtime = TelemetryRuntime.get(appContext)
        runtime.onTargetSocChangedListener = { percent ->
            executor.execute {
                push("telemetry.chargeState", obj { put("targetSoc", percent) }.toString())
            }
        }
        runtime.onChargeControlStateChanged = { state ->
            executor.execute {
                push("telemetry.chargeState", obj {
                    put("targetSoc", state.targetSoc)
                    put("amps", state.amps)
                    put("minAmps", state.minAmps)
                    put("maxAmps", state.maxAmps)
                    put("forceCharging", state.forceCharging)
                    put("lastCommandOk", state.lastCommandOk)
                    put("lastError", state.lastError)
                }.toString())
            }
        }
    }

    private fun exec(block: (TelemetryRuntime) -> Unit) {
        executor.execute {
            runCatching { block(TelemetryRuntime.get(appContext)) }
                .onFailure { Log.w(TAG, "telemetry command failed", it) }
        }
    }

    /** Stage B10: лимит зарядки (кламп 50–100 на стороне движка). */
    fun setChargeTarget(percent: Int) = exec {
        val r = it.setChargeTargetSoc(percent.coerceIn(50, 100))
        push("telemetry.chargeState", obj {
            put("targetSoc", (r["chargeTargetSoc"] as? Number)?.toInt() ?: percent)
        }.toString())
    }

    fun setChargeAmps(amps: Int) = exec { it.setChargingAmperage(amps) }

    fun setChargeForce(on: Boolean) = exec { it.setForceCharging(on) }

    fun stopCharging() = exec { runCatching { it.stopCharging() } }

    /** Stage B8/B12: правка стоимости зарядки (криптекс → MoneyKeypad). */
    fun updateChargeCost(sessionId: String, costPerKwh: Double?, paidAmount: Double?, currency: String?) = exec {
        it.updateChargeSessionCost(sessionId, costPerKwh, paidAmount, currency)
        runCatching { pushData() }
    }

    /** Stage B12: слияние разорванных зарядок (removed_while_charging). */
    fun mergeCharges(ids: List<String>) = exec {
        val out = it.mergeChargeSessions(ids)
        done("charges.merge", out.ok, out.error ?: "объединено сеансов: ${'$'}{out.mergedCount}")
        runCatching { pushData() }
    }

    /** Stage B9: мгновенный ответ на смену окна (между тяжёлыми циклами). */
    fun energyWindow(minutes: Long, parked: Boolean) = exec {
        val now = System.currentTimeMillis()
        val series = if (parked) it.parkedEnergySeriesInWindow(now - minutes * 60_000, now)
        else it.energySeriesInWindow(now - minutes * 60_000, now)
        push("telemetry.energyWindow", obj {
            put("minutes", minutes)
            put("parked", parked)
            add("series", windowJson(series))
        }.toString())
    }

    /** Stage B12: серия сеанса для детайла истории (по клику, без пуша всех). */
    fun sessionSeries(sessionId: String) = exec { runtime ->
        val db = runtime.database
        val intervals = db.intervalDao().forSession(sessionId)
        val events = db.telemetryEventDao().forSession(sessionId)
        val s = db.sessionDao().findById(sessionId)
        // Stage T2: порт lastPricedChargeBefore (session_reading.dart) —
        // текущая поездка оценивается по ставке последней оплаченной зарядки
        // до неё (scan 20, kind=CHARGE, первый с ценой).
        val priced = runCatching {
            val now = System.currentTimeMillis()
            db.sessionDao().listSessionsFiltered("CHARGE", null, null, now, 20, 0)
                .firstOrNull { it.costPerKwh != null || it.paidAmount != null }
                ?.let { c -> obj { put("costPerKwh", c.costPerKwh); put("currency", c.costCurrency) } }
        }.getOrNull()
        push("telemetry.sessionSeries", obj {
            put("sessionId", sessionId)
            put("start", s?.startedAtUtcMillis)
            put("end", s?.endedAtUtcMillis)
            put("status", s?.status)
            put("kind", s?.kind)
            put("chargeStart", s?.chargeStartedAtUtcMillis)
            put("chargeEnd", s?.chargeEndedAtUtcMillis)
            put("plugEnd", s?.plugDisconnectedAtUtcMillis)
            put("soc0", s?.startSocPercent?.toDouble())
            put("soc1", s?.endSocPercent?.toDouble())
            put("kwh", s?.rollupDeliveredWh?.div(1000.0))
            add("priced", priced)
            add("intervals", buildJsonArray { intervals.forEach { e -> add(intervalJson(e)) } })
            add("limitReachedAt", buildJsonArray {
                events.filter { e -> e.type == "CHARGE_LIMIT_REACHED" }
                    .forEach { e -> add(e.occurredAtUtcMillis) }
            })
        }.toString())
    }

    /** Stage B12: мозаика сеансов цикла батареи. */
    fun cycleSessions(ordinal: Long) = exec {
        val page = it.batteryCycleSessions(ordinal)
        push("telemetry.cycleSessions", obj {
            put("ordinal", ordinal)
            add("sessions", buildJsonArray {
                page.sessions.forEach { r ->
                    add(obj {
                        put("kind", r.kind)
                        put("sessionId", r.sessionId)
                        put("share", r.share)
                        put("start", r.startUtcMillis)
                        put("end", r.endUtcMillis)
                        put("deleted", r.deleted)
                        /* Stage T4 (CycleTimelineRow._facts): поездке — пробег
                           и SOC, зарядке — энергию и SOC, стоянке — только окно. */
                        r.trip?.let { t ->
                            put("km0", t.session.startOdometerKm?.toDouble())
                            put("km1", t.endOdometerKm?.toDouble())
                            put("soc0", t.session.startSocPercent?.toDouble())
                            put("soc1", (t.endSoc ?: t.session.endSocPercent)?.toDouble())
                        }
                        r.charge?.let { c ->
                            put("kwh", c.estimatedEnergyKwh)
                            put("soc0", c.session.startSocPercent?.toDouble())
                            put("soc1", (c.endSoc ?: c.session.endSocPercent)?.toDouble())
                        }
                    })
                }
            })
        }.toString())
    }

    /** Stage B12: именование мест (пользовательское имя сильнее авто-имени). */
    fun savePlace(id: String?, name: String, lat: Double, lon: Double, radius: Double, autoName: String?) = exec {
        it.saveInsightPlace(
            id = id, name = name, latitude = lat, longitude = lon,
            radiusM = radius, autoName = autoName
        )
        runCatching { pushData() }
    }

    fun deletePlace(id: String) = exec {
        it.deleteInsightPlace(id)
        runCatching { pushData() }
    }

    /** Полная минутная корзина энергии — все поля графиков v2. */
    private fun bucketFull(b: com.timhss.capyenergy.telemetry.EnergyBucket): JsonObject = obj {
        put("t", b.startUtcMillis)
        put("traction", b.tractionWh)
        put("regen", b.regeneratedWh)
        put("aux", b.auxiliaryWh)
        put("climate", b.climateWh)
        put("climateSec", b.climateIntegratedSeconds)
        put("sec", b.integratedSeconds)
        put("delivered", b.deliveredWh)
        put("deliveredSec", b.deliveredCoveredSeconds)
        put("km", b.speedDistanceKm)
        put("odoKm", b.odometerDistanceKm)
        put("speedSec", b.speedIntegratedSeconds)
        put("soc0", b.startSoc)
        put("soc1", b.endSoc)
    }

    private fun liveSeriesJson(s: com.timhss.capyenergy.telemetry.LiveEnergyBuckets?): JsonObject = obj {
        put("sessionId", s?.sessionId)
        put("startedAt", s?.startedAtUtcMillis ?: 0L)
        put("bucketMillis", s?.bucketMillis ?: 60_000L)
        add("buckets", buildJsonArray { s?.buckets?.forEach { add(bucketFull(it)) } })
    }

    private fun windowJson(s: com.timhss.capyenergy.telemetry.WindowEnergySeries?): JsonObject = obj {
        put("start", s?.startUtcMillis ?: 0L)
        put("end", s?.endUtcMillis ?: 0L)
        put("bucketMillis", s?.bucketMillis ?: 60_000L)
        put("sessions", s?.sessionCount ?: 0)
        put("resampled", s?.resampledSessionCount ?: 0)
        put("rate", s?.lastChargeCostPerKwh)
        put("currency", s?.lastChargeCostCurrency)
        add("buckets", buildJsonArray { s?.buckets?.forEach { add(bucketFull(it)) } })
    }

    private fun intervalJson(e: com.timhss.capyenergy.telemetry.db.IntervalEntity): JsonObject = obj {
        put("t", e.startUtcMillis)
        put("w", e.widthMillis)
        put("delivered", e.deliveredWh)
        put("deliveredSec", e.deliveredCoveredSeconds)
        put("climate", e.climateWh)
        put("climateSec", e.climateCoveredSeconds)
        // Поля поездочных корзин: детайл истории строит из них график энергии.
        put("traction", e.tractionWh)
        put("regen", e.regenWh)
        put("aux", e.auxiliaryWh)
        put("sec", e.coveredSeconds)
        put("km", e.distanceKm)
        put("speedSec", e.speedCoveredSeconds)
        put("soc0", e.startSoc)
        put("soc1", e.endSoc)
        // Stage T2: time-authority T6 — серия ещё ждёт якоря времени загрузки
        // (Dart: seriesTimePending, interval.timeState == 'pending').
        put("timeState", e.timeState)
    }

    private fun bucketsJson(
        buckets: com.timhss.capyenergy.telemetry.LiveEnergyBuckets?,
        wh: (com.timhss.capyenergy.telemetry.EnergyBucket) -> Double
    ): com.google.gson.JsonArray {
        val a = com.google.gson.JsonArray()
        buckets?.buckets?.forEach { b ->
            val o = JsonObject()
            o.addProperty("t", b.startUtcMillis)
            o.addProperty("wh", wh(b))
            o.addProperty("km", b.speedDistanceKm)
            o.addProperty("soc", b.endSoc)
            a.add(o)
        }
        return a
    }

    companion object {
        private const val TAG = "TelemetryUiAdapter"
        private const val LIMIT = 50

        /** Окно коалесценции всплеска кадров (аналог витка event loop capy). */
        private const val LIVE_FLUSH_MS = 250L

        /** Период мягкой перечитки тяжёлого пакета при открытом живом потоке. */
        private const val HEAVY_INTERVAL_S = 10L

        /** Каденс живых корзин энергии (livePollInterval контроллера capy). */
        private const val ENERGY_POLL_S = 1L

        private fun fmt(v: Double): String =
            String.format("%.3f", v).trimEnd('0').trimEnd('.')
    }
}

/* ---------- маленький DSL над Gson, чтобы не городить конкатенацию ---------- */

private inline fun buildJsonArray(block: com.google.gson.JsonArray.() -> Unit):
    com.google.gson.JsonArray {
    val a = com.google.gson.JsonArray()
    a.block()
    return a
}

private inline fun obj(block: JsonObject.() -> Unit): JsonObject {
    val o = JsonObject()
    o.block()
    return o}

private fun JsonObject.put(key: String, value: String?) {
    if (value == null) add(key, com.google.gson.JsonNull.INSTANCE) else addProperty(key, value)
}

private fun JsonObject.put(key: String, value: Double?) {
    if (value == null) add(key, com.google.gson.JsonNull.INSTANCE) else addProperty(key, value)
}

private fun JsonObject.put(key: String, value: Float?) {
    if (value == null) add(key, com.google.gson.JsonNull.INSTANCE) else addProperty(key, value)
}

private fun JsonObject.put(key: String, value: Long) = addProperty(key, value)
private fun JsonObject.put(key: String, value: Long?) {
    if (value == null) add(key, com.google.gson.JsonNull.INSTANCE) else addProperty(key, value)
}
private fun JsonObject.put(key: String, value: Boolean) = addProperty(key, value)

private fun JsonObject.put(key: String, value: Boolean?) {
    if (value == null) add(key, com.google.gson.JsonNull.INSTANCE) else addProperty(key, value)
}
private fun JsonObject.put(key: String, value: Int?) {
    if (value == null) add(key, com.google.gson.JsonNull.INSTANCE) else addProperty(key, value)
}
