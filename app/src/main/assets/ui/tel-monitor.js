/*
 * tel-monitor.js — Stage T2 (порт телеметрии Capy → GeelyTools).
 *
 * Источник: github.com/Timoteohss/capy @ e39777c, Apache License 2.0.
 *   lib/core/energy_monitor_controller.dart — EnergyMonitorController,
 *   EnergyMonitorStats / ParkedMonitorStats / EnergyLedgerStats,
 *   EnergyChartSeries, seriesForChartWidth, _liveDomainSpan.
 *
 * Адаптация (документируется): в capy контроллер сам опрашивает
 * TelemetryApi (Flutter ↔ Kotlin). Здесь те же ответы приходят пушами
 * моста TelemetryUiAdapter:
 *   telemetry.energyLive (1 с)  = getLiveEnergyBuckets /
 *                                 getLiveContinuousEnergyBuckets
 *   telemetry.data (тяжёлый)    = окна m15/m60/m480 + p15/p60/p480
 *                                 (= getEnergyBucketsInWindow /
 *                                    getParkedEnergyBucketsInWindow),
 *                                 spans (= listSessions), настройки
 *                                 (= getTelemetrySettings)
 *   telemetry.sessionSeries     = getSeries(sessionId) + lastPricedChargeBefore
 *   telemetry.energyWindow      = мгновенный ответ на смену окна (ask())
 * Каденс сохранён: live — 1 с (движет мост), stored — раз в минуту;
 * окно/трек/сводка/слияние живого хвоста — та же семантика, что в Dart.
 *
 * Copyright 2026 Timoteohss (capy), Apache License 2.0 — see NOTICE.
 */
'use strict';

/* ══════════ Статистики (Dart-фабрики, дословно) ══════════ */

function EnergyMonitorStats(o) {
  this.measuredKmPerKwh = o.measuredKmPerKwh;
  this.distanceKm = o.distanceKm;
  this.averageSpeedKmh = o.averageSpeedKmh;
  this.estimatedCost = o.estimatedCost;
  this.costCurrency = o.costCurrency;
}
EnergyMonitorStats.fromBuckets = function (buckets, costPerKwh, costCurrency) {
  var packWh = 0, speedDistanceKm = 0, odometerDistanceKm = 0, speedSeconds = 0;
  for (var i = 0; i < buckets.length; i++) {
    var b = buckets[i];
    packWh += b.drawnWh - b.regeneratedWh;
    speedDistanceKm += b.speedDistanceKm;
    odometerDistanceKm += b.odometerDistanceKm;
    speedSeconds += b.speedIntegratedSeconds;
  }
  var distanceKm = (odometerDistanceKm >= 0.01) ? odometerDistanceKm
    : (speedDistanceKm >= 0.01) ? speedDistanceKm : null;
  var usablePackWh = (isFinite(packWh) && packWh > 0) ? packWh : null;
  var usableRate = (costPerKwh != null && isFinite(costPerKwh) && costPerKwh >= 0) ? costPerKwh : null;
  return new EnergyMonitorStats({
    measuredKmPerKwh: (distanceKm == null || usablePackWh == null) ? null : distanceKm * 1000 / usablePackWh,
    distanceKm: distanceKm,
    averageSpeedKmh: (speedSeconds > 0 && isFinite(speedDistanceKm)) ? speedDistanceKm * 3600 / speedSeconds : null,
    estimatedCost: (usablePackWh == null || usableRate == null) ? null : usablePackWh / 1000 * usableRate,
    costCurrency: costCurrency
  });
};

