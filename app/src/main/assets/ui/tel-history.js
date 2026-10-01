/*
 * tel-history.js — Stage T4 (порт телеметрии Capy → GeelyTools).
 *
 * Источник: github.com/Timoteohss/capy @ e39777c, Apache License 2.0.
 *   lib/screens_v2/history/history_v2_screen.dart — ExpandableCardStage
 *     (список 3/4 + детайл 1/4, детайл разворачивается на весь экран),
 *     CategoryMenu(Поездки|Зарядки|Батарея);
 *   lib/screens_v2/history/history_list.dart — TripHistoryPane (кнопка мест,
 *     TripsBody), ChargeHistoryPane (HistoryRow), HistoryList;
 *   lib/screens_v2/history/battery_history_pane.dart — _CycleRow (CycleBar +
 *     заметки + MetricMosaic 3×2 по 76px);
 *   lib/screens_v2/history/history_detail_page.dart — факты сессий;
 *   lib/screens_v2/history/history_detail_summary.dart — сводка: первые
 *     4 факта + подсказка развернуть;
 *   lib/screens_v2/history/history_detail_fullscreen.dart — полный детайл:
 *     поездка с маршрутом = Row[график+мозаика | кольцо+карта(c анимацией
 *     expand), 3:1]; без маршрута/зарядка = Column[графики 3 | мозаика 1
 *     (+ квадратная карта позиции у зарядки)];
 *   lib/screens_v2/history/session_mosaic.dart — SessionMosaic (7 колонок);
 *   lib/screens_v2/history/history_cycle_timeline.dart — CycleTimelineCard;
 *   packages/capy_ui: CategoryMenu/TripsBody/TripsFilterBar/
 *     DaySectionHeader/TripSessionCard/CycleBar/MetricMosaic/HistoryRow/
 *     RouteMapCard(+RouteSpeedScale)/RoutePreviewMap;
 *   lib/core/efficiency_unit.dart — переключатель единиц эффективности
 *     (здесь — локальное состояние экрана, не глобальный контроллер).
 *
 * Адаптации (каждая — в README стадии):
 *   - серии/мозаики цикла приходят мостом (history.series / cycle.sessions)
 *     и кэшируются в HISTD — вместо TelemetryQuery(getSeries/…);
 *   - карты — офлайн-SVG без OSM-тайлов (в источнике flutter_map);
 *   - EfficiencyUnitController — локальное состояние экрана;
 *   - PlacesScreen за кнопкой «Посмотреть места» не портирована (вне T4).
 */
