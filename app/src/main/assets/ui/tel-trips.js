/*
 * tel-trips.js — Stage T2 (порт телеметрии Capy → GeelyTools).
 *
 * Источник: github.com/Timoteohss/capy @ e39777c, Apache License 2.0.
 *   lib/screens_v2/trips/trips_v2_screen.dart — TwoColumnLayout(
 *     primary: EnergyUsePanel, trailing: EnergySessionPanel);
 *   lib/screens_v2/trips/energy_monitor_panel.dart — карточка «Расход
 *     энергии»: график + выбор окна + статистики (drive/parked/ledger);
 *   lib/screens_v2/energy_session_panel.dart — «Сведения о сеансе»:
 *     кольцо-донат с внутренней дугой регена + легенда + пояснение;
 *   lib/screens_v2/charts/trip_energy_bar_chart.dart — маппинг бакетов
 *     на столбцы (value=привод, base=прочие, mid=климат,
 *     counter=-(реген+заряд) под осью);
 *   lib/screens_v2/charts/energy_state_band.dart — полоса состояний;
 *   lib/screens_v2/energy_bucket_tooltip.dart — содержимое тултипа.
 *
 * Адаптации (документируются):
 *   - RangeDropPanel НЕ монтируется — как и в источнике (issue 170);
 *   - EfficiencyUnitController хранит единицу в localStorage WebView
 *     (в capy — SharedPreferences, ключ 'efficiency_unit');
 *   - часы оси — всегда 24-часовые (локаль RU);
 *   - «Синхронизация» и гейджи самописного макета не входят в этот экран.
 *
 * Copyright 2026 Timoteohss (capy), Apache License 2.0 — see NOTICE.
 */
'use strict';

/* ══════════ EfficiencyUnitController (синглтон, как в Dart) ══════════ */
var EfficiencyUnitController = (function () {
  var instance = null;
  function Controller() {
    var saved = null;
    try { saved = window.localStorage.getItem('efficiency_unit'); } catch (e) {}
    this._unit = (saved === 'kwhPer50km' || saved === 'kwhPer100km') ? saved : 'kmPerKwh';
    this._listeners = [];
  }
  Controller.prototype = {
    get unit() { return this._unit; },
    addListener: function (fn) { this._listeners.push(fn); },
    cycle: function () {
      var values = telEfficiency.EfficiencyUnit.values;
      this._unit = values[(values.indexOf(this._unit) + 1) % values.length];
      try { window.localStorage.setItem('efficiency_unit', this._unit); } catch (e) {}
      for (var i = 0; i < this._listeners.length; i++) this._listeners[i]();
    }
  };
  return {
    get instance() {
      if (!instance) instance = new Controller();
      return instance;
    }
  };
})();

/* ══════════ Метки окна (energyWindowLabel) ══════════ */
function energyWindowLabel(window) {
  switch (window.name) {
    case 'currentDrive': return TEL_L10N.energyWindowCurrentDrive;
    case 'sincePowerOn': return TEL_L10N.energyWindowSincePowerOn;
    case 'last15Minutes': return TEL_L10N.energyWindowLast15Minutes;
    case 'lastHour': return TEL_L10N.energyWindowLastHour;
    case 'last8Hours': return TEL_L10N.energyWindowLast8Hours;
  }
  return window.name;
}

/* Названия состояний «С момента включения» (continuousLabelText). */
function continuousLabelText(label) {
  switch (label) {
    case 'trip': return TEL_L10N.energyModeDrive;
    case 'parked': return TEL_L10N.energyModeParked;
    case 'charge': return TEL_L10N.energyStateCharge;
    default: return TEL_L10N.energyStatePoweredOn;
  }
}

