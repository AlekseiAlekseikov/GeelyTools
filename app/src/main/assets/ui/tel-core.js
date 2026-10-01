/*
 * tel-core.js — Stage T1 (порт телеметрии Capy → GeelyTools).
 *
 * Источник: github.com/Timoteohss/capy @ e39777c, Apache License 2.0.
 *   lib/design_system/automotive_colors.dart, automotive_spacing.dart,
 *   automotive_typography.dart;
 *   lib/core/telemetry_format.dart;
 *   lib/core/charge_graph_data.dart;
 *   packages/telemetry_core/lib/energy_buckets.dart (choose/reduce/
 *   progressive/floor/ceil/capacity);
 *   packages/telemetry_core/lib/compass_reading.dart (compassBearingLabel);
 *   lib/l10n/app_ru.arb (строки).
 *
 * Правило этапа: логика переносится ДОСЛОВНО — те же имена, формулы,
 * единицы и правила фильтрации. Экраны (T2–T4) переводятся на этот
 * модуль; дублирующие формулы в index.html удаляются по мере перевода.
 *
 * Copyright 2026 Timoteohss (capy), Apache License 2.0 — see NOTICE.
 */
'use strict';

/* ══════════ Design system: AutomotiveColors (обе темы) ══════════ */
var CapyDS = (function () {
  // automotive_colors.dart → _AutomotiveDarkColors
  var dark = {
    surface: '#131313', surfaceDim: '#131313', surfaceBright: '#393939',
    surfaceContainerLowest: '#0E0E0E', surfaceContainerLow: '#1C1B1B',
    surfaceContainer: '#20201F', surfaceContainerHigh: '#2A2A2A',
    surfaceContainerHighest: '#353535',
    onSurface: '#E5E2E1', onSurfaceVariant: '#C4C7C7',
    inverseSurface: '#E5E2E1', inverseOnSurface: '#313030',
    outline: '#8E9192', outlineVariant: '#444748', surfaceTint: '#C9C6C5',
    primary: '#C9C6C5', onPrimary: '#313030', primaryContainer: '#0A0A0A',
    onPrimaryContainer: '#7B7979', inversePrimary: '#5F5E5E',
    secondary: '#4AE183', onSecondary: '#003919',
    secondaryContainer: '#06BB63', onSecondaryContainer: '#00431F',
    tertiary: '#92CCFF', onTertiary: '#003351',
    tertiaryContainer: '#000B16', onTertiaryContainer: '#0080C0',
    error: '#FFB4AB', onError: '#690005',
    errorContainer: '#93000A', onErrorContainer: '#FFDAD6',
    background: '#131313', onBackground: '#E5E2E1', surfaceVariant: '#353535',
    technicalBase: '#0A0A0A', technicalPanel: '#1A1A1A', technicalBorder: '#2A2A2A',
    batteryPositive: '#2ECC71', kinetic: '#3498DB',
    warning: '#F39C12', critical: '#E74C3C'
  };
  // AutomotiveLightColors
  var light = {
    surface: '#FCF9F8', surfaceDim: '#DCD9D9', surfaceBright: '#FCF9F8',
    surfaceContainerLowest: '#FFFFFF', surfaceContainerLow: '#F6F3F2',
    surfaceContainer: '#F0EDED', surfaceContainerHigh: '#EAE7E7',
    surfaceContainerHighest: '#E5E2E1',
    onSurface: '#1C1B1B', onSurfaceVariant: '#444748',
    inverseSurface: '#313030', inverseOnSurface: '#F3F0EF',
    outline: '#747878', outlineVariant: '#C4C7C7', surfaceTint: '#5F5E5E',
    primary: '#000000', onPrimary: '#FFFFFF', primaryContainer: '#EAE7E7',
    onPrimaryContainer: '#444748', inversePrimary: '#C9C6C5',
    secondary: '#006D37', onSecondary: '#FFFFFF',
    secondaryContainer: '#6BFE9C', onSecondaryContainer: '#00743A',
    tertiary: '#006493', onTertiary: '#FFFFFF',
    tertiaryContainer: '#CCE5FF', onTertiaryContainer: '#1D8ACD',
    error: '#BA1A1A', onError: '#FFFFFF',
    errorContainer: '#FFDAD6', onErrorContainer: '#93000A',
    background: '#FCF9F8', onBackground: '#1C1B1B', surfaceVariant: '#E5E2E1',
    technicalBase: '#FFFFFF', technicalPanel: '#F6F3F2', technicalBorder: '#C4C7C7',
    batteryPositive: '#006D37', kinetic: '#1D8ACD',
    warning: '#F39C12', critical: '#BA1A1A'
  };
  function palette(lightMode) { return lightMode ? light : dark; }

  /* automotive_spacing.dart */
  var spacing = {
    unit: 8, railWidth: 96, gutter: 24, marginScreen: 32, touchTargetMin: 64,
    x0: 0, x0_5: 4, x1: 8, x1_5: 12, x2: 16, x3: 24, x4: 32, x5: 40, x6: 48, x8: 64,
    screenPadding: 32, panelPadding: 24, compactPanelPadding: 16
  };
  /* AutomotiveRadii */
  var radii = { sm: 2, base: 4, md: 6, lg: 8, xl: 12, full: 9999 };
  /* AutomotiveDimensions */
  var dimensions = {
    navRailWidth: 96, navIconSize: 32, activeRailMarkerWidth: 4,
    progressHeight: 12, minTouchTarget: 64,
    panelBorderWidth: 1, activeBorderWidth: 2
  };
  /* automotive_typography.dart — семейства и стили как есть */
  var fonts = { ui: 'Inter', mono: 'JetBrains Mono' };
  var typography = {
    metricDisplay: { font: fonts.mono, size: 64, weight: 700, height: 1, letterSpacing: 0 },
    metricDisplayMobile: { font: fonts.mono, size: 48, weight: 700, height: 1 },
    headlineLg: { font: fonts.ui, size: 32, weight: 600, height: 40 / 32 },
    headlineMd: { font: fonts.ui, size: 24, weight: 600, height: 32 / 24 },
    bodyLg: { font: fonts.ui, size: 18, weight: 400, height: 28 / 18 },
    bodyMd: { font: fonts.ui, size: 16, weight: 400, height: 24 / 16 },
    labelCaps: { font: fonts.ui, size: 12, weight: 700, height: 16 / 12, letterSpacing: 0.6 },
    unitLabel: { font: fonts.mono, size: 14, weight: 500, height: 20 / 14 }
  };
  return { dark: dark, light: light, palette: palette, spacing: spacing, radii: radii, dimensions: dimensions, fonts: fonts, typography: typography };
})();

/* ══════════ L10N: строки телеметрии из app_ru.arb (ключи = arb) ══════════ */
var TEL_L10N = {
  gearD: 'D', gearP: 'P', gearR: 'R', gearN: 'N',
  unitKmh: 'км/ч', unitKm: 'км',
  statusComplete: 'ЗАВЕРШЕНО',
  tripStatusActive: 'АКТИВНА',
  tripStatusPendingEnd: 'ОЖИДАНИЕ ОКОНЧАНИЯ',
  tripEndReasonInProgress: 'В_ПРОЦЕССЕ',
  tripEndReasonWaitingIdle: 'ОЖИДАНИЕ_ПРОСТОЯ',
  /* ── app_ru.arb: экраны v2 (T2+) ── */
  energyUseTitle: 'Расход энергии',
  energyUseAbout: 'О расходе энергии',
  energyModeDrive: 'Поездка',
  energyModeParked: 'Стоянка',
  energyChartFailed: 'Не удалось прочитать поездку.',
  energyChartLoading: 'Чтение поездки…',
  energyChartEmpty: 'В этом окне поездок не записано.',
  energyChartEmptyParked: 'В этом окне автомобиль не стоял.',
  energyChartSemantics: 'Расход энергии по интервалам',
  energyWindowSelector: 'Выберите отрезок поездки для показа',
  energyWindowCurrentDrive: 'Текущая поездка',
  energyWindowSincePowerOn: 'С момента включения',
  energyWindowLast15Minutes: 'Последние 15 минут',
  energyWindowLastHour: 'Последний час',
  energyWindowLast8Hours: 'Последние 8 часов',
  energyStatEfficiency: 'Сред.',
  energyStatDistance: 'Дистанция',
  energyStatSpeed: 'Сред. скорость',
  energyStatCost: 'Расч. стоимость',
  energyStatParkedDrain: 'Ср. расход',
  energyStatParkedTotal: 'Всего',
  energyStatParkedClimate: 'Климат',
  energyLedgerIn: 'Пришло',
  energyLedgerOut: 'Ушло',
  energyLedgerBalance: 'Баланс',
  energyLedgerSoc: 'SOC',
  energyLedgerIncludesEstimate: 'Включает оценку расхода во сне.',
  energyTraction: 'Привод',
  energyClimate: 'Климат',
  energyAuxiliary: 'Прочие системы',
  energyRegeneration: 'Возвращено',
  sessionDetailsTitle: 'Сведения о сеансе',
  sessionDetailsAbout: 'Об этом сеансе',
  sessionDetailsInfoClose: 'Закрыть пояснение о сеансе',
  sessionDetailsInfoTitle: 'Что показывает кольцо',
  sessionDetailsInfoTraction: 'Энергия, которую батарея отдала мотору на движение автомобиля.',
  sessionDetailsInfoClimate: 'Энергия, которую батарея отдала на обогрев и охлаждение. Автомобиль сообщает это значение сам.',
  sessionDetailsInfoAuxiliary: 'Всё, что отдала батарея и что не объясняют привод и климат: руль, насосы, свет, электроника. Это остаток после привода, поэтому в нём накапливается погрешность обоих измерений. Если автомобиль не сообщает мощность климата, эта нагрузка входит в данное значение.',
  sessionDetailsInfoRegeneration: 'Энергия, возвращённая мотором при замедлении. Измеряется по отношению к израсходованной, а не является её долей — поэтому это внутренняя дуга.',
  unitKwh: 'кВт·ч',
  unitWatt: 'Вт',
  unitPercent: '%',
  unitKmPerKwh: 'км/кВт·ч',
  unitKwhPer50km: 'кВт·ч/50км',
  unitKwhPer100km: 'кВт·ч/100км',
  v2HistoryChartEmpty: 'У этой сессии нет данных для графика.',
  v2TimeNotSynced: 'Время ещё не синхронизировано. Столбцы показывают измеренную энергию.',
  energyStateCharge: 'Зарядка',
  energyStatePoweredOn: 'Включён',
  energyBarOpen: 'идёт',
  liveChargeBadgeEstimate: 'ОЦ'
};
/* NB: длительность в заголовке «Сведения о сеансе» в источнике НЕ
   локализована — energy_session_panel.dart жёстко печатает `1h 13min` /
   `13min`. Порт сохраняет это поведение. */

