let audioCtx: AudioContext | null = null

function getCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext()
  }
  return audioCtx
}

/**
 * Reproduce un sonido de "murmullo" continuo tipo caricatura.
 * Suena como "bleh bleh bleh" con variación de tono.
 * Se detiene automáticamente después de `duration` ms.
 */
let currentNoise: { stop: () => void } | null = null
let talkGeneration = 0

/**
 * Inicia un loop de "blah blah" que suena durante `duration` ms.
 * Varios tonos se mezclan para sonar como voz de dibujo animado hablando.
 * Se detiene automáticamente después de `duration` ms.
 */
export function startTalking(duration: number = 3000) {
  stopTalking()

  const myGeneration = ++talkGeneration

  try {
    const ctx = getCtx()
    const now = ctx.currentTime
    const bops: { freq: number; time: number; dur: number }[] = []

    // Generar ~8 "blips" de voz distribuidos en la duración
    const count = Math.floor(duration / 150)
    for (let i = 0; i < count; i++) {
      const t = now + (i / count) * (duration / 1000)
      bops.push({
        freq: 350 + Math.random() * 250,
        time: t,
        dur: 0.08 + Math.random() * 0.06,
      })
    }

    const startedOscs: OscillatorNode[] = []

    for (let i = 0; i < bops.length; i++) {
      const bop = bops[i]
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = i % 2 === 0 ? 'sine' : 'triangle'
      osc.frequency.setValueAtTime(bop.freq, bop.time)
      osc.frequency.linearRampToValueAtTime(bop.freq * (0.8 + Math.random() * 0.4), bop.time + bop.dur)

      gain.gain.setValueAtTime(0, bop.time)
      gain.gain.linearRampToValueAtTime(0.06, bop.time + 0.01)
      gain.gain.linearRampToValueAtTime(0.02, bop.time + bop.dur - 0.02)
      gain.gain.linearRampToValueAtTime(0, bop.time + bop.dur)

      osc.connect(gain)
      gain.connect(ctx.destination)

      // Only start if this generation is still active
      if (myGeneration === talkGeneration) {
        osc.start(bop.time)
        startedOscs.push(osc)
      }
    }

    currentNoise = {
      stop: () => {
        const now2 = ctx.currentTime
        for (const osc of startedOscs) {
          try { osc.stop(now2) } catch {}
        }
      },
    }
  } catch {
    // audio no disponible
  }
}

export function stopTalking() {
  talkGeneration++
  if (currentNoise) {
    try { currentNoise.stop() } catch {}
    currentNoise = null
  }
}

export function playPopSound() {
  try {
    const ctx = getCtx()
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(700, now)
    osc.frequency.exponentialRampToValueAtTime(1000, now + 0.06)
    gain.gain.setValueAtTime(0.05, now)
    gain.gain.linearRampToValueAtTime(0.01, now + 0.08)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.1)
  } catch {}
}

export function playCompleteSound() {
  try {
    const ctx = getCtx()
    const now = ctx.currentTime
    const notes = [523, 659, 784]
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, now + i * 0.12)
      gain.gain.setValueAtTime(0, now + i * 0.12)
      gain.gain.linearRampToValueAtTime(0.06, now + i * 0.12 + 0.03)
      gain.gain.linearRampToValueAtTime(0, now + i * 0.12 + 0.25)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now + i * 0.12)
      osc.stop(now + i * 0.12 + 0.25)
    })
  } catch {}
}
