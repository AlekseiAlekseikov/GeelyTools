package com.example.voiceapp3.ui

import android.content.Context
import android.os.SystemClock
import android.util.Log
import com.google.gson.JsonArray
import com.google.gson.JsonObject
import com.timhss.capyenergy.diagnostics.SensorLabStreamer
import com.timhss.capyenergy.roadcast.RoadcastCadence
import com.timhss.capyenergy.roadcast.RoadcastSchemaEntry
import com.timhss.capyenergy.roadcast.RoadcastSnapshot
import com.timhss.capyenergy.roadcast.RoadcastSnapshotState
import com.timhss.capyenergy.roadcast.RoadcastState
import com.timhss.capyenergy.roadcast.RoadcastSubscription
import com.timhss.capyenergy.telemetry.TelemetryRuntime
import io.flutter.plugin.common.EventChannel
import kotlinx.coroutines.CoroutineExceptionHandler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import java.util.concurrent.Executors

/**
 * Stage B4: инженерные экраны разработчика (⚙ → Разработчик).
 *
 * Три экрана макета на реальных источниках движка capy:
 *  - ROADCAST ТРЕЙС и ЛАБОРАТОРИЯ СИГНАЛОВ — репозиторий Roadcast:
 *    согласованная схема CAN + один батч-снапшот на 10 Гц по подписке
 *    на все сигналы (см. RoadcastRepository.subscribe — объединение
 *    вотчлистов в одно JNI-чтение). Логика «что менялось» — порт
 *    CanActivityTracker из lib/core/can_activity.dart (capy), адаптация:
 *    история для спарклайна строится на JS из тиков, здесь только
 *    счётчики/возраст/частота.
 *  - ЛАБОРАТОРИЯ ДАТЧИКОВ — diagnostics/SensorLabStreamer как есть:
 *    его EventSink подключён к нашему пушу (см. шим io/flutter/…/EventChannel.kt,
 *    где подписка потребителей через мост WebView была заявлена планом).
 *
 * Протокол в JS (window.__nativeEvent):
 *  lab.schema {schema: [[name, canId, unit], …]}            — при (пере)подписке
 *  lab.base   {base:   [[value, raw, valid, cal, published], …]} — первый снапшот
 *  lab.tick   {alive, t, rows: [[name, v, raw, vd, cl, ageMs, cps, chg], …]} — 10 Гц
 *  lab.sensor {pitchDeg, rollDeg, vertical, horizontal, peaks…, sampleCount} — 10 Гц
 *
 * rows содержат только сигналы, менявшиеся с момента подписки: молчащие
 * остаются константными с baseline из lab.base (это корректно — значение
 * не менялось, поэтому и не стримится).
 */