/* ══════════ telemetry_format.dart → telFmt ══════════ */
var telFmt = (function () {
  function twoDigits(v) { return String(v).padStart(2, '0'); }

  function dateTimeFromMillis(millis) {
    if (millis == null || millis <= 0) return null;
    return new Date(millis); // Dart: fromMillisecondsSinceEpoch(utc).toLocal() — Date уже локальный
  }

  function durationBetween(start, end) {
    if (start == null) return null;
    var effectiveEnd = end != null ? end : new Date();
    var ms = effectiveEnd.getTime() - start.getTime();
    if (ms < 0) return null;
    return ms; // Duration в миллисекундах
  }

  function boundedDurationBetween(start, end, maximum) {
    var d = durationBetween(start, end);
    if (d == null || d > maximum) return null;
    return d;
  }

  function durationFromMillis(millis) {
    if (millis == null || millis < 0) return null;
    return millis;
  }

  function formatDateTime(value) {
    return value.getFullYear() + '-' + twoDigits(value.getMonth() + 1) + '-' + twoDigits(value.getDate()) +
      ' ' + twoDigits(value.getHours()) + ':' + twoDigits(value.getMinutes());
  }

  /* Часы: mm:ss до часа, hh:mm:ss от часа. */
  function formatDuration(ms) {
    if (ms == null) return '--';
    var total = Math.floor(ms / 1000);
    var hours = Math.floor(total / 3600);
    var minutes = Math.floor(total / 60) % 60;
    var seconds = total % 60;
    if (hours === 0) return twoDigits(minutes) + ':' + twoDigits(seconds);
    return twoDigits(hours) + ':' + twoDigits(minutes) + ':' + twoDigits(seconds);
  }

  function formatUpdated(millis) {
    var updated = dateTimeFromMillis(millis);
    if (updated == null) return '--';
    return formatDateTime(updated);
  }

  var RU_WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
  var RU_MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  /* RU-ветка formatSessionEventDate: 'EEEE, MMMM d' + начало предложения с заглавной */
  function formatSessionEventDate(value) {
    var s = RU_WEEKDAYS[value.getDay()] + ', ' + RU_MONTHS[value.getMonth()] + ' ' + value.getDate();
    return capitalize(s);
  }
  function formatChargeEventDate(value) { return formatSessionEventDate(value); }

  function statusLabel(status) {
    switch (String(status || '').toUpperCase()) {
      case 'ACTIVE': return TEL_L10N.tripStatusActive;
      case 'ENDED': return TEL_L10N.statusComplete;
      case 'PENDING_END': return TEL_L10N.tripStatusPendingEnd;
      default: return String(status || '').toUpperCase();
    }
  }

  function statusColorFor(status, endReason, lightMode) {
    var c = CapyDS.palette(!!lightMode);
    var upperStatus = String(status || '').toUpperCase();
    var upperReason = String(endReason || '').toUpperCase();
    if (upperStatus === 'ACTIVE') return c.secondary;
    if (upperReason.indexOf('CANCEL') >= 0 || upperReason.indexOf('ERROR') >= 0) return c.warning;
    if (upperStatus === 'ENDED') return c.tertiary;
    return c.onSurfaceVariant;
  }

  function distanceBetween(start, end) {
    if (start == null || end == null) return null;
    var value = end - start;
    if (value < 0) return null;
    return value;
  }
  function distanceLabelFor(distance) {
    if (distance == null) return '--';
    return distance.toFixed(1) + ' ' + TEL_L10N.unitKm;
  }
  function efficiencyLabel(value) {
    if (value == null) return '--';
    return value.toFixed(0) + ' Wh/km';
  }
  function rangePerEnergyLabel(value) {
    if (value == null) return '--';
    return value.toFixed(1) + ' km/kWh';
  }
  function energyLabel(value) {
    if (value == null) return '--';
    return value.toFixed(2) + ' kWh';
  }
  function liveNumber(value, unit, decimals) {
    if (value == null) return '--';
    return value.toFixed(decimals) + ' ' + unit;
  }
  function liveEfficiencyWhPerKm(netEnergyKwh, distanceKm) {
    if (distanceKm < 0.01 || netEnergyKwh <= 0) return null;
    return (netEnergyKwh * 1000) / distanceKm;
  }
  function liveKmPerKwh(netEnergyKwh, distanceKm) {
    if (distanceKm < 0.01 || netEnergyKwh <= 0) return null;
    return distanceKm / netEnergyKwh;
  }
  function objectAsDouble(value) {
    if (typeof value === 'number') return value;
    if (value == null) return null;
    var s = String(value).replace(',', '.').trim();
    if (s === '') return null;
    var v = parseFloat(s);
    return isNaN(v) ? null : v;
  }
  function mapDouble(map, key) {
    if (map == null) return null;
    return objectAsDouble(map[key]);
  }
  function mapText(map, key) {
    if (map == null) return null;
    var v = map[key];
    return v == null ? null : String(v);
  }
  function speedLabelFor(distance, durationMs) {
    if (distance == null || durationMs == null || Math.floor(durationMs / 1000) <= 0) return '--';
    var hours = (durationMs / 1000) / 3600;
    return Math.round(distance / hours) + ' ' + TEL_L10N.unitKmh;
  }
  function speedKmhLabel(kmh) {
    if (kmh == null || !isFinite(kmh)) return '--';
    return Math.round(kmh) + ' ' + TEL_L10N.unitKmh;
  }
  function socRangeLabel(start, end) {
    var startText = start == null ? '--' : start.toFixed(1) + '%';
    var endText = end == null ? '--' : end.toFixed(1) + '%';
    return startText + ' -> ' + endText;
  }
  function ambientTempLabel(celsius) {
    if (celsius == null) return '--';
    return celsius.toFixed(1) + '°C';
  }
  function ambientTempRangeLabel(start, end) {
    if (start == null && end == null) return '--';
    return ambientTempLabel(start) + ' -> ' + ambientTempLabel(end);
  }
  function altitudeGainLabel(metres) {
    if (metres == null || !isFinite(metres)) return '--';
    return '+' + Math.round(metres) + ' m';
  }
  function tiltAngleLabel(degrees) {
    if (degrees == null || !isFinite(degrees)) return '--';
    var rounded = Math.round(degrees);
    return (rounded === 0 ? 0 : rounded) + '°';
  }
  function socDeltaLabel(start, end) {
    if (start == null || end == null) return '--';
    var delta = end - start;
    return (delta >= 0 ? '+' : '') + delta.toFixed(1) + '%';
  }
  function odometerLabelFor(value) {
    if (value == null) return '--';
    return value.toFixed(1) + ' ' + TEL_L10N.unitKm;
  }
  function gearLabelFor(value) {
    if (value == null) return '--';
    if ((value & 0x8) !== 0) return TEL_L10N.gearD;
    if ((value & 0x4) !== 0) return TEL_L10N.gearP;
    if ((value & 0x2) !== 0) return TEL_L10N.gearR;
    if ((value & 0x1) !== 0) return TEL_L10N.gearN;
    return 'RAW ' + value;
  }
  function fallbackEndReason(status) {
    switch (String(status || '').toUpperCase()) {
      case 'ACTIVE': return TEL_L10N.tripEndReasonInProgress;
      case 'PENDING_END': return TEL_L10N.tripEndReasonWaitingIdle;
      default: return '--';
    }
  }
  /* paddedMinY/paddedMaxY: точки = [{x,y}] */
  function minMax(spots) {
    var min = Infinity, max = -Infinity;
    for (var i = 0; i < spots.length; i++) {
      var y = spots[i].y;
      if (y < min) min = y;
      if (y > max) max = y;
    }
    return [min, max];
  }
  function paddedMinY(spots, floor, ceiling) {
    if (spots.length === 0) return floor;
    var mm = minMax(spots);
    var range = Math.abs(mm[1] - mm[0]);
    var padding = range <= 0 ? 1.0 : Math.min(30.0, Math.max(1.0, range * 0.12));
    return Math.min(ceiling, Math.max(floor, mm[0] - padding));
  }
  function paddedMaxY(spots, minimum, ceiling) {
    if (spots.length === 0) return minimum;
    var mm = minMax(spots);
    var range = Math.abs(mm[1] - mm[0]);
    var padding = range <= 0 ? 1.0 : Math.min(30.0, Math.max(1.0, range * 0.12));
    return Math.min(ceiling, Math.max(minimum, mm[1] + padding));
  }
  return {
    twoDigits: twoDigits, dateTimeFromMillis: dateTimeFromMillis,
    durationBetween: durationBetween, boundedDurationBetween: boundedDurationBetween,
    durationFromMillis: durationFromMillis, formatDateTime: formatDateTime,
    formatDuration: formatDuration, formatUpdated: formatUpdated,
    formatSessionEventDate: formatSessionEventDate, formatChargeEventDate: formatChargeEventDate,
    statusLabel: statusLabel, statusColorFor: statusColorFor,
    distanceBetween: distanceBetween, distanceLabelFor: distanceLabelFor,
    efficiencyLabel: efficiencyLabel, rangePerEnergyLabel: rangePerEnergyLabel,
    energyLabel: energyLabel, liveNumber: liveNumber,
    liveEfficiencyWhPerKm: liveEfficiencyWhPerKm, liveKmPerKwh: liveKmPerKwh,
    mapDouble: mapDouble, mapText: mapText, objectAsDouble: objectAsDouble,
    speedLabelFor: speedLabelFor, speedKmhLabel: speedKmhLabel,
    socRangeLabel: socRangeLabel, ambientTempLabel: ambientTempLabel,
    ambientTempRangeLabel: ambientTempRangeLabel, altitudeGainLabel: altitudeGainLabel,
    tiltAngleLabel: tiltAngleLabel, socDeltaLabel: socDeltaLabel,
    odometerLabelFor: odometerLabelFor, gearLabelFor: gearLabelFor,
    fallbackEndReason: fallbackEndReason, paddedMinY: paddedMinY, paddedMaxY: paddedMaxY
  };
})();

/* ══════════ compass_reading.dart → compassBearingLabel ══════════ */
function compassBearingLabel(degrees) {
  if (degrees == null || !isFinite(degrees)) return '--';
  return (Math.round(degrees) % 360) + '°';
}

