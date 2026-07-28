package com.ycore.android.controls

import com.ycore.android.data.remote.websocket.CloudWebSocket

/**
 * Sends input events to the Desktop host via WebSocket signaling.
 * The host interprets these as virtual gamepad/touch/keyboard/mouse events.
 */
class InputSender(
    private val cloudWs: CloudWebSocket,
    private val hostId: String
) {
    fun sendTouch(x: Float, y: Float, action: Int, pointerId: Int = 0) {
        cloudWs.sendMessage(com.ycore.android.data.remote.websocket.WsMessage(
            type = "signal",
            targetHostId = hostId,
            signal = mapOf(
                "type" to "input",
                "data" to mapOf(
                    "kind" to "touch",
                    "x" to x,
                    "y" to y,
                    "action" to action, // 0=down, 1=up, 2=move
                    "pointerId" to pointerId
                )
            )
        ))
    }

    fun sendGamepadButton(button: String, pressed: Boolean) {
        cloudWs.sendMessage(com.ycore.android.data.remote.websocket.WsMessage(
            type = "signal",
            targetHostId = hostId,
            signal = mapOf(
                "type" to "input",
                "data" to mapOf(
                    "kind" to "gamepad",
                    "button" to button,
                    "pressed" to pressed
                )
            )
        ))
    }

    fun sendGamepadAxis(axis: String, value: Float) {
        cloudWs.sendMessage(com.ycore.android.data.remote.websocket.WsMessage(
            type = "signal",
            targetHostId = hostId,
            signal = mapOf(
                "type" to "input",
                "data" to mapOf(
                    "kind" to "gamepad",
                    "axis" to axis,
                    "value" to value
                )
            )
        ))
    }

    fun sendKey(key: String, pressed: Boolean) {
        cloudWs.sendMessage(com.ycore.android.data.remote.websocket.WsMessage(
            type = "signal",
            targetHostId = hostId,
            signal = mapOf(
                "type" to "input",
                "data" to mapOf(
                    "kind" to "keyboard",
                    "key" to key,
                    "pressed" to pressed
                )
            )
        ))
    }

    fun sendMouseMove(x: Float, y: Float) {
        cloudWs.sendMessage(com.ycore.android.data.remote.websocket.WsMessage(
            type = "signal",
            targetHostId = hostId,
            signal = mapOf(
                "type" to "input",
                "data" to mapOf(
                    "kind" to "mouse",
                    "x" to x,
                    "y" to y,
                    "action" to "move"
                )
            )
        ))
    }

    fun sendMouseClick(x: Float, y: Float, button: String = "left") {
        cloudWs.sendMessage(com.ycore.android.data.remote.websocket.WsMessage(
            type = "signal",
            targetHostId = hostId,
            signal = mapOf(
                "type" to "input",
                "data" to mapOf(
                    "kind" to "mouse",
                    "x" to x,
                    "y" to y,
                    "action" to "click",
                    "button" to button
                )
            )
        ))
    }
}
