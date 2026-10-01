/*
 * tel-charge.js — Stage T3 (порт телеметрии Capy → GeelyTools).
 *
 * Источник: github.com/Timoteohss/capy @ e39777c, Apache License 2.0.
 *   lib/screens_v2/charging/charging_v2_screen.dart — ThreeColumnLayout(
 *     leading: ChargingEnergyPanel, primary: ChargingLimitPanel,
 *     trailing: ChargingSessionPanel);
 *   lib/screens_v2/charging/charging_energy_panel.dart — запас хода авто/прил.,
 *     стоп/форс/ток (SoftActionTile + AnchoredTooltip);
 *   lib/screens_v2/charging/charging_limit_panel.dart — вкладки Уровень|График,
 *     LimitSlider + пресеты, климат-баннер, инфо-панель пределов;
 *   lib/screens_v2/charging/charging_graph_panel.dart — график сеанса + футер
 *     (запас·оценка, добавлено, стоимость·оценка, длительность, лимит достигнут);
 *   lib/screens_v2/charging/charging_session_panel.dart — сводка последней
 *     зарядки (ChargeSessionSummaryCard: донат батарея/климат);
 *   lib/screens_v2/charts/charge_session_chart.dart — SOC-столбцы + кривая
 *     мощности (overlay), тики мощности через chargePowerPlotValue;
 *   lib/screens_v2/charge_cost_editor.dart — клавиатура цены (rate|total);
 *   lib/core/charge_climate_warning.dart — гистерезис климат-предупреждения.
 *
 * Адаптации (документируются):
 *   - опрос детайла: в машине данные приходят telemetry.data (30 с) +
 *     telemetry.chargeState (бродкасты) + telemetry.energyLive (1 Гц);
 *     ask каждые 5 с (chargeDetailLiveInterval) шлёт 'history.series' с id
 *     сеанса — как _detail.ask() в Dart;
 *   - RecentTripEfficiency строится из списка поездок моста (TEL.trips),
 *     фильтр 7 дней — клиентский, как listSessions(from: now-7d) в Dart.
 */