/* ══════════ energy_buckets.dart → telBuckets ══════════ */
var telBuckets = (function () {
  var ONE_MINUTE_MS = 60000;

  function progressiveEnergyBucketMinutes(requiredMinutes) {
    var minutes = Math.max(1, requiredMinutes);
    if (minutes <= 60) return minutes;
    if (minutes <= 180) return Math.floor((minutes + 4) / 5) * 5;
    return Math.floor((minutes + 14) / 15) * 15;
  }

  /* Сколько баров влезает в plotWidth при шаге pitch и зазоре gap. */
  function energyChartBarCapacity(plotWidth, pitch, gap) {
    if (plotWidth <= 0) return 0;
    return Math.max(0, Math.floor((plotWidth + gap) / pitch));
  }

  /* Минимальная прогрессивная ширина, чьё число баров влезает в capacity. */
  function chooseEnergyBucketWidth(spanMs, capacity) {
    if (capacity <= 0) return ONE_MINUTE_MS;
    var spanMinutes = Math.max(1, Math.ceil((spanMs / 1000) / 60));
    var requiredMinutes = Math.ceil(spanMinutes / capacity);
    return progressiveEnergyBucketMinutes(requiredMinutes) * ONE_MINUTE_MS;
  }

  function nextEnergyBucketWidth(widthMs) {
    var nextRequiredMinute = Math.max(1, Math.floor(widthMs / ONE_MINUTE_MS) + 1);
    return progressiveEnergyBucketMinutes(nextRequiredMinute) * ONE_MINUTE_MS;
  }

  function _floorDiv(a, b) { return Math.floor(a / b); }

  /* Граница бакета по местным часам (Dart: floorEnergyBucketBoundary). */
  function floorEnergyBucketBoundary(dateMs, widthMs) {
    if (widthMs <= 0) return dateMs;
    var d = new Date(dateMs);
    var offsetMs = -d.getTimezoneOffset() * 60000; // Dart timeZoneOffset = локальное − UTC
    var local = dateMs + offsetMs;
    var aligned = _floorDiv(local, widthMs) * widthMs - offsetMs;
    return aligned;
  }
  function ceilEnergyBucketBoundary(dateMs, widthMs) {
    var floor = floorEnergyBucketBoundary(dateMs, widthMs);
    return floor < dateMs ? floor + widthMs : floor;
  }
  function _floorFromOrigin(dateMs, widthMs, originMs) {
    return originMs + _floorDiv(dateMs - originMs, widthMs) * widthMs;
  }

  /* EnergyBucket: Wh-значения, discharge positive (как в Dart). */
  function EnergyBucket(o) {
    this.start = o.start;                 // ms epoch
    this.width = o.width || ONE_MINUTE_MS;
    this.tractionWh = o.tractionWh || 0;
    this.regeneratedWh = o.regeneratedWh || 0;
    this.auxiliaryWh = o.auxiliaryWh || 0;
    this.integratedSeconds = o.integratedSeconds || 0;
    this.deliveredWh = o.deliveredWh || 0;
    this.speedDistanceKm = o.speedDistanceKm || 0;
    this.odometerDistanceKm = o.odometerDistanceKm || 0;
    this.speedIntegratedSeconds = o.speedIntegratedSeconds || 0;
    this.climateWh = o.climateWh || 0;
    this.climateIntegratedSeconds = o.climateIntegratedSeconds || 0;
    this.startSoc = (o.startSoc == null) ? null : o.startSoc;
    this.endSoc = (o.endSoc == null) ? null : o.endSoc;
  }
  EnergyBucket.ONE_MINUTE_MS = ONE_MINUTE_MS;
  /* fromMap — wire-формат capy + имена legacy-бакетов GeelyTools
     (адаптация: Dart-версия читает только wire-имена). */
  EnergyBucket.fromMap = function (map, width) {
    var w = width || ONE_MINUTE_MS;
    var num = function (v, d) { return (typeof v === 'number') ? v : d; };
    return new EnergyBucket({
      start: (map.startUtcMillis != null) ? map.startUtcMillis : (map.t != null ? map.t : 0),
      width: w,
      tractionWh: num(map.tractionWh, num(map.traction, 0)),
      regeneratedWh: num(map.regeneratedWh, num(map.regen, 0)),
      auxiliaryWh: num(map.auxiliaryWh, num(map.aux, 0)),
      integratedSeconds: num(map.integratedSeconds, num(map.coveredSeconds, num(map.sec, 0))),
      deliveredWh: num(map.deliveredWh, num(map.delivered, 0)),
      speedDistanceKm: num(map.speedDistanceKm, num(map.distanceKm, num(map.km, 0))),
      odometerDistanceKm: num(map.odometerDistanceKm, num(map.km, 0)),
      speedIntegratedSeconds: num(map.speedIntegratedSeconds, num(map.speedSec, 0)),
      climateWh: num(map.climateWh, num(map.climate, 0)),
      climateIntegratedSeconds: num(map.climateIntegratedSeconds, num(map.climateCoveredSeconds, num(map.climateSec, 0))),
      startSoc: (map.startSoc != null) ? map.startSoc : map.soc0,
      endSoc: (map.endSoc != null) ? map.endSoc : map.soc1
    });
  };
  EnergyBucket.prototype.netWh = function () {
    return this.tractionWh - this.regeneratedWh + this.auxiliaryWh;
  };
  /* Отдано батареей за интервал: привод + всё остальное, до возврата регена. */
  Object.defineProperty(EnergyBucket.prototype, 'drawnWh', {
    get: function () { return this.tractionWh + this.auxiliaryWh; }
  });
  /* Пустой = ни одной измеренной секунды ( absence, не ноль). */
  Object.defineProperty(EnergyBucket.prototype, 'isEmpty', {
    get: function () { return this.integratedSeconds <= 0; }
  });
  Object.defineProperty(EnergyBucket.prototype, 'end', {
    get: function () { return this.start + this.width; }
  });

  /* Слияние минутных бакетов в width-широкие (reduceEnergyBuckets).
     Вход — только минутная серия; alignment по местным часам (origin — для
     live-сессии от её старта). */
  function reduceEnergyBuckets(minutes, widthMs, originMs) {
    if (!minutes || minutes.length === 0) return [];
    if (!(widthMs > ONE_MINUTE_MS)) return minutes.slice();
    var grouped = {};
    for (var i = 0; i < minutes.length; i++) {
      var b = minutes[i];
      var aligned = (originMs == null)
        ? floorEnergyBucketBoundary(b.start, widthMs)
        : _floorFromOrigin(b.start, widthMs, originMs);
      (grouped[aligned] || (grouped[aligned] = [])).push(b);
    }
    var starts = Object.keys(grouped).map(Number).sort(function (a, b2) { return a - b2; });
    var out = [];
    for (var k = 0; k < starts.length; k++) {
      var g = grouped[starts[k]];
      var sum = function (f) { var s = 0; for (var j = 0; j < g.length; j++) s += g[j][f]; return s; };
      var first = g[0], last = g[g.length - 1];
      out.push(new EnergyBucket({
        start: starts[k], width: widthMs,
        tractionWh: sum('tractionWh'), regeneratedWh: sum('regeneratedWh'),
        auxiliaryWh: sum('auxiliaryWh'), integratedSeconds: sum('integratedSeconds'),
        deliveredWh: sum('deliveredWh'), speedDistanceKm: sum('speedDistanceKm'),
        odometerDistanceKm: sum('odometerDistanceKm'),
        speedIntegratedSeconds: sum('speedIntegratedSeconds'),
        climateWh: sum('climateWh'), climateIntegratedSeconds: sum('climateIntegratedSeconds'),
        startSoc: first.startSoc, endSoc: last.endSoc
      }));
    }
    return out;
  }

  /* Точная сетка слотов: пустые бакеты = отсутствие, не измеренный ноль.
     Dart: fillEnergyBucketSlots({buckets, start, width, slotCount}). */
  function fillEnergyBucketSlots(buckets, start, widthMs, slotCount) {
    if (!(slotCount > 0)) return [];
    var byStart = {};
    for (var i = 0; i < buckets.length; i++) byStart[buckets[i].start] = buckets[i];
    var out = [];
    for (var index = 0; index < slotCount; index++) {
      var slotStart = start + widthMs * index;
      out.push(byStart[slotStart] || emptyEnergyBucket(slotStart, widthMs));
    }
    return out;
  }

  /* Один неизмеренный интервал, сохраняющий слот на оси времени. */
  function emptyEnergyBucket(start, widthMs) {
    return new EnergyBucket({ start: start, width: widthMs });
  }

  /* Заполняет дыры той же шириной: ось держит масштаб, дыра ≠ ноль. */
  function fillEnergyBucketGaps(buckets) {
    if (buckets.length <= 1) return buckets.slice();
    var widthMs = buckets[0].width;
    var filled = [];
    for (var i = 0; i < buckets.length; i++) {
      filled.push(buckets[i]);
      if (i + 1 >= buckets.length) break;
      var cursor = buckets[i].start + buckets[i].width;
      var next = buckets[i + 1].start;
      while (cursor < next) {
        filled.push(emptyEnergyBucket(cursor, widthMs));
        cursor += widthMs;
      }
    }
    return filled;
  }

  /* Слияние живых минут на записанную серию: шире покрытие — тот и прав.
     Ничья — живой (свежее). Оба входа — минутные. */
  function mergeEnergyBuckets(stored, live) {
    if (!live || live.length === 0) return stored.slice();
    if (!stored || stored.length === 0) return live.slice();
    var byStart = {};
    for (var i = 0; i < stored.length; i++) byStart[stored[i].start] = stored[i];
    for (var j = 0; j < live.length; j++) {
      var b = live[j];
      var existing = byStart[b.start];
      if (existing == null || b.integratedSeconds >= existing.integratedSeconds) {
        byStart[b.start] = b;
      }
    }
    var starts = Object.keys(byStart).map(Number).sort(function (a, b2) { return a - b2; });
    return starts.map(function (s) { return byStart[s]; });
  }

  /* Индекс интервала, который ещё копится (только последний и только live). */
  function openEnergyBucketIndex(buckets, live, nowMs) {
    if (!live || buckets.length === 0) return null;
    var last = buckets[buckets.length - 1];
    if (last.integratedSeconds === 0 && last.tractionWh === 0 && last.auxiliaryWh === 0 &&
        last.regeneratedWh === 0 && last.deliveredWh === 0 && last.speedDistanceKm === 0) return null;
    if (!(last.start + last.width > nowMs)) return null;
    return last.integratedSeconds < last.width / 1000 ? buckets.length - 1 : null;
  }

  /* Весь охват оси, дыры включены: сумма ширин, не разница штампов. */
  function energyBucketSpan(buckets) {
    if (buckets.length === 0) return 0;
    var total = 0;
    for (var i = 0; i < buckets.length; i++) total += buckets[i].width;
    return total;
  }

  /* Репликация reconcileSessionEnergyBuckets: часы врали — якорим к сессии.
     Выброс >1 ч в любую сторону переезжает к доминирующему кластеру. */
  function _dominantStart(buckets) {
    var sorted = buckets.slice().sort(function (a, b) { return a.start - b.start; });
    return sorted[Math.floor(sorted.length / 2)].start;
  }

  function reconcileSessionEnergyBuckets(buckets, sessionStartMs) {
    if (buckets.length === 0) return [];
    var referenceStart = (sessionStartMs != null) ? sessionStartMs : _dominantStart(buckets);
    var OUTLIER_THRESHOLD_MS = 3600000; // 1 ч
    var preJump = [], postJump = [];
    for (var i = 0; i < buckets.length; i++) {
      if (Math.abs(referenceStart - buckets[i].start) > OUTLIER_THRESHOLD_MS) preJump.push(buckets[i]);
      else postJump.push(buckets[i]);
    }
    if (preJump.length === 0) return buckets.slice();

    var targetBase = (sessionStartMs != null)
      ? floorEnergyBucketBoundary(sessionStartMs, ONE_MINUTE_MS)
      : (postJump.length > 0
          ? postJump[0].start - preJump.length * ONE_MINUTE_MS
          : floorEnergyBucketBoundary(referenceStart, ONE_MINUTE_MS));

    preJump.sort(function (a, b) { return a.start - b.start; });
    var firstPreJumpStart = preJump[0].start;
    var byStart = {};
    for (var k = 0; k < postJump.length; k++) byStart[postJump[k].start] = postJump[k];

    function cloneAt(bucket, newStart) {
      return new EnergyBucket({
        start: newStart, width: bucket.width,
        tractionWh: bucket.tractionWh, regeneratedWh: bucket.regeneratedWh,
        auxiliaryWh: bucket.auxiliaryWh, integratedSeconds: bucket.integratedSeconds,
        deliveredWh: bucket.deliveredWh, speedDistanceKm: bucket.speedDistanceKm,
        odometerDistanceKm: bucket.odometerDistanceKm,
        speedIntegratedSeconds: bucket.speedIntegratedSeconds,
        climateWh: bucket.climateWh, climateIntegratedSeconds: bucket.climateIntegratedSeconds,
        startSoc: bucket.startSoc, endSoc: bucket.endSoc
      });
    }
    for (var p = 0; p < preJump.length; p++) {
      var bucket = preJump[p];
      var offset = bucket.start - firstPreJumpStart;
      var newStart = targetBase + offset;
      var existing = byStart[newStart];
      if (existing == null) {
        byStart[newStart] = cloneAt(bucket, newStart);
      } else {
        var merged = cloneAt(bucket, newStart);
        merged.tractionWh = existing.tractionWh + bucket.tractionWh;
        merged.regeneratedWh = existing.regeneratedWh + bucket.regeneratedWh;
        merged.auxiliaryWh = existing.auxiliaryWh + bucket.auxiliaryWh;
        merged.integratedSeconds = existing.integratedSeconds + bucket.integratedSeconds;
        merged.deliveredWh = existing.deliveredWh + bucket.deliveredWh;
        merged.speedDistanceKm = existing.speedDistanceKm + bucket.speedDistanceKm;
        merged.odometerDistanceKm = existing.odometerDistanceKm + bucket.odometerDistanceKm;
        merged.speedIntegratedSeconds = existing.speedIntegratedSeconds + bucket.speedIntegratedSeconds;
        merged.climateWh = existing.climateWh + bucket.climateWh;
        merged.climateIntegratedSeconds = existing.climateIntegratedSeconds + bucket.climateIntegratedSeconds;
        merged.startSoc = (bucket.startSoc != null) ? bucket.startSoc : existing.startSoc;
        merged.endSoc = (bucket.endSoc != null) ? existing.endSoc : existing.endSoc;
        byStart[newStart] = merged;
      }
    }
    var starts = Object.keys(byStart).map(Number).sort(function (a, b) { return a - b; });
    return starts.map(function (s) { return byStart[s]; });
  }

  return {
    ONE_MINUTE_MS: ONE_MINUTE_MS,
    progressiveEnergyBucketMinutes: progressiveEnergyBucketMinutes,
    energyChartBarCapacity: energyChartBarCapacity,
    chooseEnergyBucketWidth: chooseEnergyBucketWidth,
    nextEnergyBucketWidth: nextEnergyBucketWidth,
    floorEnergyBucketBoundary: floorEnergyBucketBoundary,
    ceilEnergyBucketBoundary: ceilEnergyBucketBoundary,
    reduceEnergyBuckets: reduceEnergyBuckets,
    fillEnergyBucketSlots: fillEnergyBucketSlots,
    emptyEnergyBucket: emptyEnergyBucket,
    fillEnergyBucketGaps: fillEnergyBucketGaps,
    mergeEnergyBuckets: mergeEnergyBuckets,
    openEnergyBucketIndex: openEnergyBucketIndex,
    energyBucketSpan: energyBucketSpan,
    reconcileSessionEnergyBuckets: reconcileSessionEnergyBuckets,
    EnergyBucket: EnergyBucket
  };
})();

/* readEnergyComposition и EnergyWindow объявлены ниже (глобально):
   telBuckets.readEnergyComposition / telBuckets.EnergyWindow — см. window-экспорт. */

/* ══════════ energy_buckets.dart: композиция + окна ══════════ */

/* Порог покрытия климата: доля секунд с климатом против всех секунд. */
var kClimateCoverageFloor = 0.98;

function EnergyComposition(o) {
  this.traction = o.traction; this.auxiliary = o.auxiliary;
  this.regenerated = o.regenerated; this.climate = o.climate;
  this.divided = o.divided; this.seconds = o.seconds;
}
EnergyComposition.prototype = {
  get system() { return this.auxiliary - this.climate; },
  get drawn() { return this.traction + this.auxiliary; },
  get packWh() { return this.traction - this.regenerated + this.auxiliary; },
  get regenerationRatio() { return this.traction > 1.0 ? this.regenerated / this.traction : null; }
};
EnergyComposition.empty = new EnergyComposition({ traction: 0, auxiliary: 0, regenerated: 0, climate: 0, divided: false, seconds: 0 });

/* Одна редукция для кольца и легенды — чтобы цифры не расходились. */
function readEnergyComposition(buckets) {
  var traction = 0, auxiliary = 0, regenerated = 0, climate = 0, seconds = 0, climateSeconds = 0;
  for (var i = 0; i < buckets.length; i++) {
    var b = buckets[i];
    traction += b.tractionWh; auxiliary += b.auxiliaryWh;
    regenerated += b.regeneratedWh; climate += b.climateWh;
    seconds += b.integratedSeconds; climateSeconds += b.climateIntegratedSeconds;
  }
  var covered = seconds > 0 && climateSeconds >= seconds * kClimateCoverageFloor;
  var divided = covered && climate >= 0 && climate <= auxiliary;
  return new EnergyComposition({
    traction: traction, auxiliary: auxiliary, regenerated: regenerated,
    climate: divided ? climate : 0, divided: divided, seconds: seconds
  });
}

/* EnergyWindow: два живых (по сессии) + три окна часов. */
var EnergyWindow = {
  currentDrive: { name: 'currentDrive', minutes: null, isLive: true },
  sincePowerOn: { name: 'sincePowerOn', minutes: null, isLive: true },
  last15Minutes: { name: 'last15Minutes', minutes: 15, isLive: false },
  lastHour: { name: 'lastHour', minutes: 60, isLive: false },
  last8Hours: { name: 'last8Hours', minutes: 480, isLive: false },
  values: null
};
EnergyWindow.values = [
  EnergyWindow.currentDrive, EnergyWindow.sincePowerOn,
  EnergyWindow.last15Minutes, EnergyWindow.lastHour, EnergyWindow.last8Hours
];

