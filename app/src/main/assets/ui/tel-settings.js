/* ═══════════════════════════════════════════════════════════════════════
   Stage T5 — Настройки: порт showSettingsMenu (capy e39777c):
   - settings_menu.dart: floating CategoryMenu (showCategoryMenu → скрим
     modalScrim, вход 0.97→1 за 220 мс easeOutCubic, панель
     categoryMenuWidth 1040 × categoryMenuHeight 720, рельс
     categoryMenuRailWidth 320, поиск + пустое состояние, группы с
     правилом-разделителем);
   - settings/charge_pane.dart, data_pane.dart, system_pane.dart (без
     карточек обновлений — исключено по требованию, у ГУ своя вкладка
     «Обновления»), developer_pane.dart (без projection-строки — исключено);
   - settings_pane.dart: SettingsPaneState — runAction (busy + status +
     read-back), SettingsStatusLine;
   - capy_ui/settings_blocks.dart: SettingsEntry/SettingsRows/SettingsSections;
   - capy_ui/setting_toggle_row.dart, confirm_dialog.dart, storage_usage.dart
     (formatStorageBytes).
   Категория «Экраны» (displays) исключена по требованию — потому и
   initialSelected здесь «Зарядка», а не «Экраны».
   Вкладка «Синхронизация» удалена (SyncV2Screen — Supabase, вне проекта).
   В машине значения читаются из telemetry.data.settings (read-back после
   каждого сеттера — pushData), пишутся settings.change/settings.apply и
   tool.act; в браузере — демо-фид telDemoSettings.
   ═══════════════════════════════════════════════════════════════════════ */