var telHistory = (function () {
  'use strict';
  var CapyUI = window.CapyUI, telUI = window.telUI, TEL_L10N = window.TEL_L10N;
  var telBuckets = window.telBuckets, telChargeGraph = window.telChargeGraph;
  var telFmt = window.telFmt, telEfficiency = window.telEfficiency;

  var mounted = false;
  var host = null;
  var category = 'trips';               /* HistoryCategory */
  var selectedTripId = null;
  var selectedChargeId = null;
  var selectedCycle = null;             /* BatteryCycleSummary (bridge) */
  var expanded = false;                 /* CardStage: детайл на весь экран */
  var filterQuery = '';                 /* TripsFilter.query */
  var filterPreset = 'all';             /* TripsFilter.timePreset (пресеты включены по требованию задачи; на e39777c showTimePresets: false) */
  var selectedBar = null;               /* выбранный столбец графика */
  var mapExpanded = false;              /* _mapExpanded */
  var effUnit = telEfficiency.EfficiencyUnit.kmPerKwh; /* локальный контроллер */
  var costOpen = false, costField = 'rate', costDigits = { rate: '', total: '' };
  var chart = null, ring = null;

  function fmt(key, params) {
    var t = TEL_L10N[key] || '';
    for (var k in (params || {})) t = t.split('{' + k + '}').join(String(params[k]));
    return t;
  }
  function esc(x) { return telUI.esc(x); }

  /* ══════════ данные ══════════ */

  function tripEntries() { return (TEL.trips || []).map(makeTripEntry); }
  function chargeEntries() { return TEL.charges || []; }
  function cycles() { return ((TEL.cycles && TEL.cycles.list) || []); }

  function selectedTrip() {
    var list = TEL.trips || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === selectedTripId) return list[i];
    return null;
  }
  function selectedCharge() {
    var list = TEL.charges || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === selectedChargeId) return list[i];
    return null;
  }
  function seriesOf(id) { return (window.HISTD && HISTD.series && HISTD.series[id]) || null; }
  function cycleSessionsOf(ordinal) { return (window.HISTD && HISTD.cycleSess && HISTD.cycleSess[ordinal]) || null; }

  function askDetail() {
    if (!window.__geelyEmit) return;
    if (category === 'trips' && selectedTripId) window.__geelyEmit('history.series', { sessionId: selectedTripId });
    else if (category === 'charges' && selectedChargeId) window.__geelyEmit('history.series', { sessionId: selectedChargeId });
    else if (category === 'battery' && selectedCycle != null) window.__geelyEmit('cycle.sessions', { ordinal: selectedCycle.ordinal });
  }

  function tripDuration(t) {
    return t.dur != null ? t.dur : (t.min != null ? Math.round(t.min * 60000) : null);
  }
  function tripEffWhPerKm(t) {
    if (t == null || t.km == null || !(t.kwh > 0)) return null;
    return (t.kwh * 1000) / t.km;
  }

  /* Средняя/пиковая мощность зарядки (ChargeDetailReading). */
  function chargePower(c, series) {
    var intervals = (series && series.intervals) || [];
    var wh = 0, seconds = 0, peak = null;
    for (var i = 0; i < intervals.length; i++) {
      var e = intervals[i];
      if (e.delivered == null || (e.deliveredSec || 0) <= 0) continue;
      wh += e.delivered; seconds += e.deliveredSec;
      var kw = e.delivered / 1000 / (e.deliveredSec / 3600);
      if (peak == null || kw > peak) peak = kw;
    }
    return {
      averageKw: seconds > 0 ? wh / 1000 / (seconds / 3600) : null,
      peakKw: peak
    };
  }

  /* HistoryDetailPage: title + facts. */
  function detailPage() {
    if (category === 'trips' && selectedTripId) return tripPage(selectedTrip(), seriesOf(selectedTripId));
    if (category === 'charges' && selectedChargeId) return chargePage(selectedCharge(), seriesOf(selectedChargeId));
    if (category === 'battery' && selectedCycle != null) return cyclePage(selectedCycle, cycleSessionsOf(selectedCycle.ordinal));
    return null;
  }

  function tripPage(t, series) {
    if (!t) return null;
    var regenKwh = t.regen != null ? t.regen / 1000 : null;
    return {
      kind: 'trip', sessionId: t.id, trip: t, series: series,
      title: formatTripListDateTime(t.start),
      facts: [
        [TEL_L10N.v2HistoryStart, historyClock(t.start)],
        [TEL_L10N.v2HistoryEnd, historyClock(t.end)],
        [TEL_L10N.v2HistoryDuration, telUI.clockDuration(tripDuration(t))],
        [TEL_L10N.v2HistoryDistance, telFmt.distanceLabelFor(t.km)],
        [TEL_L10N.v2HistorySoc, telFmt.socRangeLabel(t.soc0, t.soc1)],
        [TEL_L10N.v2HistoryTemperature, telFmt.ambientTempRangeLabel(t.tmp0, t.tmp1)],
        [TEL_L10N.v2HistoryAltitude, telFmt.altitudeGainLabel(null)],
        [TEL_L10N.v2HistoryConsumed, telFmt.energyLabel(t.kwh)],
        [TEL_L10N.v2HistoryRegen, telFmt.energyLabel(regenKwh)],
        [TEL_L10N.v2HistoryEfficiency, telEfficiency.formatEfficiencyWhPerKmForUnit(tripEffWhPerKm(t), effUnit)]
      ]
    };
  }

  function chargePage(c, series) {
    if (!c) return null;
    var p = chargePower(c, series);
    return {
      kind: 'charge', sessionId: c.id, charge: c, series: series,
      title: formatTripListDateTime(c.start),
      facts: [
        [TEL_L10N.v2HistoryStart, historyClock(c.start)],
        [TEL_L10N.v2HistoryEnd, historyClock(c.end)],
        [TEL_L10N.v2HistoryDuration, telUI.clockDuration(c.min != null ? Math.round(c.min * 60000) : null)],
        [TEL_L10N.v2HistorySoc, telFmt.socRangeLabel(c.soc0, c.soc1)],
        [TEL_L10N.v2HistoryTemperature, telFmt.ambientTempRangeLabel(c.tmp0, c.tmp1)],
        [TEL_L10N.v2HistoryEnergyAdded, telFmt.energyLabel(c.kwh)],
        [TEL_L10N.v2HistoryAvgPower, telFmt.liveNumber(p.averageKw, TEL_L10N.unitKw, 1)],
        [TEL_L10N.v2HistoryPeakPower, telFmt.liveNumber(p.peakKw, TEL_L10N.unitKw, 1)],
        [TEL_L10N.v2HistoryPlug, chargePlugLabel(c.plug != null ? c.plug : null)]
      ]
    };
  }

  function cyclePage(cyc, sessions) {
    if (!cyc) return null;
    var span = (cyc.end || 0) - (cyc.start || 0);
    return {
      kind: 'cycle', sessionId: 'cycle-' + cyc.ordinal, cycle: cyc, sessions: sessions || [],
      title: formatTripListDateTime(cyc.start) + ' — ' + formatTripListDateTime(cyc.end),
      facts: [
        [TEL_L10N.v2CycleTimelineSessions, String((sessions || []).length)],
        [TEL_L10N.v2CycleDistance, telFmt.distanceLabelFor(cyc.km)],
        [TEL_L10N.v2CycleEnergy, (!cyc.incomplete && cyc.tripKwh != null) ? telFmt.energyLabel(cyc.tripKwh) : '--'],
        [TEL_L10N.v2HistoryDuration, span > 0 ? telUI.clockDuration(span) : '--']
      ]
    };
  }

  /* ══════════ левая карточка: CategoryMenu + панели списка ══════════ */

  function listCardHTML() {
    var c = telUI.theme();
    var h = '<div style="display:flex;height:100%;min-height:0;background:' + c.surface + ';border-radius:' + CapyUI.AppRadii.xl + 'px;overflow:hidden">';
    h += telUI.categoryRail({
      selected: category,
      entries: [
        { value: 'trips', label: TEL_L10N.v2HistoryTrips, icon: 'route' },
        { value: 'charges', label: TEL_L10N.v2HistoryCharges, icon: 'bolt' },
        { value: 'battery', label: TEL_L10N.v2HistoryBattery, icon: 'battery_charging_full' }
      ]
    });
    /* detail-панель на канве, detailScrolls: false — панель скроллит себя. */
    h += '<div style="flex:1;min-width:0;background:' + c.canvas + ';padding:' + CapyUI.AppSpacing.cardPadding + 'px;overflow:auto" id="telHistPane">';
    h += paneHTML();
    h += '</div></div>';
    return h;
  }

  function paneHTML() {
    if (category === 'trips') return tripsPaneHTML();
    if (category === 'charges') return chargesPaneHTML();
    return batteryPaneHTML();
  }

  /* ── TripHistoryPane: места + TripsBody (поиск + группы дней) ── */
  function tripsPaneHTML() {
    var SP = CapyUI.AppSpacing;
    var c = telUI.theme();
    var h = '<div style="padding:' + SP.x4 + 'px ' + SP.x4 + 'px ' + SP.x2 + 'px">' +
      telUI.softActionTile({ key: 'places', label: TEL_L10N.placesButton, icon: 'place' }) + '</div>';
    /* TripsFilterBar (showTimePresets: false — только поиск). */
    h += '<div style="display:flex;align-items:center;min-height:' + CapyUI.AppSizes.minTouchTarget + 'px;padding:0 ' + SP.x3 + 'px;background:' + c.control + ';border-radius:' + CapyUI.AppRadii.lg + 'px">' +
      telUI.icon('search', 20, c.inkMuted) +
      '<input id="telHistSearch" value="' + esc(filterQuery) + '" placeholder="' + esc(TEL_L10N.tripsSearchHint) + '" style="flex:1;min-width:0;margin-left:' + SP.x2 + 'px;border:0;background:transparent;outline:none;font-family:inherit;' + telUI.textStyle(CapyUI.AppText.body, c.ink) + '">' +
      (filterQuery ? '<button data-telclearsearch="1" style="border:0;background:transparent;cursor:pointer;padding:' + SP.x2 + 'px">' + telUI.icon('clear', 18, c.inkMuted) + '</button>' : '') +
      '</div>';
    /* Пресеты времени (TripsFilterBar.showTimePresets): Все / 7 дней / 30 дней. */
    var presets = [
      { value: 'all', label: 'Все' },
      { value: 'days7', label: '7 дней' },
      { value: 'days30', label: '30 дней' }
    ];
    h += '<div style="height:' + SP.x2 + 'px"></div><div style="display:flex;gap:' + SP.x2 + 'px">';
    for (var pi = 0; pi < presets.length; pi++) {
      var psel = presets[pi].value === filterPreset;
      h += '<button data-telfpreset="' + presets[pi].value + '" style="min-height:' + CapyUI.AppSizes.minTouchTarget + 'px;border:0;cursor:pointer;font-family:inherit;border-radius:' + CapyUI.AppRadii.full + 'px;background:' + (psel ? c.selectionFill : c.control) + ';padding:' + SP.x1 + 'px ' + SP.x3 + 'px;display:flex;align-items:center' +
        '" class="' + (psel ? '' : '') + '"><span style="' + telUI.textStyle(CapyUI.AppText.caption, psel ? c.onSelection : c.inkMuted) + 'white-space:nowrap">' + esc(presets[pi].label) + '</span></button>';
    }
    h += '</div>';
    var entries = tripEntries();
    if (!entries.length) {
      return h + '<div style="display:flex;flex-direction:column;align-items:center;padding:' + SP.cardPadding + 'px">' +
        telUI.icon('route_outlined', 48, c.inkMuted) +
        '<div style="margin-top:' + SP.x3 + 'px;' + telUI.textStyle(CapyUI.AppText.body, c.inkMuted) + 'text-align:center">' + esc(TEL_L10N.v2HistoryEmpty) + '</div></div>';
    }
    var filtered = entries.filter(function (e) { return tripsFilterMatches({ query: filterQuery, timePreset: filterPreset }, e); });
    if (!filtered.length) {
      return h + '<div style="padding:' + SP.x8 + 'px 0;' + telUI.textStyle(CapyUI.AppText.body, c.inkMuted) + 'text-align:center">' + esc(TEL_L10N.tripsEmptyFilter) + '</div>';
    }
    var groups = assembleTripDayGroups(filtered);
    h += '<div style="padding:' + SP.x3 + 'px ' + SP.x5 + 'px 0">';
    for (var g = 0; g < groups.length; g++) {
      h += telUI.daySectionHeader(groups[g]);
      h += '<div style="height:' + SP.x2 + 'px"></div>';
      for (var i = 0; i < groups[g].trips.length; i++) {
        h += telUI.tripSessionCard({ entry: groups[g].trips[i], selected: groups[g].trips[i].id === selectedTripId });
        h += '<div style="height:' + SP.x3 + 'px"></div>';
      }
      h += '<div style="height:' + SP.x2 + 'px"></div>';
    }
    return h + '</div>';
  }

  /* ── ChargeHistoryPane: HistoryRow на сессию ── */
  function chargesPaneHTML() {
    var list = chargeEntries();
    if (!list.length) return emptyList(TEL_L10N.v2HistoryEmpty);
    var h = '';
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      h += telUI.historyRow({
        key: s.id,
        title: formatTripListDateTime(s.start),
        status: telFmt.statusLabel(s.status || 'ENDED'),
        facts: [
          chargePlugLabel(s.plug != null ? s.plug : null),
          telFmt.energyLabel(s.kwh),
          telFmt.socRangeLabel(s.soc0, s.soc1)
        ],
        selected: s.id === selectedChargeId
      });
    }
    return h;
  }

  /* ── BatteryHistoryPane: _CycleRow ── */
  function batteryPaneHTML() {
    var list = cycles();
    if (!list.length) return emptyList(TEL_L10N.v2CycleEmpty);
    var h = '';
    for (var i = 0; i < list.length; i++) h += cycleRowHTML(list[i]);
    return h;
  }

  function emptyList(text) {
    var c = telUI.theme();
    return '<div style="padding:' + CapyUI.AppSpacing.cardPadding + 'px;' + telUI.textStyle(CapyUI.AppText.body, c.inkSubtle) + '">' + esc(text) + '</div>';
  }

  function cycleRowHTML(cyc) {
    var c = telUI.theme();
    var SP = CapyUI.AppSpacing;
    /* BatteryCycleSummary: примы (заметки/доли) — как в Dart. */
    var mixed = !!cyc.mixed;
    var frozen = !!cyc.frozen;
    var hasEnergy = !cyc.incomplete && cyc.tripKwh != null && cyc.tripKwh > 0;
    var tripKwh = hasEnergy ? cyc.tripKwh : null;
    var kmPerKwh = (hasEnergy && cyc.km > 0) ? cyc.km / cyc.tripKwh : null;
    var cost = mixed ? null : (cyc.cost != null ? cyc.cost : null);
    var priced = cyc.priced || 0, unpriced = cyc.unpriced || 0;
    var coverage = (priced + unpriced) > 0 ? Math.min(1, Math.max(0, priced / (priced + unpriced))) : null;
    var avgCostPerKwh = (cost != null && priced > 0) ? cost / priced : null;
    var capacityKwh = (hasEnergy && cyc.discharge > 0) ? cyc.tripKwh * 100 / cyc.discharge : null;
    var symbol = chargeCurrencySymbolForLocale(null, (!mixed && cyc.currency) ? cyc.currency : defaultCurrency());
    function money(v) { return v == null ? '--' : symbol + ' ' + v.toFixed(2); }
    var sel = selectedCycle != null && selectedCycle.ordinal === cyc.ordinal;
    var notes = [];
    if (cyc.open) notes.push(TEL_L10N.v2CycleOpen);
    if (cyc.partial) notes.push(TEL_L10N.v2CyclePartial);
    if (cyc.incomplete) notes.push(TEL_L10N.v2CycleNoCapacity);
    if (mixed) notes.push(TEL_L10N.v2CycleMixedCurrency);
    if (!mixed && coverage != null && coverage < 1) {
      notes.push(fmt('v2CyclePartlyPriced', { percent: (coverage * 100).toFixed(0) }));
    }
    if (frozen) notes.push(TEL_L10N.v2CycleFrozen);
    var h = '<button data-telcyc="' + cyc.ordinal + '" style="display:block;width:100%;text-align:left;margin-bottom:' + SP.x3 + 'px;padding:' + SP.x4 + 'px;border:' + (sel ? '2px solid ' + c.ink : '0') + ';border-radius:' + CapyUI.AppRadii.md + 'px;background:' + c.surface + ';cursor:pointer;font-family:inherit">';
    h += telUI.cycleBar({
      fillPercent: cyc.discharge,
      leadingLabel: fmt('v2CycleOrdinal', { ordinal: cyc.ordinal }),
      valueLabel: cyc.discharge.toFixed(0), valueUnit: TEL_L10N.unitPercent,
      isPartial: !!cyc.partial
    });
    h += '<div style="height:' + SP.x3 + 'px"></div>';
    h += '<div style="display:flex;align-items:center;gap:' + SP.x2 + 'px">' +
      '<span style="flex:1;' + telUI.textStyle(CapyUI.AppText.bodyStrong, c.ink) + 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
      formatTripListDateTime(cyc.start) + ' — ' + formatTripListDateTime(cyc.end) + '</span>' +
      notes.map(function (n) {
        return '<span style="flex:none;padding:' + SP.x1 + 'px ' + SP.x3 + 'px;border-radius:' + CapyUI.AppRadii.full + 'px;background:' + c.surface + ';border:1px solid ' + c.divider + ';' + telUI.textStyle(CapyUI.AppText.label, c.inkMuted) + '">' + esc(n) + '</span>';
      }).join('') + '</div>';
    h += '<div style="height:' + SP.x3 + 'px"></div>';
      h += telUI.metricMosaic({
      columns: 3,
      cellHeight: 76,
      tiles: [
        { caption: TEL_L10N.v2CycleDistance, value: cyc.km > 0 ? cyc.km.toFixed(0) : '--', unit: TEL_L10N.unitKm },
        { caption: TEL_L10N.v2CycleEnergy, value: tripKwh != null ? tripKwh.toFixed(1) : '--', unit: TEL_L10N.unitKwh },
        {
          caption: TEL_L10N.v2CycleEfficiency,
          value: telEfficiency.formatEfficiencyForUnit(kmPerKwh, effUnit),
          unit: kmPerKwh != null ? telEfficiency.efficiencyUnitSuffix(effUnit) : null,
          actionIcon: 'swap_horiz', editLabel: TEL_L10N.v2CycleEfficiencyUnitAction,
          onPressed: cycleEfficiencyUnit, key: 'efficiency'
        },
        { caption: TEL_L10N.v2CycleCost, value: money(cost) },
        { caption: TEL_L10N.v2CycleCostPerKwh, value: money(avgCostPerKwh) },
        { caption: TEL_L10N.v2CycleCapacity, value: capacityKwh != null ? capacityKwh.toFixed(1) : '--', unit: TEL_L10N.unitKwh }
      ]
    });
    return h + '</button>';
  }

  function cycleEfficiencyUnit() {
    var vals = telEfficiency.EfficiencyUnit.values;
    effUnit = vals[(vals.indexOf(effUnit) + 1) % vals.length];
    render();
  }

  /* ══════════ правая карточка: сводка / полный детайл ══════════ */

  function detailCardHTML() {
    var page = detailPage();
    if (!page) {
      var prompt = category === 'battery' ? TEL_L10N.v2CycleSelectPrompt : TEL_L10N.v2HistorySelectPrompt;
      return telUI.appCard({ child: centeredText(prompt) });
    }
    if (!expanded) return summaryCardHTML(page);
    return fullscreenHTML(page);
  }

  function centeredText(text) {
    var c = telUI.theme();
    return '<div style="flex:1;display:flex;align-items:center;justify-content:center;padding:' + CapyUI.AppSpacing.cardPadding + 'px">' +
      '<span style="' + telUI.textStyle(CapyUI.AppText.body, c.inkSubtle) + 'text-align:center">' + esc(text) + '</span></div>';
  }

  /* HistoryDetailSummaryCard: первые 4 факта + подсказка. */
  function summaryCardHTML(page) {
    var c = telUI.theme();
    var rows = '';
    for (var i = 0; i < Math.min(4, page.facts.length); i++) {
      rows += '<div style="display:flex;align-items:baseline;margin-bottom:' + CapyUI.AppSpacing.x2 + 'px">' +
        '<span style="flex:1;' + telUI.textStyle(CapyUI.AppText.label, c.inkSubtle) + 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(page.facts[i][0]) + '</span>' +
        '<span style="margin-left:' + CapyUI.AppSpacing.x3 + 'px;' + telUI.textStyle(CapyUI.AppText.bodyStrong, c.ink) + 'white-space:nowrap">' + esc(page.facts[i][1]) + '</span></div>';
    }
    rows += '<div style="height:' + CapyUI.AppSpacing.x4 + 'px"></div>';
    rows += '<span style="' + telUI.textStyle(CapyUI.AppText.caption, c.inkSubtle) + '">' + esc(TEL_L10N.v2HistoryExpandHint) + '</span>';
    var h = telUI.appCard({ title: page.title, child: rows });
    /* Развернуть (жест детайла ExpandableCardStage — кнопкой). */
    return '<div style="position:relative;height:100%">' + h +
      '<button data-telexpand="1" title="' + esc(TEL_L10N.v2HistoryExpand) + '" style="position:absolute;top:' + CapyUI.AppSpacing.x2 + 'px;right:' + CapyUI.AppSpacing.x2 + 'px;width:48px;height:48px;border:0;cursor:pointer;border-radius:' + CapyUI.AppRadii.md + 'px;background:' + c.control + ';display:flex;align-items:center;justify-content:center">' +
      telUI.icon('keyboard_arrow_up', CapyUI.AppSizes.iconMd, c.ink) + '</button></div>';
  }

  /* HistoryDetailFullscreen. Пропорции: графики 3 / показания 1,
     боковая колонка 1 при главной 3. Сворачивание в источнике — жест
     (drag-to-close); здесь — кнопка поверх детайла. */
  function fullscreenHTML(page) {
    if (page.kind === 'cycle') return cycleTimelineHTML(page);
    var gutter = CapyUI.AppSpacing.gridGutter;
    var route = routePointsOf(page);
    var content;
    if (page.kind === 'trip' && route.length) {
      /* Row[main 3: Column[график 3 + мозаика 1] | side 1: кольцо + карта] */
      content = '<div style="display:flex;gap:' + gutter + 'px;height:100%;min-height:0">' +
        '<div style="flex:3;min-width:0;display:flex;flex-direction:column;gap:' + gutter + 'px">' +
        '<div style="flex:3;min-height:0;display:flex">' + chartCardHTML(page) + '</div>' +
        '<div style="flex:1;min-height:0;display:flex">' + mosaicCardHTML(page) + '</div>' +
        '</div>' +
        '<div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:' + gutter + 'px">' +
        '<div style="flex:1;min-height:0;display:flex;transition:height ' + CapyUI.AppMotion.slow + 'ms' + (CapyUI.AppMotion.curveCss ? ' ' + CapyUI.AppMotion.curveCss : '') + '">' + ringCardHTML(page) + '</div>' +
        '<div style="flex:1;min-height:0;display:flex;transition:height ' + CapyUI.AppMotion.slow + 'ms' + (CapyUI.AppMotion.curveCss ? ' ' + CapyUI.AppMotion.curveCss : '') + '">' + routeCardHTML(page, route, false) + '</div>' +
        '</div></div>';
    } else {
      /* Column[графики 3 | показания 1]. Поездка без маршрута: кольцо рядом с
         графиком. Зарядка: график один + квадратная карта позиции в ряду
         показаний (без кнопки). */
      var charts = '<div style="display:flex;gap:' + gutter + 'px;flex:3;min-height:0">' +
        '<div style="flex:3;min-width:0;display:flex">' + chartCardHTML(page) + '</div>' +
        (page.kind === 'trip' ? '<div style="flex:1;min-width:0;display:flex">' + ringCardHTML(page) + '</div>' : '') +
        '</div>';
      var readings;
      if (page.kind === 'charge' && route.length) {
        readings = '<div style="display:flex;gap:' + gutter + 'px;flex:1;min-height:0">' +
          '<div style="flex:1;min-width:0;display:flex">' + mosaicCardHTML(page) + '</div>' +
          '<div style="flex:none;width:' + mapSquareSide() + 'px;display:flex;flex-direction:column">' + routeCardHTML(page, route, true) + '</div></div>';
      } else {
        readings = '<div style="flex:1;min-height:0;display:flex">' + mosaicCardHTML(page) + '</div>';
      }
      content = '<div style="display:flex;flex-direction:column;gap:' + gutter + 'px;height:100%;min-height:0">' +
        charts + readings + '</div>';
    }
    return '<div style="position:relative;height:100%">' + content + collapseBtn() + '</div>';
  }

  /* Сторона квадрата карты позиции зарядки: высота ряда показаний. */
  function mapSquareSide() {
    var el = document.getElementById('telHistRoot');
    if (!el) return 220;
    var h = el.clientHeight;
    var readings = Math.max(120, h - CapyUI.AppSpacing.gridGutter) / 4; /* flex 3:1 */
    return Math.round(Math.min(Math.max(readings, 140), 420));
  }

  function routePointsOf(page) {
    if (page.kind === 'charge') {
      var c = page.charge;
      if (c && c.startLat != null && c.startLon != null) return [{ latitude: c.startLat, longitude: c.startLon }];
      return [];
    }
    return makeTripEntry(page.trip).routePoints.map(function (p) {
      return { latitude: p.latitude, longitude: p.longitude, speedKmh: p.speedKmh };
    });
  }

  function chartCardHTML(page) {
    return telUI.appCard({
      title: page.title,
      subtitle: TEL_L10N.v2HistoryCollapseHint,
      fill: true,
      child: '<div class="telChartHost" id="telHistChart" style="flex:1;min-height:0"></div>'
    });
  }

  function ringCardHTML(page) {
    return telUI.appCard({ fill: true, child: '<div id="telHistRing" style="flex:1;min-height:0;display:flex;align-items:center;justify-content:center;position:relative"></div>' });
  }

  /* _tripHeaderInsight: места начала/конца (InsightTripPlaces без
     route-match — вариантная ветка вне T4) + фраза собственной средней
     (compareTripToOwnAverage) в шапке карточки мозаики. */
  function tripHeaderInsight(t) {
    var subject = null;
    var corpus = TEL.insightTrips || [];
    for (var i = 0; i < corpus.length; i++) if (corpus[i].id === t.id) { subject = corpus[i]; break; }
    var startName = (t.startLat != null && t.startLon != null) ? tripPlaceFor(t.startLat, t.startLon) : null;
    var endName = (t.endLat != null && t.endLon != null) ? tripPlaceFor(t.endLat, t.endLon) : null;
    var phrase = null;
    if (subject) {
      var read = compareTripToOwnAverage(subject, corpus, Date.now());
      var ph = insightPhraseFor(read);
      phrase = fmt(ph.key, ph.params);
    }
    var hasPlaces = !!(startName || endName);
    if (!hasPlaces && !phrase) return null;
    var c = telUI.theme();
    var h = '<div style="display:flex;flex-direction:column;align-items:flex-end;max-width:60%">';
    if (hasPlaces) {
      h += '<div style="display:flex;align-items:center;' + telUI.textStyle(CapyUI.AppText.body, c.ink) + 'overflow:hidden">' +
        (startName ? '<span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(startName) + '</span>' : '');
      if (startName && endName) {
        h += '<span style="flex:none;margin:0 ' + CapyUI.AppSpacing.x3 + 'px">' + telUI.icon('arrow_forward', 18, c.inkMuted) + '</span>';
      }
      if (endName) h += '<span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(endName) + '</span>';
      h += '</div>';
    }
    if (phrase) {
      h += '<div style="margin-top:' + (hasPlaces ? CapyUI.AppSpacing.x1 : 0) + 'px;' + telUI.textStyle(CapyUI.AppText.label, c.inkMuted) + 'text-align:right">' + esc(phrase) + '</div>';
    }
    return h + '</div>';
  }

  function mosaicCardHTML(page) {
    return telUI.appCard({
      title: TEL_L10N.v2HistoryFactsTitle,
      trailing: page.kind === 'trip' ? tripHeaderInsight(page.trip) : null,
      fill: true,
      child: '<div id="telHistMosaic" style="flex:1;min-height:0;overflow:auto">' + sessionMosaicHTML(page) + '</div>'
    });
  }

  /* RouteSpeedScale + легенда (mapSpeedSlow/Fast · speedKmhLabel). */
  function routeCardHTML(page, route, square) {
    var slow = null, fast = null;
    for (var i = 1; i < route.length; i++) {
      var a = route[i - 1].speedKmh, b = route[i].speedKmh, sp = null;
      if (a == null && b == null) sp = null;
      else if (a == null) sp = b;
      else if (b == null) sp = a;
      else sp = (a + b) / 2;
      if (sp == null || !isFinite(sp) || sp < 0) continue;
      if (slow == null || sp < slow) slow = sp;
      if (fast == null || sp > fast) fast = sp;
    }
    var hasSpeed = slow != null && fast != null;
    return telUI.routeMapCard({
      points: route,
      square: square,
      expanded: mapExpanded,
      expandLabel: TEL_L10N.v2HistoryMapExpand,
      collapseLabel: TEL_L10N.v2HistoryMapCollapse,
      onToggle: page.kind === 'trip',
      speedLegend: hasSpeed ? {
        slowLabel: fmt('mapSpeedSlow', { speed: telFmt.speedKmhLabel(slow) }),
        fastLabel: fmt('mapSpeedFast', { speed: telFmt.speedKmhLabel(fast) })
      } : null
    });
  }

  function collapseBtn() {
    var c = telUI.theme();
    return '<button data-telcollapse="1" title="' + esc(TEL_L10N.v2HistoryCollapse) + '" style="position:absolute;top:' + CapyUI.AppSpacing.x2 + 'px;left:' + CapyUI.AppSpacing.x2 + 'px;z-index:3;height:48px;padding:0 ' + CapyUI.AppSpacing.x3 + 'px;border:0;cursor:pointer;border-radius:' + CapyUI.AppRadii.md + 'px;background:' + c.surface + ';display:flex;align-items:center;gap:' + CapyUI.AppSpacing.x2 + 'px">' +
      telUI.icon('keyboard_arrow_down', CapyUI.AppSizes.iconMd, c.ink) +
      '<span style="' + telUI.textStyle(CapyUI.AppText.label, c.ink) + '">' + esc(TEL_L10N.v2HistoryCollapseHint) + '</span></button>';
  }

  /* ── SessionMosaic (7 колонок) ── */
  function sessionMosaicHTML(page) {
    var c = telUI.theme();
    if (page.kind === 'trip') {
      var t = page.trip;
      var regenKwh = t.regen != null ? t.regen / 1000 : null;
      var effWhPerKm = tripEffWhPerKm(t);
      return telUI.metricMosaic({
        columns: 7,
        tiles: [
          {
            caption: TEL_L10N.v2HistoryEfficiency,
            value: telEfficiency.formatEfficiencyWhPerKmForUnit(effWhPerKm, effUnit),
            unit: effWhPerKm != null ? telEfficiency.efficiencyUnitSuffix(effUnit) : null,
            icon: 'eco', accent: c.energy.gain, span: MosaicTileSpan.hero,
            actionIcon: 'swap_horiz', editLabel: TEL_L10N.v2CycleEfficiencyUnitAction,
            onPressed: cycleEfficiencyUnit, key: 'efficiency'
          },
          { caption: TEL_L10N.v2HistoryDistance, value: t.km != null ? t.km.toFixed(1) : '--', unit: t.km != null ? TEL_L10N.unitKm : null, icon: 'route' },
          { caption: TEL_L10N.v2HistoryAltitude, value: telFmt.altitudeGainLabel(null), icon: 'terrain' },
          { caption: TEL_L10N.v2HistoryStart, value: historyClock(t.start), icon: 'play_arrow' },
          { caption: TEL_L10N.v2HistoryDuration, value: telUI.clockDuration(tripDuration(t)), icon: 'schedule' },
          { caption: TEL_L10N.v2HistoryEnd, value: historyClock(t.end), icon: 'stop' },
          { caption: TEL_L10N.v2HistorySoc, value: telFmt.socRangeLabel(t.soc0, t.soc1), icon: 'battery_full', span: MosaicTileSpan.wide },
          { caption: TEL_L10N.v2HistoryTemperature, value: telFmt.ambientTempRangeLabel(t.tmp0, t.tmp1), icon: 'thermostat', span: MosaicTileSpan.wide },
          { caption: TEL_L10N.v2HistoryCost, value: t.cost != null ? t.cost.toFixed(2) : '--', unit: t.cost != null ? (t.currency || null) : null, icon: 'payments' }
        ]
      });
    }
    if (page.kind === 'charge') {
      var ch = page.charge;
      var p = chargePower(ch, page.series);
      var rate = ch.costPerKwh != null ? ch.costPerKwh : defaultRate();
      var cost = chargeEstimatedCost(ch.kwh, rate, ch.paidAmount != null ? ch.paidAmount : ch.cost);
      var symbol = chargeCurrencySymbolForLocale('ru-RU', chargeCostCurrencyOf({ costCurrency: ch.currency, currency: ch.currency }, defaultCurrency()));
      var sep = chargeDecimalSeparatorForLocale('ru-RU');
      return telUI.metricMosaic({
        columns: 7,
        tiles: [
          { caption: TEL_L10N.v2HistoryEnergyAdded, value: ch.kwh != null ? ch.kwh.toFixed(2) : '--', unit: ch.kwh != null ? TEL_L10N.unitKwh : null, icon: 'battery_charging_full', accent: c.energy.gain, span: MosaicTileSpan.hero },
          { caption: TEL_L10N.v2HistoryAvgPower, value: p.averageKw != null ? p.averageKw.toFixed(1) : '--', unit: p.averageKw != null ? TEL_L10N.unitKw : null, icon: 'speed' },
          { caption: TEL_L10N.v2HistoryPeakPower, value: p.peakKw != null ? p.peakKw.toFixed(1) : '--', unit: p.peakKw != null ? TEL_L10N.unitKw : null, icon: 'trending_up' },
          { caption: TEL_L10N.v2HistoryStart, value: historyClock(ch.start), icon: 'play_arrow' },
          { caption: TEL_L10N.v2HistoryDuration, value: telUI.clockDuration(ch.min != null ? Math.round(ch.min * 60000) : null), icon: 'schedule' },
          { caption: TEL_L10N.v2HistoryEnd, value: historyClock(ch.end), icon: 'stop' },
          { caption: TEL_L10N.v2HistorySoc, value: telFmt.socRangeLabel(ch.soc0, ch.soc1), icon: 'battery_full', span: MosaicTileSpan.wide },
          { caption: TEL_L10N.v2HistoryTemperature, value: telFmt.ambientTempRangeLabel(ch.tmp0, ch.tmp1), icon: 'thermostat', span: MosaicTileSpan.wide },
          {
            caption: TEL_L10N.v2HistoryCost,
            value: chargeAmountLabel(cost, symbol, sep),
            icon: 'payments', onPressed: true, key: 'cost',
            editLabel: TEL_L10N.v2ChargeCostEdit
          }
        ]
      });
    }
    return '';
  }
  function defaultRate() { return (TEL.set && TEL.set.rate) || null; }
  function defaultCurrency() { return (TEL.set && TEL.set.currency) || 'BRL'; }

  /* ── CycleTimelineCard ── */
  function cycleTimelineHTML(page) {
    var c = telUI.theme();
    var cyc = page.cycle;
    var sessions = page.sessions || [];
    var inner = telUI.cycleBar({
      fillPercent: cyc.discharge,
      leadingLabel: fmt('v2CycleOrdinal', { ordinal: cyc.ordinal }),
      valueLabel: cyc.discharge.toFixed(0), valueUnit: TEL_L10N.unitPercent,
      isPartial: !!cyc.partial
    });
    inner += '<div style="height:' + CapyUI.AppSpacing.x4 + 'px"></div>';
    inner += '<div style="display:flex;align-items:center">' +
      '<span style="flex:1;' + telUI.textStyle(CapyUI.AppText.bodyStrong, c.ink) + '">' + esc(TEL_L10N.v2CycleTimelineTitle) + '</span>' +
      '<span style="' + telUI.textStyle(CapyUI.AppText.label, c.inkSubtle) + '">' + sessions.length + '</span></div>';
    inner += '<div style="height:' + CapyUI.AppSpacing.x3 + 'px"></div>';
    if (!sessions.length) {
      inner += '<div style="flex:1;display:flex;align-items:center;justify-content:center;' + telUI.textStyle(CapyUI.AppText.body, c.inkSubtle) + 'text-align:center">' + esc(TEL_L10N.v2CycleTimelineEmpty) + '</div>';
    } else {
      inner += '<div style="flex:1;overflow:auto">';
      for (var i = 0; i < sessions.length; i++) inner += cycleTimelineRowHTML(sessions[i]);
      inner += '</div>';
    }
    var h = telUI.appCard({ title: page.title, subtitle: TEL_L10N.v2HistoryCollapseHint, fill: true, child: inner });
    return '<div style="position:relative;height:100%">' + h + collapseBtn() + '</div>';
  }

  function cycleTimelineRowHTML(entry) {
    var c = telUI.theme();
    var SP = CapyUI.AppSpacing;
    var kindIcon = entry.kind === 'TRIP' ? 'route' : (entry.kind === 'CHARGE' ? 'bolt' : 'local_parking');
    var kindLabel = entry.deleted ? TEL_L10N.v2CycleTimelineDeleted
      : (entry.kind === 'TRIP' ? TEL_L10N.v2CycleTimelineDrive
        : (entry.kind === 'CHARGE' ? TEL_L10N.v2CycleTimelineCharge : TEL_L10N.v2CycleTimelineParked));
    var accent = entry.deleted ? c.inkSubtle : (entry.kind === 'CHARGE' ? c.energy.gain : c.inkMuted);
    var ink = entry.deleted ? c.inkSubtle : c.ink;
    var isSplit = entry.share != null && entry.share < 1;
    var span = (entry.end || 0) - (entry.start || 0);
    var facts;
    if (entry.trip) {
      facts = [telFmt.distanceLabelFor(telFmt.distanceBetween(entry.trip.km0, entry.trip.km1)), telFmt.socRangeLabel(entry.trip.soc0, entry.trip.soc1)];
    } else if (entry.charge) {
      facts = [telFmt.energyLabel(entry.charge.kwh), telFmt.socRangeLabel(entry.charge.soc0, entry.charge.soc1)];
    } else {
      facts = [span > 0 ? telUI.clockDuration(span) : '--', '--'];
    }
    var h = '<div style="display:flex;align-items:center;min-height:' + CapyUI.AppSizes.minTouchTarget + 'px;margin-bottom:' + SP.x2 + 'px;padding:' + SP.x3 + 'px ' + SP.x4 + 'px;background:' + c.control + ';border-radius:' + CapyUI.AppRadii.md + 'px">' +
      telUI.icon(kindIcon, CapyUI.AppSizes.iconSm, accent) +
      '<div style="flex:3;min-width:0;margin-left:' + SP.x3 + 'px">' +
      '<div style="' + telUI.textStyle(CapyUI.AppText.bodyStrong, ink) + 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + formatTripListDateTime(entry.start) + '</div>' +
      '<div style="' + telUI.textStyle(CapyUI.AppText.label, c.inkSubtle) + 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(kindLabel) + '</div></div>';
    if (isSplit) {
      h += '<span style="flex:none;margin-right:' + SP.x3 + 'px;padding:' + SP.x1 + 'px ' + SP.x2 + 'px;border-radius:' + CapyUI.AppRadii.full + 'px;background:' + c.track + ';' + telUI.textStyle(CapyUI.AppText.caption, c.inkMuted) + '">' +
        fmt('v2CycleTimelineShare', { percent: (entry.share * 100).toFixed(0) }) + '</span>';
    }
    for (var f = 0; f < facts.length; f++) {
      h += '<div style="flex:2;min-width:0;' + telUI.textStyle(CapyUI.AppText.body, ink) + 'text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(facts[f]) + '</div>';
    }
    return h + '</div>';
  }

  /* ══════════ главный рендер ══════════ */

  function render() {
    if (!host) return;
    var gutter = CapyUI.AppSpacing.gridGutter;
    var h = '<div id="telHistRoot" style="height:100%;display:flex;gap:' + gutter + 'px;min-height:0">';
    if (expanded) {
      h += '<div style="flex:1;min-width:0;display:flex">' + detailCardHTML() + '</div>';
    } else {
      h += '<div style="flex:3;min-width:0;display:flex">' + listCardHTML() + '</div>';
      h += '<div style="flex:1;min-width:0;display:flex">' + detailCardHTML() + '</div>';
    }
    h += '</div>';
    h += costPanelHTML();
    host.innerHTML = h;
    mountChart();
    mountRing();
    attachSearch();
  }

  /* Строка поиска: перерисовка только панели списка; после неё input
     пересоздаётся — слушатель и фокус восстанавливаются (как
     TextEditingController вне setState). */
  function attachSearch() {
    var search = document.getElementById('telHistSearch');
    if (!search) return;
    search.addEventListener('input', function () {
      filterQuery = search.value;
      var pane = document.getElementById('telHistPane');
      if (pane) {
        var scroll = pane.scrollTop;
        pane.innerHTML = paneHTML();
        pane.scrollTop = scroll;
        attachSearch();
        var fresh = document.getElementById('telHistSearch');
        if (fresh) {
          fresh.focus();
          try { fresh.setSelectionRange(fresh.value.length, fresh.value.length); } catch (e) { }
        }
      }
    });
  }

  /* ── график детайла: поездка (TripEnergyBarChart) / зарядка
     (ChargeSessionChart) ── */
  function mountChart() {
    var chartHost = document.getElementById('telHistChart');
    if (!chartHost) return;
    var page = detailPage();
    if (!page) return;
    if (page.kind === 'charge') mountChargeChart(chartHost, page);
    else if (page.kind === 'trip') mountTripChart(chartHost, page);
  }

  function mountTripChart(chartHost, page) {
    var series = page.series;
    var minutes = seriesBucketsOf(series);
    if (!minutes.length) { chartHost.innerHTML = chartEmptyHTML(); return; }
    var chartWidth = chartHost.clientWidth || 600;
    var capacity = telBuckets.energyChartBarCapacity(chartWidth - CapyUI.AppSizes.chartAxisGutter,
      CapyUI.AppSizes.chartBarProfile.pitch, CapyUI.AppSizes.chartBarProfile.gap);
    var spanMin = Math.max(1, Math.ceil(((series.end || minutes[minutes.length - 1].t + 60000) - series.start) / 60000));
    var width = histChooseBucketWidth(spanMin, capacity);
    var reduced = histReduceBuckets(minutes, width).filter(function (b) { return b; });
    if (!reduced.length) { chartHost.innerHTML = chartEmptyHTML(); return; }

    var bars = [], peak = 0, trough = 0;
    for (var i = 0; i < reduced.length; i++) {
      var b = reduced[i];
      var comp = histComposition([b]);
      var counter = -((b.regen || 0) + (b.delivered || 0)) / 1000;
      peak = Math.max(peak, (b.traction || 0) / 1000 + comp.system / 1000);
      trough = Math.max(trough, -counter);
      bars.push({
        id: b.t + ':' + width,
        value: (b.traction || 0) / 1000,
        base: comp.system / 1000,
        mid: comp.climate / 1000,
        counter: counter,
        state: 'actual'
      });
    }
    var ticks = histTicksFor(peak, trough);
    var widthMs = width * 60000;
    var xTicks = histXTicks(series.start, widthMs, reduced.length);
    if (!chart) chart = new telUI.EnergyBarChart(chartHost);
    chart.mount = chartHost;
    chart.update({
      bars: bars, slotCount: bars.length, ticks: ticks, xTicks: xTicks,
      selectedIndex: selectedBar,
      onSelect: function (index) { selectedBar = index; render(); },
      tooltip: function (index) {
        var b = reduced[index];
        var comp = histComposition([b]);
        var d0 = new Date(b.t), d1 = new Date(b.t + widthMs);
        function hm(d) { return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
        return telUI.chartTooltip({
          value: (comp.packWh / 1000).toFixed(2),
          unit: TEL_L10N.unitKwh,
          rows: [
            { label: 'Тяга ' + ((b.traction || 0) / 1000).toFixed(2) + ' кВт·ч' },
            { label: 'Климат ' + (comp.climate / 1000).toFixed(2) + ' кВт·ч' },
            { label: 'Прочее ' + (comp.system / 1000).toFixed(2) + ' кВт·ч' },
            { label: 'Регенерация +' + ((b.regen || 0) / 1000).toFixed(2) + ' кВт·ч' },
            { label: hm(d0) + '–' + hm(d1) }
          ]
        });
      }
    });
  }

  function mountChargeChart(chartHost, page) {
    var series = page.series;
    var c = page.charge;
    if (!series || !series.intervals || !series.intervals.length) {
      chartHost.innerHTML = chartEmptyHTML();
      return;
    }
    /* Нормализация серий — как chargeDetailForGraph в T3. */
    var start = series.start || 0;
    var intervals = series.intervals.map(function (e) {
      return {
        startUtcMillis: e.t, widthMillis: e.w || 60000,
        deliveredWh: e.delivered, deliveredCoveredSeconds: e.deliveredSec,
        climateWh: e.climate, climateCoveredSeconds: e.climateSec,
        startSoc: e.soc0, endSoc: e.soc1
      };
    });
    var socSeries = [], powerSeries = [];
    series.intervals.forEach(function (e) {
      if (e.delivered != null && e.deliveredSec > 0) powerSeries.push({ x: (e.t - start) / 1000, y: e.delivered / 1000 / (e.deliveredSec / 3600) });
      if (e.soc0 != null) socSeries.push({ x: (e.t - start) / 1000, y: e.soc0 });
      if (e.soc1 != null) socSeries.push({ x: (e.t + (e.w || 60000) - start) / 1000, y: e.soc1 });
    });
    var detail = {
      series: { intervals: intervals }, intervals: intervals,
      socSeries: socSeries, powerSeries: powerSeries,
      start: start,
      targetReachedAtUtcMillis: series.limitReachedAt || [],
      targetReachedSeconds: (series.limitReachedAt || []).map(function (ms) { return (ms - start) / 1000; }),
      session: { startSoc: c.soc0 != null ? c.soc0 : null }
    };
    var session = {
      id: c.id, status: c.status || 'ENDED',
      startedAtUtcMillis: c.start,
      endedAtUtcMillis: c.end,
      plugDisconnectedAtUtcMillis: c.end,
      estimatedEnergyKwh: c.kwh
    };
    var durationMs = chargeWindow(session);
    var profile = CapyUI.AppSizes.chartDenseBarProfile;
    var plotW = chartHost.clientWidth - CapyUI.AppSizes.chartAxisGutter;
    var capacity = telBuckets.energyChartBarCapacity(plotW, profile.pitch, profile.gap);
    var graph = telChargeGraph.buildChargeGraphData(detail, durationMs, capacity);
    if (graph.isEmpty) { chartHost.innerHTML = chartEmptyHTML(); return; }
    var bars = [], overlay = [];
    for (var i = 0; i < graph.buckets.length; i++) {
      var b = graph.buckets[i];
      bars.push({
        id: c.id + ':' + b.startSeconds + ':' + graph.intervalSeconds,
        value: b.socPercent != null ? b.socPercent : NaN,
        state: b.isHeld ? 'held' : 'actual'
      });
      overlay.push(b.powerKw == null ? NaN : telChargeGraph.chargePowerPlotValue(b.powerKw, graph.axisMaximumKw));
    }
    var ticks = [];
    for (var t = 0; t < graph.powerTicksKw.length; t++) {
      var tick = graph.powerTicksKw[t];
      ticks.push({ value: telChargeGraph.chargePowerPlotValue(tick, graph.axisMaximumKw), label: String(Math.round(tick)) });
    }
    if (!chart) chart = new telUI.EnergyBarChart(chartHost);
    chart.mount = chartHost;
    chart.update({
      bars: bars, slotCount: capacity, ticks: ticks,
      xTicks: histXTicks(start, graph.intervalSeconds * 1000, capacity),
      profile: profile,
      overlay: overlay,
      overlayAnchor: 'both',
      selectedIndex: selectedBar,
      onSelect: function (index) { selectedBar = index; render(); },
      tooltip: function (index) {
        var b = graph.buckets[index];
        var from = new Date(start + b.startSeconds * 1000);
        var to = new Date(start + b.endSeconds * 1000);
        function hm(d) { return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
        return telUI.chartTooltip({
          value: b.socPercent != null ? b.socPercent.toFixed(1) : '--',
          unit: b.socPercent == null ? null : TEL_L10N.unitPercent,
          rows: [
            { label: b.powerKw == null ? ('-- ' + TEL_L10N.unitWatt2) : (b.powerKw.toFixed(1) + ' ' + TEL_L10N.unitWatt2) },
            { label: hm(from) + '–' + hm(to) }
          ]
        });
      }
    });
  }

  function histXTicks(startMs, widthMs, count) {
    if (!(count > 0)) return [];
    var positions = [0.0, 0.4, 0.8], out = [];
    for (var i = 0; i < positions.length; i++) {
      var d = new Date(startMs + Math.round(widthMs * count * positions[i]));
      out.push({ position: positions[i], label: String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') });
    }
    return out;
  }
  function chartEmptyHTML() {
    var c = telUI.theme();
    return '<div style="flex:1;display:flex;align-items:center;justify-content:center;' +
      telUI.textStyle(CapyUI.AppText.label, c.inkMuted) + 'text-align:center">' + esc(TEL_L10N.v2HistoryChartEmpty) + '</div>';
  }

  /* ── кольцо (EnergySessionPanel c showTitle: false) ── */
  function mountRing() {
    var ringHost = document.getElementById('telHistRing');
    if (!ringHost) return;
    var page = detailPage();
    if (!page || page.kind !== 'trip') return;
    var series = page.series;
    var minutes = seriesBucketsOf(series);
    var comp = histComposition(minutes);
    var traction = comp.traction, climate = comp.climate, system = comp.system, regen = comp.regen;
    var drawn = comp.drawn;
    var c = telUI.theme();
    if (!(drawn > 0)) {
      ringHost.innerHTML = '<span style="' + telUI.textStyle(CapyUI.AppText.caption, c.inkMuted) + '">--</span>';
      return;
    }
    var side = Math.min(ringHost.clientWidth || 240, ringHost.clientHeight || 240);
    var segments = [{ value: traction, color: c.energy.draw }];
    if (climate > 0) segments.push({ value: climate, color: c.energy.drawSoft });
    if (system > 0) segments.push({ value: system, color: c.energy.drawSubtle });
    if (!ring) ring = new telUI.SegmentedDonut(ringHost);
    ring.mount = ringHost;
    ring.update({
      side: side,
      segments: segments,
      innerArc: regen > 0 ? { value: regen, color: c.energy.gain } : null,
      value: (drawn / 1000).toFixed(1),
      unit: TEL_L10N.unitKwh,
      delta: regen > 0 ? '+' + (regen / 1000).toFixed(1) + ' ' + TEL_L10N.unitKwh : null,
      hasMarkers: false
    });
  }

  /* ══════════ хелперы серий (порт Stage B12) ══════════ */
  function seriesBucketsOf(series) {
    return ((series && series.intervals) || []).map(function (e) {
      return {
        t: e.t, traction: e.traction || 0, regen: e.regen || 0, aux: e.aux || 0,
        climate: e.climate || 0, climateSec: e.climateSec || 0, sec: e.sec || 0,
        delivered: e.delivered || 0, deliveredSec: e.deliveredSec || 0,
        km: e.km || 0, speedSec: e.speedSec || 0, soc0: e.soc0, soc1: e.soc1
      };
    });
  }
  function histComposition(buckets) {
    var tr = 0, ax = 0, rg = 0, cl = 0, sec = 0, clSec = 0;
    (buckets || []).forEach(function (b) {
      if (!b) return;
      tr += b.traction || 0; ax += b.aux || 0; rg += b.regen || 0; cl += b.climate || 0;
      sec += b.sec || 0; clSec += b.climateSec || 0;
    });
    var covered = sec > 0 && clSec >= sec * 0.98;
    var divided = covered && cl >= 0 && cl <= ax;
    var climate = divided ? cl : 0;
    return {
      traction: tr, aux: ax, regen: rg, climate: climate, divided: divided, seconds: sec,
      system: Math.max(0, ax - climate), drawn: tr + ax, packWh: tr + ax - rg
    };
  }
  function progBucketMin(min) {
    if (min <= 60) return min;
    if (min <= 180) return Math.ceil(min / 5) * 5;
    return Math.ceil(min / 15) * 15;
  }
  function histChooseBucketWidth(spanMin, cap) {
    if (!cap || cap <= 0) return 1;
    var span = Math.max(1, Math.ceil(spanMin));
    return progBucketMin(Math.ceil(span / cap));
  }
  function histReduceBuckets(minutes, width) {
    if (!minutes || !minutes.length) return [];
    var wMs = width * 60000, first = minutes[0].t;
    var align = Math.ceil(first / wMs) * wMs;
    var out = [];
    minutes.forEach(function (b) {
      var idx = Math.floor((b.t - align) / wMs);
      if (idx < 0) idx = 0;
      while (out.length <= idx) out.push(null);
      var o = out[idx];
      if (!o) {
        o = { t: align + idx * wMs, n: 0, traction: 0, regen: 0, aux: 0, climate: 0, climateSec: 0, sec: 0, delivered: 0, deliveredSec: 0, km: 0, soc0: null, soc1: null };
        out[idx] = o;
      }
      o.n++; o.traction += b.traction || 0; o.regen += b.regen || 0; o.aux += b.aux || 0; o.climate += b.climate || 0;
      o.climateSec += b.climateSec || 0; o.sec += b.sec || 0; o.delivered += b.delivered || 0; o.deliveredSec += b.deliveredSec || 0;
      o.km += b.km || 0;
      if (o.soc0 == null && b.soc0 != null) o.soc0 = b.soc0;
      if (b.soc1 != null) o.soc1 = b.soc1;
    });
    return out;
  }
  function histTicksFor(peakKwh, troughKwh) {
    var top = peakKwh > 0 ? energyAxisTop(peakKwh) : energyAxisTop(0.5);
    var bottom = troughKwh <= 0 ? 0 : energyAxisTop(troughKwh);
    var ticks = [
      { value: top, label: top.toFixed(2) },
      { value: top / 2, label: (top / 2).toFixed(2) },
      { value: 0, label: '0.00' }
    ];
    if (bottom > 0) ticks.push({ value: -bottom, label: '+' + bottom.toFixed(2) });
    return ticks;
  }

  /* ══════════ клавиатура цены (MoneyKeypadDialog, как T3) ══════════ */

  function costPanelHTML() {
    if (!costOpen) return '';
    var page = detailPage();
    if (!page || page.kind !== 'charge') return '';
    var ch = page.charge;
    var loc = TEL_L10N;
    var currency = chargeCostCurrencyOf({ costCurrency: ch.currency, currency: ch.currency }, defaultCurrency());
    var symbol = chargeCurrencySymbolForLocale('ru-RU', currency);
    var sep = chargeDecimalSeparatorForLocale('ru-RU');
    var digits = costDigits[costField] || '';
    var n = digits.length ? parseInt(digits, 10) : 0;
    var display = digits.length
      ? (String(Math.floor(n / 100)) + sep + String(n % 100).padStart(2, '0'))
      : '0' + sep + '00';
    return '<div class="telAnchorLayer" style="position:absolute;inset:0;z-index:30">' +
      '<div class="telDropScrim" data-telanchorclose style="position:absolute;inset:0"></div>' +
      '<div class="telAnchorPanel" style="position:absolute;left:50%;top:72px;transform:translateX(-50%);background:' + telUI.theme().surface + ';border-radius:' + CapyUI.AppRadii.xl + 'px;box-shadow:0 8px 32px rgba(0,0,0,0.35)">' +
      telUI.moneyKeypadDialog({
        title: loc.v2ChargeCostTitle, description: loc.v2ChargeCostDescription,
        fields: [
          { value: 'rate', label: loc.v2ChargeCostFieldRate },
          { value: 'total', label: loc.v2ChargeCostFieldTotal }
        ],
        selected: costField, currencySymbol: symbol, display: display,
        unit: costField === 'rate' ? loc.v2ChargeCostUnitRate : null,
        saveLabel: loc.v2MoneyKeypadSave
      }) + '</div></div>';
  }
  function digitsOf(amount) {
    if (amount == null || !isFinite(amount)) return '';
    return String(Math.round(amount * 100));
  }

  /* ══════════ события ══════════ */

  function handleAction(target) {
    var t = target, el;
    /* Плитка мозаики — раньше строк-кнопок: плитка эффективности вложена
       в строку цикла, и клик по ней не должен открывать строку. */
    if ((el = t.closest('[data-telmosaic]'))) {
      var mkey = el.getAttribute('data-telmosaic');
      if (mkey === 'efficiency') { cycleEfficiencyUnit(); return true; }
      if (mkey === 'cost') {
        var mpage = detailPage();
        if (mpage && mpage.kind === 'charge') {
          costOpen = true;
          costField = 'rate';
          costDigits = {
            rate: digitsOf(mpage.charge.costPerKwh != null ? mpage.charge.costPerKwh : defaultRate()),
            total: digitsOf(mpage.charge.paidAmount != null ? mpage.charge.paidAmount : null)
          };
          render();
        }
        return true;
      }
    }
    if ((el = t.closest('[data-telcat]'))) {
      var cat = el.getAttribute('data-telcat');
      if (cat !== category) {
        category = cat;
        selectedBar = null;
        mapExpanded = false;
        render();
        askDetail();
      }
      return true;
    }
    if ((el = t.closest('[data-teltrip]'))) {
      selectedTripId = el.getAttribute('data-teltrip');
      selectedBar = null; mapExpanded = false;
      expanded = true;
      render();
      askDetail();
      return true;
    }
    if ((el = t.closest('[data-telhist]'))) {
      selectedChargeId = el.getAttribute('data-telhist');
      selectedBar = null; mapExpanded = false;
      expanded = true;
      render();
      askDetail();
      return true;
    }
    if ((el = t.closest('[data-telcyc]'))) {
      var ord = +el.getAttribute('data-telcyc');
      selectedCycle = cycles().filter(function (x) { return x.ordinal === ord; })[0] || null;
      selectedBar = null; mapExpanded = false;
      expanded = true;
      render();
      askDetail();
      return true;
    }
    if (t.closest('[data-telcollapse]')) {
      expanded = false;
      render();
      return true;
    }
    if (t.closest('[data-telexpand]')) {
      expanded = true;
      render();
      return true;
    }
    if (t.closest('[data-telmaptoggle]')) {
      mapExpanded = !mapExpanded;
      render();
      return true;
    }
    if ((el = t.closest('[data-telfpreset]'))) {
      filterPreset = el.getAttribute('data-telfpreset');
      var pane = document.getElementById('telHistPane');
      if (pane) pane.innerHTML = paneHTML();
      return true;
    }
    if (t.closest('[data-telclearsearch]')) {
      filterQuery = '';
      render();
      return true;
    }
    if ((el = t.closest('[data-telsoft]')) && el.getAttribute('data-telsoft') === 'places') {
      say('Места: ' + ((TEL.places || []).length) + ' сохранённых');
      return true;
    }
    /* Плитка мозаики обрабатывается выше (до строк). */
    if (costOpen) {
      if (t.closest('[data-telanchorclose]')) { costOpen = false; render(); return true; }
      if ((el = t.closest('[data-telseg]'))) {
        var segVal = el.getAttribute('data-val');
        if (segVal === 'rate' || segVal === 'total') { costField = segVal; render(); }
        return true;
      }
      if ((el = t.closest('[data-teldigit]'))) {
        var d = el.getAttribute('data-teldigit');
        var cur = costDigits[costField] || '';
        if (cur.length < 9 && !(cur === '' && d === '0')) {
          costDigits[costField] = cur + d;
          render();
        }
        return true;
      }
      if ((el = t.closest('[data-telkey]'))) {
        var k = el.getAttribute('data-telkey');
        if (k === 'clear') costDigits[costField] = '';
        else if (k === 'delete') costDigits[costField] = (costDigits[costField] || '').slice(0, -1);
        else if (k === 'save') {
          var page2 = detailPage();
          if (page2 && page2.kind === 'charge') {
            var digits = costDigits[costField] || '';
            var amount = digits.length ? parseInt(digits, 10) / 100 : null;
            var ch = page2.charge;
            writeChargeCost(
              {
                id: ch.id,
                costPerKwh: ch.costPerKwh != null ? ch.costPerKwh : null,
                paidAmount: ch.paidAmount != null ? ch.paidAmount : null,
                costCurrency: ch.currency, currency: ch.currency
              },
              costField, amount, defaultCurrency());
            costOpen = false;
          }
        }
        render();
        return true;
      }
    }
    return false;
  }

  /* ══════════ live-цикл ══════════ */

  function repaintLive() {
    if (!mounted || !host) return;
    render();
  }

  var clickFn = null;
  function mount(rootEl) {
    host = rootEl;
    if (!clickFn) clickFn = function (ev) { handleAction(ev.target); };
    rootEl.removeEventListener('click', clickFn);
    rootEl.addEventListener('click', clickFn);
    mounted = true;
    render();
    askDetail();
  }
  function unmount() {
    mounted = false;
    if (host && clickFn) host.removeEventListener('click', clickFn);
  }

  return {
    mount: mount, unmount: unmount,
    handleAction: handleAction,
    repaintLive: repaintLive,
    isMounted: function () { return mounted; }
  };
})();