/* ══════════ continuous_minute_labelling.dart → telLabelling ══════════ */
var telLabelling = (function () {
  var ContinuousLabel = { charge: 'charge', trip: 'trip', parked: 'parked', poweredOn: 'poweredOn' };
  var continuousLabelPrecedence = [ContinuousLabel.charge, ContinuousLabel.trip, ContinuousLabel.parked];

  /* SessionSpan: сеанс TRIP/PARKED/CHARGE как его видит разметчик. */
  function SessionSpan(map) {
    /* wire-формат моста (startedAtUtcMillis/endedAtUtcMillis, как в
       TelemetryUiAdapter.spans) приоритетен; start/end — демо-имена. */
    this.kind = map.kind || 'TRIP';
    this.start = (map.startedAtUtcMillis != null) ? map.startedAtUtcMillis : map.start;
    this.end = (map.endedAtUtcMillis != null) ? map.endedAtUtcMillis
      : ((map.end == null) ? null : map.end);
    this.sleepSeconds = (map.sleepSeconds == null) ? null : map.sleepSeconds;
    this.sleepSocDeltaPercent = (map.sleepSocDeltaPercent == null) ? null : map.sleepSocDeltaPercent;
    this.sleepEnergyWhEstimate = (map.sleepEnergyWhEstimate == null) ? null : map.sleepEnergyWhEstimate;
  }

  /* Накладывается ли интервал (полуоткрытый с обеих сторон). */
  function _covers(span, startMs, endMs) {
    return span.start < endMs && startMs < ((span.end == null) ? Infinity : span.end);
  }

  function _resolveLabel(startMs, endMs, spans) {
    var covering = {};
    for (var i = 0; i < spans.length; i++) {
      if (_covers(spans[i], startMs, endMs)) covering[spans[i].label] = true;
    }
    for (var k = 0; k < continuousLabelPrecedence.length; k++) {
      if (covering[continuousLabelPrecedence[k]]) return continuousLabelPrecedence[k];
    }
    return ContinuousLabel.poweredOn;
  }

  /* Размечает каждый данный минутный бакет по spans. Дыры не заполняет. */
  function labelEnergyBuckets(buckets, spans, nowMs, isEstimated) {
    var useable = [];
    for (var i = 0; i < spans.length; i++) {
      var s = spans[i];
      if (s.kind === 'CONTINUOUS') continue;
      useable.push({
        label: (s.kind === 'TRIP') ? ContinuousLabel.trip
          : (s.kind === 'PARKED') ? ContinuousLabel.parked
          : (s.kind === 'CHARGE') ? ContinuousLabel.charge
          : ContinuousLabel.poweredOn,
        start: s.start,
        end: (s.end == null) ? nowMs : s.end
      });
    }
    var out = [];
    for (var b = 0; b < buckets.length; b++) {
      var bucket = buckets[b];
      out.push({
        bucket: bucket,
        label: _resolveLabel(bucket.start, bucket.start + bucket.width, useable),
        estimated: isEstimated ? !!isEstimated(bucket) : false
      });
    }
    return out;
  }

  /* Метка растяжки из нескольких минут — та же приоритетность, грубее. */
  function resolveStretchLabel(labels) {
    var present = {};
    for (var i = 0; i < labels.length; i++) if (labels[i] != null) present[labels[i]] = true;
    for (var k = 0; k < continuousLabelPrecedence.length; k++) {
      if (present[continuousLabelPrecedence[k]]) return continuousLabelPrecedence[k];
    }
    return ContinuousLabel.poweredOn;
  }

  /* Одна оценочная минута на каждую дыру, закрытую sleep-оценкой PARKED. */
  function synthesizeSleepGapEnergyBuckets(buckets, spans) {
    if (buckets.length === 0) return [];
    var measuredStarts = {};
    for (var i = 0; i < buckets.length; i++) measuredStarts[buckets[i].start] = true;
    var sessionStart = buckets[0].start;
    for (var j = 1; j < buckets.length; j++) if (buckets[j].start < sessionStart) sessionStart = buckets[j].start;
    var synthesized = [];
    for (var s = 0; s < spans.length; s++) {
      var span = spans[s];
      var energyWh = span.sleepEnergyWhEstimate, end = span.end;
      if (span.kind !== 'PARKED' || energyWh == null || end == null) continue;
      var gapStart = telBuckets.ceilEnergyBucketBoundary(span.start, telBuckets.ONE_MINUTE_MS);
      var clampedStart = (gapStart < sessionStart) ? sessionStart : gapStart;
      var gapStarts = [];
      for (var minute = clampedStart; minute < end; minute += telBuckets.ONE_MINUTE_MS) {
        if (!measuredStarts[minute]) gapStarts.push(minute);
      }
      if (gapStarts.length === 0) continue;
      var perMinuteWh = energyWh / gapStarts.length;
      for (var g = 0; g < gapStarts.length; g++) {
        synthesized.push(new telBuckets.EnergyBucket({
          start: gapStarts[g], width: telBuckets.ONE_MINUTE_MS,
          tractionWh: 0, regeneratedWh: 0, auxiliaryWh: perMinuteWh,
          integratedSeconds: 60
        }));
      }
    }
    synthesized.sort(function (a, b) { return a.start - b.start; });
    return synthesized;
  }

  return {
    ContinuousLabel: ContinuousLabel,
    continuousLabelPrecedence: continuousLabelPrecedence,
    SessionSpan: SessionSpan,
    labelEnergyBuckets: labelEnergyBuckets,
    resolveStretchLabel: resolveStretchLabel,
    synthesizeSleepGapEnergyBuckets: synthesizeSleepGapEnergyBuckets
  };
})();

/* ══════════ efficiency_unit.dart → telEfficiency ══════════ */
var telEfficiency = (function () {
  var EfficiencyUnit = { kmPerKwh: 'kmPerKwh', kwhPer50km: 'kwhPer50km', kwhPer100km: 'kwhPer100km' };
  EfficiencyUnit.values = [EfficiencyUnit.kmPerKwh, EfficiencyUnit.kwhPer50km, EfficiencyUnit.kwhPer100km];

  function _roundedForDisplay(value) {
    return value < 10 ? value.toFixed(2) : value.toFixed(1);
  }

  function formatEfficiencyForUnit(kmPerKwh, unit) {
    if (kmPerKwh == null || !isFinite(kmPerKwh)) return '--';
    var value = Math.max(0.0, kmPerKwh);
    if (unit === EfficiencyUnit.kmPerKwh) return _roundedForDisplay(value);
    if (value <= 0) return '--';
    if (unit === EfficiencyUnit.kwhPer50km) return _roundedForDisplay(50 / value);
    return _roundedForDisplay(100 / value);
  }

  function formatEfficiencyWhPerKmForUnit(whPerKm, unit) {
    if (whPerKm == null || !isFinite(whPerKm) || whPerKm <= 0) return '--';
    return formatEfficiencyForUnit(1000 / whPerKm, unit);
  }

  /* Суффикс единицы по локали (RU): км/кВт·ч · кВт·ч/50км · кВт·ч/100км. */
  function efficiencyUnitSuffix(unit) {
    if (unit === EfficiencyUnit.kmPerKwh) return TEL_L10N.unitKmPerKwh;
    if (unit === EfficiencyUnit.kwhPer50km) return TEL_L10N.unitKwhPer50km;
    return TEL_L10N.unitKwhPer100km;
  }

  return {
    EfficiencyUnit: EfficiencyUnit,
    formatEfficiencyForUnit: formatEfficiencyForUnit,
    formatEfficiencyWhPerKmForUnit: formatEfficiencyWhPerKmForUnit,
    efficiencyUnitSuffix: efficiencyUnitSuffix
  };
})();

/* ══════════ charge_metrics.dart: символ валюты по локали ══════════ */
function chargeCurrencySymbolForLocale(localeName, fallbackCurrency) {
  var locale = (localeName || '').toLowerCase();
  if (locale.indexOf('pt') === 0) return 'R$';
  if (locale.indexOf('ru') === 0) return '₽';
  if (locale.indexOf('en') === 0) return '$';
  var fallback = (fallbackCurrency || 'BRL').toUpperCase();
  if (fallback === 'BRL') return 'R$';
  if (fallback === 'EUR') return '€';
  if (fallback === 'USD') return '$';
  return fallback;
}

/* ══════════ energy_bar_chart.dart: energyAxisTop ══════════ */
function energyAxisTop(peak) {
  if (!isFinite(peak) || peak <= 0) return 1;
  var magnitude = Math.pow(10, Math.floor(Math.log(peak) / Math.LN10));
  var steps = [1.0, 1.2, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0, 6.0, 8.0];
  for (var i = 0; i < steps.length; i++) {
    var candidate = steps[i] * magnitude;
    if (candidate >= peak * 1.1) return candidate;
  }
  return 12 * magnitude;
}

/* ══════════ charge_graph_data.dart → telChargeGraph ══════════ */
var telChargeGraph = (function () {
  var CHARGE_GRAPH_MAXIMUM_POWER_KW = 80;
  var K_MAX_CHARGE_WALL_DURATION_MS = 31 * 24 * 60 * 60 * 1000;  /* session_duration.dart */
  var CHARGE_IDLE_POWER_KW = 0.05;
  var MAX_TAIL_SHARE = 0.35;

  /* Логарифмическая кривая: 1 кВт виден, сессии сопоставимы. */
  function chargePowerPlotValue(powerKw, ceilingKw) {
    var ceiling = (ceilingKw == null) ? CHARGE_GRAPH_MAXIMUM_POWER_KW : ceilingKw;
    if (!isFinite(powerKw) || ceiling <= 0) return NaN;
    var bounded = Math.min(ceiling, Math.max(0, powerKw));
    return Math.log(1 + bounded) / Math.log(1 + ceiling) * 100;
  }

  /* Окно с обрезанным idle-хвостом (макс 35% сверх последней активности). */
  function _cappedWindowSeconds(requested, powerSeries) {
    if (requested <= 0) return requested;
    var lastActive = 0.0;
    for (var i = 0; i < powerSeries.length; i++) {
      if (powerSeries[i].y > CHARGE_IDLE_POWER_KW && powerSeries[i].x > lastActive) {
        lastActive = powerSeries[i].x;
      }
    }
    if (lastActive <= 0) return requested;
    var cap = lastActive * (1 + MAX_TAIL_SHARE);
    return Math.min(requested, cap);
  }

  /* Потолок оси: общий 80 кВт; выше — следующая ступень 10 кВт. */
  function _axisMaximumKw(buckets) {
    var peak = 0.0;
    for (var i = 0; i < buckets.length; i++) {
      var p = buckets[i].powerKw;
      if (p != null && isFinite(p) && p > peak) peak = p;
    }
    if (peak <= CHARGE_GRAPH_MAXIMUM_POWER_KW) return CHARGE_GRAPH_MAXIMUM_POWER_KW;
    return Math.ceil(peak / 10) * 10;
  }

  function _bucketIndex(point, intervalSeconds, bucketCount) {
    var x = point.x;
    if (!isFinite(x) || x < 0) return null;
    var index = Math.floor(x / intervalSeconds);
    if (index < bucketCount) return index;
    return x === bucketCount * intervalSeconds ? bucketCount - 1 : null;
  }

  function _fixedIntervalSeconds(durationSeconds, capacity) {
    var budget = (capacity == null) ? 24 : capacity;
    if (budget <= 0) return 60;
    var widthMs = telBuckets.chooseEnergyBucketWidth(durationSeconds * 1000, budget);
    return Math.round(widthMs / 1000);
  }

  /*
   * detail = {
   *   socSeries:   [{x: сек, y: %}],
   *   powerSeries: [{x: сек, y: кВт}],
   *   targetReachedSeconds: [сек],
   *   session: { startSoc: {displayValue} | число | null }
   * }
   * duration — окно (мс) или null.
   */
  function buildChargeGraphData(detail, durationMs, capacity) {
    var seriesEnd = 0;
    var i, p;
    for (i = 0; i < detail.socSeries.length; i++) seriesEnd = Math.max(seriesEnd, detail.socSeries[i].x);
    for (i = 0; i < detail.powerSeries.length; i++) seriesEnd = Math.max(seriesEnd, detail.powerSeries[i].x);
    var windowSeconds = (durationMs || 0) / 1000;
    var requested = windowSeconds > 0 ? windowSeconds : seriesEnd;
    var durationSeconds = _cappedWindowSeconds(requested, detail.powerSeries);
    if (durationSeconds <= 0 || (detail.socSeries.length === 0 && detail.powerSeries.length === 0)) {
      return { buckets: [], intervalSeconds: 60, axisMaximumKw: CHARGE_GRAPH_MAXIMUM_POWER_KW, targetReachedSeconds: [], truncatedTailMs: 0, isEmpty: true, powerTicksKw: [CHARGE_GRAPH_MAXIMUM_POWER_KW, 30, 10, 0] };
    }
    var intervalSeconds = _fixedIntervalSeconds(durationSeconds, capacity);
    var bucketCount = Math.ceil(durationSeconds / intervalSeconds);

    var socLatest = new Array(bucketCount).fill(null);
    for (i = 0; i < detail.socSeries.length; i++) {
      p = detail.socSeries[i];
      var si = _bucketIndex(p, intervalSeconds, bucketCount);
      if (si != null) socLatest[si] = Math.min(100, Math.max(0, p.y));
    }
    var powerSum = new Array(bucketCount).fill(0);
    var powerCount = new Array(bucketCount).fill(0);
    for (i = 0; i < detail.powerSeries.length; i++) {
      p = detail.powerSeries[i];
      var pi = _bucketIndex(p, intervalSeconds, bucketCount);
      if (pi == null) continue;
      powerSum[pi] += p.y;
      powerCount[pi] += 1;
    }

    var firstTargetSeconds = null;
    for (i = 0; i < detail.targetReachedSeconds.length; i++) {
      var t = detail.targetReachedSeconds[i];
      if (firstTargetSeconds == null || t < firstTargetSeconds) firstTargetSeconds = t;
    }

    var startSocVal = (detail.session && detail.session.startSoc)
      ? (detail.session.startSoc.displayValue != null ? detail.session.startSoc.displayValue : detail.session.startSoc)
      : null;
    var carried = (startSocVal != null) ? startSocVal
      : (detail.socSeries.length > 0 ? detail.socSeries[0].y : null);

    var buckets = [];
    for (var index = 0; index < bucketCount; index++) {
      var startSeconds = index * intervalSeconds;
      var measuredSoc = socLatest[index];
      var power = powerCount[index] === 0 ? null : powerSum[index] / powerCount[index];
      var charging = power != null && power > CHARGE_IDLE_POWER_KW;
      var afterTarget = firstTargetSeconds != null && (startSeconds + intervalSeconds > firstTargetSeconds);
      if (measuredSoc != null) carried = measuredSoc;
      var effectiveSoc = carried;
      var phase;
      if (charging) phase = 'charging';
      else if (afterTarget) phase = 'holding';
      else if (effectiveSoc != null) phase = 'charging';
      else phase = 'gap';
      buckets.push({
        startSeconds: startSeconds,
        endSeconds: Math.min(durationSeconds, (index + 1) * intervalSeconds),
        socPercent: effectiveSoc,
        powerKw: phase === 'holding' ? (power != null ? power : 0) : power,
        phase: phase,
        isHeld: phase === 'holding'
      });
    }

    var targetReached = [];
    for (i = 0; i < detail.targetReachedSeconds.length; i++) {
      var s = detail.targetReachedSeconds[i];
      if (s >= 0 && s <= durationSeconds) targetReached.push(s);
    }
    var axisMaximumKw = _axisMaximumKw(buckets);
    return {
      buckets: buckets,
      intervalSeconds: intervalSeconds,
      axisMaximumKw: axisMaximumKw,
      targetReachedSeconds: targetReached,
      truncatedTailMs: Math.round((requested - durationSeconds) * 1000),
      isEmpty: buckets.length === 0,
      powerTicksKw: (function () {
        var ticks = [axisMaximumKw];
        var fixed = [30.0, 10.0];
        for (var j = 0; j < fixed.length; j++) if (fixed[j] < axisMaximumKw) ticks.push(fixed[j]);
        ticks.push(0);
        return ticks;
      })()
    };
  }

  return {
    CHARGE_GRAPH_MAXIMUM_POWER_KW: CHARGE_GRAPH_MAXIMUM_POWER_KW,
    CHARGE_IDLE_POWER_KW: CHARGE_IDLE_POWER_KW,
    chargePowerPlotValue: chargePowerPlotValue,
    buildChargeGraphData: buildChargeGraphData,
    /* charging_format/charging_duration пользуются теми же потолками */
    kMaxChargeWallDurationMillis: K_MAX_CHARGE_WALL_DURATION_MS,
    chargeIdlePowerKw: CHARGE_IDLE_POWER_KW
  };
})();

