package io.flutter.plugin.common

/**
 * Шим совместимости (Capy Energy → GeelyTools).
 *
 * Движок телеметрии capy стримит живые данные во Flutter через
 * io.flutter.plugin.common.EventChannel. В GeelyTools Flutter-движка нет,
 * поэтому здесь определён минимальный интерфейс с той же сигнатурой —
 * паблишеры (LiveTelemetryPublisher, VehicleSpeedPublisher, SensorLabStreamer)
 * компилируются без единого изменения логики.
 *
 * Подписка потребителей идёт напрямую: реализуйте StreamHandler и
 * подключите его к мосту WebView (ui/UiBridge) на фазе B.
 */
interface EventChannel {
    interface StreamHandler {
        fun onListen(arguments: Any?, events: EventSink?)
        fun onCancel(arguments: Any?)
    }

    interface EventSink {
        fun success(event: Any?)

        /** В capy использовался для ошибок стрима; в GeelyTools — no-op по умолчанию. */
        fun error(code: String?, message: String?, details: Any?) {}
    }
}