/* ══════════ TripsV2Screen ══════════ */
var telTrips = (function () {
  var mounted = false;         // экран построен (инстансы графиков живы)
  var chart = null;            // telUI.EnergyBarChart
  var donut = null;            // telUI.SegmentedDonut
  var notifyFn = null;         // подписка на контроллер
  var unitFn = null;           // подписка на смену единицы эффективности
  var selectedBar = null;      // держит ЭКРАН — переживает тик в 1 с
  var dropOpen = false;        // меню выбора окна
  var infoOpen = null;         // 'energy' | 'session' | null

  var C = null;                // EnergyMonitorController (TMON)

  function setController(controller) { C = controller; }

  /* ── рост графика: chase на живых окнах, иначе settle ── */
  function growthFor() {
    if (!C) return { growthMs: 180, growthCurve: 'settle' };
    var live = C.track !== 'parked' && C.window.isLive;
    return live
      ? { growthMs: C.livePollIntervalMs, growthCurve: 'linear' }
      : { growthMs: 180, growthCurve: 'settle' };
  }

  /* ── маппинг бакета на столбец (порт TripEnergyBarChart._bar) ── */
  function barFor(bucket, isParked, isEstimated) {
    /* Dart: id = (bucket.start, bucket.width) — record со value-equality.
       Здесь примитив, чтобы id переживал тик (сравнение по значению). */
    var id = bucket.start + ':' + bucket.width;
    if (bucket.isEmpty) {
      return { id: id, value: NaN, base: NaN, mid: NaN, counter: NaN, state: 'actual' };
    }
    var state = isEstimated ? 'estimated' : 'actual';
    var energy = readEnergyComposition([bucket]);
    var counter = -(bucket.regeneratedWh + bucket.deliveredWh) / 1000;
    if (isParked) {
      return {
        id: id, value: 0,
        base: energy.system / 1000, mid: energy.climate / 1000,
        counter: counter, state: state
      };
    }
    return {
      id: id,
      value: bucket.tractionWh / 1000,
      base: energy.system / 1000, mid: energy.climate / 1000,
      counter: counter, state: state
    };
  }

  /* ── тултип столбца (порт EnergyBucketTooltip) ── */
  function tooltipFor(buckets, labels, estimated, openIndex, timeUnsynced, widthMs) {
    return function (index) {
      var bucket = buckets[index];
      if (bucket.isEmpty) return '';
      var label = labels ? labels[index] : null;
      var isParked = label == null ? (C && C.track === 'parked') : label === 'parked';
      var energy = readEnergyComposition([bucket]);
      var c = telUI.theme();

      function kwh(wh, decimals) {
        return (wh / 1000).toFixed(decimals == null ? 2 : decimals) + ' ' + TEL_L10N.unitKwh;
      }
      function timeLabel(ms) {
        var d = new Date(ms);
        return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
      }
      var windowTxt;
      if (timeUnsynced) {
        /* arb: '+{minutes} мин' — минуты от старта серии, не часы оси. */
        var fmtRel = function (m) { return '+' + m + ' мин'; };
        windowTxt = fmtRel(Math.round(widthMs * index / 60000)) + '–' + fmtRel(Math.round(widthMs * (index + 1) / 60000));
      } else {
        windowTxt = timeLabel(bucket.start) + '–' + timeLabel(bucket.start + bucket.width);
      }
      var labelText = null;
      if (label != null) {
        labelText = estimated && estimated[index]
          ? continuousLabelText(label) + ' · ' + TEL_L10N.liveChargeBadgeEstimate
          : continuousLabelText(label);
      }
      var socRow = null;
      if (label != null) {
        var s0 = bucket.startSoc, s1 = bucket.endSoc;
        if (s0 != null || s1 != null) {
          socRow = {
            label: (s0 == null ? '--' : Math.round(s0) + '%') + ' → ' +
              (s1 == null ? '--' : Math.round(s1) + '%') + ' SOC'
          };
        }
      }

      var rows = [];
      if (labelText != null) rows.push({ label: labelText });
      if (energy.divided && energy.climate > 0) {
        rows.push({ label: TEL_L10N.energyClimate, value: kwh(energy.climate, isParked ? 3 : 2), color: c.energy.drawSoft });
      }
      if (energy.system > 0) {
        rows.push({ label: TEL_L10N.energyAuxiliary, value: kwh(energy.system, isParked ? 3 : 2), color: c.energy.drawSubtle });
      }
      if (bucket.regeneratedWh > 0) rows.push({ label: '+' + kwh(bucket.regeneratedWh, isParked ? 3 : 2), color: c.energy.gain });
      if (bucket.deliveredWh > 0) rows.push({ label: '+' + kwh(bucket.deliveredWh, isParked ? 3 : 2), color: c.energy.gain });
      rows.push({ label: (index === openIndex ? windowTxt + ' · ' + TEL_L10N.energyBarOpen : windowTxt) });
      if (socRow) rows.push(socRow);

      if (isParked) {
        var watts = energy.seconds > 0 ? energy.drawn * 3600 / energy.seconds : null;
        return telUI.chartTooltip({
          value: watts != null ? String(Math.round(watts)) : '--',
          unit: TEL_L10N.unitWatt,
          rows: rows
        });
      }
      return telUI.chartTooltip({
        value: (bucket.drawnWh / 1000).toFixed(2),
        unit: TEL_L10N.unitKwh,
        rows: rows
      });
    };
  }

  /* ── xTicks: время (0/0.4/0.8) или относительные минуты ── */
  function xTicksFor(buckets, widthMs, timeUnsynced) {
    if (buckets.length === 0) return [];
    var domainStart = buckets[0].start;
    var domainMs = widthMs * buckets.length;
    function label(v) {
      var d = new Date(v);
      return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    }
    var positions = [0.0, 0.4, 0.8];
    var out = [];
    for (var i = 0; i < positions.length; i++) {
      if (timeUnsynced) {
        var minutes = Math.round(domainMs / 60000 * positions[i]);
        out.push({ position: positions[i], label: '+' + minutes + ' мин' });
      } else {
        out.push({ position: positions[i], label: label(domainStart + Math.round(domainMs * positions[i])) });
      }
    }
    return out;
  }

  /* ── сообщение-заглушка графика (3 пустых состояния) ── */
  function chartMessage(text) {
    var c = telUI.theme();
    return '<div style="flex:1;display:flex;align-items:center;justify-content:center;' +
      telUI.textStyle(CapyUI.AppText.caption, c.inkMuted) + 'text-align:center">' + telUI.esc(text) + '</div>';
  }

  /* ── карточка «Расход энергии» ── */
  function energyUseHTML(chartWidth) {
    var c = telUI.theme();
    var loc = TEL_L10N;
    var showTrack = C.hasParkedData;
    var trackInHeader = showTrack && chartWidth >= 700;   // _headerTrackMinWidth

    var control = showTrack
      ? telUI.trackSegmentedControl([
          { value: 'drive', label: loc.energyModeDrive },
          { value: 'parked', label: loc.energyModeParked }
        ], C.track, 'track')
      : '';

    var trailing = '<div style="display:flex;align-items:center">' +
      (trackInHeader && control ? control + '<div style="width:' + CapyUI.AppSpacing.x3 + 'px"></div>' : '') +
      telUI.infoIconButton('energy', infoOpen === 'energy') + '</div>';

    var series = C.seriesForChartWidth(chartWidth,
      CapyUI.AppSizes.chartBarProfile.slotsIn
        ? CapyUI.AppSizes.chartBarProfile.slotsIn(chartWidth - CapyUI.AppSizes.chartAxisGutter)
        : telBuckets.energyChartBarCapacity(chartWidth - CapyUI.AppSizes.chartAxisGutter,
            CapyUI.AppSizes.chartBarProfile.pitch, CapyUI.AppSizes.chartBarProfile.gap));

    var body = '';
    if (C.hasFailed) body = chartMessage(loc.energyChartFailed);
    else if (C.isLoading && series.isEmpty) body = chartMessage(loc.energyChartLoading);
    else if (series.isEmpty) body = chartMessage(C.track === 'parked' ? loc.energyChartEmptyParked : loc.energyChartEmpty);
    else body = '<div class="telChartHost" id="telEnergyChart" style="flex:1;min-height:0"></div>';

    var footer = footerHTML();

    return telUI.appCard({
      title: loc.energyUseTitle,
      fill: true,   /* карточка растягивается на колонку — график Expanded */
      trailing: trailing,
      child: (function () {
        var inner = '';
        if (!trackInHeader && control) {
          inner += '<div style="display:flex;justify-content:flex-end">' + control + '</div>' +
            '<div style="height:' + CapyUI.AppSpacing.x4 + 'px"></div>';
        }
        inner += body +
          '<div style="height:' + CapyUI.AppSpacing.x4 + 'px"></div>' + footer;
        return inner;
      })()
    });
  }

  /* ── подвал статистик (drive / parked / ledger) ── */
  function footerHTML() {
    var loc = TEL_L10N;
    var S = CapyUI.AppSizes;

    if (C.window === EnergyWindow.sincePowerOn) return ledgerFooter();
    if (C.track === 'parked') return parkedFooter();
    return driveFooter();
  }

  function statsRow(cells, minimumContentWidth) {
    return '<div style="display:flex;justify-content:space-between;align-items:center;gap:' +
      CapyUI.AppSpacing.x4 + 'px;overflow-x:auto">' + cells.join('') + '</div>';
  }

  function driveFooter() {
    var loc = TEL_L10N;
    var stats = C.selectedStats;
    var unit = EfficiencyUnitController.instance.unit;
    var symbol = chargeCurrencySymbolForLocale('ru-RU', (stats && stats.costCurrency) || 'BRL');
    return statsRow([
      windowSelectorHTML(),
      telUI.statColumn({
        value: telEfficiency.formatEfficiencyForUnit(stats ? stats.measuredKmPerKwh : null, unit),
        unit: telEfficiency.efficiencyUnitSuffix(unit),
        caption: loc.energyStatEfficiency, onTap: true, dataTel: 'effUnit'
      }),
      telUI.statColumn({
        value: stats && stats.distanceKm != null ? stats.distanceKm.toFixed(1) : '--',
        unit: loc.unitKm, caption: loc.energyStatDistance, width: 120
      }),
      telUI.statColumn({
        value: stats && stats.averageSpeedKmh != null ? String(Math.round(stats.averageSpeedKmh)) : '--',
        unit: loc.unitKmh, caption: loc.energyStatSpeed, width: 120
      }),
      telUI.statColumn({
        value: stats && stats.estimatedCost != null ? symbol + ' ' + stats.estimatedCost.toFixed(2) : '--',
        caption: loc.energyStatCost, width: 120
      })
    ]);
  }

  function parkedFooter() {
    var loc = TEL_L10N;
    var stats = C.parkedStats;
    var symbol = chargeCurrencySymbolForLocale('ru-RU', (stats && stats.costCurrency) || 'BRL');
    return statsRow([
      windowSelectorHTML(),
      telUI.statColumn({
        value: stats && stats.averageDrainW != null ? String(Math.round(stats.averageDrainW)) : '--',
        unit: loc.unitWatt, caption: loc.energyStatParkedDrain, width: 120
      }),
      telUI.statColumn({
        value: stats && stats.totalEnergyKwh != null ? stats.totalEnergyKwh.toFixed(2) : '--',
        unit: loc.unitKwh, caption: loc.energyStatParkedTotal, width: 120
      }),
      telUI.statColumn({
        value: stats && stats.climateShareKwh != null ? stats.climateShareKwh.toFixed(2) : '--',
        unit: loc.unitKwh, caption: loc.energyStatParkedClimate, width: 120
      }),
      telUI.statColumn({
        value: stats && stats.estimatedCost != null ? symbol + ' ' + stats.estimatedCost.toFixed(2) : '--',
        caption: loc.energyStatCost, width: 120
      })
    ]);
  }

  function ledgerFooter() {
    var loc = TEL_L10N;
    var stats = C.ledgerStats;
    var c = telUI.theme();
    var h = statsRow([
      windowSelectorHTML(),
      telUI.statColumn({
        value: stats ? (stats.inWh / 1000).toFixed(2) : '--',
        unit: loc.unitKwh, caption: loc.energyLedgerIn, width: 132
      }),
      telUI.statColumn({
        value: stats ? (stats.outWh / 1000).toFixed(2) : '--',
        unit: loc.unitKwh, caption: loc.energyLedgerOut, width: 132
      }),
      telUI.statColumn({
        value: stats ? (stats.balanceWh / 1000).toFixed(2) : '--',
        unit: loc.unitKwh, caption: loc.energyLedgerBalance, width: 132
      }),
      telUI.statColumn({
        value: (stats && (stats.startSoc != null || stats.endSoc != null))
          ? ((stats.startSoc != null ? Math.round(stats.startSoc) : '--') + '→' +
             (stats.endSoc != null ? Math.round(stats.endSoc) : '--'))
          : '--',
        unit: loc.unitPercent, caption: loc.energyLedgerSoc, width: 132
      })
    ]);
    if (stats && stats.includesEstimate) {
      h += '<div style="margin-top:' + CapyUI.AppSpacing.x1 + 'px;' +
        telUI.textStyle(CapyUI.AppText.caption, c.inkSubtle) + '">' + telUI.esc(loc.energyLedgerIncludesEstimate) + '</div>';
    }
    return h;
  }

  function windowSelectorHTML() {
    var options = [];
    var windows = C.availableWindows;
    for (var i = 0; i < windows.length; i++) {
      options.push({ value: windows[i].name, label: energyWindowLabel(windows[i]) });
    }
    return telUI.dropdownField({
      key: 'window',
      value: C.window.name,
      label: energyWindowLabel(C.window),
      options: options,
      open: dropOpen,
      barrierLabel: TEL_L10N.energyWindowSelector
    });
  }

  /* ── карточка «Сведения о сеансе» ── */
  function energySessionHTML() {
    var loc = TEL_L10N;
    var c = telUI.theme();
    var seconds = readEnergyComposition(C.minutes).seconds;
    /* Длительность в источнике НЕ локализована: `1h 13min` / `13min`. */
    var total = Math.round(seconds);
    var hours = Math.floor(total / 3600);
    var minutes = Math.floor((total % 3600) / 60);
    var duration = hours > 0 ? (hours + 'h ' + minutes + 'min') : (minutes + 'min');

    return telUI.appCard({
      title: loc.sessionDetailsTitle,
      fill: true,   /* карточка растягивается на колонку, кольцо Expanded */
      subtitle: seconds > 0 ? duration : null,
      trailing: telUI.infoIconButton('session', infoOpen === 'session'),
      child: '<div class="telSessionBody" id="telSessionRing" style="flex:1;min-height:0;display:flex;flex-direction:column"></div>'
    });
  }

  /* ── кольцо: обновление отдельно от разметки карточки ── */
  function renderRing(host) {
    var c = telUI.theme();
    var buckets = C.minutes;
    var loading = C.isLoading, failed = C.hasFailed;
    var loc = TEL_L10N;
    var energy = readEnergyComposition(buckets);
    var traction = energy.traction, climate = energy.climate;
    var system = energy.system, regenerated = energy.regenerated, drawn = energy.drawn;

    if (drawn <= 0) {
      host.innerHTML = '<div style="flex:1;display:flex;align-items:center;justify-content:center;' +
        telUI.textStyle(CapyUI.AppText.caption, c.inkMuted) + 'text-align:center">' +
        telUI.esc(failed ? loc.energyChartFailed : (loading ? loc.energyChartLoading : loc.energyChartEmpty)) + '</div>';
      return;
    }

    function kwh(wh) { return (wh / 1000).toFixed(1) + ' ' + loc.unitKwh; }

    var side = Math.min(host.clientWidth || 300, host.clientHeight || 300);

    host.innerHTML = '';
    var ringWrap = document.createElement('div');
    ringWrap.style.cssText = 'flex:1;min-height:0;display:flex;align-items:center;justify-content:center;position:relative';
    host.appendChild(ringWrap);
    var gap = document.createElement('div');
    gap.style.height = CapyUI.AppSpacing.x4 + 'px';
    host.appendChild(gap);
    var legendWrap = document.createElement('div');

    var legend = telUI.iconValueGrid([
      { icon: 'grid_view', value: kwh(traction), color: c.energy.draw },
      (climate > 0) ? { icon: 'air', value: kwh(climate), color: c.energy.drawSoft } : null,
      (system > 0) ? { icon: 'electrical_services', value: kwh(system), color: c.energy.drawSubtle } : null,
      (regenerated > 0) ? { icon: 'trending_up', value: kwh(regenerated), color: c.energy.gain } : null
    ].filter(Boolean));
    legendWrap.innerHTML = legend;
    host.appendChild(legendWrap);

    if (!donut) donut = new telUI.SegmentedDonut(ringWrap);
    donut.mount = ringWrap;
    donut.update({
      side: side,
      segments: [
        { value: traction, color: c.energy.draw },
        (climate > 0) ? { value: climate, color: c.energy.drawSoft } : null,
        (system > 0) ? { value: system, color: c.energy.drawSubtle } : null
      ].filter(Boolean),
      innerArc: regenerated > 0 ? { value: regenerated, color: c.energy.gain } : null,
      value: (drawn / 1000).toFixed(1),
      unit: loc.unitKwh,
      delta: regenerated > 0 ? '+' + kwh(regenerated) : null,
      hasMarkers: false
    });
  }

  /* ── пояснения (i): «О расходе энергии» / «Что показывает кольцо» ── */
  function energyInfoEntries() {
    var c = telUI.theme();
    return [
      { icon: 'grid_view', color: c.energy.draw, value: TEL_L10N.energyTraction, description: TEL_L10N.sessionDetailsInfoTraction },
      { icon: 'air', color: c.energy.drawSoft, value: TEL_L10N.energyClimate, description: TEL_L10N.sessionDetailsInfoClimate },
      { icon: 'electrical_services', color: c.energy.drawSubtle, value: TEL_L10N.energyAuxiliary, description: TEL_L10N.sessionDetailsInfoAuxiliary },
      { icon: 'trending_up', color: c.energy.gain, value: TEL_L10N.energyRegeneration, description: TEL_L10N.sessionDetailsInfoRegeneration }
    ];
  }

  /* ══════════ главный рендер ══════════ */
  function render(rootEl) {
    if (!C) return;
    var gutter = CapyUI.AppSpacing.gridGutter;
    var c = telUI.theme();

    var h = '<div id="telTripsRoot" class="telTripsRoot" style="height:100%;display:flex;flex-direction:column">' +
      '<div style="flex:1;display:flex;gap:' + gutter + 'px;min-height:0">' +
      '<div id="telUseCol" style="flex:3;min-width:0;display:flex;flex-direction:column"></div>' +
      '<div id="telSessionCol" style="flex:1;min-width:0;display:flex;flex-direction:column"></div>' +
      '</div></div>';
    rootEl.innerHTML = h;

    var useCol = rootEl.querySelector('#telUseCol');
    var sessionCol = rootEl.querySelector('#telSessionCol');

    var chartWidth = useCol.clientWidth - 2 * CapyUI.AppSpacing.cardPadding;
    useCol.innerHTML = energyUseHTML(chartWidth);
    sessionCol.innerHTML = energySessionHTML();

    /* Пояснения поверх (anchored). */
    if (infoOpen === 'energy' || infoOpen === 'session') {
      var panel = telUI.anchoredTooltipPanel(infoOpen,
        infoOpen === 'energy' ? TEL_L10N.energyUseAbout : TEL_L10N.sessionDetailsInfoTitle,
        energyInfoEntries(),
        infoOpen === 'energy' ? 'position:absolute;right:' + (gutter + 8) + 'px;top:8px;z-index:40'
          : 'position:absolute;right:8px;top:8px;z-index:40');
      var layer = document.createElement('div');
      layer.className = 'telAnchorLayer';
      layer.innerHTML = '<div class="telDropScrim" data-telanchorclose></div>' + panel;
      rootEl.appendChild(layer);
    }

    /* Живой график монтируем, только когда серия не пуста. */
    var chartHost = rootEl.querySelector('#telEnergyChart');
    if (chartHost) {
      if (!chart) chart = new telUI.EnergyBarChart(chartHost);
      chart.mount = chartHost;
      var series = C.seriesForChartWidth(chartWidth,
        telBuckets.energyChartBarCapacity(chartWidth - CapyUI.AppSizes.chartAxisGutter,
          CapyUI.AppSizes.chartBarProfile.pitch, CapyUI.AppSizes.chartBarProfile.gap));
      var bars = [];
      for (var i = 0; i < series.buckets.length; i++) {
        var isParked = series.labels ? series.labels[i] === 'parked' : (C.track === 'parked');
        bars.push(barFor(series.buckets[i], isParked, series.estimated ? series.estimated[i] : false));
      }
      var g = growthFor();
      chart.update({
        bars: bars,
        slotCount: series.buckets.length,
        ticks: ticksFor(series),
        xTicks: xTicksFor(series.buckets, series.width, series.timePending),
        growthMs: g.growthMs,
        growthCurve: g.growthCurve,
        selectedIndex: selectedBar,
        onSelect: function (index) {
          selectedBar = index;
          repaintLive();
        },
        tooltip: tooltipFor(series.buckets, series.labels, series.estimated, series.openIndex, series.timePending, series.width)
      });

      /* Полоса состояний + чип времени — только у размеченного окна. */
      if (series.labels) {
        var band = document.createElement('div');
        band.style.marginTop = CapyUI.AppSpacing.x2 + 'px';
        band.innerHTML = telUI.energyStateBand(series.labels, series.estimated);
        chartHost.appendChild(band);
      }
      if (series.timePending) {
        var chip = document.createElement('div');
        chip.style.cssText = 'position:absolute;left:0;top:0;display:flex;align-items:center;gap:' +
          CapyUI.AppSpacing.x1 + 'px;pointer-events:none';
        chip.innerHTML = telUI.icon('schedule', CapyUI.AppSizes.iconSm, c.energy.warning) +
          '<span style="' + telUI.textStyle(CapyUI.AppText.label, c.energy.warning) + '">' +
          telUI.esc(TEL_L10N.v2TimeNotSynced) + '</span>';
        chartHost.style.position = 'relative';
        chartHost.appendChild(chip);
      }
    }

    var ringHost = rootEl.querySelector('#telSessionRing');
    if (ringHost) {
      if (!donut) donut = new telUI.SegmentedDonut(ringHost);
      renderRing(ringHost);
    }
  }

  /* Тик живых данных: перерисовать только график и кольцо — выбор окна
     и карточки не пересобираются (карточки строят render()). */
  function repaintLive() {
    var rootEl = document.getElementById('telTripsRoot');
    if (!rootEl || !C) return;
    var chartHost = rootEl.querySelector('#telEnergyChart');
    if (chartHost) {
      var band = chartHost.querySelector(':scope > div[style*="height:10px"]');
      var useCol = rootEl.querySelector('#telUseCol');
      var chartWidth = useCol.clientWidth - 2 * CapyUI.AppSpacing.cardPadding;
      /* Сеть слотов могла измениться (ширина шагнула) — тогда перестроить
         карточку целиком, как это делает build в Flutter. */
      var series = C.seriesForChartWidth(chartWidth,
        telBuckets.energyChartBarCapacity(chartWidth - CapyUI.AppSizes.chartAxisGutter,
          CapyUI.AppSizes.chartBarProfile.pitch, CapyUI.AppSizes.chartBarProfile.gap));
      var slotsKey = series.buckets.length + ':' + series.width;
      if (repaintLive._slotsKey !== slotsKey) {
        repaintLive._slotsKey = slotsKey;
        render(rootEl);
        return;
      }
      var bars = [];
      for (var i = 0; i < series.buckets.length; i++) {
        var isParked = series.labels ? series.labels[i] === 'parked' : (C.track === 'parked');
        bars.push(barFor(series.buckets[i], isParked, series.estimated ? series.estimated[i] : false));
      }
      var g = growthFor();
      chart.update({
        bars: bars, slotCount: series.buckets.length,
        ticks: ticksFor(series),
        xTicks: xTicksFor(series.buckets, series.width, series.timePending),
        growthMs: g.growthMs, growthCurve: g.growthCurve,
        selectedIndex: selectedBar,
        onSelect: function (index) { selectedBar = index; repaintLive(); },
        tooltip: tooltipFor(series.buckets, series.labels, series.estimated, series.openIndex, series.timePending, series.width)
      });
    }
    var ringHost = rootEl.querySelector('#telSessionRing');
    if (ringHost) renderRing(ringHost);
  }


  /* ── тики оси Y (порт TripEnergyBarChart.build) ── */
  function ticksFor(series) {
    var peak = 0, trough = 0;
    for (var i = 0; i < series.buckets.length; i++) {
      var b = series.buckets[i];
      peak = peak > b.drawnWh ? peak : b.drawnWh;
      var counterWh = b.regeneratedWh + b.deliveredWh;
      trough = trough > counterWh ? trough : counterWh;
    }
    var bottom = trough <= 0 ? 0 : energyAxisTop(trough / 1000);
    var top = peak > 0 ? energyAxisTop(peak / 1000) : (bottom > 0 ? bottom : energyAxisTop(0));
    var ticks = [
      { value: top, label: top.toFixed(2) },
      { value: top / 2, label: (top / 2).toFixed(2) },
      { value: 0, label: '0.00' }
    ];
    if (bottom > 0) ticks.push({ value: -bottom, label: '+' + bottom.toFixed(2) });
    return ticks;
  }

  /* ══════════ события (делегирование внутри корня телеметрии) ══════════ */
  function handleAction(target, rootEl) {
    var t = target;
    if (t.closest('[data-telseg]')) {
      var val = t.closest('[data-telseg]').getAttribute('data-val');
      C.selectTrack(val);
      render(rootEl);
      return true;
    }
    if (t.closest('[data-teldropopt]')) {
      var opt = t.closest('[data-teldropopt]');
      dropOpen = false;
      C.selectWindow(EnergyWindow[opt.getAttribute('data-val')]);
      render(rootEl);
      return true;
    }
    if (t.closest('[data-teldropscrim]') || t.closest('[data-telanchorclose]')) {
      dropOpen = false; infoOpen = null;
      render(rootEl);
      return true;
    }
    if (t.closest('[data-teldrop]')) {
      dropOpen = !dropOpen;
      render(rootEl);
      return true;
    }
    if (t.closest('[data-telinfo]')) {
      var key = t.closest('[data-telinfo]').getAttribute('data-telinfo');
      infoOpen = (infoOpen === key) ? null : key;
      render(rootEl);
      return true;
    }
    if (t.closest('[data-tel="effUnit"]')) {
      EfficiencyUnitController.instance.cycle();
      render(rootEl);
      return true;
    }
    return false;
  }

  /* ══════════ lifecycle (isActive: опрос живёт, пока вкладка на экране) ═══ */
  var clickFn = null;

  function mount(rootEl, controller) {
    setController(controller);
    /* Делегирование кликов: слушатель живёт на персистентном хосте —
       innerHTML экрана пересобирается, хост нет. */
    if (!clickFn) {
      clickFn = function (ev) { handleAction(ev.target, rootEl); };
    }
    rootEl.removeEventListener('click', clickFn);
    rootEl.addEventListener('click', clickFn);
    if (!notifyFn) {
      notifyFn = function () {
        var rootEl2 = document.getElementById('telTripsRoot');
        if (rootEl2) repaintLive();
      };
      controller.addListener(notifyFn);
    }
    if (!unitFn) {
      unitFn = function () {
        var rootEl2 = document.getElementById('telTripsRoot');
        if (rootEl2) render(rootEl2);
      };
      EfficiencyUnitController.instance.addListener(unitFn);
    }
    render(rootEl);
    mounted = true;
  }

  function unmount(controller) {
    var host = document.getElementById('telTripsHost');
    if (host && clickFn) host.removeEventListener('click', clickFn);
    if (notifyFn && controller) controller.removeListener(notifyFn);
    notifyFn = null;
    mounted = false;
  }

  return {
    mount: mount, unmount: unmount,
    handleAction: handleAction,
    isMounted: function () { return mounted; }
  };
})();