/* ══════════ capy_ui tokens: AppColors / AppThemeColors / AppText ══════════
   Источник: packages/capy_ui/lib/tokens/app_colors.dart, app_palettes.dart,
   app_typography.dart, app_spacing.dart (4px-шкала v2, НЕ automotive 8px). */
var CapyUI = (function () {
  /* Стабильные семантические цвета — одинаковы во всех темах. */
  var AppColors = {
    canvas: '#EFEFED', surface: '#FFFFFF', control: '#EBEBEB',
    controlHigh: '#E0E0DE', track: '#E3E3E1', divider: '#DEDEDC',
    ink: '#0D0D0D', inkMuted: '#6B6B6B', inkSubtle: '#9A9A9A',
    selectionFill: '#262626', onSelection: '#FFFFFF',
    inverseSurface: '#1F1F1F', onInverseSurface: '#FFFFFF', onInverseSurfaceMuted: '#C6C6C6',
    modalScrim: 'rgba(13,13,13,0.2)',
    energyGain: '#6DC24B', energyGainSoft: '#B6E0A0', energyGainSubtle: '#DCF0D2',
    energyDraw: '#EFA83A', energyDrawSoft: '#F6D69B', energyDrawSubtle: '#FAEAC9',
    warning: '#E8A33D', critical: '#D8493C', focus: '#3B8FD6'
  };

  var AppEnergyRamp = {
    standard: {
      gain: '#6DC24B', gainSoft: '#B6E0A0', gainSubtle: '#DCF0D2',
      draw: '#EFA83A', drawSoft: '#F6D69B', drawSubtle: '#FAEAC9',
      warning: '#E8A33D', critical: '#D8493C', focus: '#3B8FD6'
    },
    tokyoNeon: {
      gain: '#21E7E0', gainSoft: '#10A3A5', gainSubtle: '#0C5F66',
      draw: '#FF3D9A', drawSoft: '#B32A75', drawSubtle: '#6B1B4B',
      warning: '#FFC93C', critical: '#FF4D5E', focus: '#7A5CFF'
    },
    sunsetDrive: {
      gain: '#34D8A6', gainSoft: '#1E9273', gainSubtle: '#135347',
      draw: '#FF7A5C', drawSoft: '#C4533C', drawSubtle: '#7A3226',
      warning: '#FFB84D', critical: '#FF4D6D', focus: '#C77DFF'
    },
    bubblegum: {
      gain: '#16BFA6', gainSoft: '#86E0D2', gainSubtle: '#D2F4EE',
      draw: '#E8398B', drawSoft: '#F79CC5', drawSubtle: '#FBDCEA',
      warning: '#F2A33C', critical: '#E23B4B', focus: '#7A5CFF'
    }
  };

  function theme(o) {
    return {
      canvas: o.canvas, surface: o.surface, control: o.control,
      controlHigh: o.controlHigh, modalScrim: o.modalScrim,
      track: o.track, divider: o.divider,
      ink: o.ink, inkMuted: o.inkMuted, inkSubtle: o.inkSubtle,
      selectionFill: o.selectionFill, onSelection: o.onSelection,
      inverseSurface: o.inverseSurface, onInverseSurface: o.onInverseSurface,
      onInverseSurfaceMuted: o.onInverseSurfaceMuted,
      chartGrid: o.chartGrid, chartAxisLabel: o.chartAxisLabel,
      chartProjected: o.chartProjected, chartHeld: o.chartHeld,
      chartNowMarker: o.chartNowMarker, chartOverlay: o.chartOverlay,
      energy: o.energy || AppEnergyRamp.standard,
      isDark: !!o.isDark
    };
  }

  /* Девять палитр app_palettes.dart; порядок = AppThemeId.values.
     Индекс совпадает с массивом THEMES в index.html (Светлая…Жвачка). */
  var palettes = {
    light: theme({
      canvas: '#EFEFED', surface: '#FFFFFF', control: '#EBEBEB',
      controlHigh: '#E0E0DE', modalScrim: 'rgba(13,13,13,0.2)',
      track: '#E3E3E1', divider: '#DEDEDC',
      ink: '#0D0D0D', inkMuted: '#6B6B6B', inkSubtle: '#9A9A9A',
      selectionFill: '#262626', onSelection: '#FFFFFF',
      inverseSurface: '#1F1F1F', onInverseSurface: '#FFFFFF', onInverseSurfaceMuted: '#C6C6C6',
      chartGrid: '#E6E6E4', chartAxisLabel: '#9A9A9A',
      chartProjected: '#DCDCDA', chartHeld: '#C4C4C2',
      chartNowMarker: '#616161', chartOverlay: '#262626'
    }),
    dark: theme({
      canvas: '#17323E', surface: '#294854', control: '#3A5964',
      controlHigh: '#496773', modalScrim: 'rgba(8,20,25,0.6)',
      track: '#466570', divider: '#5B7680',
      ink: '#F7F7F0', inkMuted: '#D2DDDA', inkSubtle: '#9EB2B1',
      selectionFill: '#D7E8E5', onSelection: '#17313B',
      inverseSurface: '#0F252E', onInverseSurface: '#F7F7F0', onInverseSurfaceMuted: '#B9C9C7',
      chartGrid: '#58717A', chartAxisLabel: '#B2C1BF',
      chartProjected: '#3B5965', chartHeld: '#56737D',
      chartNowMarker: '#708992', chartOverlay: '#F7F7F0', isDark: true
    }),
    midnight: theme({
      canvas: '#060606', surface: '#151515', control: '#232323',
      controlHigh: '#2F2F2F', modalScrim: 'rgba(0,0,0,0.7)',
      track: '#2A2A2A', divider: '#333333',
      ink: '#F2F2F2', inkMuted: '#AFAFAF', inkSubtle: '#7A7A7A',
      selectionFill: '#E8E8E8', onSelection: '#0A0A0A',
      inverseSurface: '#262626', onInverseSurface: '#F7F7F7', onInverseSurfaceMuted: '#B5B5B5',
      chartGrid: '#2C2C2C', chartAxisLabel: '#8F8F8F',
      chartProjected: '#242424', chartHeld: '#3A3A3A',
      chartNowMarker: '#5A5A5A', chartOverlay: '#F2F2F2', isDark: true
    }),
    sepia: theme({
      canvas: '#F0E9DC', surface: '#FBF6EC', control: '#E9E0CF',
      controlHigh: '#DFD4C0', modalScrim: 'rgba(35,28,15,0.2)',
      track: '#E4DACA', divider: '#DCD1BE',
      ink: '#231C0F', inkMuted: '#6E6353', inkSubtle: '#9C9081',
      selectionFill: '#3A2F1E', onSelection: '#FBF6EC',
      inverseSurface: '#2C2417', onInverseSurface: '#FBF6EC', onInverseSurfaceMuted: '#C7BAA6',
      chartGrid: '#E2D8C6', chartAxisLabel: '#9C9081',
      chartProjected: '#E0D6C4', chartHeld: '#C9BDA9',
      chartNowMarker: '#AB9F8C', chartOverlay: '#231C0F'
    }),
    nordic: theme({
      canvas: '#20242C', surface: '#2C323C', control: '#3A414D',
      controlHigh: '#48505E', modalScrim: 'rgba(19,23,32,0.6)',
      track: '#434B58', divider: '#525B6A',
      ink: '#E7ECF3', inkMuted: '#B6BFCD', inkSubtle: '#8792A3',
      selectionFill: '#D5DEEB', onSelection: '#20242C',
      inverseSurface: '#171B22', onInverseSurface: '#E7ECF3', onInverseSurfaceMuted: '#AAB4C3',
      chartGrid: '#4B5462', chartAxisLabel: '#9AA4B4',
      chartProjected: '#363D48', chartHeld: '#4E5766',
      chartNowMarker: '#6B7585', chartOverlay: '#E7ECF3', isDark: true
    }),
    daylight: theme({
      canvas: '#FFFFFF', surface: '#FFFFFF', control: '#E2E2E2',
      controlHigh: '#D0D0D0', modalScrim: 'rgba(0,0,0,0.4)',
      track: '#D8D8D8', divider: '#3A3A3A',
      ink: '#000000', inkMuted: '#3D3D3D', inkSubtle: '#5E5E5E',
      selectionFill: '#000000', onSelection: '#FFFFFF',
      inverseSurface: '#000000', onInverseSurface: '#FFFFFF', onInverseSurfaceMuted: '#D5D5D5',
      chartGrid: '#BDBDBD', chartAxisLabel: '#3D3D3D',
      chartProjected: '#CFCFCF', chartHeld: '#9E9E9E',
      chartNowMarker: '#616161', chartOverlay: '#000000'
    }),
    tokyoNeon: theme({
      canvas: '#0B0714', surface: '#150E24', control: '#221838',
      controlHigh: '#2E2049', modalScrim: 'rgba(5,3,11,0.8)',
      track: '#251A3C', divider: '#3A2A5C',
      ink: '#F2ECFF', inkMuted: '#B9A8E0', inkSubtle: '#7E6BA8',
      selectionFill: '#E9DDFF', onSelection: '#150E24',
      inverseSurface: '#070410', onInverseSurface: '#F2ECFF', onInverseSurfaceMuted: '#B0A0D6',
      chartGrid: '#2B2043', chartAxisLabel: '#9C8AC8',
      chartProjected: '#1E1633', chartHeld: '#33254F',
      chartNowMarker: '#55406F', chartOverlay: '#F2ECFF',
      energy: AppEnergyRamp.tokyoNeon, isDark: true
    }),
    sunsetDrive: theme({
      canvas: '#1B0F1C', surface: '#2A1728', control: '#3A2036',
      controlHigh: '#4A2A43', modalScrim: 'rgba(14,7,15,0.8)',
      track: '#3E2238', divider: '#55314B',
      ink: '#FFEDE4', inkMuted: '#E0B9AE', inkSubtle: '#A9807C',
      selectionFill: '#FFE0CF', onSelection: '#2A1728',
      inverseSurface: '#150A16', onInverseSurface: '#FFEDE4', onInverseSurfaceMuted: '#D6B3A9',
      chartGrid: '#3D2337', chartAxisLabel: '#C29A96',
      chartProjected: '#2E1A2B', chartHeld: '#48283F',
      chartNowMarker: '#6B3D5C', chartOverlay: '#FFEDE4',
      energy: AppEnergyRamp.sunsetDrive, isDark: true
    }),
    bubblegum: theme({
      canvas: '#FDF2FA', surface: '#FFFFFF', control: '#F7E4F3',
      controlHigh: '#EFD3EA', modalScrim: 'rgba(48,16,40,0.2)',
      track: '#F3DCEE', divider: '#EBD0E6',
      ink: '#2B1030', inkMuted: '#7A5478', inkSubtle: '#A889A6',
      selectionFill: '#3D1642', onSelection: '#FFF5FC',
      inverseSurface: '#35123A', onInverseSurface: '#FFF5FC', onInverseSurfaceMuted: '#D6B8D3',
      chartGrid: '#F0DCEB', chartAxisLabel: '#A889A6',
      chartProjected: '#F0E0EC', chartHeld: '#D9BFD4',
      chartNowMarker: '#B694B2', chartOverlay: '#2B1030',
      energy: AppEnergyRamp.bubblegum
    })
  };

  var AppThemeIds = ['light', 'dark', 'midnight', 'sepia', 'nordic', 'daylight', 'tokyoNeon', 'sunsetDrive', 'bubblegum'];

  function spec(id) { return palettes[id] || palettes.light; }

  /* app_spacing.dart (capy_ui): 4px-шкала. */
  var AppSpacing = {
    x1: 4, x2: 8, x3: 12, x4: 16, x5: 20, x6: 24, x8: 32, x10: 40, x12: 48,
    cardPadding: 24, gridGutter: 12, screenPadding: 12, bezelInset: 8
  };
  var AppRadii = { xs: 8, sm: 12, md: 16, lg: 20, xl: 24, xxl: 32, full: 999 };

  var AppSizes = {
    minTouchTarget: 64, actionRowHeight: 64, presetTileHeight: 72,
    limitSliderHeight: 88, limitSliderKnob: 52, limitSliderOutline: 2,
    limitSliderTargetMarker: 8, limitSliderTickWidth: 6, limitSliderTickHeight: 32,
    limitSliderPressedScale: 1.14, cycleBarHeight: 64, magnitudeBarHeight: 6,
    shareBarHeight: 10, shareBarDot: 8, seriesTraceHeight: 72,
    seriesTraceLabelWidth: 56, socSpanBarHeight: 20,
    warningBannerHeight: 112, warningBannerLeading: 96, warningBannerIconCircle: 56,
    anchoredTooltipWidth: 416, anchoredTooltipCaret: 16, anchoredTooltipCaretOverlap: 4,
    amperageDialogHeight: 408, amperageDialogStepHeight: 80,
    moneyKeypadKeyHeight: 64, categoryMenuWidth: 1040, categoryMenuHeight: 720,
    categoryMenuRailWidth: 320, categoryMenuRule: 1, confirmDialogWidth: 480,
    donutStroke: 40, donutSegmentGap: 0.07, donutCapRadius: 6,
    donutInnerStroke: 20, donutInnerGap: 8,
    energyWindowFieldWidth: 220, segmentedHeight: 56, statusBadge: 32,
    squareIconButton: 48,
    chartBarWidth: 14, chartDenseBarWidth: 10.5, chartBarGap: 6,
    chartBarProfile: { width: 14, gap: 6, pitch: 20 },
    chartDenseBarProfile: { width: 10.5, gap: 6, pitch: 16.5 },
    chartZeroGap: 4, chartAxisGutter: 48, chartLabelBand: 28,
    chartGridStroke: 2, chartGridHalo: 4,
    chartOverlayStroke: 3, chartOverlayDot: 16, chartSelectionDot: 24,
    tooltipCaret: 9, tooltipCaretWidth: 18, tooltipSwatch: 10,
    chartPinDot: 14, chartPinRing: 3, chartPinRule: 2,
    cardStageExpandDistance: 260, cardStagePeekDistance: 220,
    cardStageFlingVelocity: 800, cardStagePeekResistance: 0.08,
    iconSm: 20, iconMd: 24, iconLg: 32
  };
  AppSizes.chartBarProfile.contentWidth = function (slotCount) {
    return slotCount <= 0 ? 0 : slotCount * this.width + (slotCount - 1) * this.gap;
  };
  AppSizes.chartDenseBarProfile.contentWidth = function (slotCount) {
    return slotCount <= 0 ? 0 : slotCount * this.width + (slotCount - 1) * this.gap;
  };

  var AppMotion = {
    fast: 120, base: 220, slow: 400, breathing: 1800,
    chartBarStagger: 18, chartBarGrowth: 180, chartBarBounce: 0.08
  };

  /* app_typography.dart: Inter, tabular figures для живых чисел. */
  var AppText = {
    family: 'Inter',
    metricXl: { size: 72, weight: 800, height: 1, letterSpacing: -2 },
    metricLg: { size: 48, weight: 800, height: 1, letterSpacing: -1.4 },
    metricMd: { size: 32, weight: 700, height: 1.05, letterSpacing: -0.8 },
    metricSm: { size: 22, weight: 700, height: 1.1, letterSpacing: -0.3 },
    unitLg: { size: 24, weight: 600, height: 1 },
    unitMd: { size: 16, weight: 600, height: 1 },
    cardTitle: { size: 22, weight: 700, height: 1.2, letterSpacing: -0.2 },
    tabLabel: { size: 20, weight: 600, height: 1.2, letterSpacing: -0.2 },
    body: { size: 16, weight: 400, height: 1.4 },
    bodyStrong: { size: 16, weight: 500, height: 1.4 },
    label: { size: 14, weight: 500, height: 1.3 },
    caption: { size: 13, weight: 400, height: 1.3 },
    compassCardinal: { size: 32, weight: 800, height: 1.1, letterSpacing: -0.6 },
    statValue: { size: 26, weight: 700, height: 1.1, letterSpacing: -0.5 },
    delta: { size: 16, weight: 600, height: 1.2, color: 'energyGain' },
    tooltipValue: { size: 20, weight: 700, height: 1.2, color: 'onInverseSurface' },
    tooltipLine: { size: 15, weight: 500, height: 1.35, color: 'onInverseSurfaceMuted' },
    legendValue: { size: 18, weight: 600, height: 1.2 }
  };

  return {
    AppColors: AppColors, AppEnergyRamp: AppEnergyRamp, palettes: palettes,
    AppThemeIds: AppThemeIds, spec: spec,
    AppSpacing: AppSpacing, AppRadii: AppRadii, AppSizes: AppSizes,
    AppMotion: AppMotion, AppText: AppText
  };


})();