var telSettings = (function () {
  'use strict';

  var CATS = [
    /* первая группа — для того, кто за рулём */
    [
      { id: 'charge', label: 'Зарядка', icon: 'bolt' },
      { id: 'data', label: 'Данные', icon: 'storage' },
      { id: 'system', label: 'Система', icon: 'memory' }
    ],
    /* своя группа за правилом: разработчик — не для водителя */
    [
      { id: 'developer', label: 'Разработчик', icon: 'code' }
    ]
  ];
  var INITIAL = 'charge'; /* в Dart — displays; категория исключена */

  var kDefaultPackCapacityWh = 39600;

  var openFlag = false;
  var category = INITIAL;
  var query = '';
  var status = null;            /* SettingsStatus: {message, isError} */
  var busy = {};                /* runAction: act → busy */
  var savingCapacity = false, savingChargeCost = false;
  var storage = { loading: true, error: null, bytes: null };
  var devUnlocked = false;      /* DeveloperToolsGate (в памяти, как в Dart) */
  var keypad = null;            /* MoneyKeypadDialog: {target, digits} */
  var wipeConfirm = false;      /* showConfirmDialog поверх меню */
  var clickFn = null, inputFn = null;

  function esc(x) { return telUI.esc(x); }
  function theme() { return telUI.theme(); }
  function SP() { return CapyUI.AppSpacing; }

  /* ── l10n (arb, RU) ── */
  var L = {
    close: 'Закрыть настройки',
    search: 'Поиск',
    searchEmpty: 'Нет категории с таким названием.',
    /* категории */
    charge: 'Зарядка', data: 'Данные', system: 'Система', developer: 'Разработчик',
    /* charge pane */
    packTitle: 'Ёмкость батареи',
    packDesc: 'Размер батареи, который приложение использует во всех расчетах энергии и эффективности. Автомобиль не сообщает достоверное значение, поэтому укажите его здесь. По умолчанию: 39,60 кВт·ч.',
    packSaved: 'Ёмкость батареи установлена: {value}.',
    costTitle: 'Цена зарядки по умолчанию',
    costDesc: 'Тариф за кВт·ч для оценки стоимости зарядки. Введите значение на клавиатуре.',
    costNotSaved: 'Цена по умолчанию не задана',
    costSaved: 'Сохранено: {value}',
    costApplyTitle: 'Указать цену прошлых зарядок',
    costApplyDesc: 'Записывает ставку по умолчанию во все завершенные зарядки без цены. Зарядка с указанной суммой сохраняет ее.',
    costApply: 'Применить к зарядкам без цены',
    costApplying: 'Применение...',
    costApplied: '{count} зарядок теперь имеют ставку по умолчанию.',
    costApplyNone: 'Ни одна зарядка не нуждалась в цене.',
    costApplyNoRate: 'Сначала сохраните ставку по умолчанию.',
    disclaimerTitle: 'Отказ от ответственности',
    disclaimerDesc: 'Использование этой функции осуществляется на ваш собственный риск, так как она напрямую взаимодействует с зарядкой автомобиля и активно управляет его функциями.',
    extTitle: 'Внешнее управление зарядкой (Geely Charge Control)',
    extDesc: 'Позволяет управлять ограничением зарядки и током, делегируя действия выделенному приложению Geely Charge Control. По умолчанию Capy Energy работает только как анализатор телеметрии.',
    roemTitle: 'Заменить экран зарядки авто',
    roemDesc: 'Блокирует автоматическое окно заводского экрана зарядки и открывает это приложение на вкладке «Зарядка», когда зарядка начинается. Заводское приложение по-прежнему открывается со значка. Экран не занимается в режиме кемпинга или сна.',
    /* data pane */
    operation: 'Работа',
    autoStart: 'Автозапуск телеметрии при загрузке',
    autoStartDesc: 'Запускает нативный сборщик после загрузки автомобиля или замены пакета.',
    autoStartFailed: 'Не удалось изменить автозапуск: {error}',
    gps: 'Сбор GPS во время поездок',
    gpsDesc: 'Сохраняет широту, долготу, высоту и точность GPS в кадрах телеметрии при доступности нативного местоположения.',
    gpsError: 'ОШИБКА ОБНОВЛЕНИЯ GPS: {error}',
    btTitle: 'Держать Bluetooth включённым',
    btDesc: 'Снова включает радио автомобиля, когда оно выключается, чтобы телефон продолжал получать данные в реальном времени. Автомобиль выключает радио сам.',
    btFailed: 'НЕ УДАЛОСЬ ДЕРЖАТЬ BLUETOOTH ВКЛЮЧЁННЫМ: {error}',
    cont: 'Непрерывная запись',
    contDesc: 'Записывает одну минуту энергии за каждую минуту работы автомобиля, даже на стоянке или на нейтральной передаче. Выключение сохраняет уже записанные данные.',
    contFailed: 'ОШИБКА НЕПРЕРЫВНОЙ ЗАПИСИ: {error}',
    storageTitle: 'Хранилище',
    storageEntry: 'Сохранённая история',
    storageDesc: 'Сколько места занимает сохранённая история. Измеряется без сканирования каждой записи.',
    storageLoading: 'Проверка…',
    storageFailed: 'Ошибка проверки хранилища: {error}',
    storageValue: 'Использовано {size}',
    retentionTitle: 'Хранение',
    retention: 'Хранение сырых данных',
    retentionDesc: 'Сохраняет историю поездок и зарядок, уплотняет завершённые сеансы и удаляет сырые кадры/события старше 30 дней.',
    retentionRun: 'ЗАПУСТИТЬ ХРАНЕНИЕ',
    retentionRunning: 'ВЫПОЛНЯЕТСЯ',
    retentionDone: 'Очистка завершена: удалено кадров — {frames}, сырые данные хранятся {days} дн.',
    retentionFailed: 'ОШИБКА ХРАНЕНИЯ: {error}',
    danger: 'Удаление',
    wipe: 'Стереть локальную базу телеметрии',
    wipeDesc: 'Навсегда удаляет все сеансы поездок, зарядок, кадры и события телеметрии одной операцией.',
    wipeHistory: 'ОЧИСТИТЬ ИСТОРИЮ',
    wiping: 'ОЧИСТКА',
    wipeDialogTitle: 'ОЧИСТИТЬ ИСТОРИЮ',
    wipeDialogContent: 'Это навсегда удаляет все строки локальной базы данных телеметрии. Журналы зарядки нельзя удалить по отдельности, и это действие невозможно отменить.',
    wipeAll: 'ОЧИСТИТЬ ВСЁ',
    wipeDone: 'Удалено: поездок — {trips}, зарядок — {charges}, кадров — {frames}.',
    wipeFailed: 'Не удалось удалить: {error}',
    cancel: 'ОТМЕНА',
    /* system pane */
    about: 'О ПРИЛОЖЕНИИ',
    appVersion: 'Версия {version} (сборка {build})',
    aboutDeveloper: 'Разработано {handle}',
    aboutTagline: 'Сделано с любовью и кофе',
    /* developer pane */
    devMode: 'Режим разработчика',
    devModeDesc: 'Показывает инженерные экраны: Roadcast Trace и Signal Lab.',
    engineering: 'Инженерные экраны',
    eventFile: 'Файл журнала событий (отладка)',
    eventFileDesc: 'Дублирует события телеметрии в файл JSONL для отладки. Занимает дополнительное место; при отключении существующие файлы удаляются.',
    eventFileFailed: 'Не удалось изменить журнал событий: {error}',
    resend: 'Отправить историю в облако заново',
    resendDesc: 'Отмечает все поездки и зарядки этого автомобиля для повторной выгрузки. Используйте после удаления данных в облаке для теста. Выгрузка начнётся при следующем sync.',
    resendAction: 'ОТМЕТИТЬ ДЛЯ ВЫГРУЗКИ',
    resendDone: 'Отмечено записей: {count}. Они выгрузятся при следующем sync.',
    resendFailed: 'Не удалось отметить историю: {error}',
    traceTitle: 'ROADCAST ТРЕЙС',
    traceDesc: 'Читает согласованную схему CAN и текущее значение каждого сигнала.',
    sensorLabTitle: 'Лаборатория сигналов',
    sensorLabDesc: 'Инженерный вид всех сигналов CAN, которые декодирует демон.',
    sensorLabOpen: 'Открыть лабораторию сигналов',
    labTitle: 'Лаборатория датчиков',
    labDesc: 'Наблюдайте наклон автомобиля и толчки в реальном времени во время движения.',
    labOpen: 'Открыть',
    /* keypad */
    unitKwh: 'кВт·ч',
    rateField: 'Цена/кВт·ч',
    rateUnit: '/кВт·ч',
    kpSave: 'Сохранить'
  };
  function fmt(key, params) {
    var s = L[key];
    if (!s) return '';
    if (params) for (var k in params) s = s.split('{' + k + '}').join(params[k]);
    return s;
  }

  /* ══════════ чтение/запись настроек (мост telemetry.data.settings) ══════════ */

  /* Три состояния, как в Dart: null — сборщик ещё не ответил (тумблер
     неоперабелен), true/false — прочитанный ответ. */
  function setOf(key) {
    if (!TEL.set || !(key in TEL.set)) return null;
    return !!TEL.set[key];
  }
  function packValue() {
    var v = TEL.set ? TEL.set.packWh : null;
    return v != null ? +v : kDefaultPackCapacityWh; /* никогда не null */
  }
  function rateValue() { return (TEL.set && TEL.set.rate != null) ? +TEL.set.rate : null; }
  function currency() { return (TEL.set && TEL.set.currency) || 'BRL'; }

  /* Браузерный демо-фид (в машине настройки приходят telemetry.data). */
  function telDemoSettings() {
    if (TEL.native) return;
    /* telDemoV2 отдаёт только ext/rate/currency — недостающие ключи это
       «сборщик ответил» демо-значениями, чтобы tri-state не висел в null. */
    var demo = {
      packWh: kDefaultPackCapacityWh, rate: null, currency: 'BYN',
      autoStart: true, gpsEnabled: true, continuousModeEnabled: false,
      replaceOemChargingEnabled: false, externalChargeControlEnabled: false,
      keepBluetoothOnEnabled: false, debugEventFileEnabled: false
    };
    var cur = TEL.set || {}, missing = false;
    /* демо-фид использует короткий ключ ext (канонический — как в мосте) */
    var aliases = { ext: 'externalChargeControlEnabled' };
    for (var a in aliases) {
      if (cur[a] != null && cur[aliases[a]] == null) cur[aliases[a]] = cur[a];
    }
    for (var k in demo) if (!(k in cur)) { missing = true; break; }
    if (missing) TEL.set = Object.assign({}, demo, cur);
  }

  function emit(ch, payload) {
    if (window.__geelyEmit) window.__geelyEmit(ch, payload);
  }

  /* _applySwitch: optimistic + read-back (native: pushData придёт
     telemetry.data и перерисует панель; браузер: read-back локальный). */
  function applyToggle(key, nativeKey, requested, failKey) {
    var previous = setOf(key);
    clearStatus();
    /* optimistic → запрос; read-back: в машине — бродкаст telemetry.data
       (pushData после сеттера), в браузере демо-сборщик подтверждает. */
    TEL.set[key] = requested;
    emit('settings.change', { key: nativeKey, value: requested });
    renderDetail();
    void previous; void failKey;
  }

  /* ══════════ formatStorageBytes (storage_usage.dart) ══════════ */
  function formatStorageBytes(bytes) {
    if (bytes == null || bytes < 0) return '--';
    function sep(s) { return s.replace('.', ','); } /* ru */
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) {
      var kb = bytes / 1024;
      return sep(kb.toFixed(kb >= 10 ? 0 : 1)) + ' KB';
    }
    var mb = bytes / (1024 * 1024);
    if (mb < 1024) return sep(mb.toFixed(mb >= 10 ? 1 : 2)) + ' MB';
    var gb = mb / 1024;
    return sep(gb.toFixed(gb >= 10 ? 1 : 2)) + ' GB';
  }

  /* ══════════ капиблоки: SettingsEntry / SettingsRows / SettingsSections ══════════ */

  function settingsEntry(o) {
    var c = theme();
    var h = '<div style="display:flex;flex-direction:column;align-items:stretch">';
    h += '<div style="' + telUI.textStyle(CapyUI.AppText.body, c.ink) + '">' + esc(o.title) + '</div>';
    if (o.description) {
      h += '<div style="margin-top:' + SP().x1 + 'px;' + telUI.textStyle(CapyUI.AppText.label, c.inkMuted) + '">' + esc(o.description) + '</div>';
    }
    h += '<div style="margin-top:' + SP().x3 + 'px">' + o.child + '</div>';
    return h + '</div>';
  }

  function settingsRows(children) {
    var h = '<div style="display:flex;flex-direction:column;align-items:stretch">';
    for (var i = 0; i < children.length; i++) {
      if (i > 0) h += '<div style="height:' + SP().x5 + 'px"></div>';
      h += children[i];
    }
    return h + '</div>';
  }

  function settingsSections(children) {
    var h = '';
    for (var i = 0; i < children.length; i++) {
      if (i > 0) h += '<div style="height:' + SP().gridGutter + 'px"></div>';
      h += children[i];
    }
    return h;
  }

  /* SettingsStatusLine (settings_pane.dart) */
  function statusLineHTML() {
    if (!status) return '';
    var c = theme();
    return '<div style="margin-top:' + SP().gridGutter + 'px;' +
      telUI.textStyle(CapyUI.AppText.label, status.isError ? c.energy.critical : c.inkMuted) + '">' +
      esc(status.message) + '</div>';
  }

  /* ══════════ SettingToggleRow (setting_toggle_row.dart) ══════════ */

  function toggleSwitchHTML(value, enabled) {
    var c = theme();
    var track = value ? c.energy.draw : c.track; /* amber, когда живой */
    return '<span style="flex:none;width:52px;height:32px;border-radius:16px;background:' + track + ';position:relative;transition:background ' + CapyUI.AppMotion.fast + 'ms">' +
      '<span style="position:absolute;top:' + (value ? 4 : 8) + 'px;right:' + (value ? 4 : '') + 'px;' + (value ? '' : 'left:50%;margin-left:-8px;') +
      'width:' + (value ? 24 : 16) + 'px;height:' + (value ? 24 : 16) + 'px;border-radius:50%;background:' + c.surface + ';transition:all ' + CapyUI.AppMotion.fast + 'ms"></span></span>';
  }

  function toggleRow(o) {
    var c = theme();
    var enabled = o.onChanged != null;
    return '<div role="button" tabindex="0" data-teltoggle="' + esc(o.key) + '" style="display:flex;align-items:center;background:' + c.control +
      ';border-radius:' + CapyUI.AppRadii.md + 'px;min-height:' + CapyUI.AppSizes.minTouchTarget + 'px;padding:' + SP().x3 + 'px ' + SP().x4 + 'px;cursor:' + (enabled ? 'pointer' : 'default') + '">' +
      '<div style="flex:1;min-width:0">' +
      '<div style="' + telUI.textStyle(CapyUI.AppText.body, enabled ? c.ink : c.inkSubtle) + '">' + esc(o.label) + '</div>' +
      (o.description ? '<div style="margin-top:' + SP().x1 + 'px;' + telUI.textStyle(CapyUI.AppText.label, enabled ? c.inkMuted : c.inkSubtle) + '">' + esc(o.description) + '</div>' : '') +
      '</div><div style="width:' + SP().x4 + 'px;flex:none"></div>' + toggleSwitchHTML(o.value, enabled) + '</div>';
  }

  /* ══════════ MoneyKeypadDialog (клавиатура ёмкости/цены, как T3/T4) ══════════ */

  function sep() { return telChargeDecimalSeparator(); }
  function telChargeDecimalSeparator() {
    return (typeof chargeDecimalSeparatorForLocale === 'function')
      ? chargeDecimalSeparatorForLocale('ru-RU') : ',';
  }
  function symbol() {
    return (typeof chargeCurrencySymbolForLocale === 'function')
      ? chargeCurrencySymbolForLocale('ru-RU', currency()) : '₽';
  }
  function keypadDisplay() {
    var n = keypad.digits.length ? parseInt(keypad.digits, 10) : 0;
    return keypad.digits.length
      ? (String(Math.floor(n / 100)) + sep() + String(n % 100).padStart(2, '0'))
      : '0' + sep() + '00';
  }
  function keypadPanelHTML() {
    if (!keypad) return '';
    var isCap = keypad.target === 'capacity';
    var c = theme();
    return '<div id="telSetKeypad" style="position:absolute;inset:0;z-index:40;display:flex;align-items:flex-start;justify-content:center">' +
      '<div data-telkeypadclose style="position:absolute;inset:0;background:' + c.modalScrim + '"></div>' +
      '<div style="position:relative;margin-top:72px;background:' + c.surface + ';border-radius:' + CapyUI.AppRadii.xl + 'px;box-shadow:0 8px 32px rgba(0,0,0,0.35)">' +
      telUI.moneyKeypadDialog({
        title: isCap ? L.packTitle : L.costTitle,
        description: isCap ? L.packDesc : L.costDesc,
        fields: [{ value: isCap ? 'capacity' : 'rate', label: isCap ? L.packTitle : L.rateField }],
        selected: isCap ? 'capacity' : 'rate',
        currencySymbol: isCap ? '' : symbol(),
        display: keypadDisplay(),
        unit: isCap ? L.unitKwh : L.rateUnit,
        saveLabel: L.kpSave
      }) + '</div></div>';
  }

  function openKeypad(target) {
    var v = target === 'capacity' ? packValue() / 1000 : rateValue();
    keypad = {
      target: target,
      digits: (v != null && isFinite(v)) ? String(Math.round(v * 100)) : ''
    };
    renderLayers();
  }

  function capacityLabel() {
    return (packValue() / 1000).toFixed(2).replace('.', sep()) + ' ' + L.unitKwh;
  }
  function rateLabel() {
    var r = rateValue();
    if (r == null) return L.costNotSaved;
    /* chargeAmountLabel: цена с символом валюты */
    var v = r.toFixed(2).replace('.', sep());
    return symbol() + ' ' + v;
  }

  function keypadSave() {
    var raw = keypad.digits.length ? parseInt(keypad.digits, 10) / 100 : null;
    if (keypad.target === 'capacity') {
      var wh = raw == null ? kDefaultPackCapacityWh : Math.round(raw * 1000);
      savingCapacity = true;
      clearStatus();
      if (!TEL.native) { TEL.set.packWh = wh; setGlobalPackWh(wh); }
      emit('settings.apply', { key: 'pack_capacity_wh', value: raw == null ? kDefaultPackCapacityWh : wh });
      reportOk(fmt('packSaved', { value: capacityLabel() }));
      savingCapacity = false;
    } else {
      var value = raw == null ? null : +raw.toFixed(2);
      savingChargeCost = true;
      clearStatus();
      if (!TEL.native) { TEL.set.rate = value; setGlobalRate(value); }
      emit('settings.apply', { key: 'default_charge_cost_per_kwh', value: value });
      reportOk(value == null ? L.costNotSaved : fmt('costSaved', { value: rateLabel() }));
      savingChargeCost = false;
    }
    keypad = null;
    renderLayers();   /* закрыть слой клавиатуры */
    renderDetail();   /* плитка и статус — новым значением */
  }

  /* глобальные packWh/rate (общие расчёты экранов) */
  /* глобальные packWh/rate страницы (общие расчёты экранов) */
  function setGlobalPackWh(v) { try { packWh = v; } catch (e) { } }
  function setGlobalRate(v) { try { rate = v; } catch (e) { } }

  /* ══════════ действия (runAction: busy + status; tool.act → actionDone) ══════════ */

  function clearStatus() { status = null; }
  function reportOk(message) { status = { message: message, isError: false }; }
  function reportError(message) { status = { message: message, isError: true }; }

  function softTile(o) {
    return telUI.softActionTile({
      key: o.key, label: o.label, icon: o.icon,
      iconColor: o.iconColor, selected: false, centered: !!o.centered,
      disabled: !!o.disabled
    });
  }

  function askStorage() {
    storage = { loading: true, error: null, bytes: null };
    renderDetail();
    if (TEL.native) {
      emit('tool.act', { act: 'storage' }); /* ответ — telemetry.storage */
    } else {
      setTimeout(function () {
        storage = { loading: false, error: null, bytes: 5242880 };
        renderDetail();
      }, 700);
    }
  }

  function storageLabel() {
    if (storage.loading) return L.storageLoading;
    if (storage.error) return fmt('storageFailed', { error: storage.error });
    return fmt('storageValue', { size: formatStorageBytes(storage.bytes) });
  }

  function runAction(act, tile) {
    if (busy[act]) return;
    busy[act] = true;
    clearStatus();
    renderDetail();
    if (TEL.native) {
      emit('tool.act', { act: act }); /* статус придёт actionDone */
    } else {
      /* браузерный демо-режим: те же фразы, что дал бы движок */
      setTimeout(function () {
        busy[act] = false;
        if (act === 'applyprice') {
          var r = rateValue();
          if (r == null) reportError(L.costApplyNoRate);
          else reportOk(fmt('costApplied', { count: 3 }));
        } else if (act === 'retention') {
          reportOk(fmt('retentionDone', { frames: 0, days: 30 }));
        } else if (act === 'resend') {
          reportOk(fmt('resendDone', { count: 0 }));
        } else if (act === 'wipe') {
          reportOk(fmt('wipeDone', { trips: 0, charges: 0, frames: 0 }));
        }
        if (act === 'retention' || act === 'wipe') askStorage();
        else renderDetail();
      }, 900);
    }
    void tile;
  }

  function wipeClicked() {
    if (busy.wipe) return;
    wipeConfirm = true; /* showConfirmDialog поверх меню */
    renderAll();
  }

  function confirmDialogHTML() {
    if (!wipeConfirm) return '';
    var c = theme();
    return '<div id="telSetConfirm" style="position:absolute;inset:0;z-index:50;display:flex;align-items:center;justify-content:center">' +
      '<div data-telconfirmcancel style="position:absolute;inset:0;background:' + c.modalScrim + '"></div>' +
      '<div style="position:relative;width:480px;max-width:calc(100vw - ' + SP().x12 + 'px);background:' + c.surface +
      ';border-radius:' + CapyUI.AppRadii.xl + 'px;padding:' + SP().cardPadding + 'px;box-shadow:0 8px 32px rgba(0,0,0,0.35)">' +
      '<div style="' + telUI.textStyle(CapyUI.AppText.cardTitle, c.ink) + '">' + esc(L.wipeDialogTitle) + '</div>' +
      '<div style="margin-top:' + SP().x3 + 'px;' + telUI.textStyle(CapyUI.AppText.body, c.inkMuted) + '">' + esc(L.wipeDialogContent) + '</div>' +
      '<div style="margin-top:' + SP().x6 + 'px;display:flex">' +
      '<div style="flex:1">' + softTile({ key: 'wipeCancel', label: L.cancel, centered: true }) + '</div>' +
      '<div style="width:' + SP().x3 + 'px;flex:none"></div>' +
      '<div style="flex:1">' + softTile({ key: 'wipeConfirm', label: L.wipeAll, icon: 'warning_amber', iconColor: c.energy.critical, centered: true }) + '</div>' +
      '</div></div></div>';
  }

  /* ══════════ панели (detailBuilder) ══════════ */

  function card(o) { return telUI.appCard(o); }

  function chargePaneHTML() {
    var ext = setOf('externalChargeControlEnabled');
    var roem = setOf('replaceOemChargingEnabled');
    return settingsSections([
      /* _batteryCard */
      card({
        title: L.packTitle, fill: false,
        child: settingsRows([
          settingsEntry({
            title: L.packTitle, description: L.packDesc,
            child: softTile({
              key: 'capacity', icon: 'battery_full', label: capacityLabel(),
              disabled: savingCapacity
            })
          }),
          settingsEntry({
            title: L.costTitle, description: L.costDesc,
            child: softTile({
              key: 'rate', icon: 'payments', label: rateLabel(),
              disabled: savingChargeCost
            })
          }),
          settingsEntry({
            title: L.costApplyTitle, description: L.costApplyDesc,
            child: softTile({
              key: 'applyprice', icon: 'price_check',
              label: busy.applyprice ? L.costApplying : L.costApply,
              disabled: busy.applyprice || rateValue() == null
            })
          })
        ])
      }),
      /* _disclaimerCard */
      disclaimerCardHTML(),
      /* _chargeControlCard (без APK-менеджера: мост не отдаёт статус
         установки Geely Charge Control — тумблеры управляют движком) */
      card({
        title: L.charge, fill: false,
        child: settingsRows([
          toggleRow({
            key: 'ext', label: L.extTitle, description: L.extDesc,
            value: ext == true,
            onChanged: ext == null ? null : function () {
              applyToggle('externalChargeControlEnabled', 'ext', !(ext == true));
            }
          }),
          toggleRow({
            key: 'roem', label: L.roemTitle, description: L.roemDesc,
            value: roem == true,
            onChanged: roem == null ? null : function () {
              applyToggle('replaceOemChargingEnabled', 'roem', !(roem == true));
            }
          })
        ])
      })
    ]) + statusLineHTML();
  }

  function disclaimerCardHTML() {
    var c = theme();
    return card({
      title: L.disclaimerTitle, fill: false,
      child: '<div style="display:flex;align-items:flex-start">' +
        telUI.icon('warning_amber', CapyUI.AppSizes.iconLg, c.energy.warning) +
        '<div style="flex:1;margin-left:' + SP().x3 + 'px;' + telUI.textStyle(CapyUI.AppText.body, c.inkMuted) + 'line-height:1.4">' + esc(L.disclaimerDesc) + '</div></div>'
    });
  }

  function dataPaneHTML() {
    var auto = setOf('autoStart');
    var gps = setOf('gpsEnabled');
    var bt = setOf('keepBluetoothOnEnabled');
    var cont = setOf('continuousModeEnabled');
    return settingsSections([
      /* _operationCard */
      card({
        title: L.operation, fill: false,
        child: settingsRows([
          toggleRow({
            key: 'auto', label: L.autoStart, description: L.autoStartDesc,
            value: auto == true,
            onChanged: auto == null ? null : function () { applyToggle('autoStart', 'auto', !(auto == true)); }
          }),
          toggleRow({
            key: 'gps', label: L.gps, description: L.gpsDesc,
            value: gps == true,
            onChanged: gps == null ? null : function () { applyToggle('gpsEnabled', 'gps', !(gps == true)); }
          }),
          toggleRow({
            key: 'bt', label: L.btTitle, description: L.btDesc,
            value: bt == true,
            onChanged: bt == null ? null : function () { applyToggle('keepBluetoothOnEnabled', 'bt', !(bt == true)); }
          }),
          toggleRow({
            key: 'cont', label: L.cont, description: L.contDesc,
            value: cont == true,
            onChanged: cont == null ? null : function () { applyToggle('continuousModeEnabled', 'cont', !(cont == true)); }
          })
        ])
      }),
      /* _storageCard */
      card({
        title: L.storageTitle, fill: false,
        child: settingsRows([
          settingsEntry({
            title: L.storageEntry, description: L.storageDesc,
            child: softTile({
              key: 'storage', icon: 'storage', label: storageLabel(),
              disabled: storage.loading
            })
          })
        ])
      }),
      /* _retentionCard */
      card({
        title: L.retentionTitle, fill: false,
        child: settingsRows([
          settingsEntry({
            title: L.retention, description: L.retentionDesc,
            child: softTile({
              key: 'retention', icon: 'cleaning_services',
              label: busy.retention ? L.retentionRunning : L.retentionRun,
              disabled: busy.retention
            })
          })
        ])
      }),
      /* _dangerCard */
      card({
        title: L.danger, fill: false,
        child: settingsEntry({
          title: L.wipe, description: L.wipeDesc,
          child: softTile({
            key: 'wipe', icon: 'delete_forever',
            iconColor: theme().energy.critical,
            label: busy.wipe ? L.wiping : L.wipeHistory,
            disabled: busy.wipe
          })
        })
      })
    ]) + statusLineHTML();
  }

  function systemPaneHTML() {
    var c = theme();
    /* _aboutCard: обновления приложения/Roadcast живут на вкладке
       «Обновления» ГУ — здесь версия и авторство, как _aboutCard. */
    var version = appVersionText();
    return settingsSections([
      card({
        title: L.about, fill: false,
        child: '<div style="display:flex;flex-direction:column;align-items:flex-start">' +
          '<div style="' + telUI.textStyle(CapyUI.AppText.body, c.ink) + '">' + esc(version) + '</div>' +
          '<div style="margin-top:' + SP().x1 + 'px;' + telUI.textStyle(CapyUI.AppText.label, c.inkMuted) + '">' + esc(fmt('aboutDeveloper', { handle: '@timhss' })) + '</div>' +
          '<div style="' + telUI.textStyle(CapyUI.AppText.label, c.inkMuted) + '">' + esc(L.aboutTagline) + '</div>' +
          '</div>'
      })
    ]) + statusLineHTML();
  }

  function appVersionText() {
    /* PackageInfo.fromPlatform: недоступен — версия остаётся '--' (как Dart) */
    try {
      if (window.GeelyNative && GeelyNative.appVersion) {
        var v = GeelyNative.appVersion();
        var b = GeelyNative.appBuild ? GeelyNative.appBuild() : null;
        return fmt('appVersion', { version: v, build: b != null ? b : '--' });
      }
    } catch (e) { /* версия остаётся '--' */ }
    return '--';
  }

  function developerPaneHTML() {
    var evf = setOf('debugEventFileEnabled');
    var rows = [
      toggleRow({
        key: 'dev', label: L.devMode, description: L.devModeDesc,
        value: devUnlocked,
        onChanged: function () { devUnlocked = !devUnlocked; renderAll(); }
      })
    ];
    if (devUnlocked) {
      rows.push(
        card({
          title: L.engineering, fill: false,
          child: settingsRows([
            toggleRow({
              key: 'evf', label: L.eventFile, description: L.eventFileDesc,
              value: evf == true,
              onChanged: evf == null ? null : function () { applyToggle('debugEventFileEnabled', 'evf', !(evf == true)); }
            }),
            settingsEntry({
              title: L.resend, description: L.resendDesc,
              child: softTile({
                key: 'resend', icon: 'cloud_upload',
                label: busy.resend ? L.costApplying : L.resendAction,
                disabled: busy.resend
              })
            }),
            settingsEntry({
              title: L.traceTitle, description: L.traceDesc,
              child: softTile({ key: 'trace', icon: 'timeline', label: L.labOpen })
            }),
            settingsEntry({
              title: L.sensorLabTitle, description: L.sensorLabDesc,
              child: softTile({ key: 'signallab', icon: 'biotech', label: L.sensorLabOpen })
            }),
            settingsEntry({
              title: L.labTitle, description: L.labDesc,
              child: softTile({ key: 'sensorlab', icon: 'sensors', label: L.labOpen })
            })
          ])
        })
      );
    }
    /* карточка «Эксперименты» исключена: projection-строка — по требованию,
       «прежний интерфейс» — в этом ГУ нет старого UI (см. README). */
    return settingsSections([settingsRows(rows)]) + statusLineHTML();
  }

  var PANES = {
    charge: chargePaneHTML,
    data: dataPaneHTML,
    system: systemPaneHTML,
    developer: developerPaneHTML
  };

  /* ══════════ CategoryMenu (рельс + поиск) ══════════ */

  function visibleGroups() {
    var q = query.trim().toLowerCase();
    if (!q) return CATS;
    var out = [];
    for (var i = 0; i < CATS.length; i++) {
      var entries = CATS[i].filter(function (e) { return e.label.toLowerCase().indexOf(q) >= 0; });
      if (entries.length) out.push(entries);
    }
    return out;
  }

  function railRowHTML(e) {
    var c = theme();
    var sel = e.id === category;
    var fg = sel ? c.onSelection : c.ink;
    return '<div role="button" tabindex="0" data-telcat="' + e.id + '" style="display:flex;align-items:center;min-height:' + CapyUI.AppSizes.minTouchTarget +
      'px;padding:' + SP().x2 + 'px ' + SP().x4 + 'px;margin-bottom:' + SP().x1 + 'px;border-radius:' + CapyUI.AppRadii.md +
      'px;background:' + (sel ? c.selectionFill : c.surface) + ';cursor:pointer;transition:background ' + CapyUI.AppMotion.fast + 'ms">' +
      telUI.icon(e.icon, CapyUI.AppSizes.iconMd, fg) +
      '<div style="flex:1;min-width:0;margin-left:' + SP().x3 + 'px;' + telUI.textStyle(sel ? CapyUI.AppText.bodyStrong : CapyUI.AppText.body, fg) +
      'overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">' + esc(e.label) + '</div></div>';
  }

  function railListHTML() {
    var c = theme();
    var groups = visibleGroups();
    if (!groups.length) {
      return '<div style="padding:' + SP().cardPadding + 'px;' + telUI.textStyle(CapyUI.AppText.body, c.inkSubtle) + '">' + esc(L.searchEmpty) + '</div>';
    }
    var h = '';
    for (var i = 0; i < groups.length; i++) {
      if (i > 0) h += '<div style="height:1px;background:' + c.divider + ';margin:' + SP().x2 + 'px ' + SP().x4 + 'px"></div>';
      for (var j = 0; j < groups[i].length; j++) h += railRowHTML(groups[i][j]);
    }
    return h;
  }

  function railHTML() {
    var c = theme();
    return '<div style="width:320px;flex:none;display:flex;flex-direction:column;align-self:stretch">' +
      /* поиск (CategoryMenuSearch) */
      '<div style="padding:' + SP().x4 + 'px ' + SP().x4 + 'px ' + SP().x2 + 'px">' +
      '<div style="display:flex;align-items:center;height:' + CapyUI.AppSizes.minTouchTarget + 'px;padding:0 ' + SP().x4 + 'px;background:' + c.control + ';border-radius:' + CapyUI.AppRadii.full + 'px">' +
      telUI.icon('search', CapyUI.AppSizes.iconMd, c.inkSubtle) +
      '<input id="telSetSearch" value="' + esc(query) + '" placeholder="' + esc(L.search) + '" style="flex:1;min-width:0;margin-left:' + SP().x3 + 'px;border:0;background:transparent;outline:none;font-family:inherit;' + telUI.textStyle(CapyUI.AppText.body, c.ink) + '">' +
      '</div></div>' +
      '<div style="height:1px;background:' + c.divider + ';margin:0 ' + SP().x4 + 'px"></div>' +
      /* список групп (правило между группами) */
      '<div id="telSetRailList" style="flex:1;min-height:0;overflow:auto;padding:' + SP().x4 + 'px">' + railListHTML() + '</div>' +
      '</div>';
  }

  function detailHTML() {
    return '<div id="telSetDetail" style="flex:1;min-width:0;overflow:auto;background:' + theme().canvas + ';padding:' + SP().cardPadding + 'px">' +
      ((PANES[category] || function () { return ''; })()) + '</div>';
  }

  /* ══════════ showCategoryMenu: скрим + панель 1040×720, вход 0.97→1 ══════════ */

  function overlayHTML() {
    var c = theme();
    return '<div data-telsettingsclose style="position:absolute;inset:0;background:' + c.modalScrim + ';opacity:0"></div>' +
      '<div id="telSetPanel" style="position:absolute;z-index:1;left:50%;top:50%;transform:translate(-50%,-50%) scale(0.97);opacity:0;' +
      'width:1040px;max-width:calc(100vw - ' + (SP().x12 * 2) + 'px);height:720px;max-height:calc(100vh - ' + SP().x12 + 'px);' +
      'display:flex;background:' + c.surface + ';border-radius:' + CapyUI.AppRadii.xl + 'px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.35)">' +
      railHTML() + detailHTML() +
      '</div>' +
      keypadPanelHTML() +
      confirmDialogHTML();
  }

  function renderAll(animate) {
    var root = document.getElementById('telSetRoot');
    if (!root) return;
    root.innerHTML = overlayHTML();
    var scrim = root.querySelector('[data-telsettingsclose]');
    var panel = document.getElementById('telSetPanel');
    if (animate) {
      /* showFloatingSurface: fade + 0.97→1, 220 мс easeOutCubic */
      requestAnimationFrame(function () {
        if (scrim) scrim.style.transition = 'opacity 220ms cubic-bezier(0.215,0.61,0.355,1)';
        if (scrim) scrim.style.opacity = '1';
        if (panel) {
          panel.style.transition = 'transform 220ms cubic-bezier(0.215,0.61,0.355,1), opacity 220ms cubic-bezier(0.215,0.61,0.355,1)';
          panel.style.transform = 'translate(-50%,-50%) scale(1)';
          panel.style.opacity = '1';
        }
      });
    } else {
      if (scrim) scrim.style.opacity = '1';
      if (panel) { panel.style.transform = 'translate(-50%,-50%) scale(1)'; panel.style.opacity = '1'; }
    }
    wireInput();
  }

  /* клавиатура/подтверждение — свои слои: перерисовываются без
     пересборки меню (фокус поиска и скролл панелей не трогаем). */
  function renderLayers() {
    var root = document.getElementById('telSetRoot');
    if (!root) return;
    var oldKp = document.getElementById('telSetKeypad');
    var oldCf = document.getElementById('telSetConfirm');
    if (oldKp) oldKp.remove();
    if (oldCf) oldCf.remove();
    var tmp = document.createElement('div');
    tmp.innerHTML = keypadPanelHTML() + confirmDialogHTML();
    while (tmp.firstChild) root.appendChild(tmp.firstChild);
  }

  function renderDetail() {
    var host = document.getElementById('telSetDetail');
    if (!host) return;
    var st = host.scrollTop;
    host.innerHTML = (PANES[category] || function () { return ''; })();
    host.scrollTop = st;
  }

  function renderRailList() {
    var host = document.getElementById('telSetRailList');
    if (host) host.innerHTML = railListHTML();
  }

  function wireInput() {
    var search = document.getElementById('telSetSearch');
    if (search) {
      search.addEventListener('input', function () {
        query = search.value;
        renderRailList(); /* рельс фильтруется, фокус не теряется */
      });
    }
  }

  /* ══════════ события (клики-делегирование) ══════════ */

  var TOGGLES = {
    auto: ['autoStart', 'auto'],
    gps: ['gpsEnabled', 'gps'],
    bt: ['keepBluetoothOnEnabled', 'bt'],
    cont: ['continuousModeEnabled', 'cont'],
    ext: ['externalChargeControlEnabled', 'ext'],
    roem: ['replaceOemChargingEnabled', 'roem'],
    evf: ['debugEventFileEnabled', 'evf']
  };

  function handleAction(target) {
    var el;
    if (keypad) {
      /* клавиатура активна: digits/сброс/сохранение/закрытие */
      if ((el = target.closest('[data-telkeypadclose]'))) { keypad = null; renderLayers(); return true; }
      if ((el = target.closest('[data-teldigit]'))) {
        var d = String(el.getAttribute('data-teldigit'));
        if (keypad.digits.length < 9 && !(keypad.digits === '' && d === '0')) keypad.digits += d;
        renderLayers();
        return true;
      }
      if ((el = target.closest('[data-telkey="clear"]'))) { keypad.digits = ''; renderLayers(); return true; }
      if ((el = target.closest('[data-telkey="delete"]'))) { keypad.digits = keypad.digits.slice(0, -1); renderLayers(); return true; }
      if ((el = target.closest('[data-telkey="save"]'))) { keypadSave(); return true; }
    }
    if (wipeConfirm) {
      if ((el = target.closest('[data-telconfirmcancel]'))) { wipeConfirm = false; renderLayers(); return true; }
      if ((el = target.closest('[data-telsoft="wipeCancel"]'))) { wipeConfirm = false; renderLayers(); return true; }
      if ((el = target.closest('[data-telsoft="wipeConfirm"]'))) {
        wipeConfirm = false;
        renderLayers(); /* confirm закрывается, действие — за ним */
        runAction('wipe');
        return true;
      }
    }
    if ((el = target.closest('[data-telsettingsclose]'))) { hide(); return true; }
    if ((el = target.closest('[data-telcat]'))) {
      var cat = el.getAttribute('data-telcat');
      if (cat !== category) {
        category = cat;
        clearStatus(); /* у каждой панели свой статус (свой State) */
        renderRailList();
        renderDetail();
        if (cat === 'data' && storage.bytes == null && !storage.error) askStorage();
      }
      return true;
    }
    if ((el = target.closest('[data-teltoggle]'))) {
      var key = el.getAttribute('data-teltoggle');
      if (key === 'dev') { devUnlocked = !devUnlocked; renderDetail(); return true; }
      var t = TOGGLES[key];
      if (t) {
        var cur = setOf(t[0]);
        if (cur != null) applyToggle(t[0], t[1], !cur);
      }
      return true;
    }
    if ((el = target.closest('[data-telsoft]'))) {
      var act = el.getAttribute('data-telsoft');
      if (el.getAttribute('data-disabled') === '1') return true; /* onPressed: null */
      if (act === 'capacity') { openKeypad('capacity'); return true; }
      if (act === 'rate') { openKeypad('rate'); return true; }
      if (act === 'applyprice' || act === 'retention' || act === 'resend') { runAction(act); return true; }
      if (act === 'storage') { askStorage(); return true; }
      if (act === 'wipe') { wipeClicked(); return true; }
      if (act === 'trace' || act === 'signallab' || act === 'sensorlab') {
        /* _open: сначала закрыть меню, затем открыть экран */
        hide();
        if (typeof openLab === 'function') openLab(act);
        return true;
      }
      return true; /* клик по плитке в панели */
    }
    return false;
  }

  /* ══════════ show/hide (showSettingsMenu) ══════════ */

  function gearMark(on) {
    var g = document.querySelector('[data-tgear]');
    if (g) { if (on) g.classList.add('on'); else g.classList.remove('on'); }
  }

  function show() {
    if (openFlag) return;
    telDemoSettings();
    openFlag = true;
    query = '';
    clearStatus();
    storage = { loading: false, error: null, bytes: TEL.storageBytes != null ? TEL.storageBytes : null };
    var root = document.createElement('div');
    root.id = 'telSetRoot';
    root.setAttribute('aria-label', L.close);
    root.style.cssText = 'position:fixed;inset:0;z-index:900';
    document.body.appendChild(root);
    if (!clickFn) clickFn = function (ev) {
      if (!openFlag) return;
      if (!ev.target.closest('#telSetRoot')) return;
      handleAction(ev.target);
    };
    document.removeEventListener('click', clickFn);
    document.addEventListener('click', clickFn);
    renderAll();
    gearMark(true); /* _settingsOpen: шестерёнка держит подсветку */
    if (category === 'data' && storage.bytes == null) askStorage();
  }

  function hide() {
    if (!openFlag) return;
    openFlag = false;
    keypad = null;
    wipeConfirm = false;
    var root = document.getElementById('telSetRoot');
    if (root) root.remove();
    if (clickFn) document.removeEventListener('click', clickFn);
    gearMark(false);
  }

  /* ══════════ бродкасты моста ══════════ */

  /* telemetry.data → read-back тумблеров (перечитанные значения). */
  function onData() {
    if (openFlag) renderDetail();
  }

  /* telemetry.actionDone: статус действия в arb-формулировках. */
  function onActionDone(d) {
    if (!openFlag) return;
    var act = d.act;
    busy[act] = false;
    var e = d.extra || {};
    if (act === 'applyprice') {
      if (d.ok === false) reportError(L.costApplyNoRate);
      else if (!e.count) reportOk(L.costApplyNone);
      else reportOk(fmt('costApplied', { count: e.count }));
    } else if (act === 'retention') {
      if (d.ok === false) reportError(fmt('retentionFailed', { error: d.message || '' }));
      else reportOk(fmt('retentionDone', { frames: e.frames != null ? e.frames : 0, days: e.days != null ? e.days : 30 }));
      askStorage();
    } else if (act === 'wipe') {
      if (d.ok === false) reportError(fmt('wipeFailed', { error: d.message || '' }));
      else reportOk(fmt('wipeDone', {
        trips: e.trips != null ? e.trips : 0,
        charges: e.charges != null ? e.charges : 0,
        frames: e.frames != null ? e.frames : 0
      }));
      askStorage();
    } else if (act === 'resend') {
      if (d.ok === false) reportError(fmt('resendFailed', { error: d.message || '' }));
      else reportOk(fmt('resendDone', { count: e.count != null ? e.count : 0 }));
    } else if (d.ok === false && d.message) {
      reportError(d.message);
    }
    renderDetail();
  }

  /* telemetry.storage: размер хранилища. */
  function onStorage(d) {
    if (!openFlag) return;
    if (d && d.bytes != null) {
      storage = { loading: false, error: null, bytes: d.bytes };
    } else if (d && d.error) {
      storage = { loading: false, error: String(d.error), bytes: null };
    }
    renderDetail();
  }

  return {
    show: show, hide: hide,
    isOpen: function () { return openFlag; },
    handleAction: handleAction,
    onData: onData,
    onActionDone: onActionDone,
    onStorage: onStorage,
    /* отладка/тесты */
    _state: function () {
      return { category: category, devUnlocked: devUnlocked, storage: storage, status: status, busy: busy };
    }
  };
})();