function ParkedMonitorStats(o) {
  this.averageDrainW = o.averageDrainW;
  this.totalEnergyKwh = o.totalEnergyKwh;
  this.measuredSeconds = o.measuredSeconds;
  this.climateShareKwh = o.climateShareKwh;
  this.estimatedCost = o.estimatedCost;
  this.costCurrency = o.costCurrency;
}
ParkedMonitorStats.fromBuckets = function (buckets, costPerKwh, costCurrency) {
  var packWh = 0, seconds = 0, climateWh = 0, climateSeconds = 0;
  for (var i = 0; i < buckets.length; i++) {
    var b = buckets[i];
    packWh += b.drawnWh - b.regeneratedWh;
    seconds += b.integratedSeconds;
    climateWh += b.climateWh;
    climateSeconds += b.climateIntegratedSeconds;
  }
  var usablePackWh = (isFinite(packWh) && packWh > 0) ? packWh : null;
  var usableRate = (costPerKwh != null && isFinite(costPerKwh) && costPerKwh >= 0) ? costPerKwh : null;
  return new ParkedMonitorStats({
    averageDrainW: (usablePackWh == null || seconds <= 0) ? null : usablePackWh * 3600 / seconds,
    totalEnergyKwh: (usablePackWh == null) ? null : usablePackWh / 1000,
    measuredSeconds: seconds,
    climateShareKwh: (seconds > 0 && climateSeconds >= seconds) ? climateWh / 1000 : null,
    estimatedCost: (usablePackWh == null || usableRate == null) ? null : usablePackWh / 1000 * usableRate,
    costCurrency: costCurrency
  });
};

function EnergyLedgerStats(o) {
  this.inWh = o.inWh; this.outWh = o.outWh;
  this.startSoc = o.startSoc; this.endSoc = o.endSoc;
  this.includesEstimate = !!o.includesEstimate;
}
Object.defineProperty(EnergyLedgerStats.prototype, 'balanceWh', {
  get: function () { return this.inWh - this.outWh; }
});
EnergyLedgerStats.fromBuckets = function (buckets, isEstimated) {
  var inWh = 0, outWh = 0, startSoc = null, endSoc = null, includesEstimate = false;
  for (var i = 0; i < buckets.length; i++) {
    var b = buckets[i];
    inWh += b.deliveredWh + b.regeneratedWh;
    outWh += b.tractionWh + b.auxiliaryWh;
    if (startSoc == null) startSoc = b.startSoc;
    if (b.endSoc != null) endSoc = b.endSoc;
    if (isEstimated && isEstimated(b)) includesEstimate = true;
  }
  return new EnergyLedgerStats({
    inWh: inWh, outWh: outWh, startSoc: startSoc, endSoc: endSoc,
    includesEstimate: includesEstimate
  });
};

/* Серия, готовая к графику (EnergyChartSeries). */
function EnergyChartSeries(o) {
  this.buckets = o.buckets;
  this.width = o.width;
  this.openIndex = (o.openIndex === undefined) ? null : o.openIndex;
  this.labels = o.labels || null;
  this.estimated = o.estimated || null;
  this.timePending = !!o.timePending;
}
EnergyChartSeries.empty = new EnergyChartSeries({ buckets: [], width: telBuckets.ONE_MINUTE_MS, openIndex: null });
Object.defineProperty(EnergyChartSeries.prototype, 'isEmpty', {
  get: function () { return this.buckets.length === 0; }
});

/* Один прочтённый ответ хранилища (_StoredEnergy). */
function _StoredEnergy(o) {
  this.buckets = o.buckets || [];
  this.windowStart = (o.windowStart === undefined) ? null : o.windowStart;
  this.costPerKwh = (o.costPerKwh === undefined) ? null : o.costPerKwh;
  this.costCurrency = (o.costCurrency === undefined) ? null : o.costCurrency;
  this.spans = o.spans || null;
  this.estimatedMinuteStarts = o.estimatedMinuteStarts || null;
  this.timePending = !!o.timePending;
}
_StoredEnergy.empty = new _StoredEnergy({ buckets: [] });

/* ══════════ EnergyMonitorController ══════════ */

