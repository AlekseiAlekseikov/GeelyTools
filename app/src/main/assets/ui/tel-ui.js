/*
 * tel-ui.js — Stage T2 (порт телеметрии Capy → GeelyTools).
 *
 * Источник: github.com/Timoteohss/capy @ e39777c, Apache License 2.0.
 *   packages/capy_ui/lib/components/:
 *     app_card.dart, stat_column.dart, track_segmented_control.dart,
 *     dropdown_field.dart, segmented_donut.dart, energy_bar_chart.dart,
 *     chart_tooltip.dart, chart_pin_annotation.dart, icon_value_grid.dart,
 *     icon_buttons.dart, anchored_tooltip.dart, information_card.dart
 *   packages/capy_ui/lib/tokens/ (через CapyUI из tel-core.js).
 *
 * Адаптация (документируется): Flutter-виджеты → HTML/SVG. Геометрия,
 * цвета, размеры, длительности анимаций и правила разметки переносятся
 * дословно; CustomPaint → SVG-примитивы. Иконки Material — приближения
 * SVG-путями (шрифт Material Icons в WebView не bundled).
 *
 * Copyright 2026 Timoteohss (capy), Apache License 2.0 — see NOTICE.
 */
'use strict';

var telUI = (function () {
  /* ── утилиты ── */
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  /* Текущая тема: индекс setTheme в index.html = порядок AppThemeId. */
  function theme() {
    var idx = (typeof setTheme === 'number') ? setTheme : 0;
    var id = CapyUI.AppThemeIds[idx] || 'light';
    return CapyUI.spec(id);
  }
  function textStyle(t, color) {
    return 'font-family:' + CapyUI.AppText.family + ',system-ui,sans-serif;' +
      'font-size:' + t.size + 'px;font-weight:' + t.weight + ';line-height:' + t.height + ';' +
      (t.letterSpacing ? 'letter-spacing:' + t.letterSpacing + 'px;' : '') +
      'font-variant-numeric:tabular-nums;' + (color ? 'color:' + color + ';' : '');
  }

  /* ── иконки Material (SVG-приближения) ── */
  var ICONS = {
    grid_view: '<rect x="3" y="3" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2"/>',
    air: '<path d="M3 8h9.5a2.5 2.5 0 1 0-2.4-3.2"/><path d="M3 12h14.5a2.5 2.5 0 1 1-2.4 3.2"/><path d="M3 16h7.5a2.2 2.2 0 1 1-2.1 2.9"/>',
    electrical_services: '<path d="M3 7v3a4 4 0 0 0 4 4h2v-2H7a2 2 0 0 1-2-2V7z"/><rect x="11" y="4.5" width="7" height="3" rx="1.5"/><rect x="11" y="10.5" width="7" height="3" rx="1.5"/><path d="M18 6h2.5a1.5 1.5 0 0 1 0 3H18z"/><path d="M18 12h2.5a1.5 1.5 0 0 1 0 3H18z"/><path d="M4 14v3.5a2.5 2.5 0 0 0 5 0V14"/>',
    trending_up: '<path d="M3 17l6-6 4 4 7-8"/><path d="M14 7h6v6"/>',
    info: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><rect x="11" y="10" width="2" height="7" rx="1"/><circle cx="12" cy="7.2" r="1.3"/>',
    schedule: '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7.5V12l3 2.5"/>',
    keyboard_arrow_up: '<path d="M7 14l5-5 5 5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
    keyboard_arrow_down: '<path d="M7 10l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
    edit: '<path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    /* Stage T3 (экран зарядки) */
    bolt: '<path d="M13 2L4.5 13.5H11L9.5 22 19 10h-6.5z"/>',
    bolt_outline: '<path d="M13 3.5L6 12.5h5L9.8 20.5 18 11h-5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
    battery_full: '<rect x="3" y="8" width="15" height="8" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="5" y="10" width="9" height="4" rx="1"/><path d="M20 10.5v3" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
    thermostat: '<path d="M14 14.8V5a2 2 0 1 0-4 0v9.8a4 4 0 1 0 4 0z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="17.5" r="1.8"/>',
    stop_circle: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><rect x="8.5" y="8.5" width="7" height="7" rx="1.5"/>',
    ev_shadow: '<path d="M13 3L5 13h5.5L9 21l8-10h-5.5z"/>',
    backspace: '<path d="M9 5h11a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 20 19H9l-6.5-7z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 9.5l5 5m0-5l-5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    clear: '<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
    /* Stage T4 (экран истории) */
    route: '<circle cx="6" cy="18" r="2.4" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="18" cy="6" r="2.4"/><path d="M8.4 18h5.1a4.5 4.5 0 0 0 0-9H9.9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    route_outlined: '<circle cx="6" cy="18" r="2.4" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="18" cy="6" r="2.4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8.4 18h5.1a4.5 4.5 0 0 0 0-9H9.9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    battery_charging_full: '<rect x="3" y="8" width="15" height="8" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M5 10h7l-3 4h4l-5 6 1.5-5H5z"/>',
    local_parking: '<path d="M6 21V4h6.5a4.8 4.8 0 0 1 0 9.6H9.5V21z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/>',
    terrain: '<path d="M3 19L9.5 7l4 7 2-3.4L21 19z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
    eco: '<path d="M12 21c-4.4-1.2-7-4.2-7-8.4C5 7.8 8.2 4.6 13 4c-.4 2.5.2 4.6 2 6.4-1.2.3-2 1-2.4 2.2-1.5-1-2.3-2.4-2.5-4.2-1.2 1-1.8 2.6-1.8 4.6 0 2.9 1.7 5.2 4.7 6.4-.7.9-1.4 1.4-3 1.6z"/>',
    payments: '<rect x="3" y="6.5" width="18" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="2.6"/>',
    /* Stage T5: настройки (settings_menu/panes) */
    storage: '<path fill-rule="evenodd" d="M4.5 4.5h15A2.5 2.5 0 0 1 22 7v2a2.5 2.5 0 0 1-2.5 2.5h-15A2.5 2.5 0 0 1 2 9V7a2.5 2.5 0 0 1 2.5-2.5zm2 2.2a1.15 1.15 0 1 0 0 2.3 1.15 1.15 0 0 0 0-2.3z"/><path fill-rule="evenodd" d="M4.5 12.5h15a2.5 2.5 0 0 1 2.5 2.5v2a2.5 2.5 0 0 1-2.5 2.5h-15A2.5 2.5 0 0 1 2 17v-2a2.5 2.5 0 0 1 2.5-2.5zm2 2.2a1.15 1.15 0 1 0 0 2.3 1.15 1.15 0 0 0 0-2.3z"/>',
    memory: '<rect x="7" y="7" width="10" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="10.5" y="10.5" width="3" height="3" rx="0.8"/><path d="M10 7V4m4 3V4M10 20v-3m4 3v-3M7 10H4m3 4H4m16-4h-3m3 4h-3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    code: '<path d="M8.5 7.5L4 12l4.5 4.5M15.5 7.5L20 12l-4.5 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    price_check: '<path d="M9 3.5v12M6 6h6M7 9.5h5M9 15.5l-2.5 4.5M9 15.5l2.5 4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M14 14.5l2.5 2.5L21.5 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    warning_amber: '<path d="M12 3.2L1.9 20.5h20.2z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 9.5v4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="17.2" r="1.2"/>',
    cleaning_services: '<path d="M5.5 10.5h13l-1.3 8a2.5 2.5 0 0 1-2.5 2.1H9.3a2.5 2.5 0 0 1-2.5-2.1z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M8.5 10.5V6.8A3.8 3.8 0 0 1 12.3 3h1.4a3.8 3.8 0 0 1 3.8 3.8v3.7" fill="none" stroke="currentColor" stroke-width="1.8"/>',
    delete_forever: '<path d="M6.5 7l1 12.2a2 2 0 0 0 2 1.8h5a2 2 0 0 0 2-1.8L17.5 7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M5 7h14M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M10.3 10.8l3.4 4.9m0-4.9l-3.4 4.9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    cloud_upload: '<path d="M7.5 18.5a4.5 4.5 0 0 1-.6-8.96A5.5 5.5 0 0 1 17.6 9.6 4 4 0 0 1 17 17.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 20v-7.5m0 0L9.5 15M12 12.5L14.5 15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
    timeline: '<path d="M6 4.5v15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="6" cy="8" r="2"/><circle cx="6" cy="16" r="2"/><path d="M11 8h9M11 16h5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    biotech: '<path d="M13.5 4.5a4 4 0 0 1 3.9 6.6L14 14.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M7 14.5h10M9.5 20.5h7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M8.2 17.5h6.6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M11 11l-1.5 1.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    sensors: '<circle cx="12" cy="12" r="2.2"/><path d="M8.1 8.1a5.5 5.5 0 0 0 0 7.8M15.9 15.9a5.5 5.5 0 0 0 0-7.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M5.3 5.3a9.5 9.5 0 0 0 0 13.4M18.7 18.7a9.5 9.5 0 0 0 0-13.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    play_arrow: '<path d="M8 5.5v13l11-6.5z"/>',
    stop: '<rect x="7" y="7" width="10" height="10" rx="1.5"/>',
    speed: '<path d="M5 18a8.5 8.5 0 1 1 14 0" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><path d="M12 14l4-4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="14" r="1.6"/>',
    straighten: '<rect x="2.5" y="9" width="19" height="6" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M6 9v3m4-3v3m4-3v3m4-3v3" stroke="currentColor" stroke-width="1.6"/>',
    timer: '<circle cx="12" cy="13.5" r="7.5" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M12 13.5V9.5M9.5 3h5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>',
    search: '<circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15.8 15.8L21 21" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
    place: '<path d="M12 21s-7-5.7-7-11a7 7 0 0 1 14 0c0 5.3-7 11-7 11z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="10" r="2.4"/>',
    map_outlined: '<path d="M3 6.5l6-2.5 6 2.5 6-2.5v13l-6 2.5-6-2.5-6 2.5z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M9 4v13m6-10.5v13" stroke="currentColor" stroke-width="1.4"/>',
    swap_horiz: '<path d="M7 8h13m0 0-3-3m3 3-3 3M17 16H4m0 0 3-3m-3 3 3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    error_outline: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7.5V13" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="16.4" r="1.3"/>',
    unfold_more: '<path d="M12 4l4 4m-4-4L8 8m4 12l4-4m-4 4-4-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    flag: '<path d="M6 21V4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M6 5h11.5l-2.5 4 2.5 4H6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/>',
    open_in_full: '<path d="M4 10V4h6M20 14v6h-6M4 4l6.5 6.5M20 20l-6.5-6.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    close_fullscreen: '<path d="M10 4v6H4M14 20v-6h6M10 10L4 4M14 14l6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
  };
  function icon(name, size, color) {
    return '<svg class="icn" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="currentColor" style="color:' + color + '">' + ICONS[name] + '</svg>';
  }

  /* ══════════ AppCard ══════════ */
  function appCard(o) {
    var c = theme();
    var hasHeader = o.title != null || o.subtitle != null || o.badge != null || o.trailing != null;
    var h = '<div class="telCard" style="background:' + c.surface + ';border-radius:' + CapyUI.AppRadii.xl + 'px;padding:' + CapyUI.AppSpacing.cardPadding + 'px' +
      (o.fill ? ';flex:1;min-height:0;display:flex;flex-direction:column' : '') + '">';
    if (hasHeader) {
      h += '<div class="telCardHead">';
      h += '<div style="flex:1;min-width:0">';
      if (o.title != null) {
        h += '<div style="display:flex;align-items:center">' +
          (o.badge ? o.badge + '<div style="width:' + CapyUI.AppSpacing.x3 + 'px"></div>' : '') +
          '<div class="telCardTitle" style="' + textStyle(CapyUI.AppText.cardTitle, c.ink) + 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(o.title) + '</div></div>';
      }
      if (o.subtitle != null) {
        h += '<div style="margin-top:' + CapyUI.AppSpacing.x1 + 'px;' + textStyle(CapyUI.AppText.label, c.inkMuted) + 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(o.subtitle) + '</div>';
      }
      h += '</div>';
      if (o.trailing) h += o.trailing;
      h += '</div><div style="height:' + CapyUI.AppSpacing.x5 + 'px"></div>';
    }
    h += '<div class="telCardBody" style="' + (o.fill ? 'flex:1;min-height:0;display:flex;flex-direction:column' : '') + '">' + o.child + '</div></div>';
    return h;
  }

  /* ══════════ StatColumn ══════════ */
  function statColumn(o) {
    var c = theme();
    var inner = '<div style="display:flex;align-items:baseline">' +
      '<span class="statVal" style="' + textStyle(CapyUI.AppText.statValue, c.ink) + 'white-space:nowrap">' + esc(o.value) + '</span>' +
      (o.unit != null ? '<span style="margin-left:' + CapyUI.AppSpacing.x1 + 'px;' + textStyle(CapyUI.AppText.label, c.ink) + '">' + esc(o.unit) + '</span>' : '') +
      '</div><div style="margin-top:' + CapyUI.AppSpacing.x1 + 'px;' + textStyle(CapyUI.AppText.caption, c.inkMuted) + 'white-space:nowrap">' + esc(o.caption) + '</div>';
    if (o.onTap) {
      return '<button class="telStatBtn" data-tel="' + o.dataTel + '" style="background:' + c.control + ';border-radius:' + CapyUI.AppRadii.md + 'px;padding:' + CapyUI.AppSpacing.x2 + 'px ' + CapyUI.AppSpacing.x3 + 'px;text-align:left">' + inner + '</button>';
    }
    return '<div style="' + (o.width ? 'width:' + o.width + 'px;' : '') + '">' + inner + '</div>';
  }

  /* ══════════ TrackSegmentedControl (`Поездка | Стоянка`) ══════════ */
  function trackSegmentedControl(items, selected, groupKey) {
    var c = theme();
    var h = '<div class="telSeg" style="background:' + c.control + ';border-radius:' + CapyUI.AppRadii.md + 'px;padding:' + CapyUI.AppSpacing.x1 + 'px">';
    for (var i = 0; i < items.length; i++) {
      var sel = items[i].value === selected;
      h += '<button data-telseg="' + groupKey + '" data-val="' + esc(items[i].value) + '" class="telSegBtn' + (sel ? ' sel' : '') + '" style="' +
        (sel ? 'background:' + c.surface + ';' : 'background:transparent;') +
        'border-radius:' + CapyUI.AppRadii.sm + 'px;height:' + (CapyUI.AppSizes.segmentedHeight - CapyUI.AppSpacing.x2) + 'px;' +
        'padding:0 ' + CapyUI.AppSpacing.x6 + 'px;' + textStyle(CapyUI.AppText.bodyStrong, sel ? c.ink : c.inkMuted) + '">' + esc(items[i].label) + '</button>';
    }
    return h + '</div>';
  }

  /* ══════════ DropdownField (поле + модальное меню) ══════════ */
  function dropdownField(o) {
    var c = theme();
    var open = !!o.open;
    var fg = open ? c.onSelection : c.ink;
    var h = '<span class="telDropWrap" style="position:relative;flex:none">';
    h += '<button data-teldrop="' + o.key + '" class="telDrop' + (open ? ' open' : '') + '" style="' +
      'background:' + (open ? c.selectionFill : c.control) + ';border-radius:' + CapyUI.AppRadii.md + 'px;' +
      'width:' + (o.width || CapyUI.AppSizes.energyWindowFieldWidth) + 'px;height:' + CapyUI.AppSizes.actionRowHeight + 'px;' +
      'padding:0 ' + CapyUI.AppSpacing.x8 + 'px;' + textStyle(CapyUI.AppText.bodyStrong, fg) + '">' +
      '<span style="flex:1;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(o.label) + '</span>' +
      icon(open ? 'keyboard_arrow_up' : 'keyboard_arrow_down', CapyUI.AppSizes.iconMd, fg) + '</button>';
    if (open) {
      h += '<div class="telDropMenuWrap" data-teldropmenu="' + o.key + '">';
      h += '<div class="telDropScrim" data-teldropscrim></div>';
      h += '<div class="telDropMenu" role="listbox" aria-label="' + esc(o.barrierLabel) + '" style="background:' + c.surface + '">';
      for (var i = 0; i < o.options.length; i++) {
        var opt = o.options[i];
        var isSel = opt.value === o.value;
        h += '<button role="option" aria-selected="' + isSel + '" data-teldropopt="' + o.key + '" data-val="' + esc(opt.value) + '" class="telDropOpt' + (isSel ? ' sel' : '') + '" style="' +
          textStyle(CapyUI.AppText.bodyStrong, isSel ? c.onSelection : c.ink) + ';background:' + (isSel ? c.selectionFill : 'transparent') + '">' + esc(opt.label) + '</button>';
      }
      h += '</div></div>';
    }
    return h + '</span>';
  }

  /* ══════════ InfoIconButton + закреплённая панель-пояснение ══════════ */
  function infoIconButton(key, selected) {
    var c = theme();
    return '<button data-telinfo="' + key + '" class="telInfoBtn" style="' +
      'width:' + CapyUI.AppSizes.minTouchTarget + 'px;height:' + CapyUI.AppSizes.minTouchTarget + 'px">' +
      '<span style="width:' + CapyUI.AppSizes.statusBadge + 'px;height:' + CapyUI.AppSizes.statusBadge + 'px;border-radius:50%;' +
      (selected ? 'background:' + c.selectionFill + ';' : '') +
      'display:flex;align-items:center;justify-content:center">' +
      icon('info', CapyUI.AppSizes.iconMd, selected ? c.onSelection : c.inkMuted) + '</span></button>';
  }

  function informationCard(entry) {
    var c = theme();
    return '<div style="display:flex;gap:' + CapyUI.AppSpacing.x3 + 'px;align-items:flex-start">' +
      icon(entry.icon, CapyUI.AppSizes.iconMd, entry.color) +
      '<div><div style="' + textStyle(CapyUI.AppText.bodyStrong, c.ink) + '">' + esc(entry.value) + '</div>' +
      '<div style="margin-top:2px;' + textStyle(CapyUI.AppText.caption, c.inkMuted) + '">' + esc(entry.description) + '</div></div></div>';
  }

  /* AnchoredTooltipTrigger → панель слева от кнопки (trailing-колонна). */
  function anchoredTooltipPanel(key, title, entries, align) {
    var c = theme();
    var w = CapyUI.AppSizes.anchoredTooltipWidth;
    var h = '<div class="telAnchorPanel" data-telanchor="' + key + '" style="' + align + ';width:' + w + 'px;background:' + c.surface +
      ';border-radius:' + CapyUI.AppRadii.xl + 'px;padding:' + CapyUI.AppSpacing.cardPadding + 'px;box-shadow:0 8px 32px rgba(0,0,0,0.35)">';
    h += '<div style="' + textStyle(CapyUI.AppText.cardTitle, c.ink) + 'margin-bottom:' + CapyUI.AppSpacing.x4 + 'px">' + esc(title) + '</div>';
    h += '<div style="display:flex;flex-direction:column;gap:' + CapyUI.AppSpacing.x4 + 'px">';
    for (var i = 0; i < entries.length; i++) h += informationCard(entries[i]);
    h += '</div></div>';
    return h;
  }

  /* ══════════ IconValueGrid ══════════ */
  function iconValueGrid(entries) {
    var c = theme();
    var columns = 2, spacing = CapyUI.AppSpacing.x4, runSpacing = CapyUI.AppSpacing.x4;
    var h = '<div style="display:flex;flex-direction:column;gap:' + runSpacing + 'px">';
    for (var start = 0; start < entries.length; start += columns) {
      h += '<div style="display:flex;gap:' + spacing + 'px">';
      for (var i = 0; i < columns; i++) {
        var idx = start + i;
        if (idx >= entries.length) { h += '<div style="flex:1"></div>'; continue; }
        var e = entries[idx];
        h += '<div style="flex:1;display:flex;align-items:center;min-width:0">' +
          icon(e.icon, CapyUI.AppSizes.iconMd, e.color || c.ink) +
          '<span style="margin-left:' + CapyUI.AppSpacing.x3 + 'px;' + textStyle(CapyUI.AppText.legendValue, c.ink) + 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(e.value) + '</span></div>';
      }
      h += '</div>';
    }
    return h + '</div>';
  }

  /* ══════════ ChartTooltip (тёмный буббл на inverseSurface) ══════════ */
  function chartTooltip(o) {
    var c = theme();
    var h = '<div class="telTip" style="background:' + c.inverseSurface + ';border-radius:' + CapyUI.AppRadii.md + 'px;padding:' +
      CapyUI.AppSpacing.x3 + 'px ' + CapyUI.AppSpacing.x4 + 'px;max-width:280px">';
    if (o.title != null) h += '<div style="' + textStyle(CapyUI.AppText.tooltipLine, c.onInverseSurfaceMuted) + '">' + esc(o.title) + '</div>';
    if (o.value != null) {
      if (o.title != null) h += '<div style="height:' + CapyUI.AppSpacing.x1 + 'px"></div>';
      h += '<div style="display:flex;align-items:baseline">' +
        '<span style="' + textStyle(CapyUI.AppText.tooltipValue, c.onInverseSurface) + '">' + esc(o.value) + '</span>' +
        (o.unit ? '<span style="margin-left:4px;' + textStyle(CapyUI.AppText.tooltipLine, c.onInverseSurfaceMuted) + '">' + esc(o.unit) + '</span>' : '') +
        '</div>';
    }
    for (var i = 0; i < o.rows.length; i++) {
      var r = o.rows[i];
      h += '<div style="height:' + CapyUI.AppSpacing.x2 + 'px"></div>';
      h += '<div class="telTipRow" style="' + textStyle(CapyUI.AppText.tooltipLine, c.onInverseSurfaceMuted) + '">' +
        (r.color ? '<span class="swatch" style="width:' + CapyUI.AppSizes.tooltipSwatch + 'px;height:' + CapyUI.AppSizes.tooltipSwatch + 'px;border-radius:50%;background:' + r.color + ';flex:none"></span>' : '<span style="width:' + CapyUI.AppSizes.tooltipSwatch + 'px;flex:none"></span>') +
        '<span style="flex:1">' + esc(r.label) + '</span>' +
        (r.value != null ? '<span style="margin-left:' + CapyUI.AppSpacing.x3 + 'px;white-space:nowrap">' + esc(r.value) + '</span>' : '') +
        '</div>';
    }
    return h + '</div>';
  }

  /* ══════════ SegmentedDonut (SVG, с анимацией как в Dart) ══════════ */
  function SegmentedDonut(mount) {
    this.mount = mount;          // DOM-узел
    this._from = null;           // сегменты, от которых анимируем
    this._fromInner = null;
    this._fromDenominator = null;
    this._firstSweep = true;
    this._raf = null;
    this._t0 = 0;
    this._config = null;
  }
  SegmentedDonut.prototype = {
    update: function (config) {
      var prev = this._config;
      this._config = config;
      var same = prev && _sameDonutGeometry(prev.segments, config.segments) &&
        _sameDonutArc(prev.innerArc, config.innerArc) && prev.total === config.total;
      if (!same) {
        if (prev) {
          var t = this._progressNow();
          this._from = _lerpDonutSegments(this._from || _zeroedDonut(prev.segments), prev.segments, t);
          this._fromInner = _lerpDonutArc(this._fromInner, prev.innerArc, t);
          this._fromDenominator = (this._fromDenominator == null) ? _donutSum(prev.segments)
            : this._fromDenominator + (_donutSum(prev.segments) - this._fromDenominator) * t;
          this._firstSweep = false;
        } else {
          this._from = _zeroedDonut(config.segments);
          this._fromInner = _zeroedDonutArc(config.innerArc);
          this._fromDenominator = config.total != null ? config.total : _donutSum(config.segments);
        }
        this._animate();
      } else {
        this._render(1);
      }
    },
    _progressNow: function () {
      if (!this._t0) return 1;
      return clamp((Date.now() - this._t0) / CapyUI.AppMotion.slow, 0, 1);
    },
    _animate: function () {
      var self = this;
      if (this._raf) cancelAnimationFrame(this._raf);
      this._t0 = Date.now();
      function frame() {
        var t = self._progressNow();
        self._render(t);
        if (t < 1) self._raf = requestAnimationFrame(frame);
        else self._raf = null;
      }
      frame();
    },
    _render: function (t) {
      var cfg = this._config;
      if (!cfg) return;
      var c = theme();
      var segments = _lerpDonutSegments(this._from || [], cfg.segments, t);
      var innerArc = _lerpDonutArc(this._fromInner, cfg.innerArc, t);
      var denominator = this._fromDenominator == null ? _donutSum(cfg.segments)
        : this._fromDenominator + ((_donutSum(cfg.segments) || (cfg.total || 0)) - this._fromDenominator) * t;

      var side = cfg.side;                        // квадрат, вычисленный хостом
      var strokeWidth = cfg.strokeWidth || CapyUI.AppSizes.donutStroke;
      var innerStrokeWidth = cfg.innerStrokeWidth || CapyUI.AppSizes.donutInnerStroke;
      var innerGap = cfg.innerGap != null ? cfg.innerGap : CapyUI.AppSizes.donutInnerGap;
      var gap = cfg.gap != null ? cfg.gap : CapyUI.AppSizes.donutSegmentGap;
      var startAngle = (cfg.startAngle != null) ? cfg.startAngle : -Math.PI / 2;
      var capRadius = cfg.capRadius != null ? cfg.capRadius : CapyUI.AppSizes.donutCapRadius;
      var markerBand = cfg.hasMarkers ? Math.max(cfg.markerBox.width, cfg.markerBox.height) + CapyUI.AppSpacing.x2 : 0;

      var center = side / 2;
      var outerRadius = Math.max(0, side / 2 - markerBand);
      var radius = Math.max(0, outerRadius - strokeWidth / 2);
      var innerRadius = Math.max(0, radius - strokeWidth / 2 - innerGap - innerStrokeWidth / 2);
      var markerRadius = outerRadius + markerBand / 2;
      var holeRadius = Math.max(0, innerRadius - innerStrokeWidth / 2 - innerGap);
      var holeSquare = holeRadius * Math.SQRT2;

      var svg = '<svg width="' + side + '" height="' + side + '" viewBox="0 0 ' + side + ' ' + side + '" style="overflow:visible">';
      var drawnCount = 0;
      for (var i = 0; i < segments.length; i++) if (segments[i].value > 0) drawnCount++;
      var effectiveGap = drawnCount > 1 ? gap : 0;

      var angle = startAngle;
      var markerHtml = '';
      for (var s = 0; s < segments.length; s++) {
        var seg = segments[s];
        var sweep = denominator > 0 ? seg.value / denominator * 2 * Math.PI : 0;
        if (seg.value > 0 && denominator > 0) {
          var extent = Math.max(0, sweep - effectiveGap);
          svg += _donutArcPath(center, radius, strokeWidth, angle + effectiveGap / 2, extent, seg.color, capRadius);
          if (cfg.markers && cfg.markers[s] && sweep > 0) {
            var mid = angle + sweep / 2;
            var mx = center + markerRadius * Math.cos(mid) - cfg.markerBox.width / 2;
            var my = center + markerRadius * Math.sin(mid) - cfg.markerBox.height / 2;
            markerHtml += '<div class="telDonutMarker" style="position:absolute;left:' + mx + 'px;top:' + my + 'px;width:' + cfg.markerBox.width + 'px;height:' + cfg.markerBox.height + 'px;display:flex;align-items:center;justify-content:center">' + cfg.markers[s] + '</div>';
          }
        }
        angle += sweep;
      }
      if (innerArc && innerArc.value > 0 && innerRadius > 0) {
        var arcSweep = Math.min(innerArc.value / denominator * 2 * Math.PI, 2 * Math.PI);
        svg += _donutArcPath(center, innerRadius, innerStrokeWidth, startAngle, arcSweep, innerArc.color, 0);
      }
      svg += '</svg>';

      var centerOpacity = this._firstSweep ? (t * t) : 1;   // Curves.easeIn
      var centerBlock = '';
      if (cfg.value != null) {
        centerBlock = '<div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:' + holeSquare + 'px;height:' + holeSquare + 'px;display:flex;align-items:center;justify-content:center;opacity:' + centerOpacity + '">' +
          '<div style="display:flex;flex-direction:column;align-items:center;transform:scale(1)">' +
          '<div style="' + textStyle(CapyUI.AppText.metricLg, c.ink) + 'line-height:1">' + esc(cfg.value) + '</div>' +
          (cfg.unit ? '<div style="margin-top:' + CapyUI.AppSpacing.x1 + 'px;' + textStyle(CapyUI.AppText.unitMd, c.inkMuted) + '">' + esc(cfg.unit) + '</div>' : '') +
          (cfg.delta ? '<div style="margin-top:' + CapyUI.AppSpacing.x1 + 'px;' + textStyle(CapyUI.AppText.delta, null) + '">' + esc(cfg.delta) + '</div>' : '') +
          '</div></div>';
      }
      this.mount.style.position = 'relative';
      this.mount.innerHTML = '<div style="position:relative;width:' + side + 'px;height:' + side + 'px">' + svg + markerHtml + centerBlock + '</div>';
    }
  };

  function _donutSum(segments) {
    var s = 0;
    for (var i = 0; i < segments.length; i++) s += segments[i].value;
    return s;
  }
  function _zeroedDonut(segments) {
    return segments.map(function (s) { return { value: 0, color: s.color, marker: s.marker }; });
  }
  function _zeroedDonutArc(arc) { return arc ? { value: 0, color: arc.color } : null; }
  function _sameDonutGeometry(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (a[i].value !== b[i].value || a[i].color !== b[i].color) return false;
    }
    return true;
  }
  function _sameDonutArc(a, b) {
    if (!a || !b) return (!a && !b);
    return a.value === b.value && a.color === b.color;
  }
  function _lerpDonutSegments(a, b, t) {
    if (t >= 1) return b;
    if (t <= 0) return a;
    var length = Math.max(a.length, b.length), out = [];
    for (var i = 0; i < length; i++) {
      var from = i < a.length ? a[i] : null;
      var to = i < b.length ? b[i] : null;
      out.push({
        value: (from ? from.value : 0) + ((to ? to.value : 0) - (from ? from.value : 0)) * t,
        color: to ? to.color : from.color
      });
    }
    return out;
  }
  function _lerpDonutArc(a, b, t) {
    if (t >= 1) return b;
    if (!a && !b) return null;
    var fromV = a ? a.value : 0, toV = b ? b.value : 0;
    return { value: fromV + (toV - fromV) * t, color: (b || a).color };
  }

  /* Дуга кольца: частично скруглённые концы (radius ≤ stroke/2) —
     приблизительно как _sectorPath + dilation в Dart: здесь — скругление
     через linecap уменьшенного сектора с компенсацией угла. */
  function _donutArcPath(center, radius, strokeWidth, start, extent, color, capRadius) {
    if (extent <= 0) return '';
    var cap = Math.min(capRadius, strokeWidth / 2);
    if (extent >= 2 * Math.PI - 1e-6) {
      return '<circle cx="' + center + '" cy="' + center + '" r="' + radius + '" fill="none" stroke="' + color + '" stroke-width="' + strokeWidth + '"/>';
    }
    if (cap <= 0) {
      return '<path d="' + _arcD(center, radius, start, extent) + '" fill="none" stroke="' + color + '" stroke-width="' + strokeWidth + '"/>';
    }
    var capAngle = cap / radius;
    var inner = Math.max(0, extent - 2 * capAngle);
    var fullyRound = cap >= strokeWidth / 2 - 1e-9;
    if (fullyRound) {
      return '<path d="' + _arcD(center, radius, start + capAngle, inner) + '" fill="none" stroke="' + color + '" stroke-width="' + strokeWidth + '" stroke-linecap="round"/>';
    }
    /* Частичное скругление: SVG-путь сектора со скруглёнными углами. */
    var r1 = radius - strokeWidth / 2 + cap, r2 = radius + strokeWidth / 2 - cap;
    var a0 = start, a1 = start + extent;
    var p = [];
    /* Внешняя дуга от a0+φ до a1−φ, прямые скосы, внутренняя дуга назад. */
    var phi = cap / Math.max(r2, 1) * 0.9;
    var oa0 = a0 + phi, oa1 = a1 - phi;
    function pt(r, a) { return [(center + r * Math.cos(a)).toFixed(2), (center + r * Math.sin(a)).toFixed(2)]; }
    p.push('M' + pt(r1, a0).join(','));
    p.push('L' + pt(r2, a0).join(','));
    p.push('A' + r2 + ' ' + r2 + ' 0 ' + (extent > Math.PI ? 1 : 0) + ' 1 ' + pt(r2, oa1).join(','));
    p.push('L' + pt(r2, a1).join(','));
    p.push('A' + cap + ' ' + cap + ' 0 0 1 ' + pt(r1, a1).join(','));
    p.push('A' + r1 + ' ' + r1 + ' 0 ' + (extent > Math.PI ? 1 : 0) + ' 0 ' + pt(r1, oa0).join(','));
    p.push('L' + pt(r1, a0).join(','));
    p.push('A' + cap + ' ' + cap + ' 0 0 1 ' + pt(r2, a0).join(','));
    p.push('Z');
    return '<path d="' + p.join('') + '" fill="' + color + '"/>';
  }
  function _arcD(center, radius, start, extent) {
    var x0 = center + radius * Math.cos(start), y0 = center + radius * Math.sin(start);
    var x1 = center + radius * Math.cos(start + extent), y1 = center + radius * Math.sin(start + extent);
    return 'M' + x0.toFixed(2) + ' ' + y0.toFixed(2) + 'A' + radius + ' ' + radius + ' 0 ' + (extent > Math.PI ? 1 : 0) + ' 1 ' + x1.toFixed(2) + ' ' + y1.toFixed(2);
  }

  /* ══════════ EnergyBarChart (SVG-порт _EnergyBarChartState) ══════════ */
  function EnergyBarChart(mount) {
    this.mount = mount;
    this._fromBars = null;
    this._shownBars = null;
    this._entryOrders = null;
    this._entryCount = 0;
    this._totalMs = CapyUI.AppMotion.base;
    this._raf = null;
    this._t0 = 0;
    this._config = null;
    this._gridKey = null;
    this._pointer = null;
  }
  EnergyBarChart.prototype = {
    /* config: {bars, ticks, xTicks, slotCount, growth, tooltip(index),
     *          selectedIndex, onSelect, profile} */
    update: function (config) {
      var old = this._config;
      this._config = config;
      var profile = config.profile || CapyUI.AppSizes.chartBarProfile;
      var gridKey = profile.width + 'x' + profile.gap + ':' + _bucketWidthOfBars(config.bars);
      var gridChanged = this._gridKey !== gridKey;
      this._gridKey = gridKey;

      if (old) {
        this._maybeClearSelection(old, config);
        var barsChanged = !_sameBars(old.bars, config.bars) ||
          !_sameChartValues(old.overlay || [], config.overlay || []);
        if (!barsChanged && !gridChanged) {
          /* Данные те же (например, хост пересобран после render) — красим
             текущее состояние без перезапуска анимации. */
          this._render(this._progressNow());
          return;
        }
        if (gridChanged) {
          this._fromBars = _zeroedBars(config.bars);
          this._shownBars = null;
          var e1 = _entranceOrders(config.bars);
          this._entryOrders = e1.orders; this._entryCount = e1.count;
          this._run(_waveDuration(CapyUI.AppMotion.base, this._entryCount));
          return;
        }
        var inc = _incrementalEntrance(this._shownBars || old.bars, config.bars);
        this._fromBars = inc.fromBars;
        this._entryOrders = inc.orders; this._entryCount = inc.count;
        if (inc.grows) {
          this._run(_waveDuration(CapyUI.AppMotion.base, this._entryCount) > config.growthMs
            ? _waveDuration(CapyUI.AppMotion.base, this._entryCount) : config.growthMs);
        } else if (this._entryCount > 0) {
          this._run(_waveDuration(CapyUI.AppMotion.base, this._entryCount));
        } else {
          this._fromBars = config.bars;
          this._render(1);
        }
      } else {
        this._fromBars = _zeroedBars(config.bars);
        var e2 = _entranceOrders(config.bars);
        this._entryOrders = e2.orders; this._entryCount = e2.count;
        this._run(_waveDuration(CapyUI.AppMotion.base, this._entryCount));
      }
    },
    _maybeClearSelection: function (old, cfg) {
      var index = cfg.selectedIndex;
      if (index == null) return;
      var oldHas = index >= 0 && index < old.bars.length;
      var newHas = index >= 0 && index < cfg.bars.length;
      var oldId = oldHas ? old.bars[index].id : null;
      var newId = newHas ? cfg.bars[index].id : null;
      var identityChanged = (oldId != null || newId != null) && oldId !== newId;
      var readingRemoved = !newHas || !_hasReading(index, cfg.bars);
      if (!(identityChanged || readingRemoved)) return;
      /* Пост-кадровый сброс выбора (Dart: addPostFrameCallback). */
      var self = this;
      setTimeout(function () {
        if (self._config && self._config.selectedIndex != null && self._config.onSelect) {
          self._config.onSelect(null);
        }
      }, 0);
    },
    _run: function (totalMs) {
      var self = this;
      this._totalMs = totalMs;
      if (this._raf) cancelAnimationFrame(this._raf);
      this._t0 = Date.now();
      function frame() {
        var t = clamp((Date.now() - self._t0) / self._totalMs, 0, 1);
        self._render(t);
        if (t < 1) self._raf = requestAnimationFrame(frame);
        else self._raf = null;
      }
      frame();
    },
    _progressNow: function () { return this._t0 ? clamp((Date.now() - this._t0) / this._totalMs, 0, 1) : 1; },

    _render: function (t) {
      var cfg = this._config;
      if (!cfg) return;
      var c = theme();
      var ramp = c.energy;
      var positiveColor = ramp.draw, negativeColor = ramp.gain;
      var baseColor = ramp.drawSubtle, midColor = ramp.drawSoft;

      var bars = _lerpBars(this._fromBars || [], cfg.bars, t, {
        entryOrders: this._entryOrders || [],
        entryDuration: CapyUI.AppMotion.base,
        total: this._totalMs,
        growthMs: cfg.growthMs,
        growthCurve: cfg.growthCurve
      });
      this._shownBars = bars;

      var width = this.mount.clientWidth || 400;
      var height = this.mount.clientHeight || 300;
      var profile = cfg.profile || CapyUI.AppSizes.chartBarProfile;
      var slotCount = cfg.slotCount != null ? cfg.slotCount : bars.length;
      var S = CapyUI.AppSizes;

      var geo = {
        plot: {
          left: S.chartAxisGutter,
          top: S.chartOverlayDot / 2,
          right: width,
          bottom: Math.max(S.chartOverlayDot / 2, height - S.chartLabelBand)
        },
        profile: profile, slotCount: slotCount, bars: bars
      };
      geo.plot.width = geo.plot.right - geo.plot.left;
      geo.plot.height = geo.plot.bottom - geo.plot.top;
      geo.xForIndex = function (i) { return this.plot.left + profile.width / 2 + i * profile.pitch; };
      geo.xForTickFraction = function (position) {
        var fraction = clamp(position, 0, 1);
        if (fraction >= 1 || slotCount <= 0) return this.plot.right;
        return clamp(this.plot.left + profile.width / 2 + fraction * slotCount * profile.pitch, this.plot.left, this.plot.right);
      };
      geo.nearestIndex = function (dx) {
        if (bars.length <= 1) return 0;
        var raw = (dx - this.plot.left - profile.width / 2) / profile.pitch;
        return clamp(Math.round(raw), 0, bars.length - 1);
      };
      geo.lastActualIndex = Math.max(0, bars.length - 1);
      /* overlay-кривая (мощность поверх SOC): точки между центрами колонн. */
      geo.overlayPoint = function (index, count, value) {
        if (!bars.length) return { x: this.plot.left, y: this.yForValue(value) };
        var start = this.xForIndex(0);
        var end = this.xForIndex(this.lastActualIndex);
        var fraction = count <= 1 ? 1.0 : index / (count - 1);
        return { x: start + (end - start) * fraction, y: this.yForValue(value) };
      };
      geo.overlayAnchorPoint = function (atStart) {
        var x = !bars.length ? (atStart ? this.plot.left : this.plot.right)
          : (atStart ? this.xForIndex(0) - profile.width / 2
                     : this.xForIndex(this.lastActualIndex) + profile.width / 2);
        return { x: x, y: this.yForValue(0) };
      };
      geo.dotOffset = function (y) {
        if (this.plot.height <= 0) return 0;
        return clamp((y - this.plot.top) / this.plot.height, 0, 1);
      };
      var range = _axisRange(bars, cfg.ticks);
      geo.minValue = range[0]; geo.maxValue = range[1];
      geo.yForValue = function (v) {
        var fraction = (v - this.minValue) / (this.maxValue - this.minValue);
        return this.plot.bottom - fraction * this.plot.height;
      };

      /* Раскладка колонн до отрисовки: сетка режется вокруг баров. */
      var columns = [];
      for (var i = 0; i < bars.length; i++) {
        var laid = _layoutBar(i, bars[i], geo, {
          positive: positiveColor, negative: negativeColor,
          base: baseColor, mid: midColor,
          projected: c.chartProjected, held: c.chartHeld, now: c.chartNowMarker
        });
        columns.push.apply(columns, laid);
      }

      var svg = '<svg width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '" style="position:absolute;inset:0">';
      svg += _drawAxes(columns, geo, cfg.ticks, c.chartGrid);
      svg += '<clipPath id="telPlot' + this._cid() + '"><rect x="' + geo.plot.left + '" y="' + geo.plot.top + '" width="' + geo.plot.width + '" height="' + geo.plot.height + '"/></clipPath>';
      svg += '<g clip-path="url(#telPlot' + this._cid() + ')">';
      for (var k = 0; k < columns.length; k++) {
        var s = columns[k];
        svg += '<rect x="' + s.x.toFixed(2) + '" y="' + s.y.toFixed(2) + '" width="' + s.w.toFixed(2) + '" height="' + s.h.toFixed(2) + '" rx="' + s.r1 + '" fill="' + s.color + '"/>';
      }
      svg += '</g>';
      /* Подписи осей */
      svg += '<g>';
      for (var ti = 0; ti < cfg.ticks.length; ti++) {
        var tick = cfg.ticks[ti];
        if (!isFinite(tick.value)) continue;
        var ty = geo.yForValue(tick.value);
        svg += '<text x="' + (geo.plot.left - CapyUI.AppSpacing.x2) + '" y="' + ty + '" text-anchor="end" dominant-baseline="middle" style="' + textStyle(CapyUI.AppText.caption, c.chartAxisLabel) + 'font-size:13px">' + esc(tick.label) + '</text>';
      }
      for (var xi = 0; xi < (cfg.xTicks || []).length; xi++) {
        var xt = cfg.xTicks[xi];
        var anchor = geo.xForTickFraction(xt.position);
        var align = xt.position <= 0 ? 'start' : (xt.position >= 1 ? 'end' : 'middle');
        var tx = xt.position <= 0 ? anchor : (xt.position >= 1 ? anchor : anchor);
        var lx = xt.position >= 1 ? anchor : (xt.position <= 0 ? geo.plot.left : anchor);
        lx = clamp(lx, geo.plot.left, Math.max(geo.plot.left, geo.plot.right - 10));
        svg += '<text x="' + lx + '" y="' + (geo.plot.bottom + CapyUI.AppSpacing.x2 + 9) + '" text-anchor="' + align + '" style="' + textStyle(CapyUI.AppText.caption, c.chartAxisLabel) + 'font-size:13px">' + esc(xt.label) + '</text>';
      }
      svg += '</g>';
      /* overlay-кривая (energy_bar_chart.dart: _drawOverlay): линия по центрам
         колонн, разрыв на NaN, якоря только рядом с реальным сэмплом. */
      var ov = cfg.overlay || [];
      if (ov.length) {
        var anchors = cfg.overlayAnchor || 'none';
        var pathD = '';
        var hasPoint = false;
        function ovPoint(p) {
          if (hasPoint) pathD += 'L' + p.x.toFixed(2) + ' ' + p.y.toFixed(2);
          else { pathD += 'M' + p.x.toFixed(2) + ' ' + p.y.toFixed(2); hasPoint = true; }
        }
        if ((anchors === 'start' || anchors === 'both') && isFinite(ov[0])) ovPoint(geo.overlayAnchorPoint(true));
        for (var oi = 0; oi < ov.length; oi++) {
          if (!isFinite(ov[oi])) { hasPoint = false; continue; }
          ovPoint(geo.overlayPoint(oi, ov.length, _lerpV(0, ov[oi], t)));
        }
        if ((anchors === 'end' || anchors === 'both') && isFinite(ov[ov.length - 1])) ovPoint(geo.overlayAnchorPoint(false));
        if (pathD) svg += '<path d="' + pathD + '" fill="none" stroke="' + c.chartOverlay + '" stroke-width="' + CapyUI.AppSizes.chartOverlayStroke + '" stroke-linejoin="round" stroke-linecap="round" pointer-events="none"/>';
      }
      /* cornerCaption (правый верх, на пластине цвета поверхности) */
      if (cfg.cornerCaption) {
        svg += '<g><rect x="' + (geo.plot.right - 8 - cfg.cornerCaption.length * 7) + '" y="' + (geo.plot.top + CapyUI.AppSpacing.x2) + '" width="' + (cfg.cornerCaption.length * 7 + 8) + '" height="20" rx="4" fill="' + c.surface + '" opacity="0.85"/>' +
          '<text x="' + (geo.plot.right - CapyUI.AppSpacing.x2 - 4) + '" y="' + (geo.plot.top + CapyUI.AppSpacing.x2 + 14) + '" text-anchor="end" style="' + textStyle(CapyUI.AppText.caption, c.chartAxisLabel) + '">' + esc(cfg.cornerCaption) + '</text></g>';
      }
      svg += '</svg>';

      /* Слой выбора: пин + тултип (HTML поверх SVG). */
      var overlay = '';
      /* Маркеры overlay-кривой: точка на первом/последнем реальном сэмпле. */
      var ovArr = cfg.overlay || [];
      if (ovArr.length) {
        var hasFirst = isFinite(ovArr[0]), hasLast = isFinite(ovArr[ovArr.length - 1]);
        if (hasFirst || hasLast) {
          var firstPt = geo.overlayPoint(0, ovArr.length, _lerpV(0, ovArr[0], t));
          var lastPt = geo.overlayPoint(ovArr.length - 1, ovArr.length, _lerpV(0, ovArr[ovArr.length - 1], t));
          if (hasFirst) overlay += _pinAnnotation(firstPt.x, geo.plot.top, geo.plot.height, geo.dotOffset(firstPt.y), c.surface, c.ink);
          if (hasLast) overlay += _pinAnnotation(lastPt.x, geo.plot.top, geo.plot.height, geo.dotOffset(lastPt.y), c.surface, c.ink);
        }
      }
      var sel = cfg.selectedIndex;
      if (sel != null && sel >= 0 && sel < bars.length && _hasReading(sel, bars, cfg.overlay)) {
        var endV = _barEnd(bars[sel]);
        var py = clamp(geo.yForValue(endV), geo.plot.top, geo.plot.bottom);
        var px = geo.xForIndex(sel);
        var dotOffset = geo.plot.height <= 0 ? 0 : clamp((py - geo.plot.top) / geo.plot.height, 0, 1);
        overlay += _pinAnnotation(px, geo.plot.top, geo.plot.height, dotOffset, c.surface, c.ink);
        var tipHtml = cfg.tooltip ? cfg.tooltip(sel) : '';
        if (tipHtml) {
          overlay += _tooltipPlacement(px, py, geo.plot, tipHtml);
        }
      }

      this.mount.style.position = 'relative';
      this.mount.innerHTML = svg + overlay;
      this._attachPointer(geo);
    },
    _cid: function () {
      if (!this.__cid) this.__cid = Math.floor(Math.random() * 1e6);
      return this.__cid;
    },
    _attachPointer: function (geo) {
      var self = this;
      var cfg = this._config;
      if (!cfg) return;
      if (this._winUp) window.removeEventListener('mouseup', this._winUp);
      var clientY_hit = 0;
      var dragging = false;
      function selectAt(clientX) {
        var rect = self.mount.getBoundingClientRect();
        var x = clientX - rect.left, y = clientY_hit - rect.top;
        var cfgNow = self._config;
        if (!cfgNow || cfgNow.bars.length === 0) return;
        if (x < geo.plot.left || x > geo.plot.right || y < geo.plot.top || y > geo.plot.bottom) {
          if (cfgNow.selectedIndex != null && cfgNow.onSelect) cfgNow.onSelect(null);
          return;
        }
        var index = geo.nearestIndex(x);
        if (!_hasReading(index, cfgNow.bars, cfgNow.overlay)) return;
        if (cfgNow.onSelect) cfgNow.onSelect(index);
      }
      this.mount.onmousedown = function (ev) {
        dragging = true; clientY_hit = ev.clientY;
        selectAt(ev.clientX); ev.preventDefault();
      };
      this.mount.onmousemove = function (ev) {
        if (dragging) { clientY_hit = ev.clientY; selectAt(ev.clientX); }
      };
      this._winUp = function () { dragging = false; };
      window.addEventListener('mouseup', this._winUp);
      this.mount.ontouchstart = function (ev) {
        dragging = true;
        var tch = ev.touches[0];
        clientY_hit = tch.clientY;
        selectAt(tch.clientX);
        ev.preventDefault();
      };
      this.mount.ontouchmove = function (ev) {
        if (dragging) {
          var tch = ev.touches[0];
          clientY_hit = tch.clientY;
          selectAt(tch.clientX);
          ev.preventDefault();
        }
      };
      this.mount.ontouchend = function () { dragging = false; };
    }
  };

  /* ── математика графика (порт функций Dart) ── */
  function _barHasVisibleReading(bar) {
    return (isFinite(bar.value) && bar.value !== 0) ||
      (isFinite(bar.base) && bar.base !== 0) ||
      (isFinite(bar.mid) && bar.mid !== 0) ||
      (isFinite(bar.counter) && bar.counter !== 0);
  }
  function _hasReading(index, bars, overlay) {
    var bar = bars[index];
    return isFinite(bar.value) || isFinite(bar.base) || isFinite(bar.mid) || isFinite(bar.counter) ||
      (overlay && index < overlay.length && isFinite(overlay[index]));
  }
  function _lerpV(a, b, t) { return a + (b - a) * t; }
  /* sameChartValues: NaN-ы равны, значения — по значению. */
  function _sameChartValues(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) {
      var x = a[i], y = b[i];
      if (x === y) continue;
      if (isNaN(x) && isNaN(y)) continue;
      return false;
    }
    return true;
  }
  function _stackBelow(bar) {
    var lead = bar.value !== 0 ? bar.value : (bar.mid !== 0 ? bar.mid : bar.base);
    if (lead === 0) return 0;
    var total = 0;
    if (bar.base !== 0 && Math.sign(bar.base) === Math.sign(lead)) total += bar.base;
    if (bar.mid !== 0 && Math.sign(bar.mid) === Math.sign(lead)) total += bar.mid;
    return total;
  }
  function _barEnd(bar) {
    var below = _stackBelow(bar);
    return bar.value === 0 ? below : bar.value + below;
  }
  function _sameBarValues(a, b) {
    return a.value === b.value || (isNaN(a.value) && isNaN(b.value));
  }
  function _sameBars(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) {
      var x = a[i], y = b[i];
      var same = function (p, q) { return p === q || (isNaN(p) && isNaN(q)); };
      if (!same(x.value, y.value) || !same(x.base, y.base) || !same(x.mid, y.mid) || !same(x.counter, y.counter) || x.state !== y.state) return false;
    }
    return true;
  }
  function _zeroedBars(bars) {
    return bars.map(function (b) { return { value: 0, base: 0, mid: 0, counter: 0, state: b.state, id: b.id }; });
  }
  function _entranceOrders(to) {
    var count = 0, orders = [];
    for (var i = 0; i < to.length; i++) {
      orders.push(_barHasVisibleReading(to[i]) ? count++ : null);
    }
    return { orders: orders, count: count };
  }
  function _incrementalEntrance(from, to) {
    var byId = {};
    for (var f = 0; f < from.length; f++) if (from[f].id != null) byId[from[f].id] = from[f];
    var count = 0, grows = false, fromBars = [], orders = [];
    for (var i = 0; i < to.length; i++) {
      var bar = to[i];
      var previous = (bar.id == null) ? (i < from.length ? from[i] : null) : byId[bar.id];
      var enters = _barHasVisibleReading(bar) && (previous == null || !_barHasVisibleReading(previous));
      var start = enters ? { value: 0, base: 0, mid: 0, counter: 0, state: bar.state, id: bar.id } : (previous || bar);
      if (!enters) {
        var same = function (p, q) { return p === q || (isNaN(p) && isNaN(q)); };
        grows = grows || !same(start.value, bar.value) || !same(start.base, bar.base) ||
          !same(start.mid, bar.mid) || !same(start.counter, bar.counter);
      }
      fromBars.push(start);
      orders.push(enters ? count++ : null);
    }
    return { fromBars: fromBars, orders: orders, count: count, grows: grows };
  }
  function _waveDuration(entrance, count) {
    return entrance + CapyUI.AppMotion.chartBarStagger * Math.max(0, count - 1);
  }
  function _entryProgress(t, order, entrance, total) {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    if (entrance <= 0) return 1;
    var elapsed = t * total;
    var delay = order * CapyUI.AppMotion.chartBarStagger;
    if (elapsed <= delay) return 0;
    var local = clamp((elapsed - delay) / entrance, 0, 1);
    var eased = 1 - Math.pow(1 - local, 3);        // Curves.easeOutCubic
    return eased + CapyUI.AppMotion.chartBarBounce * local * Math.sin(Math.PI * local);
  }
  function _growthProgress(t, total, growthMs, curve) {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    if (!growthMs || growthMs <= 0) return 1;
    var local = clamp(t * total / growthMs, 0, 1);
    if (curve === 'linear') return local;          // chase
    return 1 - Math.pow(1 - local, 3);             // settle: easeOutCubic
  }
  function _lerpChartValue(from, to, t) {
    if (!isFinite(to)) return to;
    return (isFinite(from) ? from : 0) + (to - (isFinite(from) ? from : 0)) * t;
  }
  function _lerpBars(from, to, t, o) {
    if (t >= 1) return to;
    if (t <= 0) return from;
    var length = Math.max(from.length, to.length), out = [];
    for (var i = 0; i < length; i++) {
      var a = i < from.length ? from[i] : null;
      var b = i < to.length ? to[i] : null;
      var meta = b || a;
      var entryOrder = i < o.entryOrders.length ? o.entryOrders[i] : null;
      var barT = entryOrder == null
        ? _growthProgress(t, o.total, o.growthMs, o.growthCurve)
        : _entryProgress(t, entryOrder, o.entryDuration, o.total);
      out.push({
        value: _lerpChartValue(a ? a.value : 0, b ? b.value : 0, barT),
        base: _lerpChartValue(a ? a.base : 0, b ? b.base : 0, barT),
        mid: _lerpChartValue(a ? a.mid : 0, b ? b.mid : 0, barT),
        counter: _lerpChartValue(a ? a.counter : 0, b ? b.counter : 0, barT),
        state: meta.state, id: meta.id
      });
    }
    return out;
  }
  function _bucketWidthOfBars(bars) {
    for (var i = 0; i < bars.length; i++) {
      var id = bars[i].id;
      if (id && id.width != null) return id.width;
    }
    return null;
  }
  function _axisIsStatedByTicks(ticks) {
    var values = {};
    for (var i = 0; i < ticks.length; i++) if (isFinite(ticks[i].value)) values[ticks[i].value] = true;
    return Object.keys(values).length >= 2;
  }
  function _axisRange(bars, ticks) {
    var values;
    if (_axisIsStatedByTicks(ticks)) {
      values = [0];
      for (var i = 0; i < ticks.length; i++) if (isFinite(ticks[i].value)) values.push(ticks[i].value);
    } else {
      values = [0];
      for (var b = 0; b < bars.length; b++) {
        var bar = bars[b];
        if (isFinite(bar.value)) values.push(bar.value);
        if (isFinite(bar.base)) values.push(bar.base);
        if (isFinite(bar.mid)) values.push(bar.mid);
        if (isFinite(bar.counter)) values.push(bar.counter);
        if (isFinite(bar.value) && isFinite(bar.base) && isFinite(bar.mid)) values.push(_barEnd(bar));
      }
    }
    var min = Math.min.apply(null, values), max = Math.max.apply(null, values);
    if (min === max) return [min - 1, max + 1];
    return [min, max];
  }

  /* Раскладка одной колонны (порт _layoutBar). */
  function _layoutBar(index, barIn, geo, colors) {
    /* Dart-дефолты EnergyBar: base/mid/counter = 0. */
    var bar = {
      value: barIn.value,
      base: barIn.base != null ? barIn.base : 0,
      mid: barIn.mid != null ? barIn.mid : 0,
      counter: barIn.counter != null ? barIn.counter : 0,
      state: barIn.state, id: barIn.id
    };
    if (!isFinite(bar.value) || !isFinite(bar.base) || !isFinite(bar.mid)) return [];
    var drawn = [];
    var x = geo.xForIndex(index);
    var override = null;
    if (bar.state === 'projected') override = colors.projected;
    else if (bar.state === 'held' || bar.state === 'estimated') override = colors.held;
    else if (bar.state === 'now') override = colors.now;

    var zeroY = geo.yForValue(0);
    var bw = geo.profile.width;
    var S = CapyUI.AppSizes;

    function segment(startY, endY, direction, color, roundStart, roundEnd) {
      var reach = (endY - startY) * direction;
      var length = Math.max(reach, bw);
      var resolvedEnd = startY + direction * length;
      var y0 = Math.min(startY, resolvedEnd), y1 = Math.max(startY, resolvedEnd);
      var startIsTop = startY <= resolvedEnd;
      var roundTop = startIsTop ? roundStart : roundEnd;
      var roundBottom = startIsTop ? roundEnd : roundStart;
      /* Скругление пер-конца: плоские стыки внутри колонны. */
      var rTop = roundTop ? bw / 2 : 0, rBottom = roundBottom ? bw / 2 : 0;
      return {
        x: x - bw / 2, y: y0, w: bw, h: Math.max(y1 - y0, 0.01),
        r1: Math.min(rTop, rBottom, (y1 - y0) / 2) || 0,
        color: color, endY: resolvedEnd
      };
    }

    if (isFinite(bar.counter) && bar.counter !== 0) {
      var cd = bar.counter > 0 ? -1 : 1;
      var cs = segment(zeroY + cd * S.chartZeroGap, geo.yForValue(bar.counter), cd,
        override || (bar.counter > 0 ? colors.positive : colors.negative), true, true);
      drawn.push(cs);
    }

    var lead = bar.value !== 0 ? bar.value : (bar.mid !== 0 ? bar.mid : bar.base);
    var baseStacks = bar.base !== 0 && lead !== 0 && Math.sign(bar.base) === Math.sign(lead);
    var midStacks = bar.mid !== 0 && lead !== 0 && Math.sign(bar.mid) === Math.sign(lead);

    var direction = lead > 0 ? -1 : 1;
    var cursor = zeroY + direction * S.chartZeroGap;
    var stacked = 0;

    if (baseStacks) {
      stacked += bar.base;
      var lb = segment(cursor, geo.yForValue(stacked), direction, override || colors.base, true, !midStacks && bar.value === 0);
      drawn.push(lb); cursor = lb.endY;
    }
    if (midStacks) {
      stacked += bar.mid;
      var lm = segment(cursor, geo.yForValue(stacked), direction, override || colors.mid, !baseStacks, bar.value === 0);
      drawn.push(lm); cursor = lm.endY;
    }
    if (bar.value === 0) return drawn;
    drawn.push(segment(cursor, geo.yForValue(stacked + bar.value), direction,
      override || (bar.value > 0 ? colors.positive : colors.negative), !baseStacks && !midStacks, true));
    return drawn;
  }

  /* Оси: направляющие режутся вокруг колонн (halo). */
  function _drawAxes(columns, geo, ticks, gridColor) {
    var S = CapyUI.AppSizes;
    var svg = '';
    var overshoot = S.chartGridStroke / 2;
    for (var i = 0; i < ticks.length; i++) {
      var tick = ticks[i];
      if (!isFinite(tick.value)) continue;
      var y = geo.yForValue(tick.value);
      var blocked = [];
      for (var k = 0; k < columns.length; k++) {
        var s = columns[k];
        if (y >= s.y - S.chartGridHalo && y <= s.y + s.h + S.chartGridHalo) {
          blocked.push([s.x - S.chartGridHalo, s.x + s.w + S.chartGridHalo]);
        }
      }
      blocked.sort(function (a, b) { return a[0] - b[0]; });
      var cursor = geo.plot.left;
      var spans = [];
      for (var b = 0; b < blocked.length; b++) {
        if (blocked[b][0] > cursor) spans.push([cursor, blocked[b][0]]);
        cursor = Math.max(cursor, blocked[b][1]);
      }
      if (cursor < geo.plot.right) spans.push([cursor, geo.plot.right]);
      for (var sp = 0; sp < spans.length; sp++) {
        var from = spans[sp][0] + overshoot, end = spans[sp][1] - overshoot;
        if (end > from) {
          svg += '<line x1="' + from.toFixed(2) + '" y1="' + y + '" x2="' + end.toFixed(2) + '" y2="' + y + '" stroke="' + gridColor + '" stroke-width="' + S.chartGridStroke + '" stroke-linecap="round"/>';
        }
      }
    }
    return svg;
  }

  /* Пин-аннотация выбора (порт ChartPinAnnotation, ruleWidth=0). */
  function _pinAnnotation(x, top, height, dotOffset, color, ringColor) {
    var S = CapyUI.AppSizes;
    var dotSize = S.chartSelectionDot;
    var cy = top + dotOffset * height;
    var r = dotSize / 2;
    return '<div style="position:absolute;left:' + (x - r) + 'px;top:' + top + 'px;width:' + dotSize + 'px;height:' + height + 'px;pointer-events:none">' +
      '<svg width="' + dotSize + '" height="' + height + '" style="overflow:visible">' +
      '<circle cx="' + r + '" cy="' + (cy - top) + '" r="' + (r - S.chartPinRing) + '" fill="' + color + '" stroke="' + ringColor + '" stroke-width="' + (S.chartPinRing * 2) + '"/>' +
      '</svg></div>';
  }

  /* Размещение тултипа: справа, иначе слева, кламп в плот (порт
     _TooltipLayoutDelegate) + каретка. */
  function _tooltipPlacement(anchorX, anchorY, plot, tipHtml) {
    var S = CapyUI.AppSizes;
    var markerRadius = S.chartSelectionDot / 2;
    var caret = S.tooltipCaret;
    /* Ширину/высоту буббла меряем после вставки — двухпроходно:
       вставим скрыто, измерим, переставим (через wrapper). */
    var wrap = document.createElement('div');
    wrap.style.cssText = 'position:absolute;left:0;top:0;visibility:hidden;pointer-events:none';
    wrap.innerHTML = tipHtml;
    document.body.appendChild(wrap);
    var w = wrap.firstElementChild ? wrap.firstElementChild.offsetWidth : 200;
    var h = wrap.firstElementChild ? wrap.firstElementChild.offsetHeight : 120;
    document.body.removeChild(wrap);

    var rightLeft = anchorX + markerRadius + caret;
    var leftLeft = anchorX - markerRadius - caret - w;
    var fitsRight = rightLeft + w <= plot.right;
    var fitsLeft = leftLeft >= plot.left;
    var availableRight = plot.right - anchorX;
    var availableLeft = anchorX - plot.left;
    var onRight = fitsRight || (!fitsLeft && availableRight >= availableLeft);
    var left = onRight ? rightLeft : leftLeft;
    left = clamp(left, plot.left, Math.max(plot.left, plot.right - w));
    var top = clamp(anchorY - h / 2, plot.top, Math.max(plot.top, plot.bottom - h));

    /* Каретка: треугольник от пузыря к точке. */
    var halfWidth = S.tooltipCaretWidth / 2;
    var minY = top + CapyUI.AppRadii.md + halfWidth;
    var maxY = top + h - CapyUI.AppRadii.md - halfWidth;
    var baseY = minY <= maxY ? clamp(anchorY, minY, maxY) : top + h / 2;
    var tipX = onRight ? anchorX + S.chartSelectionDot / 2 : anchorX - S.chartSelectionDot / 2;
    var c = theme();
    var baseX = onRight ? left + 1 : left + w - 1;
    var caretSvg = '<svg style="position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible;pointer-events:none">' +
      '<path d="M' + baseX + ' ' + (baseY - halfWidth) + ' L' + tipX + ' ' + anchorY + ' L' + baseX + ' ' + (baseY + halfWidth) + ' Z" fill="' + c.inverseSurface + '"/></svg>';

    return '<div style="position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none">' + caretSvg +
      '<div style="position:absolute;left:' + left + 'px;top:' + top + 'px">' + tipHtml + '</div></div>';
  }

  /* ══════════ EnergyStateBand ══════════ */
  function energyStateBand(labels, estimated) {
    var c = theme();
    var height = 10;
    if (!labels || labels.length === 0) return '<div style="height:' + height + 'px"></div>';
    var S = CapyUI.AppSizes;
    var profile = S.chartBarProfile;
    var colors = {
      charge: c.energy.gain,
      trip: c.energy.draw,
      parked: c.inkSubtle,
      poweredOn: c.track
    };
    var h = '<div style="height:' + height + 'px;position:relative;overflow:hidden">';
    /* Один скруглённый блок на растяжку одной метки. */
    var i = 0;
    while (i < labels.length) {
      var j = i;
      while (j + 1 < labels.length && labels[j + 1] === labels[i] &&
        (estimated ? estimated[j + 1] : false) === (estimated ? estimated[i] : false)) j++;
      var x = i * profile.pitch;
      var w = (j - i) * profile.pitch - profile.gap;
      var dim = estimated && estimated[i];
      h += '<div style="position:absolute;left:' + x + 'px;top:0;width:' + Math.max(w, 2) + 'px;height:' + height + 'px;border-radius:' + height / 2 + 'px;background:' + colors[labels[i]] + ';' + (dim ? 'opacity:0.45;' : '') + '"></div>';
      i = j + 1;
    }
    return h + '</div>';
  }



  /* ══════════ Stage T4: компоненты экрана истории (capy_ui) ══════════ */

  /* ── cycle_bar.dart: статичная «пилюля» цикла батареи ── */
  function cycleBar(o) {
    var c = theme();
    var S = CapyUI.AppSizes;
    var fill = isFinite(o.fillPercent) ? Math.min(100, Math.max(0, o.fillPercent)) : 0;
    return '<div style="position:relative;height:' + S.cycleBarHeight + 'px">' +
      '<div style="position:absolute;inset:0;border-radius:' + CapyUI.AppRadii.full + 'px;overflow:hidden;background:' + c.track + '">' +
      (fill > 0 ? '<div style="position:absolute;left:0;top:0;bottom:0;width:' + fill + '%;background:' + (o.fillColor || c.energy.gain) + '"></div>' : '') +
      '</div>' +
      (o.isPartial ? '<div style="position:absolute;inset:0;border-radius:' + CapyUI.AppRadii.full + 'px;border:' + S.limitSliderOutline + 'px solid ' + c.divider + ';pointer-events:none"></div>' : '') +
      '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:space-between;padding:0 ' + CapyUI.AppSpacing.x3 + 'px">' +
      '<span style="' + textStyle(CapyUI.AppText.metricSm, fill > 0 ? '#1A1A1A' : c.inkMuted) + '">' + esc(o.leadingLabel) + '</span>' +
      metricValue(o.valueLabel, o.valueUnit != null ? o.valueUnit : null, 'sm', c.ink, c.inkMuted) +
      '</div></div>';
  }

  /* ── metric_mosaic.dart: packMosaic + _MosaicCell (first-fit, ячейки 1fr
     либо фиксированной высоты cellHeight — как SizedBox в списке циклов) ── */
  function metricMosaic(o) {
    var c = theme();
    var columns = o.columns || 4;
    var gutter = o.gutter != null ? o.gutter : CapyUI.AppSpacing.x2;
    var tiles = o.tiles || [];
    if (!tiles.length) return '';
    var placements = packMosaic(tiles, columns);
    var rowCount = 0;
    placements.forEach(function (pl) { rowCount = Math.max(rowCount, pl.row + pl.tile.span.rows); });
    var h = '<div style="display:grid;grid-template-columns:repeat(' + columns + ',1fr);gap:' + gutter + 'px' +
      (o.cellHeight != null ? ';grid-auto-rows:' + o.cellHeight + 'px' : ';grid-auto-rows:1fr') + '">';
    var byCell = {};
    placements.forEach(function (pl) { byCell[pl.row + ':' + pl.column] = pl; });
    for (var r = 0; r < rowCount; r++) {
      for (var col = 0; col < columns; col++) {
        var pl = byCell[r + ':' + col];
        if (pl) {
          var t = pl.tile;
          var size = t.span === MosaicTileSpan.hero ? 'xl' : 'sm';
          var head = '<div style="display:flex;align-items:center;gap:' + CapyUI.AppSpacing.x2 + 'px">' +
            (t.icon ? icon(t.icon, CapyUI.AppSizes.iconSm, t.accent || c.inkSubtle) : '') +
            '<span style="flex:1;' + textStyle(CapyUI.AppText.label, c.inkSubtle) + 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(t.caption) + '</span>' +
            (t.onPressed ? icon(t.actionIcon || 'edit', CapyUI.AppSizes.iconSm, c.inkSubtle) : '') + '</div>';
          h += '<div data-telmosaic="' + esc(t.key || '') + '" role="button" tabindex="' + (t.onPressed ? '0' : '-1') + '" title="' + esc(t.onPressed ? (t.editLabel || t.caption) : t.caption) + '" style="grid-column:span ' + t.span.columns + ';grid-row:span ' + t.span.rows + ';' +
            'background:' + c.control + ';border-radius:' + CapyUI.AppRadii.md + 'px;padding:' + CapyUI.AppSpacing.x4 + 'px;' +
            'display:flex;flex-direction:column;justify-content:space-between;min-width:0;min-height:0;cursor:' + (t.onPressed ? 'pointer' : 'default') + ';text-align:left;user-select:none' +
            (t.onPressed ? '' : ';pointer-events:none') + '">' + head +
            '<div style="margin-top:' + CapyUI.AppSpacing.x2 + 'px;overflow:hidden;align-self:flex-start">' + metricValue(t.value, t.unit != null ? t.unit : null, size) + '</div></div>';
        } else {
          h += '<div></div>';
        }
      }
    }
    return h + '</div>';
  }

  /* ── category_menu.dart: рельс категорий (320px) ── */
  function categoryRail(o) {
    var c = theme();
    var S = CapyUI.AppSizes;
    var h = '<div style="width:' + S.categoryMenuRailWidth + 'px;flex:none;display:flex;flex-direction:column;min-height:0;padding:' + CapyUI.AppSpacing.x4 + 'px">';
    for (var i = 0; i < o.entries.length; i++) {
      var e = o.entries[i];
      var sel = e.value === o.selected;
      var fg = sel ? c.onSelection : c.ink;
      h += '<button data-telcat="' + esc(e.value) + '" style="display:flex;align-items:center;gap:' + CapyUI.AppSpacing.x3 + 'px;width:100%;min-height:' + S.minTouchTarget + 'px;margin-bottom:' + CapyUI.AppSpacing.x1 + 'px;padding:' + CapyUI.AppSpacing.x2 + 'px ' + CapyUI.AppSpacing.x4 + 'px;border:0;cursor:pointer;font-family:inherit;border-radius:' + CapyUI.AppRadii.md + 'px;background:' + (sel ? c.selectionFill : c.surface) + ';text-align:left">' +
        icon(e.icon, S.iconMd, fg) +
        '<span style="flex:1;' + textStyle(sel ? CapyUI.AppText.bodyStrong : CapyUI.AppText.body, fg) + '">' + esc(e.label) + '</span></button>';
    }
    return h + '</div>';
  }

  /* ── day_section_header.dart ── */
  function daySectionHeader(group) {
    var c = theme();
    var tripLabel = group.tripCount === 1 ? '1 поездка' : group.tripCount + ' поездок';
    var distStr = group.totalDistanceKm.toFixed(group.totalDistanceKm >= 100 ? 0 : 1);
    var energyStr = group.totalNetKwh.toFixed(2);
    return '<div style="padding:' + CapyUI.AppSpacing.x1 + 'px ' + CapyUI.AppSpacing.x2 + 'px">' +
      '<div style="' + textStyle(CapyUI.AppText.cardTitle, c.ink) + '">' + esc(tripDayTitle(group.date)) + '</div>' +
      '<div style="margin-top:' + CapyUI.AppSpacing.x1 + 'px;' + textStyle(CapyUI.AppText.caption, c.inkMuted) + '">' +
      esc(tripLabel + ' • ' + distStr + ' км • ' + energyStr + ' кВт·ч') + '</div></div>';
  }

  /* ── trip_session_card.dart: _formatDurationMinutes (карточка, не график) ── */
  function tripCardDuration(ms) {
    if (ms == null) return '--';
    var totalMin = Math.round(ms / 60000);
    if (totalMin < 60) return totalMin + ' мин';
    return Math.floor(totalMin / 60) + ' ч ' + (totalMin % 60) + ' мин';
  }

  /* _ExpandedTripCard (ГУ/landscape): карта 140×140 + таймлайн + колонка
     метрик 155px. pt-BR подписи карточки переведены (RU-only). */
  function tripSessionCard(o) {
    var c = theme();
    var SP = CapyUI.AppSpacing;
    var e = o.entry;
    var distStr = e.distanceKm != null ? e.distanceKm.toFixed(e.distanceKm >= 100 ? 0 : 1) : '--';
    var energyStr = e.netEnergyKwh != null ? e.netEnergyKwh.toFixed(2) : '--';
    var speedStr = e.avgSpeedKmh != null ? String(Math.round(e.avgSpeedKmh)) : '--';
    var durationStr = tripCardDuration(e.durationMillis);
    var startLoc = tripDisplayStartLocation(e) || TEL_L10N.tripStartPlaceholder;
    var endLoc = tripDisplayEndLocation(e) || TEL_L10N.tripEndPlaceholder;
    function clock(ms) { return historyClock(ms); }
    function metricRow(ic, label, value, unit) {
      return '<div style="display:flex;align-items:center;gap:' + SP.x2 + 'px">' +
        '<span style="flex:none;width:28px;height:28px;border-radius:' + CapyUI.AppRadii.sm + 'px;background:' + c.control + ';display:flex;align-items:center;justify-content:center">' + icon(ic, 16, c.ink) + '</span>' +
        '<span style="flex:1;min-width:0;overflow:hidden">' +
        '<span style="display:flex;align-items:baseline;justify-content:flex-start;overflow:hidden">' +
        '<span style="' + textStyle(CapyUI.AppText.bodyStrong, c.ink) + 'white-space:nowrap">' + esc(value) + '</span>' +
        (unit ? '<span style="margin-left:2px;' + textStyle(CapyUI.AppText.caption, c.inkMuted) + '">' + esc(unit) + '</span>' : '') +
        '</span>' +
        '<span style="display:block;' + textStyle(CapyUI.AppText.caption, c.inkMuted) + 'font-size:9px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(label) + '</span>' +
        '</span></div>';
    }
    var timeline = '<div>' +
      '<div style="display:flex;align-items:flex-start"><span style="flex:none;width:12px;height:12px;margin-top:3px;border-radius:50%;border:2.5px solid ' + c.ink + '"></span>' +
      '<span style="margin-left:' + SP.x3 + 'px;flex:1;min-width:0;' + textStyle(CapyUI.AppText.bodyStrong, c.ink) + 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(startLoc) + '</span>' +
      '<span style="margin-left:' + SP.x2 + 'px;' + textStyle(CapyUI.AppText.caption, c.inkMuted) + '">' + clock(e.startedAtUtcMillis) + '</span></div>' +
      '<div style="margin-left:5px;width:2px;height:16px;background:' + c.inkMuted + ';opacity:.3"></div>' +
      '<div style="display:flex;align-items:flex-start"><span style="flex:none;width:12px;height:12px;margin-top:3px;border-radius:50%;background:' + c.energy.draw + '"></span>' +
      '<span style="margin-left:' + SP.x3 + 'px;flex:1;min-width:0;' + textStyle(CapyUI.AppText.bodyStrong, c.ink) + 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(endLoc) + '</span>' +
      '<span style="margin-left:' + SP.x2 + 'px;' + textStyle(CapyUI.AppText.caption, c.inkMuted) + '">' + clock(e.endedAtUtcMillis) + '</span></div></div>';
    var miniMap = routePreviewMap({ points: e.routePoints, size: 140 });
    return '<button data-teltrip="' + esc(e.id) + '" style="display:flex;gap:' + SP.x5 + 'px;width:100%;padding:' + SP.cardPadding + 'px;border:' + (o.selected ? '2px solid ' + c.energy.focus : '0') + ';border-radius:' + CapyUI.AppRadii.xl + 'px;background:' + (o.selected ? c.control : c.surface) + ';cursor:pointer;font-family:inherit;text-align:left">' +
      miniMap +
      '<div style="flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center">' +
      '<div style="' + textStyle(CapyUI.AppText.caption, c.inkMuted) + '">' + clock(e.startedAtUtcMillis) + ' — ' + clock(e.endedAtUtcMillis) + '</div>' +
      '<div style="height:' + SP.x3 + 'px"></div>' + timeline + '</div>' +
      '<div style="width:1px;flex:none;background:' + c.divider + '"></div>' +
      '<div style="width:155px;flex:none;display:flex;flex-direction:column;justify-content:space-evenly;gap:' + SP.x2 + 'px">' +
      metricRow('straighten', 'РАССТ.', distStr, 'км') +
      metricRow('bolt', 'ЭНЕРГИЯ', energyStr, 'кВт·ч') +
      metricRow('speed', 'СРЕДН.', speedStr, 'км/ч') +
      metricRow('schedule', 'ВРЕМЯ', durationStr, '') +
      '</div></button>';
  }

  /* formatDuration (mm:ss / h:mm:ss) — telemetry_format.dart, для детайла. */
  function clockDuration(ms) {
    if (ms == null) return '--';
    var total = Math.floor(ms / 1000);
    var h = Math.floor(total / 3600), m = Math.floor(total / 60) % 60, sec = total % 60;
    var mm = String(m).padStart(2, '0'), ss = String(sec).padStart(2, '0');
    return h === 0 ? mm + ':' + ss : h + ':' + mm + ':' + ss;
  }

  /* ── route_preview_map.dart: статичная SVG-мини-карта (без тайлов —
     офлайн-адаптация, документирована в README стадии) ── */
  function validRoutePoints(points) {
    return (points || []).filter(function (p) {
      return isFinite(p.latitude) && isFinite(p.longitude) &&
        Math.abs(p.latitude) <= 90 && Math.abs(p.longitude) <= 180 &&
        !(p.latitude === 0 && p.longitude === 0);
    });
  }
  function projectPoints(points, w, h, pad) {
    var minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
    points.forEach(function (p) {
      minLat = Math.min(minLat, p.latitude); maxLat = Math.max(maxLat, p.latitude);
      minLon = Math.min(minLon, p.longitude); maxLon = Math.max(maxLon, p.longitude);
    });
    var spanLat = Math.max(maxLat - minLat, 1e-6), spanLon = Math.max(maxLon - minLon, 1e-6);
    var scale = Math.min((w - pad * 2) / spanLon, (h - pad * 2) / spanLat);
    var offX = (w - spanLon * scale) / 2, offY = (h - spanLat * scale) / 2;
    return points.map(function (p) {
      return { x: offX + (p.longitude - minLon) * scale, y: h - offY - (p.latitude - minLat) * scale };
    });
  }
  function routePreviewMap(o) {
    var c = theme();
    var size = o.size || 140;
    var valid = validRoutePoints(o.points);
    if (!valid.length) {
      return '<div style="flex:none;width:' + size + 'px;height:' + size + 'px;border-radius:' + CapyUI.AppRadii.lg + 'px;background:' + c.control + ';display:flex;align-items:center;justify-content:center">' + icon('map_outlined', 28, c.inkMuted) + '</div>';
    }
    var pts = projectPoints(valid, size, size, CapyUI.AppSpacing.x3);
    var d = '';
    for (var i = 0; i < pts.length; i++) d += (i ? 'L' : 'M') + pts[i].x.toFixed(1) + ' ' + pts[i].y.toFixed(1);
    var start = pts[0], end = pts[pts.length - 1];
    return '<div style="flex:none;width:' + size + 'px;height:' + size + 'px;border-radius:' + CapyUI.AppRadii.lg + 'px;background:' + c.canvas + ';overflow:hidden">' +
      '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '">' +
      (pts.length >= 2 ? '<path d="' + d + '" fill="none" stroke="' + c.surface + '" stroke-opacity=".7" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/>' +
        '<path d="' + d + '" fill="none" stroke="' + c.energy.focus + '" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/>' : '') +
      '<circle cx="' + start.x.toFixed(1) + '" cy="' + start.y.toFixed(1) + '" r="7" fill="' + c.surface + '" stroke="' + c.ink + '" stroke-width="2.5"/>' +
      (pts.length >= 2 ? '<circle cx="' + end.x.toFixed(1) + '" cy="' + end.y.toFixed(1) + '" r="7" fill="' + c.energy.draw + '" stroke="' + c.surface + '" stroke-width="2"/>' : '') +
      '</svg></div>';
  }

  /* ── route_map_card.dart (SVG-порт). Карта без тайлов: линия на «плашке»
     surface, сегменты по скорости звена (среднее концов), без скорости —
     inkSubtle, постоянная скорость — ramp[2]; ступени ramp — как в Dart
     (floor(position*4)). Маркеры: 1 точка — place·draw; ≥2 — play_arrow·gain
     и flag·draw на плашках. Легенда-градиент от ≥320px ширины. ── */
  function routeMapCard(o) {
    var c = theme();
    var SP = CapyUI.AppSpacing;
    var points = o.points || [];
    var valid = validRoutePoints(points);
    var plateA = 0.82;
    var toggle = o.onToggle ? '<button data-telmaptoggle="1" title="' + esc(o.expanded ? (o.collapseLabel || '') : (o.expandLabel || '')) + '" style="position:absolute;top:' + SP.x2 + 'px;right:' + SP.x2 + 'px;z-index:2;width:48px;height:48px;border:0;cursor:pointer;border-radius:' + CapyUI.AppRadii.md + 'px;background:' + c.surface + ';background:color-mix(in srgb, ' + c.surface + ' ' + Math.round(plateA * 100) + '%, transparent);display:flex;align-items:center;justify-content:center">' +
      icon(o.expanded ? 'close_fullscreen' : 'open_in_full', CapyUI.AppSizes.iconMd, c.ink) + '</button>' : '';
    function marker(x, y, ic, color) {
      return '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="16" fill="' + c.surface + '" fill-opacity="' + plateA + '" stroke="' + color + '" stroke-width="2"/>' +
        '<g transform="translate(' + (x - 11) + ',' + (y - 11) + ')">' + icon(ic, 22, color) + '</g>';
    }
    if (!valid.length) {
      return '<div style="position:relative;flex:1;min-height:0;background:' + c.control + ';border-radius:' + CapyUI.AppRadii.xl + 'px">' + toggle + '</div>';
    }
    /* RouteSpeedScale.fromPoints: скорость звена = среднее концов. */
    var slowest = null, fastest = null;
    function legSpeed(i) {
      var a = points[i - 1].speedKmh, b = points[i].speedKmh;
      if (a == null || !isFinite(a)) return b;
      if (b == null || !isFinite(b)) return a;
      return (a + b) / 2;
    }
    for (var i = 1; i < points.length; i++) {
      var sp = legSpeed(i);
      if (sp == null || !isFinite(sp) || sp < 0) continue;
      if (slowest == null || sp < slowest) slowest = sp;
      if (fastest == null || sp > fastest) fastest = sp;
    }
    var hasSpeed = slowest != null && fastest != null;
    var ramp = [c.energy.focus, c.energy.gain, c.energy.draw, c.energy.critical];
    function colorFor(sp) {
      if (sp == null || !isFinite(sp) || !hasSpeed) return c.inkSubtle;
      if (Math.abs(fastest - slowest) < 0.1) return ramp[2];
      var position = Math.min(1, Math.max(0, (sp - slowest) / (fastest - slowest)));
      return ramp[Math.min(ramp.length - 1, Math.floor(position * ramp.length))];
    }
    var W = 600, H = 600;
    var pts = projectPoints(valid, W, H, SP.x4);
    var svg = '<svg width="100%" height="100%" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" style="display:block">';
    function px(pt) { return pt.x.toFixed(1) + ' ' + pt.y.toFixed(1); }
    if (pts.length >= 2) {
      var plate = '';
      for (var j = 0; j < pts.length; j++) plate += (j ? 'L' : 'M') + px(pts[j]);
      svg += '<path d="' + plate + '" fill="none" stroke="' + c.surface + '" stroke-opacity="' + plateA + '" stroke-width="10" stroke-linejoin="round" stroke-linecap="round"/>';
      for (var k = 1; k < pts.length; k++) {
        svg += '<path d="M' + px(pts[k - 1]) + 'L' + px(pts[k]) + '" fill="none" stroke="' + colorFor(legSpeed(k)) + '" stroke-width="6.5" stroke-linecap="round"/>';
      }
    }
    if (pts.length === 1) {
      svg += marker(pts[0].x, pts[0].y, 'place', c.energy.draw);
    } else {
      svg += marker(pts[0].x, pts[0].y, 'play_arrow', c.energy.gain);
      svg += marker(pts[pts.length - 1].x, pts[pts.length - 1].y, 'flag', c.energy.draw);
    }
    svg += '</svg>';
    var legend = (hasSpeed && o.speedLegend) ? '<div style="position:absolute;right:' + SP.x2 + 'px;bottom:' + SP.x2 + 'px;z-index:2;width:180px;padding:' + SP.x2 + 'px;border-radius:' + CapyUI.AppRadii.md + 'px;background:' + c.surface + ';background:color-mix(in srgb, ' + c.surface + ' ' + Math.round(plateA * 100) + '%, transparent)">' +
      '<div style="display:flex;gap:' + SP.x2 + 'px">' +
      '<span style="flex:1;' + textStyle(CapyUI.AppText.caption, c.ink) + 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(o.speedLegend.slowLabel) + '</span>' +
      '<span style="flex:1;' + textStyle(CapyUI.AppText.caption, c.ink) + 'text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(o.speedLegend.fastLabel) + '</span></div>' +
      '<div style="margin-top:' + SP.x1 + 'px;height:8px;border-radius:' + CapyUI.AppRadii.full + 'px;background:linear-gradient(90deg,' + ramp.join(',') + ')"></div></div>' : '';
    return '<div style="position:relative;flex:1;min-height:0;background:' + c.canvas + ';border-radius:' + CapyUI.AppRadii.xl + 'px;overflow:hidden">' + toggle + svg + legend + '</div>';
  }

  /* ── history_list.dart: HistoryRow (зарядки) ── */
  function historyRow(o) {
    var c = theme();
    var SP = CapyUI.AppSpacing;
    var fg = o.selected ? c.onSelection : c.ink;
    var h = '<button data-telhist="' + esc(o.key) + '" style="display:flex;align-items:center;width:100%;min-height:' + CapyUI.AppSizes.minTouchTarget + 'px;margin-bottom:' + SP.x2 + 'px;padding:' + SP.x3 + 'px ' + SP.x4 + 'px;border:0;cursor:pointer;font-family:inherit;border-radius:' + CapyUI.AppRadii.md + 'px;background:' + (o.selected ? c.selectionFill : c.surface) + ';text-align:left">' +
      '<div style="flex:3;min-width:0">' +
      '<div style="' + textStyle(CapyUI.AppText.bodyStrong, fg) + 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(o.title) + '</div>' +
      '<div style="' + textStyle(CapyUI.AppText.label, o.selected ? fg : c.inkSubtle) + 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(o.status) + '</div></div>';
    for (var i = 0; i < o.facts.length; i++) {
      h += '<div style="flex:2;min-width:0;' + textStyle(CapyUI.AppText.body, fg) + 'text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(o.facts[i]) + '</div>';
    }
    return h + '</button>';
  }

  /* ══════════ Stage T3: компоненты экрана зарядки (capy_ui) ══════════ */

  /* ── metric_value.dart: MetricValue/MetricWithCaption ── */
  var METRIC_STYLES = {
    xl: { v: CapyUI.AppText.metricXl, u: CapyUI.AppText.unitLg, gap: CapyUI.AppSpacing.x2 },
    lg: { v: CapyUI.AppText.metricLg, u: CapyUI.AppText.unitLg, gap: CapyUI.AppSpacing.x2 },
    md: { v: CapyUI.AppText.metricMd, u: CapyUI.AppText.unitMd, gap: CapyUI.AppSpacing.x1 },
    sm: { v: CapyUI.AppText.metricSm, u: CapyUI.AppText.unitMd, gap: CapyUI.AppSpacing.x1 }
  };
  function metricValue(value, unit, size, valueColor, unitColor) {
    var c = theme();
    var st = METRIC_STYLES[size || 'xl'] || METRIC_STYLES.xl;
    return '<span style="display:inline-flex;align-items:baseline">' +
      '<span style="' + textStyle(st.v, valueColor || c.ink) + 'white-space:nowrap">' + esc(value) + '</span>' +
      (unit != null ? '<span style="margin-left:' + st.gap + 'px;' + textStyle(st.u, unitColor || c.ink) + '">' + esc(unit) + '</span>' : '') +
      '</span>';
  }
  function metricWithCaption(o) {
    var c = theme();
    return '<div style="display:flex;flex-direction:column;align-items:flex-start">' +
      metricValue(o.value, o.unit, o.size) +
      (o.caption != null ? '<div style="margin-top:' + CapyUI.AppSpacing.x2 + 'px;' + textStyle(CapyUI.AppText.label, c.inkMuted) + '">' + esc(o.caption) + '</div>' : '') +
      '</div>';
  }

  /* ── soft_action_tile.dart ── */
  function softActionTile(o) {
    var c = theme();
    var enabled = !o.disabled; /* onPressed: null — плитка неоперабельна */
    var active = enabled && !!o.selected;
    var fg = !enabled ? c.inkSubtle : (active ? c.onSelection : c.ink);
    var glyph = !enabled ? c.inkSubtle : (o.iconColor || fg);
    return '<button data-telsoft="' + esc(o.key) + '"' + (enabled ? '' : ' data-disabled="1" aria-disabled="true"') + ' style="display:flex;align-items:center;justify-content:' +
      (o.centered ? 'center' : 'flex-start') + ';gap:' + CapyUI.AppSpacing.x3 + 'px;width:100%;height:' +
      (o.height || CapyUI.AppSizes.actionRowHeight) + 'px;padding:0 ' + CapyUI.AppSpacing.x4 + 'px;border:0;cursor:' + (enabled ? 'pointer' : 'default') + ';' +
      'font-family:inherit;border-radius:' + CapyUI.AppRadii.md + 'px;background:' + (active ? c.selectionFill : c.control) + ';' +
      textStyle(CapyUI.AppText.bodyStrong, fg) + '">' +
      (o.icon ? icon(o.icon, CapyUI.AppSizes.iconMd, glyph) : '') +
      '<span style="flex:1;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(o.label) + '</span></button>';
  }

  /* ── selectable_tile.dart (пресеты лимита) ── */
  function selectableTile(o) {
    var c = theme();
    var sel = !!o.selected;
    return '<button data-telpreset="' + o.target + '" style="display:flex;flex-direction:column;justify-content:center;' +
      'align-items:flex-start;height:' + (o.height || CapyUI.AppSizes.presetTileHeight) + 'px;padding:0 ' + CapyUI.AppSpacing.x4 + 'px;' +
      'border:0;cursor:pointer;font-family:inherit;border-radius:' + CapyUI.AppRadii.md + 'px;' +
      'background:' + (sel ? c.selectionFill : c.control) + ';width:100%">' +
      '<span style="' + textStyle(CapyUI.AppText.bodyStrong, sel ? c.onSelection : c.ink) + '">' + esc(o.value) + '</span>' +
      '<span style="margin-top:' + CapyUI.AppSpacing.x1 + 'px;' + textStyle(CapyUI.AppText.body, sel ? c.onSelection : c.inkMuted) + '">' + esc(o.label) + '</span></button>';
  }

  /* ── text_tab_bar.dart (Уровень | График) ── */
  function textTabBar(items, selected, key) {
    var c = theme();
    var h = '<div style="display:flex;align-items:center;gap:' + CapyUI.AppSpacing.x6 + 'px">';
    for (var i = 0; i < items.length; i++) {
      var sel = items[i].value === selected;
      var style = CapyUI.AppText.tabLabel;
      h += '<button data-teltab="' + esc(key) + '" data-val="' + esc(items[i].value) + '" style="min-width:' + CapyUI.AppSizes.minTouchTarget + 'px;height:' + CapyUI.AppSizes.minTouchTarget + 'px;border:0;background:transparent;cursor:pointer;font-family:inherit;border-radius:' + CapyUI.AppRadii.sm + 'px;' +
        'font-family:' + CapyUI.AppText.family + ',system-ui,sans-serif;font-size:' + style.size + 'px;line-height:' + style.height + ';letter-spacing:' + (style.letterSpacing || 0) + 'px;font-weight:' + (sel ? 700 : 600) + ';color:' + (sel ? c.ink : c.inkSubtle) + '">' + esc(items[i].label) + '</button>';
    }
    return h + '</div>';
  }

  /* ── breathing_warning_banner.dart ── */
  function breathingWarningBanner(o) {
    var c = theme();
    return '<div style="display:flex;align-items:center;gap:' + CapyUI.AppSpacing.x4 + 'px;padding:' + CapyUI.AppSpacing.x4 + 'px;border-radius:' + CapyUI.AppRadii.xl + 'px;overflow:hidden">' +
      '<span style="position:relative;flex:none;width:48px;height:48px;display:flex;align-items:center;justify-content:center">' +
      '<i class="telBreathe" style="position:absolute;inset:0;border-radius:50%;background:' + o.color + ';opacity:.26"></i>' +
      '<i class="telBreathe2" style="position:absolute;inset:0;border-radius:50%;background:' + o.color + ';opacity:.12"></i>' +
      '<span style="position:relative;width:32px;height:32px;border-radius:50%;background:' + o.color + ';display:flex;align-items:center;justify-content:center">' + icon(o.icon || 'thermostat', 20, '#FFFFFF') + '</span></span>' +
      '<div style="flex:1;min-width:0"><div style="' + textStyle(CapyUI.AppText.cardTitle, c.ink) + '">' + esc(o.title) + '</div>' +
      '<div style="margin-top:' + CapyUI.AppSpacing.x1 + 'px;' + textStyle(CapyUI.AppText.body, c.inkMuted) + '">' + esc(o.message) + '</div></div></div>';
  }

  /* ── charging_amperage_dialog.dart (контент anchored-панели) ── */
  function chargingAmperageDialog(o) {
    var c = theme();
    var S = CapyUI.AppSizes;
    var h = '<div style="height:' + S.amperageDialogHeight + 'px;padding:' + CapyUI.AppSpacing.x6 + 'px ' + CapyUI.AppSpacing.x6 + 'px ' + CapyUI.AppSpacing.x5 + 'px;display:flex;flex-direction:column;align-items:flex-start">';
    h += '<div style="' + textStyle(CapyUI.AppText.cardTitle, c.ink) + '">' + esc(o.title) + '</div>';
    h += '<div style="margin-top:' + CapyUI.AppSpacing.x3 + 'px;' + textStyle(CapyUI.AppText.body, c.inkMuted) + '">' + esc(o.description) + '</div>';
    h += '<div style="margin-top:' + CapyUI.AppSpacing.x4 + 'px;' + textStyle(CapyUI.AppText.label, c.inkSubtle) + '">' + esc(o.defaultLabel) + '</div>';
    h += '<div style="flex:1"></div>';
    h += metricValue(String(o.value), o.unit, 'xl', c.inkMuted, c.inkSubtle);
    h += '<div style="height:' + CapyUI.AppSpacing.x5 + 'px"></div>';
    h += '<div style="display:flex;gap:' + CapyUI.AppSpacing.x1 + 'px;width:100%">' +
      '<button data-telamps="-1" style="flex:1;height:' + S.amperageDialogStepHeight + 'px;border:0;cursor:pointer;border-radius:' + CapyUI.AppRadii.sm + 'px;background:' + c.control + ';display:flex;align-items:center;justify-content:center;' + (o.value <= o.min ? 'opacity:.4;pointer-events:none' : '') + '">' + icon('keyboard_arrow_down', CapyUI.AppSizes.iconLg, c.inkMuted) + '</button>' +
      '<button data-telamps="1" style="flex:1;height:' + S.amperageDialogStepHeight + 'px;border:0;cursor:pointer;border-radius:' + CapyUI.AppRadii.sm + 'px;background:' + c.control + ';display:flex;align-items:center;justify-content:center;' + (o.value >= o.max ? 'opacity:.4;pointer-events:none' : '') + '">' + icon('keyboard_arrow_up', CapyUI.AppSizes.iconLg, c.inkMuted) + '</button></div>';
    return h + '</div>';
  }

  /* ── charge_session_summary_card.dart ── */
  function chargeSessionSummaryCard(o) {
    var c = theme();
    var h = appCard({ title: o.title, subtitle: o.duration, fill: true, child: (function () {
      var inner = '<div class="telSessionBody" id="telChargeRing" style="flex:1;min-height:0;display:flex;flex-direction:column"></div>';
      inner += '<div style="height:' + CapyUI.AppSpacing.x5 + 'px"></div>';
      inner += iconValueGrid([
        { icon: 'battery_full', value: o.batteryEnergyLabel },
        { icon: 'thermostat', value: o.climateEnergyLabel }
      ]);
      return inner;
    })() });
    return h;
  }

  /* ── money_keypad_dialog.dart (контент anchored-панели) ── */
  function moneyKeypadDialog(o) {
    var c = theme();
    var S = CapyUI.AppSizes, SP = CapyUI.AppSpacing;
    var h = '<div style="padding:' + SP.x6 + 'px ' + SP.x6 + 'px ' + SP.x5 + 'px;display:flex;flex-direction:column;align-items:flex-start;width:340px;max-width:80vw">';
    h += '<div style="' + textStyle(CapyUI.AppText.cardTitle, c.ink) + '">' + esc(o.title) + '</div>';
    h += '<div style="margin-top:' + SP.x3 + 'px;' + textStyle(CapyUI.AppText.body, c.inkMuted) + '">' + esc(o.description) + '</div>';
    if (o.fields.length > 1) {
      h += '<div style="margin-top:' + SP.x4 + 'px;width:100%">' + trackSegmentedControl(
        o.fields.map(function (f) { return { value: f.value, label: f.label }; }),
        o.selected, 'moneyfield') + '</div>';
    }
    h += '<div style="margin-top:' + SP.x5 + 'px;width:100%;display:flex;align-items:baseline;padding:' + SP.x5 + 'px ' + SP.x4 + 'px;border-radius:' + CapyUI.AppRadii.md + 'px;background:' + c.control + '">' +
      '<span style="' + textStyle(CapyUI.AppText.unitLg, c.inkMuted) + '">' + esc(o.currencySymbol) + '</span>' +
      '<span style="flex:1;text-align:right;' + textStyle(CapyUI.AppText.metricLg, c.ink) + '">' + esc(o.display) + '</span>' +
      (o.unit != null ? '<span style="margin-left:' + SP.x2 + 'px;' + textStyle(CapyUI.AppText.unitLg, c.inkSubtle) + '">' + esc(o.unit) + '</span>' : '') +
      '</div>';
    h += '<div style="margin-top:' + SP.x5 + 'px;width:100%">';
    for (var row = 0; row < 3; row++) {
      if (row > 0) h += '<div style="height:' + SP.x2 + 'px"></div>';
      h += '<div style="display:flex;gap:' + SP.x2 + 'px">';
      for (var col = 1; col <= 3; col++) {
        var d = row * 3 + col;
        h += '<button data-teldigit="' + d + '" style="flex:1;height:' + CapyUI.AppSizes.minTouchTarget + 'px;border:0;cursor:pointer;font-family:inherit;border-radius:' + CapyUI.AppRadii.md + 'px;background:' + c.control + ';' + textStyle(CapyUI.AppText.metricSm, c.ink) + '">' + d + '</button>';
      }
      h += '</div>';
    }
    h += '<div style="height:' + SP.x2 + 'px"></div><div style="display:flex;gap:' + SP.x2 + 'px">';
    h += '<button data-telkey="clear" style="flex:1;height:' + CapyUI.AppSizes.minTouchTarget + 'px;border:0;cursor:pointer;border-radius:' + CapyUI.AppRadii.md + 'px;background:' + c.control + ';display:flex;align-items:center;justify-content:center">' + icon('clear', CapyUI.AppSizes.iconMd, c.inkMuted) + '</button>';
    h += '<button data-teldigit="0" style="flex:1;height:' + CapyUI.AppSizes.minTouchTarget + 'px;border:0;cursor:pointer;font-family:inherit;border-radius:' + CapyUI.AppRadii.md + 'px;background:' + c.control + ';' + textStyle(CapyUI.AppText.metricSm, c.ink) + '">0</button>';
    h += '<button data-telkey="delete" style="flex:1;height:' + CapyUI.AppSizes.minTouchTarget + 'px;border:0;cursor:pointer;border-radius:' + CapyUI.AppRadii.md + 'px;background:' + c.control + ';display:flex;align-items:center;justify-content:center">' + icon('backspace', CapyUI.AppSizes.iconMd, c.inkMuted) + '</button>';
    h += '</div></div>';
    h += '<div style="margin-top:' + SP.x4 + 'px;width:100%"><button data-telkey="save" style="width:100%;height:' + CapyUI.AppSizes.actionRowHeight + 'px;border:0;cursor:pointer;font-family:inherit;border-radius:' + CapyUI.AppRadii.md + 'px;background:' + c.selectionFill + ';' + textStyle(CapyUI.AppText.bodyStrong, c.onSelection) + '">' + esc(o.saveLabel) + '</button></div>';
    return h + '</div>';
  }

  /* ── limit_slider.dart (SVG-порт: трек, заполнение, тики, ручка, выноски) ── */
  var LimitSlider = (function () {
    function LimitSlider(mount) { this.mount = mount; this._raf = null; this._flow0 = 0; }
    LimitSlider.prototype = {
      update: function (cfg) {
        this._cfg = cfg;
        this._render();
      },
      _render: function () {
        var cfg = this._cfg;
        if (!cfg) return;
        var c = telUI.theme();
        var S = CapyUI.AppSizes, SP = CapyUI.AppSpacing;
        var width = this.mount.clientWidth || 400;
        var H = S.limitSliderHeight;
        var min = cfg.min != null ? cfg.min : 50, max = cfg.max != null ? cfg.max : 100;
        var value = clamp(cfg.value, min, max);
        var current = cfg.current != null ? clamp(cfg.current, 0, max) : null;
        function fraction(v) { return clamp(v / max, 0, 1); }
        function posFor(v) {
          var endCapCenter = Math.min(H / 2, width / 2);
          var start = Math.max(endCapCenter, fraction(min) * width);
          var end = width - endCapCenter;
          if (end <= start) return width / 2;
          return start + clamp((v - min) / (max - min), 0, 1) * (end - start);
        }
        var targetX = value >= max ? width : posFor(value);
        var currentX = current == null ? 0 : fraction(current) * width;
        var knobX = posFor(value);
        var trackH = 24, trackY = (H - trackH) / 2;

        var svg = '<svg width="' + width + '" height="' + H + '" viewBox="0 0 ' + width + ' ' + H + '" style="display:block">';
        svg += '<defs><clipPath id="ls' + this._cid() + '"><rect x="0" y="' + trackY + '" width="' + width + '" height="' + trackH + '" rx="' + trackH / 2 + '"/></clipPath></defs>';
        svg += '<rect x="0" y="' + trackY + '" width="' + width + '" height="' + trackH + '" rx="' + trackH / 2 + '" fill="' + c.control + '"/>';
        /* заполнение до текущего SOC */
        if (current != null && currentX > 0) {
          svg += '<rect x="0" y="' + trackY + '" width="' + currentX + '" height="' + trackH + '" fill="' + (c.energy.gain) + '"/>';
        }
        /* зона current→target темнее (trackColor поверх) */
        var pendingStart = current == null ? 0 : currentX;
        if (targetX > pendingStart) {
          svg += '<rect x="' + pendingStart + '" y="' + trackY + '" width="' + (targetX - pendingStart) + '" height="' + trackH + '" fill="' + c.track + '"/>';
        }
        /* маркер цели, когда цель ниже текущего SOC */
        if (current != null && targetX < currentX) {
          svg += '<rect x="' + (targetX - S.limitSliderTargetMarker / 2) + '" y="' + trackY + '" width="' + S.limitSliderTargetMarker + '" height="' + trackH + '" fill="' + c.surface + '"/>';
        }
        /* тики-гайды (видны при драге) */
        var tickOp = cfg.dragging ? 1 : 0;
        if (tickOp > 0) {
          var beyondStart = current == null ? targetX : Math.max(targetX, currentX);
          for (var tick = Math.ceil(min / 10) * 10; tick <= max + 0.0001; tick += 10) {
            var tickX = posFor(tick);
            if (tickX <= beyondStart) continue;
            svg += '<rect x="' + (tickX - S.limitSliderTickWidth / 2) + '" y="' + (H / 2 - S.limitSliderTickHeight / 2) + '" width="' + S.limitSliderTickWidth + '" height="' + S.limitSliderTickHeight + '" rx="' + S.limitSliderTickWidth / 2 + '" fill="' + c.chartNowMarker + '" opacity="' + tickOp + '"/>';
          }
        }
        svg += '</svg>';
        /* ручка (selectionFill, minTouchTarget-хитзона) */
        var knobHtml = '<div style="position:absolute;left:' + (knobX - S.minTouchTarget / 2) + 'px;top:' + ((H - S.minTouchTarget) / 2) + 'px;width:' + S.minTouchTarget + 'px;height:' + S.minTouchTarget + 'px;display:flex;align-items:center;justify-content:center">' +
          '<span style="width:' + S.limitSliderKnob + 'px;height:' + S.limitSliderKnob + 'px;border-radius:50%;background:' + c.selectionFill + ';box-shadow:0 2px 8px rgba(0,0,0,.18)"></span></div>';
        /* выноска цели над ручкой */
        var readout = '<div style="position:absolute;left:0;top:0;right:0;height:' + S.minTouchTarget + 'px;display:flex;align-items:center;justify-content:center;gap:' + SP.x1 + 'px;pointer-events:none">' +
          metricValue(cfg.valueLabel != null ? cfg.valueLabel : String(Math.round(value)), cfg.valueUnit != null ? cfg.valueUnit : '', 'lg') + '</div>';
        var capHtml = cfg.caption != null
          ? '<div style="margin-top:' + SP.x1 + 'px;' + telUI.textStyle(CapyUI.AppText.caption, c.inkMuted) + 'text-align:center">' + telUI.esc(cfg.caption) + '</div>'
          : '';
        /* текущий SOC слева (болт при зарядке) */
        var curHtml = '';
        if (current != null && cfg.currentLabel != null) {
          curHtml = '<div style="position:absolute;left:' + SP.x6 + 'px;top:0;height:' + H + 'px;display:flex;align-items:center;gap:' + SP.x2 + 'px;pointer-events:none">' +
            (cfg.isCharging ? telUI.icon('bolt', CapyUI.AppSizes.iconMd, c.energy.gain) : '') +
            metricValue(cfg.currentLabel, cfg.currentUnit || '', 'md', c.inkMuted, c.inkSubtle) + '</div>';
        }
        this.mount.innerHTML = '<div style="position:relative;-webkit-user-select:none;user-select:none">' +
          '<div style="height:' + S.minTouchTarget + 'px"></div><div style="height:' + SP.x2 + 'px"></div>' +
          '<div style="position:relative;height:' + H + 'px">' + svg + curHtml + knobHtml + '</div>' + capHtml +
          '<div style="position:relative;height:0">' + readout + '</div></div>';
        this._attachPointer(posFor, min, max);
      },
      _cid: function () { if (!this.__cid) this.__cid = Math.floor(Math.random() * 1e6); return this.__cid; },
      _attachPointer: function (posFor, min, max) {
        var self = this;
        /* Геометрия обновляется каждый рендер, но обработчики ставятся на
         * элемент ОДИН раз: переустановка сбрасывала состояние жеста посреди
         * драга (в Dart виджет переживает rebuild без потери жеста). */
        this._posFor = posFor; this._min = min; this._max = max;
        var el = this.mount;
        if (el.__telSliderWired) return;
        el.__telSliderWired = true;
        this._dragging = false;
        el.onpointerdown = function (ev) {
          self._dragging = true;
          var cfg = self._cfg;
          if (cfg && cfg.onDraggingChanged) cfg.onDraggingChanged(true);
          var r = el.getBoundingClientRect();
          self._emitAt(ev.clientX - r.left);
          ev.preventDefault();
        };
        el.onpointermove = function (ev) {
          if (!self._dragging) return;
          var r = el.getBoundingClientRect();
          self._emitAt(ev.clientX - r.left);
        };
        el.onpointerup = function () {
          if (!self._dragging) return;
          self._dragging = false;
          var cfg = self._cfg;
          if (cfg && cfg.onDraggingChanged) cfg.onDraggingChanged(false);
        };
        el.onpointercancel = el.onpointerup;
      },
      _emitAt: function (x) {
        var posFor = this._posFor, min = this._min, max = this._max, cfg = this._cfg;
        var start = posFor(min), end = posFor(max);
        var f = clamp((x - start) / (end - start), 0, 1);
        var v = min + f * (max - min);
        if (cfg && cfg.onChanged) cfg.onChanged(v);
      }
    };
    return LimitSlider;
  })();

  return {
    esc: esc, clamp: clamp, theme: theme, textStyle: textStyle, icon: icon,
    appCard: appCard, statColumn: statColumn,
    trackSegmentedControl: trackSegmentedControl,
    dropdownField: dropdownField, infoIconButton: infoIconButton,
    anchoredTooltipPanel: anchoredTooltipPanel, iconValueGrid: iconValueGrid,
    chartTooltip: chartTooltip, SegmentedDonut: SegmentedDonut,
    EnergyBarChart: EnergyBarChart, energyStateBand: energyStateBand,
    metricValue: metricValue, metricWithCaption: metricWithCaption,
    softActionTile: softActionTile, selectableTile: selectableTile,
    textTabBar: textTabBar, breathingWarningBanner: breathingWarningBanner,
    chargingAmperageDialog: chargingAmperageDialog,
    chargeSessionSummaryCard: chargeSessionSummaryCard,
    moneyKeypadDialog: moneyKeypadDialog, LimitSlider: LimitSlider,
    cycleBar: cycleBar, metricMosaic: metricMosaic, categoryRail: categoryRail,
    daySectionHeader: daySectionHeader, tripSessionCard: tripSessionCard,
    routePreviewMap: routePreviewMap, routeMapCard: routeMapCard,
    historyRow: historyRow, clockDuration: clockDuration,
    tripCardDuration: tripCardDuration
  };
})();