class DevLabController(
    context: Context,
    private val push: (name: String, json: String) -> Unit
) {

    private val appContext = context.applicationContext
    private val lock = Any()
    private val openScreens = mutableSetOf<String>()

    private val dispatcher =
        Executors.newSingleThreadExecutor { r -> Thread(r, "dev-lab-ui") }
            .asCoroutineDispatcher()

    /**
     * Инженерный экран не должен иметь права уронить приложение: любое
     * исключение в потоках лаборатории логируется и глотается
     * (экран покажет честный статус недоступности, приложение живёт).
     */
    private val scope = CoroutineScope(
        SupervisorJob() + dispatcher +
            CoroutineExceptionHandler { _, t -> Log.e(TAG, "dev lab error", t) }
    )

    // ── Roadcast (Trace + Signal Lab) ──────────────────────────────────────

    private var stateJob: Job? = null
    private var tickJob: Job? = null
    private var subscription: RoadcastSubscription? = null
    private var tracker: Tracker? = null
    /** Хэш схемы, на которую подписаны; смена = перезапуск генерации. */
    private var subscribedSchemaKey: Long = Long.MIN_VALUE
    private var basePushed = false
    /** Демон терялся (Unavailable) — при следующей готовой схеме сбрасываем трекер. */
    private var sawUnavailable = false

    // ── Sensor Lab ─────────────────────────────────────────────────────────

    private var sensorStreamer: SensorLabStreamer? = null

    /** UI открыл экран; запускаем соответствующий поток данных. */
    fun open(screen: String) {
        if (screen !in SCREENS) return
        synchronized(lock) { openScreens.add(screen) }
        // onEvent приходит на потоке JS-моста WebView — вся работа уходит
        // на собственный поток контроллера.
        scope.launch {
            when (screen) {
                "trace", "signallab" -> ensureRoadcast()
                "sensorlab" -> ensureSensor()
            }
        }
    }

    /** UI закрыл экран; останавливаем потоки, когда они больше никому не нужны. */
    fun close(screen: String) {
        if (screen !in SCREENS) return
        val canScreens = synchronized(lock) {
            openScreens.remove(screen)
            openScreens.toSet()
        }
        scope.launch {
            if (screen == "trace" || screen == "signallab") {
                if ("trace" !in canScreens && "signallab" !in canScreens) stopRoadcast()
            }
            if (screen == "sensorlab" && "sensorlab" !in canScreens) stopSensor()
        }
    }

    // ── Roadcast: подписка на всю схему ────────────────────────────────────

    private fun ensureRoadcast() {
        if (stateJob?.isActive == true) return
        stateJob = scope.launch {
            val repository = TelemetryRuntime.get(appContext).roadcastRepository
            repository.state.collect { state ->
                if (state is RoadcastState.Unavailable) {
                    // Демон терялся — следующая готовая схема означает новую эпоху
                    // штампов: трекер пересоздаётся (как replacementTracker в capy),
                    // иначе каждый сигнал «изменится» один раз от смены эпохи.
                    sawUnavailable = true
                }
                val entries = when (state) {
                    is RoadcastState.Ready -> state.schema
                    is RoadcastState.Unavailable -> state.lastKnownSchema
                    else -> emptyList()
                }
                if (entries.isEmpty()) return@collect
                val key = when (state) {
                    is RoadcastState.Ready ->
                        state.status.schemaHash * 31 + state.status.schemaVersion
                    is RoadcastState.Unavailable ->
                        (state.lastKnownStatus?.schemaHash ?: 0L) * 31 +
                            (state.lastKnownStatus?.schemaVersion ?: 0)
                    else -> 0L
                }
                val generationChanged = sawUnavailable || key != subscribedSchemaKey
                sawUnavailable = false
                if (!generationChanged) return@collect
                subscribedSchemaKey = key
                resubscribe(repository, entries)
            }
        }
    }

    private fun resubscribe(
        repository: com.timhss.capyenergy.roadcast.RoadcastRepository,
        entries: List<RoadcastSchemaEntry>
    ) {
        tickJob?.cancel()
        subscription?.close()
        basePushed = false
        tracker = Tracker(entries)

        pushSchema(entries)

        subscription = repository
            .subscribe(entries.map { it.name }.toSet(), RoadcastCadence.tenHz)
            .also { sub ->
                tickJob = scope.launch {
                    sub.state.collect { snap ->
                        when (snap) {
                            is RoadcastSnapshotState.Ready -> onSnapshot(snap.snapshot)
                            is RoadcastSnapshotState.Unavailable -> {
                                // Демон перестал публиковать — честный факт окна.
                                pushTick(emptyList(), alive = false, 0L)
                            }
                            RoadcastSnapshotState.Waiting -> Unit
                        }
                    }
                }
            }
    }

    private fun stopRoadcast() {
        stateJob?.cancel(); stateJob = null
        tickJob?.cancel(); tickJob = null
        subscription?.close(); subscription = null
        tracker = null
        subscribedSchemaKey = Long.MIN_VALUE
    }

    private fun onSnapshot(snapshot: RoadcastSnapshot) {
        val t = tracker ?: return
        val nowMs = SystemClock.elapsedRealtime()
        t.observe(snapshot, nowMs)
        if (!basePushed) {
            basePushed = true
            pushBase(t)
        }
        // Свежесть сэмпла: репозиторий уже отфильтровал мёртвые подключения
        // (publishUnavailable), поэтому здесь дополнительно проверяем лишь
        // возраст последнего сэмпла — как isAlive() у сессии.
        val alive = snapshot.sampleAgeNanos in 0..ALIVE_NS
        pushTick(t.activeRows(nowMs), alive, nowMs)
    }

    // ── Sensor Lab ─────────────────────────────────────────────────────────

    private fun ensureSensor() {
        if (sensorStreamer != null) return
        // SensorLabStreamer.onListen регистрирует слушателя с FASTEST —
        // без разрешения HIGH_SAMPLING_RATE_SENSORS фреймворк кидает
        // SecurityException (см. манифест). Ловим любой сбой запуска датчиков
        // и честно сообщаем экрану: приложение не должно падать.
        runCatching {
            val streamer = SensorLabStreamer(appContext)
            streamer.onListen(null, object : EventChannel.EventSink {
                override fun success(event: Any?) {
                    val map = event as? Map<*, *> ?: return
                    val o = JsonObject()
                    for ((k, v) in map) {
                        when (v) {
                            is Float -> o.addProperty(k.toString(), v.toDouble())
                            is Int -> o.addProperty(k.toString(), v)
                            is Boolean -> o.addProperty(k.toString(), v)
                        }
                    }
                    push("lab.sensor", o.toString())
                }

                override fun error(code: String?, message: String?, details: Any?) {
                    // SensorLabStreamer сообщает так об отсутствии акселерометра.
                    push("lab.sensor", "{\"unavailable\":true}")
                }
            })
            sensorStreamer = streamer
        }.onFailure { t ->
            Log.e(TAG, "sensor lab unavailable", t)
            sensorStreamer = null
            push("lab.sensor", "{\"unavailable\":true}")
        }
    }

    private fun stopSensor() {
        sensorStreamer?.let { streamer ->
            runCatching { streamer.onCancel(null) }
            runCatching { streamer.dispose() }
        }
        sensorStreamer = null
    }

    /** Контроллер больше не нужен (закрытие всего UI). */
    fun shutdown() {
        stopRoadcast()
        stopSensor()
        synchronized(lock) { openScreens.clear() }
        scope.cancel()
        dispatcher.close()
    }

    // ── Трекер активности (порт CanActivityTracker, см. шапку класса) ─────

    private class SignalAct {
        var value = 0.0
        var raw = 0L
        var valid = false
        var calibrated = false
        /** Штамп последнего изменения от демона; -1 = ещё не наблюдали. */
        var lastTs = -1L
        var lastChangeAtMs = 0L
        var changeCount = 0
        val recent = ArrayDeque<Long>()

        val everChanged: Boolean get() = changeCount > 0
    }

    private class Tracker(val entries: List<RoadcastSchemaEntry>) {
        private val acts = HashMap<String, SignalAct>(entries.size * 2)

        init {
            for (e in entries) acts[e.name] = SignalAct()
        }

        /** Первый снапшот устанавливает baseline и изменением не считается. */
        fun observe(snapshot: RoadcastSnapshot, nowMs: Long) {
            for ((name, sample) in snapshot.samples) {
                val a = acts[name] ?: continue
                a.value = sample.physical
                a.raw = sample.raw
                a.valid = sample.valid
                a.calibrated = sample.calibrated
                if (a.lastTs < 0) {
                    a.lastTs = sample.lastChangeNanos
                    continue
                }
                if (sample.lastChangeNanos != a.lastTs) {
                    a.lastTs = sample.lastChangeNanos
                    a.lastChangeAtMs = nowMs
                    a.changeCount++
                    a.recent.addLast(nowMs)
                    while (a.recent.isNotEmpty() && a.recent.first() < nowMs - RATE_MS) {
                        a.recent.removeFirst()
                    }
                }
            }
        }

        /** Значения baseline (до первого изменения) для молчащих сигналов. */
        fun baseRow(entry: RoadcastSchemaEntry): JsonArray? {
            val a = acts[entry.name] ?: return null
            return arrOf(
                trim(a.value), a.raw, a.valid, a.calibrated,
                a.lastTs > 0 // публиковался до нашей подписки (штамп демона)
            )
        }

        /** Строки тика: только менявшиеся сигналы (см. шапку класса). */
        fun activeRows(nowMs: Long): List<JsonArray> {
            val out = ArrayList<JsonArray>(64)
            for (entry in entries) {
                val a = acts[entry.name] ?: continue
                if (!a.everChanged) continue
                val age = nowMs - a.lastChangeAtMs
                val cps = a.recent.size / (RATE_MS / 1000.0)
                out.add(
                    arrOf(
                        entry.name, trim(a.value), a.raw, a.valid, a.calibrated,
                        age, Math.round(cps * 10.0) / 10.0, a.changeCount
                    )
                )
            }
            return out
        }
    }

    // ── JSON ───────────────────────────────────────────────────────────────

    private fun pushSchema(entries: List<RoadcastSchemaEntry>) {
        val schema = JsonArray(entries.size)
        for (e in entries) schema.add(arrOf(e.name, e.canId, e.unit))
        val root = obj()
        root.add("schema", schema)
        push("lab.schema", root.toString())
    }

    private fun pushBase(t: Tracker) {
        val base = JsonArray(t.entries.size)
        for (e in t.entries) {
            val row = t.baseRow(e) ?: JsonArray().also { it.apply {} }
            base.add(row)
        }
        val root = obj()
        root.add("base", base)
        push("lab.base", root.toString())
    }

    private fun pushTick(rows: List<JsonArray>, alive: Boolean, t: Long) {
        val root = obj()
        root.addProperty("alive", alive)
        root.addProperty("t", t)
        val arr = JsonArray(rows.size)
        for (r in rows) arr.add(r)
        root.add("rows", arr)
        push("lab.tick", root.toString())
    }

    private companion object {
        private val SCREENS = setOf("trace", "signallab", "sensorlab")
        private const val TAG = "DevLabController"
        private const val RATE_MS = 5_000L // окно «изменений/с», как в capy
        private const val ALIVE_NS = 500_000_000L

        /** Компактное число: без хвостов double в JSON. */
        fun trim(v: Double): Double {
            val a = Math.abs(v)
            return when {
                !v.isFinite() -> 0.0
                a >= 1000 -> Math.round(v).toDouble()
                a >= 100 -> Math.round(v * 10) / 10.0
                a >= 1 -> Math.round(v * 100) / 100.0
                else -> Math.round(v * 1000) / 1000.0
            }
        }

        fun obj(): JsonObject = JsonObject()

        fun arrOf(vararg values: Any?): JsonArray {
            val a = JsonArray()
            for (v in values) {
                when (v) {
                    is String -> a.add(v)
                    is Double -> a.add(v)
                    is Long -> a.add(v)
                    is Int -> a.add(v)
                    is Boolean -> a.add(v)
                    null -> a.add(com.google.gson.JsonNull.INSTANCE)
                }
            }
            return a
        }
    }
}