function EnergyMonitorController(opts) {
  opts = opts || {};
  /* Канал запросов к мосту: emit('history.series', {sessionId}),
   * emit('energy.window', {minutes, parked}). */
  this._emit = opts.emit || function () {};
  this._now = opts.now || function () { return Date.now(); };
  this.livePollIntervalMs = opts.livePollIntervalMs || 1000;       // Dart: 1 s
  this.storedReloadIntervalMs = opts.storedReloadIntervalMs || 60000; // Dart: 1 min

  this._window = EnergyWindow.currentDrive;
  this._track = 'drive';
  this._live = [];
  this._activeSessionId = null;
  this._liveContinuous = [];
  this._activeContinuousSessionId = null;
  this._continuousSessionStart = null;

  /* Кэши ответов хранилища: {value, firstLoad, error}. */
  this._stored = { value: null, firstLoad: true, error: false };
  this._parked = { value: null, firstLoad: true, error: false };
  this._continuousMode = { value: false, firstLoad: true, error: false };

  /* Спаны сеансов (тяжёлый пакет) + серии живых сеансов по запросу. */
  this._spans = [];
  this._seriesCache = {};      // sessionId → последний ответ sessionSeries
  this._windowsCache = null;   // последний тяжёлый пакет окон (справочно)
  this._listeners = [];;
  this._storedTimer = null;
  this._active = false;

  /* Выбранный столбик держит ЭКРАН (TripsV2Screen._selectedBar): живой
   * тик пересобирает поддерево раз в секунду, и выбор, живущий внутри
   * панели, терялся бы на каждом тике. */
  this.selectedIndex = null;
}