var telCharge = (function () {
  'use strict';
  var CapyUI = window.CapyUI, telUI = window.telUI, TEL_L10N = window.TEL_L10N;
  var telBuckets = window.telBuckets, telChargeGraph = window.telChargeGraph;

  /* ══════════ состояние экрана (порт _ChargingV2ScreenState) ══════════ */
  var mounted = false;
  var host = null;
  var panelTab = 'level';          /* ChargePanelTab */
  var graphSelection = null;       /* выбранный столбец графика */
  var graphDismissed = false;
  var selectionSessionId = null;
  var draftTarget = 80;            /* _draftChargeTarget */
  var draggingTarget = false;
  var amperageOpen = false;        /* anchored-диалог тока */
  var infoOpen = false;            /* инфо-панель пределов */
  var costOpen = false;            /* клавиатура цены */
  var costField = 'rate';          /* ChargeCostField */
  var costDigits = { rate: '', total: '' };
  var climateWarning = 'none';     /* ChargeClimateWarning (гистерезис) */
  var savingCost = false;
  var detailTimer = null;
  var chart = null;
  var notifyFns = [];

  function fmt(key, params) {
    var t = TEL_L10N[key] || '';
    for (var k in (params || {})) t = t.split('{' + k + '}').join(String(params[k]));
    return t;
  }
  function esc(x) { return telUI.esc(x); }
  /* Обёртка anchored-панели (поверх скрима, как AnchoredTooltipSurface). */
  function panelWrap(content, style) {
    var c = telUI.theme();
    return '<div class="telAnchorPanel" style="' + style + ';background:' + c.surface +
      ';border-radius:' + CapyUI.AppRadii.xl + 'px;box-shadow:0 8px 32px rgba(0,0,0,0.35)">' + content + '</div>';
  }

  /* ══════════ источники данных (мост) ══════════ */

  /* Сеанс на экране: последняя зарядка + её детайл (один вопрос — один ответ,
   * как ChargeDetailPage в Dart). */
  function chargePage() {
    var session = (TEL.charges && TEL.charges[0]) || null;
    var detail = TEL.chargeDetail || null;
    if (session && detail && detail.sessionId !== session.id) detail = null;
    if (!session && detail) {
      session = { id: detail.sessionId, start: detail.start, end: detail.plugEnd || detail.end };
    }
    return { session: session, detail: detail };
  }

  function normalizeSession(s, d) {
    if (!s) return null;
    return {
      id: s.id,
      status: (d && d.status) || s.status || 'ENDED',
      startedAtUtcMillis: s.start,
      endedAtUtcMillis: s.end,
      chargeStartedAtUtcMillis: d ? d.chargeStart : null,
      chargeEndedAtUtcMillis: d ? d.chargeEnd : null,
      plugDisconnectedAtUtcMillis: d ? d.plugEnd : null,
      costPerKwh: (d && d.costPerKwh != null) ? d.costPerKwh : null,
      paidAmount: (d && d.cost != null) ? d.cost : null,
      costCurrency: (d && d.currency) || s.currency || null,
      estimatedEnergyKwh: (d && d.kwh != null) ? d.kwh : (s.kwh != null ? s.kwh : null)
    };
  }

  function currentSoc() {
    var v = (typeof TEL_LIVE !== 'undefined' && TEL_LIVE.soc != null) ? TEL_LIVE.soc
      : (TEL.range && TEL.range.soc != null ? TEL.range.soc : null);
    if (v == null || v < 0 || v > 100) return null;
    return v;
  }
  function chargingPowerKw() {
    if (typeof TEL_LIVE === 'undefined') return null;
    var kw = (TEL_LIVE.dcPowerKw != null && TEL_LIVE.dcPowerKw > 0) ? TEL_LIVE.dcPowerKw
      : (TEL_LIVE.vhalPowerKw != null ? Math.abs(TEL_LIVE.vhalPowerKw) : null);
    if (!isActivelyCharging()) return null;
    return (kw != null && isFinite(kw) && kw >= 0) ? kw : null;
  }
  function isActivelyCharging() {
    var st = TEL.status || {};
    return !!st.running && st.chargeState === 'ACTIVE';
  }
  function chargeClimateBuckets() {
    var cc = (TEL.energyLive && TEL.energyLive.chargeClimate) || null;
    if (!cc || !cc.buckets) return [];
    return cc.buckets;
  }
  function externalControl() { return !!(TEL.set && TEL.set.ext); }
  function chargeControl() { return TEL.chargeControl || { minAmps: 5, maxAmps: 32, forceCharging: false }; }

  /* RecentTripEfficiency: последние 7 дней (listSessions(from: now-7d)). */
  function recentEfficiency() {
    var since = Date.now() - 7 * 24 * 3600000;
    var trips = (TEL.trips || []).filter(function (t) { return t.start >= since; });
    return new RecentTripEfficiency(trips);
  }

  /* RangeEstimate: ownRangeKm/полный запас из моста либо локальная формула. */
  function rangeEstimate() {
    var rg = TEL.range || {};
    var own = rg.ownKm != null ? rg.ownKm
      : (rg.soc != null && rg.capacityKwh && rg.effKmPerKwh ? rg.soc / 100 * rg.capacityKwh * rg.effKmPerKwh : null);
    var full = rg.fullKm != null ? rg.fullKm
      : (rg.capacityKwh && rg.effKmPerKwh ? rg.capacityKwh * rg.effKmPerKwh : null);
    return {
      carRangeKm: rg.carKm != null ? rg.carKm : null,
      carRangeAvailable: rg.carKm != null,
      ownRangeKm: own,
      fullRangeKm: full
    };
  }
  function projectedRangeKm(target) {
    var full = rangeEstimate().fullRangeKm;
    if (full == null || !isFinite(target) || target < 0 || target > 100) return null;
    var r = target / 100 * full;
    return (isFinite(r) && r >= 0) ? r : null;
  }

  /* ══════════ колонки экрана ══════════ */

  /* ── ChargingEnergyPanel (leading) ── */
  function energyPanelHTML() {
    var c = telUI.theme();
    var loc = TEL_L10N;
    var rg = rangeEstimate();
    var cc = chargeControl();
    var ext = externalControl();
    var charging = isActivelyCharging();
    var reportedAmps = cc.amps != null ? cc.amps : null;
    var currentAmps = reportedAmps != null ? reportedAmps : (cc.minAmps || 5);

    var h = '';
    h += '<div style="display:flex;flex-direction:column;align-items:flex-start">';
    h += telUI.metricWithCaption({
      value: rg.carRangeAvailable ? String(Math.round(rg.carRangeKm)) : '--',
      unit: rg.carRangeAvailable ? loc.unitKm : null,
      caption: loc.v2RangeVehicleRange, size: 'xl'
    });
    h += '<div style="height:' + CapyUI.AppSpacing.x3 + 'px"></div>';
    h += telUI.metricWithCaption({
      value: rg.ownRangeKm != null ? String(Math.round(rg.ownRangeKm)) : '--',
      unit: rg.ownRangeKm == null ? null : loc.unitKm,
      caption: appRangeCaption(), size: 'xl'
    });
    h += '</div><div style="flex:1"></div>';

    /* Каждый контрол требует и тумблер, и колбэк: без любого из них
     * контрол не рисуется вовсе — экран не может писать в машину. */
    if (ext) {
      if (charging) {
        h += telUI.softActionTile({ key: 'stop', label: loc.v2ChargingStopButton, icon: 'stop_circle', iconColor: c.critical || '#B3261E' });
        h += '<div style="height:' + CapyUI.AppSpacing.x3 + 'px"></div>';
      }
      h += telUI.softActionTile({
        key: 'force', label: cc.forceCharging ? loc.v2ChargingForceActive : loc.v2ChargingForceButton,
        icon: cc.forceCharging ? 'bolt' : 'bolt_outline', iconColor: cc.forceCharging ? c.energy.gain : null,
        selected: cc.forceCharging
      });
      h += '<div style="height:' + CapyUI.AppSpacing.x3 + 'px"></div>';
      h += telUI.softActionTile({
        key: 'amps', label: reportedAmps == null ? ('-- ' + loc.v2ChargingAmperageUnit) : fmt('v2ChargingAmperageValue', { amps: reportedAmps }),
        icon: 'electrical_services', centered: true, selected: amperageOpen, height: CapyUI.AppSizes.presetTileHeight
      });
    }
    return telUI.appCard({ title: TEL_L10N.v2ChargingEnergy, fill: true, child: h });
  }

  function appRangeCaption() {
    var rg = TEL.range || {};
    if (rg.ownQuality === 'DEGRADED') return TEL_L10N.v2RangeEstimateDelayed;
    if (rg.ownKm != null) return TEL_L10N.v2RangeEstimateCaption;
    return TEL_L10N.v2RangeEstimateUnavailable;
  }

  /* ── ChargingLimitPanel (primary) ── */
  function limitPanelHTML() {
    var c = telUI.theme();
    var loc = TEL_L10N;
    var ext = externalControl();
    var page = chargePage();
    var session = normalizeSession(page.session, page.detail);
    var showBanner = climateWarning !== 'none' && climateKw() != null;

    var body = '';
    if (ext) {
      body += '<div style="display:flex;align-items:center">' +
        '<div style="flex:1;min-width:0">' + telUI.textTabBar([
          { value: 'level', label: loc.v2ChargeLimitLevel },
          { value: 'graph', label: loc.v2ChargeLimitGraph }
        ], panelTab, 'panel') + '</div>' +
        telUI.infoIconButton('limit', infoOpen) + '</div>';
      body += '<div style="height:' + CapyUI.AppSpacing.x4 + 'px"></div>';
      body += '<div style="flex:1;min-height:0;display:flex;flex-direction:column">';
      if (panelTab === 'level') body += levelContentHTML();
      else body += graphPanelHTML();
      body += '</div>';
    } else {
      body += '<div style="flex:1;min-height:0;display:flex;flex-direction:column">' + graphPanelHTML() + '</div>';
    }

    var card = telUI.appCard({ fill: true, child: body });
    if (!showBanner) return card;
    /* Климат-баннер над карточкой (BreathingWarningBanner). */
    var kw = climateKw();
    var message = climateWarning === 'outweighs'
      ? fmt('v2ChargeClimateWarningOutweighs', { climate: kw.toFixed(1) })
      : fmt('v2ChargeClimateWarningHigh', { climate: kw.toFixed(1), charging: (chargingPowerKw() || 0).toFixed(1) });
    return '<div style="display:flex;flex-direction:column;flex:1;min-height:0">' +
      telUI.breathingWarningBanner({
        icon: 'thermostat', title: loc.v2ChargeClimateWarningTitle, message: message,
        color: climateWarning === 'outweighs' ? (c.energy.critical || '#B3261E') : (c.energy.warning || '#E8933C')
      }) +
      '<div style="height:' + CapyUI.AppSpacing.x4 + 'px"></div>' + card + '</div>';
  }

  function climateKw() { return readChargeClimateKw(chargeClimateBuckets()); }

  function levelContentHTML() {
    var loc = TEL_L10N;
    var S = CapyUI.AppSizes;
    var targetPct = Math.round(draftTarget);
    var customSelected = draggingTarget || chargeLimitNamedPresets.indexOf(targetPct) < 0;
    var customTarget = customSelected ? targetPct : 50;
    var proj = projectedRangeKm(draftTarget);
    var projection = proj != null ? String(Math.round(proj)) : '--';

    var h = '<div style="flex:1;display:flex;flex-direction:column;justify-content:center;opacity:' + (externalControl() ? 1 : 0.55) + ';pointer-events:' + (externalControl() ? 'auto' : 'none') + '">';
    h += '<div style="height:' + (S.minTouchTarget + S.limitSliderHeight + CapyUI.AppSpacing.x2) + 'px" id="telLimitSliderHost"></div>';
    h += '<div style="flex:1"></div>';
    h += '<div style="display:flex;gap:' + CapyUI.AppSpacing.x3 + 'px">';
    h += presetTile(customTarget, loc.v2ChargeLimitCustom, customSelected);
    h += presetTile(chargeLimitDailyPreset, loc.v2ChargeLimitDaily, !draggingTarget && targetPct === chargeLimitDailyPreset);
    h += presetTile(chargeLimitExtendedPreset, loc.v2ChargeLimitExtended, !draggingTarget && targetPct === chargeLimitExtendedPreset);
    h += presetTile(chargeLimitMaxPreset, loc.v2ChargeLimitMax, !draggingTarget && targetPct === chargeLimitMaxPreset);
    h += '</div></div>';
    return h;
  }
  function presetTile(value, label, selected) {
    return '<div style="flex:1">' + telUI.selectableTile({
      value: fmt('helpersChargeLimitValue', { percent: value }), label: label, selected: selected, target: value
    }) + '</div>';
  }

  /* ── ChargeGraphPanel (вкладка «График») ── */
  function graphPanelHTML() {
    var loc = TEL_L10N;
    var page = chargePage();
    var session = normalizeSession(page.session, page.detail);
    if (!session || !page.detail) {
      return chartMessage(loc.v2ChargeGraphEmpty);
    }
    var durationMs = chargeWindow(session);
    var graph = telChargeGraph.buildChargeGraphData(chargeDetailForGraph(page.detail), durationMs);
    if (graph.isEmpty) return chartMessage(loc.v2ChargeGraphNoData);
    return '<div style="flex:1;min-height:0;display:flex;flex-direction:column">' +
      '<div class="telChartHost" id="telChargeChart" style="flex:1;min-height:0"></div>' +
      '<div style="height:' + CapyUI.AppSpacing.x3 + 'px"></div>' +
      graphFooterHTML(session, page.detail, graph) + '</div>';
  }
  function chartMessage(text) {
    var c = telUI.theme();
    return '<div style="flex:1;display:flex;align-items:center;justify-content:center;' +
      telUI.textStyle(CapyUI.AppText.label, c.inkMuted) + 'text-align:center">' + esc(text) + '</div>';
  }
  /* Мост шлёт интервалы в legacy-именах; графу нужны soc/power-серии
   * (SessionDetailReading.socSeries/powerSeries: точка на конце интервала). */
  function chargeDetailForGraph(d) {
    if (d._graphNormalized) return d;
    var start = d.start || 0;
    var intervals = (d.intervals || []).map(function (e) {
      return {
        startUtcMillis: e.t, widthMillis: e.w || 60000,
        deliveredWh: e.delivered, deliveredCoveredSeconds: e.deliveredSec,
        climateWh: e.climate, climateCoveredSeconds: e.climateSec,
        startSoc: e.soc0, endSoc: e.soc1
      };
    });
    var socSeries = [], powerSeries = [];
    (d.intervals || []).forEach(function (e) {
      if (e.delivered != null && e.deliveredSec > 0) {
        powerSeries.push({ x: (e.t - start) / 1000, y: e.delivered / 1000 / (e.deliveredSec / 3600) });
      }
      if (e.soc0 != null) socSeries.push({ x: (e.t - start) / 1000, y: e.soc0 });
      if (e.soc1 != null) socSeries.push({ x: (e.t + (e.w || 60000) - start) / 1000, y: e.soc1 });
    });
    var nd = {
      _graphNormalized: true,
      series: { intervals: intervals },
      intervals: intervals,
      socSeries: socSeries,
      powerSeries: powerSeries,
      start: start,
      targetReachedAtUtcMillis: d.limitReachedAt || [],
      targetReachedSeconds: (d.limitReachedAt || []).map(function (ms) { return (ms - start) / 1000; }),
      session: { startSoc: d.soc0 != null ? d.soc0 : null },
      estimatedEnergyKwh: d.kwh,
      soc0: d.soc0
    };
    return nd;
  }

  function graphFooterHTML(session, detailRaw, graph) {
    var loc = TEL_L10N;
    var detail = chargeDetailForGraph(detailRaw);
    var energy = session.estimatedEnergyKwh != null ? session.estimatedEnergyKwh : null;
    var rangeGain = estimateRangeGainKm(recentEfficiency(), energy);
    var defaultRate = (TEL.set && TEL.set.rate) || null;
    var rate = session.costPerKwh != null ? session.costPerKwh : defaultRate;
    var cost = chargeEstimatedCost(energy, rate, session.paidAmount);
    var currency = chargeCostCurrencyOf(session, defaultCurrency());
    var symbol = chargeCurrencySymbolForLocale('ru-RU', currency);
    var sep = chargeDecimalSeparatorForLocale('ru-RU');
    var duration = chargingDuration(session, detail);
    var targetAt = chargeTargetReachedAt(detail);
    var active = chargeSessionIsActive(session) && isActivelyCharging();

    var pad = 'padding:' + CapyUI.AppSpacing.x2 + 'px ' + CapyUI.AppSpacing.x3 + 'px';
    var h = '<div style="display:flex">';
    h += footerStat(rangeGain == null ? '--' : '+' + Math.round(rangeGain), rangeGain == null ? null : loc.unitKm, loc.v2ChargeGraphRangeGainedEstimate, pad);
    h += footerStat(energy == null ? '--' : '+' + energy.toFixed(1), energy == null ? null : loc.unitKwh, loc.v2ChargeGraphEnergyAdded, pad);
    /* Стоимость — редактируемая (ChargeCostStat): карандаш + клавиатура. */
    h += '<div style="flex:1;' + pad + '"><button data-telcost="1" class="telStatBtn" style="border:0;background:transparent;cursor:' + (savingCost ? 'default' : 'pointer') + ';font-family:inherit;padding:0;text-align:left">' +
      telUI.statColumn({ value: chargeAmountLabel(cost, symbol, sep), caption: loc.v2ChargeGraphCostEstimate, editLabel: loc.v2ChargeCostEdit }) + '</button></div>';
    h += footerStat(chargeDurationLabel(duration), null, loc.v2ChargeGraphDuration, pad);
    if (targetAt != null) {
      var d = new Date(targetAt);
      h += footerStat(String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'), null, loc.v2ChargeGraphTargetReached, pad);
    }
    return h + '</div>';
  }
  function footerStat(value, unit, caption, pad) {
    return '<div style="flex:1;' + pad + '">' + telUI.statColumn({ value: value, unit: unit, caption: caption }) + '</div>';
  }
  function defaultCurrency() {
    return (TEL.set && TEL.set.currency) || 'BRL';
  }

  /* ── ChargingSessionPanel (trailing) ── */
  function sessionPanelHTML() {
    var loc = TEL_L10N;
    var page = chargePage();
    var session = normalizeSession(page.session, page.detail);
    if (!session || !page.detail) {
      return telUI.appCard({ fill: true, child: '<div style="flex:1;display:flex;align-items:center;justify-content:center">' + chartMessage(loc.v2ChargeGraphEmpty) + '</div>' });
    }
    var duration = chargeSessionDuration(session);
    var battery = usableChargeEnergy(session.estimatedEnergyKwh);
    if (battery == null) {
      return telUI.appCard({
        title: loc.v2LastChargeSession, subtitle: chargeDurationLabel(duration), fill: true,
        child: '<div style="flex:1;display:flex;align-items:center;justify-content:center">' + chartMessage(loc.v2ChargeSummaryNoEnergy) + '</div>'
      });
    }
    var detail = chargeDetailForGraph(page.detail);
    var climate = chargeClimateEnergyOver(detail, duration);
    var climateEnergy = usableChargeEnergy(climate ? climate.kwh : null);
    var total = battery + (climateEnergy || 0);
    return telUI.chargeSessionSummaryCard({
      title: loc.v2LastChargeSession,
      duration: chargeDurationLabel(duration),
      totalEnergy: total,
      totalEnergyLabel: total.toFixed(1),
      batteryEnergy: battery,
      batteryEnergyLabel: battery.toFixed(1) + ' ' + loc.unitKwh,
      climateEnergy: climateEnergy,
      climateEnergyLabel: climateEnergy == null ? ('-- ' + loc.unitKwh)
        : (climate.complete ? climateEnergy.toFixed(1) + ' ' + loc.unitKwh
          : '≥ ' + climateEnergy.toFixed(1) + ' ' + loc.unitKwh)
    });
  }

  /* ══════════ главный рендер ══════════ */
  function render() {
    if (!host) return;
    var gutter = CapyUI.AppSpacing.gridGutter;
    var h = '<div id="telChargeRoot" style="height:100%;display:flex;flex-direction:column">' +
      '<div style="flex:1;display:flex;gap:' + gutter + 'px;min-height:0">' +
      '<div id="telChgCol0" style="flex:1;min-width:0;display:flex;flex-direction:column"></div>' +
      '<div id="telChgCol1" style="flex:2;min-width:0;display:flex;flex-direction:column"></div>' +
      '<div id="telChgCol2" style="flex:1;min-width:0;display:flex;flex-direction:column"></div>' +
      '</div></div>';
    host.innerHTML = h;
    host.querySelector('#telChgCol0').innerHTML = energyPanelHTML();
    host.querySelector('#telChgCol1').innerHTML = limitPanelHTML();
    host.querySelector('#telChgCol2').innerHTML = sessionPanelHTML();

    mountChart();
    mountSlider();
    mountRing();
    mountPanels();
  }

  /* График сеанса: SOC-столбцы + кривая мощности (ChargeSessionChart). */
  function mountChart() {
    var rootEl = document.getElementById('telChargeRoot');
    if (!rootEl) return;
    var chartHost = rootEl.querySelector('#telChargeChart');
    if (!chartHost) return;
    var page = chargePage();
    var session = normalizeSession(page.session, page.detail);
    if (!session || !page.detail) return;
    var detail = chargeDetailForGraph(page.detail);
    var durationMs = chargeWindow(session);
    var profile = CapyUI.AppSizes.chartDenseBarProfile;
    var plotW = chartHost.clientWidth - CapyUI.AppSizes.chartAxisGutter;
    var capacity = telBuckets.energyChartBarCapacity(plotW, profile.pitch, profile.gap);
    var graph = telChargeGraph.buildChargeGraphData(detail, durationMs, capacity);
    if (graph.isEmpty) return;

    var active = chargeSessionIsActive(session) && isActivelyCharging();
    var lastIndex = graph.buckets.length - 1;
    var selIdx = graphDismissed ? null
      : (graphSelection != null ? Math.min(graphSelection, lastIndex) : lastIndex);
    var bars = [], overlay = [];
    for (var i = 0; i < graph.buckets.length; i++) {
      var b = graph.buckets[i];
      bars.push({
        id: session.id + ':' + b.startSeconds + ':' + graph.intervalSeconds,
        value: b.socPercent != null ? b.socPercent : NaN,
        state: b.isHeld ? 'held' : 'actual'
      });
      overlay.push(b.powerKw == null ? NaN : telChargeGraph.chargePowerPlotValue(b.powerKw, graph.axisMaximumKw));
    }
    var ticks = [];
    for (var t = 0; t < graph.powerTicksKw.length; t++) {
      var tick = graph.powerTicksKw[t];
      ticks.push({
        value: telChargeGraph.chargePowerPlotValue(tick, graph.axisMaximumKw),
        label: fmt('v2ChargeGraphPowerTick', { power: Math.round(tick) })
      });
    }
    var startMs = session.chargeStartedAtUtcMillis != null ? session.chargeStartedAtUtcMillis : session.startedAtUtcMillis;
    var widthMs = graph.intervalSeconds * 1000;

    if (!chart) chart = new telUI.EnergyBarChart(chartHost);
    chart.mount = chartHost;
    chart.update({
      bars: bars, slotCount: capacity, ticks: ticks,
      xTicks: xTicksFor(startMs, widthMs, capacity),
      profile: profile,
      overlay: overlay,
      overlayAnchor: active ? 'start' : 'both',
      selectedIndex: selIdx,
      onSelect: function (index) {
        graphSelection = index;
        graphDismissed = index == null;
        repaintLive();
      },
      tooltip: function (index) {
        var b = graph.buckets[index];
        return telUI.chartTooltip({
          value: b.socPercent != null ? b.socPercent.toFixed(1) : '--',
          unit: b.socPercent == null ? null : TEL_L10N.unitPercent,
          rows: [
            { label: b.powerKw == null ? ('-- ' + TEL_L10N.unitWatt2) : (b.powerKw.toFixed(1) + ' ' + TEL_L10N.unitWatt2) },
            { label: timeWindowLabel(startMs, b) }
          ]
        });
      }
    });
  }
  function xTicksFor(startMs, widthMs, slotCount) {
    if (slotCount <= 0) return [];
    var positions = [0.0, 0.4, 0.8];
    var out = [];
    for (var i = 0; i < positions.length; i++) {
      var v = startMs + Math.round(widthMs * slotCount * positions[i]);
      var d = new Date(v);
      out.push({
        position: positions[i],
        label: String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
      });
    }
    return out;
  }
  function timeWindowLabel(startMs, bucket) {
    var from = new Date(startMs + bucket.startSeconds * 1000);
    var to = new Date(startMs + bucket.endSeconds * 1000);
    function hhmm(d) { return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
    return hhmm(from) + '–' + hhmm(to);
  }

  /* LimitSlider (вкладка «Уровень»). */
  var slider = null;
  function mountSlider() {
    var rootEl = document.getElementById('telChargeRoot');
    if (!rootEl) return;
    var sliderHost = rootEl.querySelector('#telLimitSliderHost');
    if (!sliderHost) return;
    if (!slider) slider = new telUI.LimitSlider(sliderHost);
    slider.mount = sliderHost;
    mountSliderCfg();
  }
  function mountSliderCfg() {
    var loc = TEL_L10N;
    var proj = projectedRangeKm(draftTarget);
    var projection = proj != null ? String(Math.round(proj)) : '--';
    slider.update({
      min: 50, max: 100, value: draftTarget, current: currentSoc(),
      isCharging: isActivelyCharging(), chargingPowerKw: chargingPowerKw(),
      currentLabel: currentSoc() != null ? currentSoc().toFixed(1) : null,
      currentUnit: loc.unitPercent,
      valueLabel: String(Math.round(draftTarget)), valueUnit: loc.unitPercent,
      caption: fmt('v2ChargeLimitProjection', { range: projection, unit: loc.unitKm }),
      dragging: draggingTarget,
      onChanged: function (v) {
        /* Драг обновляет слайдер на месте: полный render пересоздавал бы
         * узел под пальцем (в Dart виджет один и тот же). */
        draftTarget = v;
        paintSlider();
      },
      onDraggingChanged: function (d) {
        draggingTarget = d;
        if (!d) commitTargetSoc(draftTarget);
        else paintSlider();
      }
    });
  }
  /* Перекраска слайдера на месте (drag/projection caption). */
  function paintSlider() {
    var sliderHost = document.getElementById('telLimitSliderHost');
    if (!sliderHost || !slider) return;
    slider.mount = sliderHost;
    mountSliderCfg();
  }
  function commitTargetSoc(val) {
    var percent = Math.round(val);
    percent = Math.max(50, Math.min(100, percent));
    draftTarget = percent;
    if (window.__geelyEmit) window.__geelyEmit('charge.target', { percent: percent });
    repaintLive();
  }

  /* Кольцо сводки (SegmentedDonut: батарея/климат). */
  var ring = null;
  function mountRing() {
    var rootEl = document.getElementById('telChargeRoot');
    if (!rootEl) return;
    var ringHost = rootEl.querySelector('#telChargeRing');
    if (!ringHost) return;
    var loc = TEL_L10N;
    var c = telUI.theme();
    var page = chargePage();
    var session = normalizeSession(page.session, page.detail);
    var battery = usableChargeEnergy(session ? session.estimatedEnergyKwh : null);
    if (battery == null) {
      ringHost.innerHTML = '<div style="flex:1;display:flex;align-items:center;justify-content:center;' +
        telUI.textStyle(CapyUI.AppText.caption, c.inkMuted) + '">--</div>';
      return;
    }
    var climate = chargeClimateEnergyOver(chargeDetailForGraph(page.detail), chargeSessionDuration(session));
    var total = battery + (climate && climate.kwh > 0 ? climate.kwh : 0);
    var hasClimate = !!(climate && climate.kwh > 0);
    var markers = [telUI.icon('battery_full', CapyUI.AppSizes.iconMd, c.ink)];
    if (hasClimate) markers.push(telUI.icon('thermostat', CapyUI.AppSizes.iconMd, c.ink));
    var side = Math.min(ringHost.clientWidth || 240, ringHost.clientHeight || 240);
    var ringWrap = ringHost.firstElementChild;
    if (!ringWrap || ringWrap.tagName !== 'DIV' || !ringWrap.style.flex) {
      ringHost.innerHTML = '';
      ringWrap = document.createElement('div');
      ringWrap.style.cssText = 'flex:1;min-height:0;display:flex;align-items:center;justify-content:center;position:relative';
      ringHost.appendChild(ringWrap);
    }
    if (!ring) ring = new telUI.SegmentedDonut(ringWrap);
    ring.mount = ringWrap;
    ring.update({
      side: side,
      segments: [
        { value: battery, color: c.energy.gain }
      ].concat(hasClimate ? [{ value: climate.kwh, color: c.energy.gainSoft }] : []),
      markers: markers,
      markerBox: { width: CapyUI.AppSizes.iconMd, height: CapyUI.AppSizes.iconMd },
      total: total,
      value: total.toFixed(1), unit: loc.unitKwh,
      hasMarkers: true
    });
  }

  /* Anchored-панели: ток, инфо пределов, клавиатура цены. */
  function mountPanels() {
    var rootEl = document.getElementById('telChargeRoot');
    if (!rootEl) return;
    if (!(amperageOpen || infoOpen || costOpen)) return;
    var loc = TEL_L10N;
    var c = telUI.theme();
    var layer = document.createElement('div');
    layer.className = 'telAnchorLayer';
    layer.innerHTML = '<div class="telDropScrim" data-telanchorclose></div>';
    var panel = '';
    if (amperageOpen) {
      var cc = chargeControl();
      var currentAmps = cc.amps != null ? cc.amps : (cc.minAmps || 5);
      panel = panelWrap(
        telUI.chargingAmperageDialog({
          value: currentAmps, min: cc.minAmps || 5, max: cc.maxAmps || 32,
          title: loc.v2ChargingAmperageTitle, description: loc.v2ChargingAmperageDescription,
          defaultLabel: fmt('v2ChargingAmperageRange', { min: cc.minAmps || 5, max: cc.maxAmps || 32 }),
          unit: loc.v2ChargingAmperageUnit
        }), 'position:absolute;left:' + CapyUI.AppSpacing.x4 + 'px;bottom:' + CapyUI.AppSpacing.x4 + 'px;z-index:40');
    } else if (infoOpen) {
      panel = telUI.anchoredTooltipPanel('limit', loc.v2ChargeLimitInfoTitle, [
        { icon: 'ev_shadow', color: c.energy.gain, value: fmt('helpersChargeLimitValue', { percent: chargeLimitDailyPreset }), description: loc.v2ChargeLimitInfoDaily },
        { icon: 'ev_shadow', color: c.energy.gain, value: fmt('helpersChargeLimitValue', { percent: chargeLimitExtendedPreset }), description: loc.v2ChargeLimitInfoExtended },
        { icon: 'ev_shadow', color: c.energy.gain, value: fmt('helpersChargeLimitValue', { percent: chargeLimitMaxPreset }), description: loc.v2ChargeLimitInfoMax }
      ], 'position:absolute;right:' + CapyUI.AppSpacing.x4 + 'px;top:8px;z-index:40');
    } else if (costOpen) {
      var page = chargePage();
      var session = normalizeSession(page.session, page.detail);
      if (session) {
        var currency = chargeCostCurrencyOf(session, defaultCurrency());
        var symbol = chargeCurrencySymbolForLocale('ru-RU', currency);
        var sep = chargeDecimalSeparatorForLocale('ru-RU');
        var digits = costDigits[costField] || '';
        var amount = digits.length ? (parseInt(digits, 10) / 100) : null;
        var unit = costField === 'rate' ? loc.v2ChargeCostUnitRate : null;
        panel = panelWrap(
          telUI.moneyKeypadDialog({
            title: loc.v2ChargeCostTitle, description: loc.v2ChargeCostDescription,
            fields: [
              { value: 'rate', label: loc.v2ChargeCostFieldRate, amount: session.costPerKwh != null ? session.costPerKwh : ((TEL.set && TEL.set.rate) || null), unit: loc.v2ChargeCostUnitRate },
              { value: 'total', label: loc.v2ChargeCostFieldTotal, amount: session.paidAmount }
            ],
            selected: costField, currencySymbol: symbol,
            display: digits.length ? (String(Math.floor(parseInt(digits, 10) / 100)) + sep + String(parseInt(digits, 10) % 100).padStart(2, '0')) : '0' + sep + '00',
            unit: unit, saveLabel: loc.v2MoneyKeypadSave
          }), 'position:absolute;left:50%;top:64px;transform:translateX(-50%);z-index:40');
      }
    }
    if (panel) layer.innerHTML += panel;
    rootEl.appendChild(layer);
  }

  /* ══════════ события ══════════ */
  function handleAction(target) {
    var t = target;
    var el;
    if ((el = t.closest('[data-teltab]'))) {
      panelTab = el.getAttribute('data-val');
      render();
      return true;
    }
    if ((el = t.closest('[data-telpreset]'))) {
      commitTargetSoc(+el.getAttribute('data-telpreset'));
      return true;
    }
    if ((el = t.closest('[data-telsoft]'))) {
      var key = el.getAttribute('data-telsoft');
      if (key === 'stop' && window.__geelyEmit) window.__geelyEmit('charge.stop', {});
      else if (key === 'force' && window.__geelyEmit) window.__geelyEmit('charge.force', { on: !chargeControl().forceCharging });
      else if (key === 'amps') { amperageOpen = !amperageOpen; infoOpen = false; costOpen = false; render(); }
      return true;
    }
    if ((el = t.closest('[data-telamps]'))) {
      var cc = chargeControl();
      var cur = cc.amps != null ? cc.amps : (cc.minAmps || 5);
      var next = cur + (+el.getAttribute('data-telamps'));
      next = Math.max(cc.minAmps || 5, Math.min(cc.maxAmps || 32, next));
      if (window.__geelyEmit) window.__geelyEmit('charge.amps', { amps: next });
      render();
      return true;
    }
    if (t.closest('[data-telanchorclose]')) {
      amperageOpen = false; infoOpen = false; costOpen = false;
      render();
      return true;
    }
    if ((el = t.closest('[data-telinfo]'))) {
      infoOpen = !infoOpen; amperageOpen = false; costOpen = false;
      render();
      return true;
    }
    if ((el = t.closest('[data-telcost]'))) {
      if (savingCost) return true;
      var page = chargePage();
      var session = normalizeSession(page.session, page.detail);
      costOpen = true; amperageOpen = false; infoOpen = false;
      costField = (session && session.paidAmount != null) ? 'total' : 'rate';
      costDigits = {
        rate: digitsOf(session ? session.costPerKwh : null),
        total: digitsOf(session ? session.paidAmount : null)
      };
      render();
      return true;
    }
    if ((el = t.closest('[data-telseg]')) && costOpen) {
      var segVal = el.getAttribute('data-val');
      if (segVal === 'rate' || segVal === 'total') { costField = segVal; render(); }
      return true;
    }
    if ((el = t.closest('[data-teldigit]'))) {
      var d = el.getAttribute('data-teldigit');
      var cur2 = costDigits[costField] || '';
      if (cur2.length < 9) { /* MoneyKeypadDialog.maxDigits */
        if (cur2 === '' && d === '0') { /* ведущий ноль игнорируется */ }
        else costDigits[costField] = cur2 + d;
        render();
      }
      return true;
    }
    if ((el = t.closest('[data-telkey]'))) {
      var k = el.getAttribute('data-telkey');
      if (k === 'clear') costDigits[costField] = '';
      else if (k === 'delete') costDigits[costField] = (costDigits[costField] || '').slice(0, -1);
      else if (k === 'save') {
        var page2 = chargePage();
        var session2 = normalizeSession(page2.session, page2.detail);
        var digits = costDigits[costField] || '';
        var amount = digits.length ? parseInt(digits, 10) / 100 : null;
        if (session2) {
          savingCost = true;
          writeChargeCost(session2, costField, amount, defaultCurrency());
          costOpen = false;
          savingCost = false;
        }
      }
      render();
      return true;
    }
    return false;
  }
  function digitsOf(amount) {
    if (amount == null || !isFinite(amount)) return '';
    return String(Math.round(amount * 100));
  }

  /* ══════════ live-цикл ══════════ */

  /* Тик 5 с (chargeDetailLiveInterval): ask детайла, пока сеанс активен
   * и вкладка на экране (Dart: _syncDetailPolling). */
  function syncPolling() {
    var active = mounted && (function () {
      var page = chargePage();
      var session = normalizeSession(page.session, page.detail);
      return session != null && chargeSessionIsActive(session) && isActivelyCharging();
    })();
    if (active && detailTimer == null) {
      detailTimer = setInterval(function () {
        var page = chargePage();
        var session = normalizeSession(page.session, page.detail);
        if (session && window.__geelyEmit) window.__geelyEmit('history.series', { sessionId: session.id });
        repaintLive();
      }, chargeDetailLiveIntervalMs);
    } else if (!active && detailTimer != null) {
      clearInterval(detailTimer);
      detailTimer = null;
    }
    if (!active && climateWarning !== 'none') climateWarning = 'none';
  }

  /* Климат-предупреждение: гистерезис против мигания (Dart). */
  function updateClimateWarning() {
    climateWarning = readChargeClimateWarning(chargeClimateBuckets(), chargingPowerKw(), climateWarning);
  }

  function repaintLive() {
    var rootEl = document.getElementById('telChargeRoot');
    if (!rootEl || !mounted) return;
    if (draggingTarget) { paintSlider(); return; }
    updateClimateWarning();
    /* Смена сеанса сбрасывает выбор графика (Dart: _onDetailChanged). */
    var page = chargePage();
    var sid = page.session ? page.session.id : null;
    if (sid !== selectionSessionId) {
      selectionSessionId = sid;
      graphSelection = null;
      graphDismissed = false;
    }
    render();
    syncPolling();
  }

  var clickFn = null;
  function mount(rootEl) {
    host = rootEl;
    if (!clickFn) clickFn = function (ev) { handleAction(ev.target); };
    rootEl.removeEventListener('click', clickFn);
    rootEl.addEventListener('click', clickFn);
    var draft0 = (TEL.set && TEL.set.chargeTargetSoc != null) ? TEL.set.chargeTargetSoc
      : ((TEL.chargeControl && TEL.chargeControl.targetSoc != null) ? TEL.chargeControl.targetSoc : 80);
    draftTarget = draft0;
    mounted = true;
    updateClimateWarning();
    render();
    syncPolling();
  }
  function unmount() {
    mounted = false;
    if (detailTimer != null) { clearInterval(detailTimer); detailTimer = null; }
    var h = document.getElementById('telChargeHost');
    if (h && clickFn) h.removeEventListener('click', clickFn);
  }

  /* Внешние входы: бродкасты chargeState обновляют черновик цели (Dart:
   * chargeTargetSocChanges, пока не идёт драг). */
  function onChargeState(d) {
    if (d && d.targetSoc != null && !draggingTarget) draftTarget = d.targetSoc;
    if (d && d.amps != null) TEL.chargeControl = Object.assign({}, TEL.chargeControl || {}, d);
    if (mounted && !draggingTarget) repaintLive();
    else if (mounted) paintSlider();
  }

  return {
    mount: mount, unmount: unmount,
    handleAction: handleAction,
    onChargeState: onChargeState,
    repaintLive: repaintLive,
    isMounted: function () { return mounted; }
  };
})();
