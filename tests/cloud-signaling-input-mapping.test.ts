import { describe, it, expect } from 'vitest'
import { mapMobileInputSignal } from '../electron/services/cloud-signaling.service'

// Regression test for the bug where the Android app's virtual gamepad/keyboard
// input silently vanished: InputSender.kt wraps input as
// { kind, ... } inside a 'signal' envelope, but InputInjectionService expects
// { type, data } (InputCommand). Without this mapping, cloud-signaling.service.ts
// forwarded every 'signal' straight to the WebRTC handler, which has no case
// for signal.type === 'input' and drops it — the phone could watch the stream
// but never control the game.

describe('mapMobileInputSignal', () => {
  it('maps a gamepad button press', () => {
    expect(mapMobileInputSignal({ kind: 'gamepad', button: 'A', pressed: true })).toEqual({
      type: 'gamepad',
      data: { button: 'A', pressed: true, value: undefined },
    })
  })

  it('maps a gamepad button release', () => {
    expect(mapMobileInputSignal({ kind: 'gamepad', button: 'A', pressed: false })).toEqual({
      type: 'gamepad',
      data: { button: 'A', pressed: false, value: undefined },
    })
  })

  it('rejects a gamepad payload missing button', () => {
    expect(mapMobileInputSignal({ kind: 'gamepad', pressed: true })).toBeNull()
  })

  it('maps a keyboard key event', () => {
    expect(mapMobileInputSignal({ kind: 'keyboard', key: 'enter', pressed: true })).toEqual({
      type: 'keyboard',
      data: { key: 'enter', pressed: true },
    })
  })

  it('translates numeric touch action codes to the string enum', () => {
    expect(mapMobileInputSignal({ kind: 'touch', x: 0.5, y: 0.25, action: 0, pointerId: 1 })).toEqual({
      type: 'touch',
      data: { x: 0.5, y: 0.25, action: 'down', id: 1 },
    })
    expect(mapMobileInputSignal({ kind: 'touch', x: 0.5, y: 0.25, action: 1 })).toMatchObject({
      data: { action: 'up' },
    })
    expect(mapMobileInputSignal({ kind: 'touch', x: 0.5, y: 0.25, action: 2 })).toMatchObject({
      data: { action: 'move' },
    })
  })

  it('rejects an unknown touch action code', () => {
    expect(mapMobileInputSignal({ kind: 'touch', x: 0.1, y: 0.1, action: 99 })).toBeNull()
  })

  it('maps a mouse move to an absolute-position command', () => {
    expect(mapMobileInputSignal({ kind: 'mouse', action: 'move', x: 100, y: 200 })).toEqual({
      type: 'mouse',
      data: { action: 'absolute', dx: 100, dy: 200 },
    })
  })

  it('maps a mouse click to a button-down command', () => {
    expect(mapMobileInputSignal({ kind: 'mouse', action: 'click', x: 10, y: 10, button: 'left' })).toEqual({
      type: 'mouse',
      data: { action: 'button', button: 'left', pressed: true },
    })
  })

  it('returns null for an unrecognized kind', () => {
    expect(mapMobileInputSignal({ kind: 'unknown' })).toBeNull()
  })

  it('returns null for malformed input', () => {
    expect(mapMobileInputSignal(null)).toBeNull()
    expect(mapMobileInputSignal(undefined)).toBeNull()
    expect(mapMobileInputSignal('not an object')).toBeNull()
  })
})