EnergyMonitorController.prototype = {
  /* ── подписка (аналог ChangeNotifier) ── */
  addListener: function (fn) { this._listeners.push(fn); },
  removeListener: function (fn) {
    var i = this._listeners.indexOf(fn);
    if (i >= 0) this._listeners.splice(i, 1);
  },
  _notify: function () {
    for (var i = 0; i < this._listeners.length; i++) this._listeners[i](this);
  },

  /* ── циклы опроса: живой хвост движет мост (1 Гц), stored — наш таймер ── */
  start: function () {
    if (this._active) return;
    this._active = true;
    var self = this;
    this._storedTimer = setInterval(function () { self._askStoredForWindow(); },
      this.storedReloadIntervalMs);
    this._askStoredForWindow();
  },
  stop: function () {
    this._active = false;
    if (this._storedTimer != null) { clearInterval(this._storedTimer); this._storedTimer = null; }
  },
  get isPolling() { return this._active; },

  /* ── геттеры состояния ── */
  get window() { return this._window; },
  get track() { return this._track; },
  get continuousModeEnabled() { return !!(this._continuousMode.value); },
  get availableWindows() {
    var out = [];
    for (var i = 0; i < EnergyWindow.values.length; i++) {
      var candidate = EnergyWindow.values[i];
      if (candidate !== EnergyWindow.sincePowerOn || this.continuousModeEnabled) out.push(candidate);
    }
    return out;
  },
  get hasParkedData() {
    return (this._parked.value && this._parked.value.buckets.length > 0);
  },
  get isLoading() {
    return this._track === 'parked' ? this._parked.firstLoad : this._stored.firstLoad;
  },
  get hasFailed() {
    return this._track === 'parked' ? this._parked.error : this._stored.error;
  },
  get activeSessionId() { return this._activeSessionId; },
  get activeContinuousSessionId() { return this._activeContinuousSessionId; },

  get _liveTail() {
    return (this._window === EnergyWindow.sincePowerOn) ? this._liveContinuous : this._live;
  },

  /* Слияние минут (Dart: minutes). */
  get minutes() {
    if (this._track === 'parked') {
      return (this._parked.value && this._parked.value.buckets) || [];
    }
    return telBuckets.mergeEnergyBuckets(
      (this._stored.value && this._stored.value.buckets) || [],
      this._liveTail
    );
  },

  get selectedStats() {
    if (this._track === 'parked') return null;
    var buckets = this.minutes;
    if (buckets.length === 0) return null;
    return EnergyMonitorStats.fromBuckets(buckets,
      this._stored.value && this._stored.value.costPerKwh,
      this._stored.value && this._stored.value.costCurrency);
  },
  get parkedStats() {
    if (this._track !== 'parked') return null;
    var buckets = this.minutes;
    if (buckets.length === 0) return null;
    return ParkedMonitorStats.fromBuckets(buckets,
      this._parked.value && this._parked.value.costPerKwh,
      this._parked.value && this._parked.value.costCurrency);
  },
  get ledgerStats() {
    if (this._window !== EnergyWindow.sincePowerOn) return null;
    var buckets = this.minutes;
    if (buckets.length === 0) return null;
    var self = this;
    return EnergyLedgerStats.fromBuckets(buckets, this._isEstimatedMinute());
  },

  /* Оценочная минута (synthesizeSleepGapEnergyBuckets) против того же
   * множества, что у ledger и свёртки меток графика. */
  _isEstimatedMinute: function () {
    var estimatedStarts = this._stored.value && this._stored.value.estimatedMinuteStarts;
    if (!estimatedStarts) return null;
    return function (bucket) { return estimatedStarts.indexOf(bucket.start) >= 0; };
  },

  /* ── выбор окна/трека (Dart: selectWindow/selectTrack) ── */
  selectWindow: function (window) {
    if (this._window === window) return;
    this._window = window;
    if (window.isLive) this._track = 'drive';
    this._notify();
    /* Прежнее окно — другой вопрос, не устаревшая версия этого: `ask`
     * читает немедленно, чтобы график не показывал старую серию под новой
     * меткой. */
    this._askStoredForWindow();
  },
  selectTrack: function (track) {
    if (this._track === track) return;
    if (track === 'parked' && this._window.isLive) return;
    this._track = track;
    this._notify();
  },

  /* ── входы моста ── */

  /* telemetry.energyLive (1 Гц): {energy, cont, …} — живые корзины. */
  onEnergyLive: function (d) {
    if (!this._active) return;
    this._pollLive(d.energy, false);
    this._pollLive(d.cont, true);
  },
  _pollLive: function (live, continuous) {
    if (!live) return;
    var sessionId = live.sessionId || null;
    var buckets = (live.buckets || []).map(function (m) {
      return telBuckets.EnergyBucket.fromMap(m, live.bucketMillis || 60000);
    });
    var sessionChanged;
    if (continuous) {
      sessionChanged = sessionId !== this._activeContinuousSessionId;
      this._activeContinuousSessionId = sessionId;
      this._continuousSessionStart = live.startedAt || null;
      this._liveContinuous = buckets;
      if (sessionChanged && this._window === EnergyWindow.sincePowerOn) this._askStored();
    } else {
      sessionChanged = sessionId !== this._activeSessionId;
      this._activeSessionId = sessionId;
      this._live = buckets;
      if (sessionChanged && this._window === EnergyWindow.currentDrive) this._askStored();
    }
    this._notify();
  },

  /* telemetry.data (тяжёлый пакет): окна, спаны, настройки. */
  onData: function (d) {
    var self = this;
    if (d && d.windows) {
      var w = d.windows;
      var winMap = {
        last15Minutes: { stored: w.m15, parked: w.p15 },
        lastHour: { stored: w.m60, parked: w.p60 },
        last8Hours: { stored: w.m480, parked: w.p480 }
      };
      this._windowsCache = winMap;
      Object.keys(winMap).forEach(function (name) {
        var entry = winMap[name];
        var isSel = (self._window.name === name);
        self._applyWindowSeries(name, false, entry.stored, isSel);
        self._applyWindowSeries(name, true, entry.parked, isSel);
      });
    }
    if (d && d.spans) this._spans = d.spans.map(function (s) { return new telLabelling.SessionSpan(s); });
    if (d && d.set && d.set.continuous != null) {
      var wasOff = !this._continuousMode.value;
      this._continuousMode.value = !!d.set.continuous;
      this._continuousMode.firstLoad = false;
      /* Режим выключили — селектор, предлагающий «С момента включения»,
       * вернулся к текущей поездке (Dart: _onContinuousModeChanged). */
      if (this._continuousMode.value === false && wasOff === false &&
          this._window === EnergyWindow.sincePowerOn) {
        this.selectWindow(EnergyWindow.currentDrive);
        return;
      }
    }
    this._notify();
  },

  _applyWindowSeries: function (windowName, parked, series, isSelected) {
    var target = parked ? this._parked : this._stored;
    /* Обновляем кэш того окна, что выбрано сейчас (Dart держит один
     * _stored на выбранное окно; прочие окна приходят в пакете и идут
     * мимо, пока не выбраны). */
    if (!isSelected || !series) return;
    target.value = new _StoredEnergy({
      buckets: (series.buckets || []).map(function (m) {
        return telBuckets.EnergyBucket.fromMap(m, series.bucketMillis || 60000);
      }),
      windowStart: series.start || null,
      costPerKwh: (series.rate === undefined) ? null : series.rate,
      costCurrency: (series.currency === undefined) ? null : series.currency
    });
    target.firstLoad = false;
    target.error = false;
  },

  /* telemetry.sessionSeries: ответ на наш ask по живому окну. */
  onSessionSeries: function (d) {
    if (!d) return;
    this._seriesCache[d.sessionId] = d;
    /* Ответ принадлежит окну, которое спрашивали; перечитываем, если
     * он всё ещё актуален (счётчик запросов Dart здесь — id сеанса). */
    if (this._window.isLive) this._rebuildStoredFromCache();
  },

  /* telemetry.energyWindow: мгновенный ответ на смену окна часов. */
  onEnergyWindow: function (d) {
    if (!d || !d.series) return;
    var name = (d.minutes === 15) ? 'last15Minutes'
      : (d.minutes === 60) ? 'lastHour' : 'last8Hours';
    var isSel = (this._window.name === name);
    this._applyWindowSeries(name, !!d.parked, d.series, true);
    if (isSel) this._notify();
  },

  /* ── ask: немедленное чтение под выбранный вопрос ── */
  _askStoredForWindow: function () { this._askStored(); },
  _askStored: function () {
    if (!this._active) return;
    var window = this._window;
    if (window.isLive) {
      var sessionId = (window === EnergyWindow.sincePowerOn)
        ? this._activeContinuousSessionId
        : this._activeSessionId;
      /* Живое окно ещё не названо — «ничего не идёт», не ошибка. */
      if (sessionId == null) {
        this._stored.value = _StoredEnergy.empty;
        this._stored.firstLoad = false;
        this._stored.error = false;
        this._notify();
        return;
      }
      this._emit('history.series', { sessionId: sessionId });
      /* Кэш ответа может уже быть (тот же сеанс на тике) — рисуем его. */
      if (this._seriesCache[sessionId]) this._rebuildStoredFromCache();
      else {
        this._stored.firstLoad = (this._stored.value == null);
        this._notify();
      }
    } else {
      /* Часовые окна: сначала последний тяжёлый пакет этого окна (если
       * есть), затем мгновенный ответ моста. Parked читается всегда —
       * иначе тумблер трека не знал бы, есть ли данные. */
      var cache = this._windowsCache;
      if (cache && cache[this._window.name]) {
        var entry = cache[this._window.name];
        this._applyWindowSeries(this._window.name, false, entry.stored, true);
        this._applyWindowSeries(this._window.name, true, entry.parked, true);
      }
      this._emit('energy.window', { minutes: window.minutes, parked: false });
      this._emit('energy.window', { minutes: window.minutes, parked: true });
    }
  },

  _rebuildStoredFromCache: function () {
    var window = this._window;
    if (window === EnergyWindow.sincePowerOn) {
      var contId = this._activeContinuousSessionId;
      var answer = contId ? this._seriesCache[contId] : null;
      var sessionStart = this._continuousSessionStart ||
        (answer && answer.start) || null;
      if (!answer || sessionStart == null) {
        this._stored.value = _StoredEnergy.empty;
        this._stored.firstLoad = false;
        this._stored.error = false;
        this._notify();
        return;
      }
      var rawBuckets = (answer.intervals || []).map(function (e) {
        return telBuckets.EnergyBucket.fromMap(e, e.w || 60000);
      });
      var reconciled = telBuckets.reconcileSessionEnergyBuckets(rawBuckets, sessionStart);

      /* Спаны: kind != CONTINUOUS, конец (или открыт) внутри окна от
       * windowStart−24 ч, старт не позже сейчас — клиентский фильтр Dart. */
      var nowMs = this._now();
      var fromMs = sessionStart - 24 * 3600000;
      var spans = [];
      for (var i = 0; i < this._spans.length; i++) {
        var s = this._spans[i];
        if (s.kind === 'CONTINUOUS') continue;
        if ((s.end == null || s.end >= fromMs) && s.start <= nowMs) spans.push(s);
      }
      var synthesized = telLabelling.synthesizeSleepGapEnergyBuckets(reconciled, spans);
      var buckets = telBuckets.mergeEnergyBuckets(reconciled, synthesized);
      var estimatedMinuteStarts = synthesized.map(function (b) { return b.start; });
      var timePending = (answer.intervals || []).some(function (e) { return e.timeState === 'pending'; });
      this._stored.value = new _StoredEnergy({
        buckets: buckets, spans: spans,
        estimatedMinuteStarts: estimatedMinuteStarts,
        timePending: timePending
      });
      this._stored.firstLoad = false;
      this._stored.error = false;
      this._notify();
      return;
    }
    if (window === EnergyWindow.currentDrive) {
      var tripId = this._activeSessionId;
      var ans = tripId ? this._seriesCache[tripId] : null;
      if (!ans) {
        this._stored.value = _StoredEnergy.empty;
        this._stored.firstLoad = false;
        this._stored.error = false;
        this._notify();
        return;
      }
      var raw = (ans.intervals || []).map(function (e) {
        return telBuckets.EnergyBucket.fromMap(e, e.w || 60000);
      });
      var reb = telBuckets.reconcileSessionEnergyBuckets(raw, ans.start || null);
      var pending = (ans.intervals || []).some(function (e) { return e.timeState === 'pending'; });
      this._stored.value = new _StoredEnergy({
        buckets: reb,
        costPerKwh: (ans.priced && ans.priced.costPerKwh != null) ? ans.priced.costPerKwh : null,
        costCurrency: (ans.priced && ans.priced.currency != null) ? ans.priced.currency : null,
        timePending: pending
      });
      this._stored.firstLoad = false;
      this._stored.error = false;
      this._notify();
      return;
    }
  },

  /* ── серия под ширину графика (Dart: seriesForChartWidth) ── */
  seriesForChartWidth: function (chartWidth, capacity) {
    var source = this.minutes;
    if (source.length === 0) return EnergyChartSeries.empty;
    if (capacity <= 0) return EnergyChartSeries.empty;

    var now = this._now();
    var relevantSessionId = (this._window === EnergyWindow.sincePowerOn)
      ? this._activeContinuousSessionId
      : this._activeSessionId;
    var live = (this._track !== 'parked') && this._window.isLive && relevantSessionId != null;
    var selectedMinutes = this._window.minutes;
    var span = (selectedMinutes == null)
      ? this._liveDomainSpan(source, now)
      : selectedMinutes * 60000;
    var width = telBuckets.chooseEnergyBucketWidth(span, capacity);

    /* Живой график шагает шире в момент, когда финальный слот закрылся. */
    if (live && span >= width * capacity) {
      width = telBuckets.nextEnergyBucketWidth(width);
    }

    var reduced = telBuckets.reduceEnergyBuckets(source, width, live ? source[0].start : null);

    /* Левый край часового окна режет интервал наискось — такой бар
     * выбрасываем; первый бар поездки остаётся. */
    var windowStart = (this._track === 'parked')
      ? (this._parked.value && this._parked.value.windowStart)
      : (this._stored.value && this._stored.value.windowStart);
    var domainStart = (windowStart == null)
      ? reduced[0].start
      : telBuckets.ceilEnergyBucketBoundary(windowStart, width);
    if (windowStart != null) {
      var kept = [];
      for (var r = 0; r < reduced.length; r++) {
        if (reduced[r].start >= domainStart) kept.push(reduced[r]);
      }
      reduced = kept;
      if (reduced.length === 0) return EnergyChartSeries.empty;
    }

    var openBucket = telBuckets.openEnergyBucketIndex(reduced, live, now);
    var openStart = (openBucket == null) ? null : reduced[openBucket].start;
    var buckets = telBuckets.fillEnergyBucketSlots(reduced, domainStart, width, capacity);
    var labelling = this._labelsAndEstimatedFor(buckets, now);
    var openIndex = null;
    if (openStart != null) {
      for (var bi = 0; bi < buckets.length; bi++) {
        if (buckets[bi].start === openStart) { openIndex = bi; break; }
      }
    }
    return new EnergyChartSeries({
      buckets: buckets, width: width, openIndex: openIndex,
      labels: labelling ? labelling[0] : null,
      estimated: labelling ? labelling[1] : null,
      timePending: !!(this._stored.value && this._stored.value.timePending)
    });
  },

  /* Метка + оценочность на бар (только «С момента включения»). */
  _labelsAndEstimatedFor: function (buckets, now) {
    if (this._window !== EnergyWindow.sincePowerOn) return null;
    var spans = this._stored.value && this._stored.value.spans;
    if (!spans) return null;
    var isEstimated = this._isEstimatedMinute();
    var labelled = telLabelling.labelEnergyBuckets(this.minutes, spans, now, isEstimated);
    var byStart = {};
    for (var i = 0; i < labelled.length; i++) byStart[labelled[i].bucket.start] = labelled[i];
    var labels = [];
    for (var b = 0; b < buckets.length; b++) {
      var labelList = [];
      for (var t = buckets[b].start; t < buckets[b].start + buckets[b].width; t += telBuckets.ONE_MINUTE_MS) {
        var m = byStart[t];
        labelList.push(m ? m.label : null);
      }
      labels.push(telLabelling.resolveStretchLabel(labelList));
    }
    /* estimated: «любая» из покрытых минут — widened бар с хоть одной
     * оценочной минутой не может читаться как измеренный. */
    var estimated = coveredEstimated(buckets, byStart);
    return [labels, estimated];
  },

  /* Охват живого окна: счёт записанных минут, а не разница штампов. */
  _liveDomainSpan: function (source, now) {
    var measured = telBuckets.energyBucketSpan(source);
    var last = source[source.length - 1];
    var lastEnd = last.start + last.width;
    if (now > lastEnd) return measured;
    var openProgress = (now > last.start) ? (now - last.start) : 0;
    var openRemainder = Math.max(0, Math.min(last.width - openProgress, last.width));
    return measured - openRemainder;
  }
};

/* Свёртка estimated по покрытым минутам («любая»). */
function coveredEstimated(buckets, byStart) {
  var out = [];
  for (var b = 0; b < buckets.length; b++) {
    var any = false;
    for (var t = buckets[b].start; t < buckets[b].start + buckets[b].width; t += telBuckets.ONE_MINUTE_MS) {
      var m = byStart[t];
      if (m && m.estimated) { any = true; break; }
    }
    out.push(any);
  }
  return out;
}