/* ══════════════════════════════════════════════════════════════════════════
   Stage T4: домен истории — порт history_format.dart, trip_day_group.dart
   (TripSessionEntry/TripsFilter/assembleTripDayGroups), chargePlugLabel
   (charging_session_display.dart), packMosaic (metric_mosaic.dart) + L10N
   v2History/v2Cycle-строк экрана HistoryV2Screen.
   ══════════════════════════════════════════════════════════════════════════ */

  /* ── L10N v2-строк истории (app_ru.arb) ── */
  TEL_L10N.v2CycleCapacity = 'Доступно';
  TEL_L10N.v2CycleCost = 'Стоимость';
  TEL_L10N.v2CycleCostPerKwh = 'За кВт·ч';
  TEL_L10N.v2CycleDistance = 'Пробег';
  TEL_L10N.v2CycleEfficiency = 'Эффективность';
  TEL_L10N.v2CycleEfficiencyUnitAction = 'Изменить единицу эффективности';
  TEL_L10N.v2CycleEmpty = 'Автомобиль ещё не израсходовал батарею полностью.';
  TEL_L10N.v2CycleEnergy = 'Энергия';
  TEL_L10N.v2CycleFrozen = 'Итоговый';
  TEL_L10N.v2CycleMixedCurrency = 'Две валюты';
  TEL_L10N.v2CycleNoCapacity = 'Ёмкость неизвестна';
  TEL_L10N.v2CycleOpen = 'В процессе';
  TEL_L10N.v2CycleOrdinal = '#{ordinal}';
  TEL_L10N.v2CyclePartial = 'Неполный';
  TEL_L10N.v2CyclePartlyPriced = '{percent}% с ценой';
  TEL_L10N.v2CycleSelectPrompt = 'Выберите батарею, чтобы увидеть, что она проехала.';
  TEL_L10N.v2CycleSemantics = 'Батарея {ordinal}, израсходовано {percent} процентов';
  TEL_L10N.v2CycleTimelineCharge = 'Зарядка';
  TEL_L10N.v2CycleTimelineDeleted = 'Сеанс удалён';
  TEL_L10N.v2CycleTimelineDrive = 'Поездка';
  TEL_L10N.v2CycleTimelineEmpty = 'Сеансы этой батареи удалены.';
  TEL_L10N.v2CycleTimelineParked = 'Стоянка';
  TEL_L10N.v2CycleTimelineSessions = 'Сеансы';
  TEL_L10N.v2CycleTimelineShare = '{percent}% этой батареи';
  TEL_L10N.v2CycleTimelineTitle = 'Что проехала эта батарея';
  TEL_L10N.v2HistoryAltitude = 'Подъём';
  TEL_L10N.v2HistoryAvgPower = 'Средняя мощность';
  TEL_L10N.v2HistoryBattery = 'Батарея';
  TEL_L10N.v2HistoryCharges = 'Зарядки';
  TEL_L10N.v2HistoryChartEmpty = 'У этой сессии нет данных для графика.';
  TEL_L10N.v2HistoryCollapse = 'Свернуть детали сессии';
  TEL_L10N.v2HistoryCollapseHint = 'Потяните вниз, чтобы закрыть';
  TEL_L10N.v2HistoryConsumed = 'Потрачено';
  TEL_L10N.v2HistoryCost = 'Оценка стоимости';
  TEL_L10N.v2HistoryDistance = 'Расстояние';
  TEL_L10N.v2HistoryDuration = 'Длительность';
  TEL_L10N.v2HistoryEfficiency = 'Эффективность';
  TEL_L10N.v2HistoryEmpty = 'Автомобиль ещё не записал ни одной сессии.';
  TEL_L10N.v2HistoryEnd = 'Конец';
  TEL_L10N.v2HistoryEnergyAdded = 'Добавлено энергии';
  TEL_L10N.v2HistoryExpand = 'Развернуть детали сессии';
  TEL_L10N.v2HistoryExpandHint = 'Выберите сессию, чтобы открыть её.';
  TEL_L10N.v2HistoryFactsTitle = 'Сессия';
  TEL_L10N.v2HistoryMapCollapse = 'Уменьшить карту';
  TEL_L10N.v2HistoryMapExpand = 'Увеличить карту';
  TEL_L10N.v2HistoryPeakPower = 'Пиковая мощность';
  TEL_L10N.v2HistoryPlug = 'Разъём';
  TEL_L10N.v2HistoryRegen = 'Рекуперация';
  TEL_L10N.v2HistorySelectPrompt = 'Выберите сессию, чтобы увидеть детали.';
  TEL_L10N.v2HistorySoc = 'SOC';
  TEL_L10N.v2HistoryStart = 'Начало';
  TEL_L10N.v2HistoryTemperature = 'Температура';
  TEL_L10N.v2HistoryTrips = 'Поездки';
  TEL_L10N.plugAc = 'AC';
  TEL_L10N.plugDc = 'DC';
  TEL_L10N.plugIntegration = 'Встроенное зарядное';
  TEL_L10N.plugNone = 'Не подключён';
  TEL_L10N.unitKw = 'кВт';
  /* ru-варианты строк, захардкоженных в capy_ui на pt-BR (RU-only проект):
     отклонение фиксируется в README стадии. */
  TEL_L10N.tripCardDistance = 'РАССТОЯНИЕ';
  TEL_L10N.tripCardNetEnergy = 'ЭНЕРГИЯ ЛИКВ.';
  TEL_L10N.tripCardAvgSpeed = 'СРЕДН.';
  TEL_L10N.tripCardDuration = 'ВРЕМЯ';
  TEL_L10N.tripStartPlaceholder = 'Пункт отправления';
  TEL_L10N.tripEndPlaceholder = 'Пункт назначения';
  TEL_L10N.tripsSearchHint = 'Поиск по местоположению...';
  TEL_L10N.placesButton = 'Посмотреть места';
  TEL_L10N.tripsEmptyFilter = 'По этому фильтру поездок нет';

  /* ── history_format.dart ── */
  function historyClock(millis) {
    if (millis == null) return '--';
    var d = new Date(millis);
    return twoDigits(d.getHours()) + ':' + twoDigits(d.getMinutes());
  }
  /* formatTripListDateTime: 'dd/MM/yyyy в HH:mm' (в источнике pt 'às' — ru). */
  function formatTripListDateTime(millis) {
    if (millis == null) return '--';
    var d = new Date(millis);
    return twoDigits(d.getDate()) + '/' + twoDigits(d.getMonth() + 1) + '/' + d.getFullYear() +
      ' в ' + twoDigits(d.getHours()) + ':' + twoDigits(d.getMinutes());
  }
  function twoDigits(n) { return String(n).padStart(2, '0'); }

  /* ── charging_session_display.dart: chargePlugLabel ── */
  function chargePlugLabel(plugType) {
    switch (plugType) {
      case 605225491: return TEL_L10N.plugAc;
      case 605225492: return TEL_L10N.plugDc;
      case 605225499: return TEL_L10N.plugIntegration;
      case 605225490: return TEL_L10N.plugNone;
      case null: return '--';
      default: return 'RAW ' + plugType;
    }
  }
  function isDcChargePlugType(plugType) { return plugType === 605225492; }

  /* ── trip_day_group.dart: TripSessionEntry ──
   * bridge-поездка {id,start,end,km,kwh,min,soc0,soc1,startLat,startLon,
   * endLat,endLon,path,regen,dur} + места TEL.places → карточка списка. */
  function tripPlaceFor(lat, lon) {
    var places = TEL.places || [];
    for (var i = 0; i < places.length; i++) {
      var pl = places[i];
      if (pl.lat == null || pl.lon == null) continue;
      var d = Math.hypot(pl.lat - lat, pl.lon - lon) * 111000;
      if (d <= (pl.radiusM || 150)) return pl.name || pl.auto || null;
    }
    return null;
  }
  function makeTripEntry(t) {
    var dur = t.dur != null ? t.dur : (t.min != null ? Math.round(t.min * 60000) : null);
    var avg = (t.km != null && dur > 0) ? t.km / (dur / 3600000) : null;
    var startPlace = (t.startLat != null && t.startLon != null) ? tripPlaceFor(t.startLat, t.startLon) : null;
    var endPlace = (t.endLat != null && t.endLon != null) ? tripPlaceFor(t.endLat, t.endLon) : null;
    return {
      id: t.id,
      startedAtUtcMillis: t.start,
      endedAtUtcMillis: t.end,
      durationMillis: dur,
      distanceKm: t.km != null ? t.km : null,
      netEnergyKwh: t.kwh != null ? t.kwh : null,
      avgSpeedKmh: avg,
      startPlace: startPlace, endPlace: endPlace,
      startLatitude: t.startLat, startLongitude: t.startLon,
      endLatitude: t.endLat, endLongitude: t.endLon,
      routePoints: parseInsightPath(t.path),
      startSoc: t.soc0, endSoc: t.soc1,
      session: t
    };
  }
  function parseInsightPath(path) {
    if (!path) return [];
    var out = [];
    var parts = path.split(';');
    for (var i = 0; i < parts.length; i++) {
      var xy = parts[i].split(',');
      if (xy.length < 2) continue;
      var lat = parseFloat(xy[0]), lon = parseFloat(xy[1]);
      if (!isFinite(lat) || !isFinite(lon)) continue;
      if (Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
      if (lat === 0 && lon === 0) continue;
      out.push({ latitude: lat, longitude: lon });
    }
    return out;
  }
  function tripDisplayStartLocation(e) {
    if (e.startPlace && e.startPlace.trim()) return e.startPlace;
    if (e.startLatitude != null && e.startLongitude != null)
      return e.startLatitude.toFixed(4) + ', ' + e.startLongitude.toFixed(4);
    return '';
  }
  function tripDisplayEndLocation(e) {
    if (e.endPlace && e.endPlace.trim()) return e.endPlace;
    if (e.endLatitude != null && e.endLongitude != null)
      return e.endLatitude.toFixed(4) + ', ' + e.endLongitude.toFixed(4);
    return '';
  }

  /* TripsFilter.apply: поиск по местам, пресеты времени. */
  var TripsTimePreset = { all: 'all', days7: 'days7', days30: 'days30' };
  function tripsFilterMatches(filter, entry, now) {
    var query = (filter.query || '').trim().toLowerCase();
    if (query) {
      var start = (entry.startPlace || tripDisplayStartLocation(entry) || '').toLowerCase();
      var end = (entry.endPlace || tripDisplayEndLocation(entry) || '').toLowerCase();
      if (start.indexOf(query) < 0 && end.indexOf(query) < 0) return false;
    }
    var current = now || Date.now();
    if (filter.timePreset === 'days7' && entry.startedAtUtcMillis < current - 7 * 86400000) return false;
    if (filter.timePreset === 'days30' && entry.startedAtUtcMillis < current - 30 * 86400000) return false;
    return true;
  }

  /* assembleTripDayGroups: группы по дням, новые сверху. */
  function assembleTripDayGroups(entries) {
    if (!entries.length) return [];
    var byDay = {};
    var order = [];
    for (var i = 0; i < entries.length; i++) {
      var d = new Date(entries[i].startedAtUtcMillis);
      var key = d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate();
      if (!byDay[key]) { byDay[key] = { date: new Date(d.getFullYear(), d.getMonth(), d.getDate()), trips: [] }; order.push(key); }
      byDay[key].trips.push(entries[i]);
    }
    order.sort(function (a, b) { return byDay[b].date - byDay[a].date; });
    return order.map(function (k) {
      var g = byDay[k];
      var dist = 0, energy = 0, count = 0;
      g.trips.forEach(function (t) {
        if (t.distanceKm != null) dist += t.distanceKm;
        if (t.netEnergyKwh != null) energy += t.netEnergyKwh;
        count++;
      });
      return { date: g.date, trips: g.trips, tripCount: count, totalDistanceKm: dist, totalNetKwh: energy };
    });
  }
  /* DaySectionHeader._formatDayTitle: Сегодня/Вчера/d MMMM (ru). */
  function tripDayTitle(date) {
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var key = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    var yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    if (key.getTime() === today.getTime()) return 'Сегодня';
    if (key.getTime() === yesterday.getTime()) return 'Вчера';
    var months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
    return date.getDate() + ' ' + months[date.getMonth()] + (date.getFullYear() === now.getFullYear() ? '' : ' ' + date.getFullYear());
  }

  /* ── metric_mosaic.dart: packMosaic (first fit) ── */
  /* ── insight.dart (slice 1): собственная средняя за 30 дней ──
     Портирована own-average ветка (compareTripToOwnAverage): гейты
     subject/corpus, окно 30 дней, ratio-of-sums, различимость по IQR
     (Tukey hinges). Вариантная ветка (compareRouteVariants,
     matchInsightTripRoute, InsightRouteIndex) — вне T4: экран истории
     показывает её только для именованных маршрутов с вариантами. */
  var kInsightOwnAverageWindowMs = 30 * 86400000;
  var kInsightDistanceFloorKm = 0.5;
  var kInsightMinReferenceTrips = 4;

  TEL_L10N.insightSubjectUnusable = 'У этой поездки нет измеренной энергии батареи для сравнения.';
  TEL_L10N.insightNotEnoughData = 'За последние 30 дней ещё мало измеренных поездок ({count} пригодных).';
  TEL_L10N.insightNotDistinguishable = 'Эту поездку пока нельзя отличить от ваших последних 30 дней ({count} поездок).';
  TEL_L10N.insightTripUsedLess = 'Эта поездка потратила на {difference} Вт·ч/км меньше, чем за последние 30 дней ({count} поездок).';
  TEL_L10N.insightTripUsedMore = 'Эта поездка потратила на {difference} Вт·ч/км больше, чем за последние 30 дней ({count} поездок).';

  /* _gate: почему поездка не может участвовать в сравнении. */
  function insightGate(t) {
    if (t.end == null) return 'notClosed';
    if (t.pack == null) return 'neverRecorded';
    if (!t.buckets) return 'noMinuteBuckets';
    if (t.agrees === false) return 'signContradiction';
    if (t.agrees == null) return 'unconfirmedSign';
    if (t.km == null || t.km < kInsightDistanceFloorKm) return 'tooShort';
    return null;
  }

  function insightMedian(sorted) {
    var n = sorted.length;
    if (n % 2 === 1) return sorted[(n - 1) >> 1];
    return (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  }
  /* Tukey hinges: медианы половин, сама медиана выпадает при нечётном n. */
  function insightIqr(sorted) {
    var n = sorted.length;
    if (n < 2) return 0;
    var lower = sorted.slice(0, n >> 1);
    var upper = sorted.slice((n + 1) >> 1);
    return insightMedian(upper) - insightMedian(lower);
  }

  /* compareTripToOwnAverage → InsightRead {insight?, absence?, considered}. */
  function compareTripToOwnAverage(subject, corpus, now) {
    var current = now || Date.now();
    var windowStart = current - kInsightOwnAverageWindowMs;
    var subjectGate = insightGate(subject);
    if (subjectGate != null) {
      return { absence: 'subject', considered: 0 };
    }
    var considered = [];
    for (var i = 0; i < (corpus || []).length; i++) {
      var trip = corpus[i];
      if (trip.id === subject.id) continue;
      if (trip.end == null) continue;
      if (trip.end < windowStart || trip.end > current) continue;
      if (insightGate(trip) != null) continue;
      considered.push(trip);
    }
    if (considered.length < kInsightMinReferenceTrips) {
      return { absence: 'insufficientSupport', considered: considered.length };
    }
    var energyWh = 0, distanceKm = 0, rates = [];
    for (var j = 0; j < considered.length; j++) {
      var e = considered[j].pack, d = considered[j].km;
      energyWh += e; distanceKm += d;
      rates.push(e / d);
    }
    if (distanceKm <= 0) {
      return { absence: 'insufficientSupport', considered: considered.length };
    }
    rates.sort(function (a, b) { return a - b; });
    var referenceWhPerKm = energyWh / distanceKm;
    var subjectWhPerKm = subject.pack / subject.km;
    var difference = subjectWhPerKm - referenceWhPerKm;
    var spread = insightIqr(rates);
    return {
      insight: {
        difference: difference,
        subjectWhPerKm: subjectWhPerKm,
        referenceWhPerKm: referenceWhPerKm,
        distinguishable: Math.abs(difference) > 0 && Math.abs(difference) >= spread
      },
      considered: considered.length
    };
  }

  /* insightPhrase(read) → {key, params} для fmt(). */
  function insightPhraseFor(read) {
    if (!read || read.absence === 'subject') return { key: 'insightSubjectUnusable', params: {} };
    if (!read.insight) {
      if (read.absence === 'insufficientSupport') {
        return { key: 'insightNotEnoughData', params: { count: read.considered } };
      }
      return { key: 'insightSubjectUnusable', params: {} };
    }
    var count = read.considered;
    if (!read.insight.distinguishable) {
      return { key: 'insightNotDistinguishable', params: { count: count } };
    }
    var shown = Math.abs(read.insight.difference).toFixed(1);
    return {
      key: read.insight.difference < 0 ? 'insightTripUsedLess' : 'insightTripUsedMore',
      params: { difference: shown, count: count }
    };
  }

  var MosaicTileSpan = { small: { columns: 1, rows: 1 }, wide: { columns: 2, rows: 1 }, tall: { columns: 1, rows: 2 }, hero: { columns: 2, rows: 2 } };
  function packMosaic(tiles, columns) {
    /* MosaicTile.span по умолчанию small — как в Dart-конструкторе. */
    tiles = (tiles || []).map(function (t) {
      return t.span ? t : Object.assign({}, t, { span: MosaicTileSpan.small });
    });
    var occupied = [];
    var placements = [];
    function free(row, column, width, height) {
      for (var r = row; r < row + height; r++) {
        while (occupied.length <= r) occupied.push(new Array(columns).fill(false));
        for (var c = column; c < column + width; c++) {
          if (occupied[r][c]) return false;
        }
      }
      return true;
    }
    for (var i = 0; i < tiles.length; i++) {
      var tile = tiles[i];
      var width = Math.min(tile.span.columns, columns);
      var height = tile.span.rows;
      for (var row = 0; ; row++) {
        var placed = false;
        for (var column = 0; column + width <= columns; column++) {
          if (!free(row, column, width, height)) continue;
          for (var r = row; r < row + height; r++) {
            while (occupied.length <= r) occupied.push(new Array(columns).fill(false));
            for (var c = column; c < column + width; c++) occupied[r][c] = true;
          }
          placements.push({ tile: tile, column: column, row: row });
          placed = true;
          break;
        }
        if (placed) break;
      }
    }
    return placements;
  }




/* ══════════════════════════════════════════════════════════════════════════
   Stage T3: домен зарядки — дословный порт charging_constants.dart,
   charging_format.dart, charge_climate_warning.dart, recent_efficiency.dart,
   vehicle_range.dart, charge_cost_editor.dart, charge_metrics.dart
   (tail функции) + L10N v2-строк экрана ChargingV2Screen.
   ══════════════════════════════════════════════════════════════════════════ */

  /* ── charging_constants.dart ── */
  var chargeLimitDailyPreset = 70;
  var chargeLimitExtendedPreset = 85;
  var chargeLimitMaxPreset = 100;
  var chargeLimitNamedPresets = [chargeLimitDailyPreset, chargeLimitExtendedPreset, chargeLimitMaxPreset];
  /* Каденс перерисовки графика зарядки: детайл пересчитывает все серии из
   * кадров, поэтому он много дороже живого опроса поездок (1 с). */
  var chargeDetailLiveIntervalMs = 5000;
  /* ChargePanelTab: level | graph — две стороны средней карточки. */
  var ChargePanelTab = { level: 'level', graph: 'graph' };

  /* ── charging_format.dart ── */
  /* Окно графика: весь plug-in — и заряд, и простой на лимите. */
  function chargeWindow(session) {
    var start = session.startedAtUtcMillis != null ? session.startedAtUtcMillis : session.start;
    var end = session.plugDisconnectedAtUtcMillis != null ? session.plugDisconnectedAtUtcMillis
      : (session.plugEnd != null ? session.plugEnd : session.end);
    if (end == null || end <= start) return null;
    var span = end - start;
    if (span > telChargeGraph.kMaxChargeWallDurationMillis) return null;
    return span;
  }
  /* Когда лимит впервые достигнут (минимум из событий, wall-clock). */
  function chargeTargetReachedAt(detail) {
    var list = (detail && detail.targetReachedAtUtcMillis) || detail && detail.limitReachedAt || [];
    if (!list || !list.length) return null;
    return Math.min.apply(null, list);
  }
  /* Сколько сеанс реально заряжался: сумма секунд с delivered выше idle. */
  function chargingDuration(session, detail) {
    var seconds = 0;
    var intervals = (detail && detail.series && detail.series.intervals) || (detail && detail.intervals) || [];
    for (var i = 0; i < intervals.length; i++) {
      var e = intervals[i];
      var delivered = e.delivered != null ? e.delivered : (e.deliveredWh != null ? e.deliveredWh : null);
      if (delivered == null) continue;
      var covered = e.deliveredCoveredSeconds != null ? e.deliveredCoveredSeconds : (e.deliveredSec || 0);
      if (covered <= 0) continue;
      var kw = delivered / 1000.0 / (covered / 3600.0);
      if (kw <= telChargeGraph.chargeIdlePowerKw) continue;
      seconds += covered;
    }
    if (seconds <= 0) return chargeSessionDuration(session);
    return Math.round(seconds) * 1000;
  }
  function chargeSessionDuration(session) {
    var stored = session.durationMillis;
    if (stored != null && stored >= 0) return stored;
    var start = session.chargeStartedAtUtcMillis != null ? session.chargeStartedAtUtcMillis
      : (session.chargeStart != null ? session.chargeStart : session.startedAtUtcMillis != null ? session.startedAtUtcMillis : session.start);
    var end = session.chargeEndedAtUtcMillis != null ? session.chargeEndedAtUtcMillis
      : (session.plugDisconnectedAtUtcMillis != null ? session.plugDisconnectedAtUtcMillis : null)
      || (session.chargeEnd != null ? session.chargeEnd : null)
      || (session.plugEnd != null ? session.plugEnd : null)
      || (session.endedAtUtcMillis != null ? session.endedAtUtcMillis : session.end);
    if (end == null || end < start) return null;
    return end - start;
  }
  function chargeSessionIsActive(session) {
    return ['CHARGING', 'PLUG_CONNECTED', 'ENDED_WAITING_DISCONNECT']
      .indexOf(String(session.status || '').toUpperCase()) >= 0;
  }
  function chargeDurationLabel(durationMs) {
    if (durationMs == null || durationMs < 0) return '--';
    var hours = Math.floor(durationMs / 3600000);
    var minutes = Math.floor(durationMs / 60000) % 60;
    return hours === 0
      ? telLocFmt('v2ChargeGraphDurationMinutes', { minutes: minutes })
      : telLocFmt('v2ChargeGraphDurationHoursMinutes', { hours: hours, minutes: minutes });
  }
  function usableChargeEnergy(value) {
    if (value == null || !isFinite(value) || value < 0) return null;
    return value;
  }

  /* ── charge_climate_warning.dart ── */
  var ChargeClimateWarning = { none: 'none', high: 'high', outweighs: 'outweighs' };
  var kClimateShareWarn = 0.5;
  var kClimateShareClear = 0.4;
  function readChargeClimateWarning(buckets, chargingPowerKw, previous) {
    var climateKw = readChargeClimateKw(buckets);
    if (climateKw == null || climateKw <= 0) return ChargeClimateWarning.none;
    var charging = chargingPowerKw;
    if (charging == null || !isFinite(charging) || charging < 0) return ChargeClimateWarning.none;
    if (charging <= 0) return ChargeClimateWarning.outweighs; /* без деления на ноль */
    var share = climateKw / charging;
    if (share >= 1) return ChargeClimateWarning.outweighs;
    var threshold = (previous !== ChargeClimateWarning.none) ? kClimateShareClear : kClimateShareWarn;
    return share > threshold ? ChargeClimateWarning.high : ChargeClimateWarning.none;
  }
  /* Средняя климат-мощность: суммарная энергия / суммарные покрытые секунды. */
  function readChargeClimateKw(buckets) {
    var wh = 0, seconds = 0;
    for (var i = 0; i < (buckets || []).length; i++) {
      var b = buckets[i];
      var clSec = b.climateIntegratedSeconds != null ? b.climateIntegratedSeconds : (b.climateSec || 0);
      if (clSec <= 0) continue;
      wh += b.climateWh != null ? b.climateWh : (b.climate || 0);
      seconds += clSec;
    }
    if (seconds <= 0) return null;
    var kw = wh / seconds * 3.6;
    return isFinite(kw) ? kw : null;
  }

  /* ── recent_efficiency.dart (список поездок моста: {km, kwh}) ── */
  function RecentTripEfficiency(sessions) {
    var count = 0, distance = 0, energy = 0;
    for (var i = 0; i < (sessions || []).length; i++) {
      var s = sessions[i];
      if (s.kind && s.kind !== 'TRIP') continue;
      var km = s.km, kwh = s.kwh;
      if (km == null || kwh == null || km <= 0 || kwh <= 0) continue;
      count += 1; distance += km; energy += kwh;
    }
    this.tripCount = count; this.distanceKm = distance; this.netEnergyKwh = energy;
  }
  Object.defineProperty(RecentTripEfficiency.prototype, 'averageEfficiencyKmPerKwh', {
    get: function () {
      if (this.tripCount < 1 || this.netEnergyKwh <= 0) return null;
      return this.distanceKm / this.netEnergyKwh;
    }
  });

  /* ── vehicle_range.dart ── */
  function plausibleEfficiencyKmPerKwh(history) {
    if (history == null || history.tripCount < 1) return null;
    var e = history.averageEfficiencyKmPerKwh;
    if (e == null || !isFinite(e) || e < 0.5 || e > 20.0) return null;
    return e;
  }
  function estimateRangeGainKm(history, energyKwh) {
    var efficiency = plausibleEfficiencyKmPerKwh(history);
    if (efficiency == null || energyKwh == null || !isFinite(energyKwh) || energyKwh < 0) return null;
    return energyKwh * efficiency;
  }

  /* ── session_detail_reading.dart: климат за сеанс ── */
  var kChargeClimateSanityFloor = 0.5;
  var kChargeClimateCompleteTolerance = 0.02;
  /* climateEnergyKwhOver(span): {kwh, complete} | null. Интеграл, покрывший
   * меньше половины сеанса, отказывается целиком. */
  function chargeClimateEnergyOver(detail, spanMs) {
    var intervals = (detail && detail.series && detail.series.intervals) || (detail && detail.intervals) || [];
    var wh = 0, seen = false, covered = 0;
    for (var i = 0; i < intervals.length; i++) {
      var e = intervals[i];
      var climate = e.climate != null ? e.climate : e.climateWh;
      if (climate != null) { wh += climate; seen = true; }
      covered += e.climateCoveredSeconds != null ? e.climateCoveredSeconds : (e.climateSec || 0);
    }
    if (!seen || !isFinite(wh) || wh < 0) return null;
    if (covered <= 0) return null;
    if (spanMs == null || spanMs <= 0) return null;
    var seconds = spanMs / 1000.0;
    var coverage = covered / seconds;
    if (coverage < kChargeClimateSanityFloor) return null;
    return { kwh: wh / 1000.0, complete: coverage >= 1 - kChargeClimateCompleteTolerance };
  }

  /* ── charge_cost_editor.dart ── */
  var ChargeCostField = { rate: 'rate', total: 'total' };
  function chargeCostCurrencyOf(session, fallback) {
    var currency = session.costCurrency != null ? session.costCurrency : session.currency;
    return (currency == null || currency === '') ? fallback : currency;
  }
  /* Оба поля пишутся одним стейтментом — нетронутое летит как есть. */
  function writeChargeCost(session, field, amount, fallbackCurrency) {
    if (window.__geelyEmit) {
      window.__geelyEmit('charge.cost', {
        sessionId: session.id,
        costPerKwh: field === ChargeCostField.rate ? amount
          : (session.costPerKwh != null ? session.costPerKwh : session.rate != null ? session.rate : null),
        paidAmount: field === ChargeCostField.total ? amount : (session.paidAmount != null ? session.paidAmount : session.cost != null ? session.cost : null),
        currency: chargeCostCurrencyOf(session, fallbackCurrency)
      });
    }
  }

  /* ── charge_metrics.dart ── */
  function chargeDecimalSeparatorForLocale(localeName) {
    return String(localeName || '').toLowerCase().indexOf('en') === 0 ? '.' : ',';
  }
  function chargeAmountLabel(amount, symbol, decimalSeparator) {
    if (amount == null) return '--';
    var text = amount.toFixed(2).replace('.', decimalSeparator);
    return symbol + ' ' + text;
  }
  function chargeEstimatedCost(energyKwh, costPerKwh, paidAmount) {
    if (paidAmount != null && paidAmount >= 0) return paidAmount;
    if (energyKwh == null || costPerKwh == null) return null;
    if (energyKwh < 0 || costPerKwh < 0) return null;
    return energyKwh * costPerKwh;
  }

  /* ── L10N v2-строк зарядки (app_ru.arb) ── */
  TEL_L10N.helpersChargeLimitValue = '{percent}%';
  TEL_L10N.v2ChargeClimateWarningHigh = 'Система климата потребляет {climate} кВт из поступающих {charging} кВт. Аккумулятор получает намного меньше, чем показывает зарядное устройство.';
  TEL_L10N.v2ChargeClimateWarningOutweighs = 'Система климата потребляет {climate} кВт — столько же, сколько даёт зарядное устройство. Аккумулятор почти ничего не получает.';
  TEL_L10N.v2ChargeClimateWarningTitle = 'Климат расходует вашу зарядку';
  TEL_L10N.v2ChargeCostDescription = 'Действует только для этой зарядки. Введите цену за кВт·ч или полную сумму.';
  TEL_L10N.v2ChargeCostEdit = 'Изменить цену этой зарядки';
  TEL_L10N.v2ChargeCostFailed = 'Цена зарядки не сохранена';
  TEL_L10N.v2ChargeCostFieldRate = 'Цена/кВт·ч';
  TEL_L10N.v2ChargeCostFieldTotal = 'Всего оплачено';
  TEL_L10N.v2ChargeCostTitle = 'Цена зарядки';
  TEL_L10N.v2ChargeCostUnitRate = '/кВт·ч';
  TEL_L10N.v2ChargeGraphCostEstimate = 'Стоимость · ОЦЕНКА';
  TEL_L10N.v2ChargeGraphDuration = 'Длительность';
  TEL_L10N.v2ChargeGraphDurationHoursMinutes = '{hours} ч {minutes} мин';
  TEL_L10N.v2ChargeGraphDurationMinutes = '{minutes} мин';
  TEL_L10N.v2ChargeGraphEmpty = 'Нет доступных сеансов зарядки.';
  TEL_L10N.v2ChargeGraphEnergyAdded = 'Добавленная энергия';
  TEL_L10N.v2ChargeGraphLoadFailed = 'Не удалось загрузить сеанс зарядки.';
  TEL_L10N.v2ChargeGraphNoData = 'В этом сеансе нет данных для графика.';
  TEL_L10N.v2ChargeGraphPowerTick = '{power}';
  TEL_L10N.v2ChargeGraphRangeGainedEstimate = 'Полученный запас хода · ОЦЕНКА';
  TEL_L10N.v2ChargeGraphSemantics = 'SOC и мощность сеанса зарядки по времени';
  TEL_L10N.v2ChargeGraphTargetReached = 'Лимит достигнут';
  TEL_L10N.v2ChargeLimitCustom = 'Свой';
  TEL_L10N.v2ChargeLimitDaily = 'Дневной';
  TEL_L10N.v2ChargeLimitExtended = 'Продлённый';
  TEL_L10N.v2ChargeLimitGraph = 'График';
  TEL_L10N.v2ChargeLimitInfoClose = 'Закрыть информацию о пределе зарядки';
  TEL_L10N.v2ChargeLimitInfoDaily = 'Для ежедневных поездок и более быстрой зарядки.';
  TEL_L10N.v2ChargeLimitInfoExtended = 'Для более дальних поездок на одной зарядке.';
  TEL_L10N.v2ChargeLimitInfoMax = 'Для максимального запаса хода и более долгой зарядки.';
  TEL_L10N.v2ChargeLimitInfoTitle = 'Какой предел зарядки выбрать?';
  TEL_L10N.v2ChargeLimitInfoTooltip = 'О пределах зарядки';
  TEL_L10N.v2ChargeLimitLevel = 'Уровень';
  TEL_L10N.v2ChargeLimitMax = 'Максимум';
  TEL_L10N.v2ChargeLimitProjection = 'ОЦЕНКА · {range} {unit} прогнозируется';
  TEL_L10N.v2ChargeLimitSemantics = 'Предел зарядки';
  TEL_L10N.v2ChargeLimitSemanticsValue = '{percent} процентов';
  TEL_L10N.v2ChargeSummaryBatteryEnergy = 'Энергия, переданная аккумулятору';
  TEL_L10N.v2ChargeSummaryClimateEnergy = 'Энергия, потреблённая системой климата во время зарядки';
  TEL_L10N.v2ChargeSummaryNoEnergy = 'В этом сеансе нет измеренной энергии.';
  TEL_L10N.v2ChargeSummarySemantics = 'Распределение энергии сеанса между аккумулятором и системой климата';
  TEL_L10N.v2ChargingAmperageClose = 'Закрыть управление силой тока';
  TEL_L10N.v2ChargingAmperageDecrease = 'Уменьшить силу тока зарядки';
  TEL_L10N.v2ChargingAmperageDescription = 'Уменьшите ток при использовании общей или незнакомой сети.';
  TEL_L10N.v2ChargingAmperageIncrease = 'Увеличить силу тока зарядки';
  TEL_L10N.v2ChargingAmperageRange = 'Диапазон автомобиля {min}–{max} А';
  TEL_L10N.v2ChargingAmperageTitle = 'Сила тока зарядки';
  TEL_L10N.v2ChargingAmperageUnit = 'А';
  TEL_L10N.v2ChargingAmperageValue = '{amps} А';
  TEL_L10N.v2ChargingCommandFailed = 'Автомобиль не принял команду зарядки.';
  TEL_L10N.v2ChargingEnergy = 'Энергия';
  TEL_L10N.v2ChargingForceActive = 'Принудительная зарядка активна';
  TEL_L10N.v2ChargingForceButton = 'Принудительная зарядка';
  TEL_L10N.v2ChargingStopButton = 'Остановить зарядку';
  TEL_L10N.v2LastChargeSession = 'Последний сеанс зарядки';
  TEL_L10N.v2MoneyKeypadClear = 'Очистить сумму';
  TEL_L10N.v2MoneyKeypadClose = 'Закрыть клавиатуру цены';
  TEL_L10N.v2MoneyKeypadDelete = 'Удалить последнюю цифру';
  TEL_L10N.v2MoneyKeypadSave = 'Сохранить';
  TEL_L10N.v2RangeEstimateCaption = 'Оценка по завершённым поездкам';
  TEL_L10N.v2RangeEstimateDelayed = 'Оценка отложена · обновление истории ожидается';
  TEL_L10N.v2RangeEstimateReadDelayed = 'Оценка отложена · ошибка чтения запаса хода';
  TEL_L10N.v2RangeEstimateReadFailed = 'Оценка недоступна · ошибка чтения';
  TEL_L10N.v2RangeEstimateUnavailable = 'Оценка недоступна';
  TEL_L10N.v2RangeVehicleRange = 'Запас хода автомобиля';
  TEL_L10N.unitPercent = '%';
  TEL_L10N.unitWatt2 = 'кВт';

  /* Подстановка {param} в arb-шаблоны (Dart: AppLocalizations methods).
   * telFmt уже занят портом telemetry_format — локальное имя telLocFmt. */
  function telLocFmt(key, params) {
    var t = TEL_L10N[key] || '';
    for (var k in (params || {})) t = t.split('{' + k + '}').join(String(params[k]));
    return t;
  }
