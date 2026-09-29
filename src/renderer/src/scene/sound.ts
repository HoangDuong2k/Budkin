// Âm thanh tổng hợp bằng WebAudio (không cần file âm thanh): tiếng tách công tắc, tiếng bíp của robot, chuông nhắc việc
import { useData } from '../state/dataStore'

let ctx: AudioContext | null = null

function audio(): { ctx: AudioContext; out: GainNode } | null {
  const settings = useData.getState().settings
  // Kiểm thử tự động: im lặng
  if (window.api.boot.test || (settings && !settings.sound)) return null
  ctx ??= new AudioContext()
  if (ctx.state === 'suspended') void ctx.resume()
  const out = ctx.createGain()
  out.gain.value = settings?.volume ?? 0.6
  out.connect(ctx.destination)
  return { ctx, out }
}

function tone(a: { ctx: AudioContext; out: GainNode }, freq: number, at: number, dur: number, opts: { type?: OscillatorType; to?: number; gain?: number } = {}): void {
  const osc = a.ctx.createOscillator()
  const g = a.ctx.createGain()
  osc.type = opts.type ?? 'sine'
  osc.frequency.setValueAtTime(freq, at)
  if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, at + dur)
  const peak = opts.gain ?? 0.25
  g.gain.setValueAtTime(0.0001, at)
  g.gain.exponentialRampToValueAtTime(peak, at + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
  osc.connect(g).connect(a.out)
  osc.start(at)
  osc.stop(at + dur + 0.02)
}

/** Tiếng "tách" của công tắc đèn */
export function playClick(on: boolean): void {
  const a = audio()
  if (!a) return
  const t = a.ctx.currentTime
  const len = Math.floor(a.ctx.sampleRate * 0.03)
  const buf = a.ctx.createBuffer(1, len, a.ctx.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 6)
  const src = a.ctx.createBufferSource()
  src.buffer = buf
  const band = a.ctx.createBiquadFilter()
  band.type = 'bandpass'
  band.frequency.value = on ? 3200 : 2400
  const g = a.ctx.createGain()
  g.gain.value = 0.9
  src.connect(band).connect(g).connect(a.out)
  src.start(t)
}

export type Chirp = 'poke' | 'startled' | 'celebrate' | 'alert' | 'sleepy'

/** Tiếng bíp của robot */
export function playChirp(kind: Chirp): void {
  const a = audio()
  if (!a) return
  const t = a.ctx.currentTime + 0.01
  switch (kind) {
    case 'poke':
      tone(a, 660, t, 0.09, { to: 990 })
      tone(a, 990, t + 0.1, 0.12, { to: 740 })
      break
    case 'startled':
      tone(a, 1200, t, 0.08, { to: 1800, type: 'triangle' })
      break
    case 'celebrate':
      ;[523, 659, 784, 1047].forEach((f, i) => tone(a, f, t + i * 0.07, 0.12, { type: 'triangle' }))
      break
    case 'alert':
      tone(a, 880, t, 0.16, { gain: 0.3 })
      tone(a, 1175, t + 0.18, 0.24, { gain: 0.3 })
      break
    case 'sleepy':
      tone(a, 440, t, 0.35, { to: 300, gain: 0.12 })
      break
  }
}
