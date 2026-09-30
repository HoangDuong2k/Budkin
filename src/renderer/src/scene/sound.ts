// Âm thanh tổng hợp bằng WebAudio (không cần file âm thanh): tiếng tách công tắc, giọng của robot đang đứng trên bệ
// (mỗi robot một giọng: Budkin bíp tròn, Orbi "bloop" trong như chuông kính, Rover bíp 8-bit, Miu meo và rừ rừ,
// Mech giọng máy trầm), chuông nhắc việc
import type { RobotModel } from '../../../shared/robots'
import { useData } from '../state/dataStore'
import { currentRobot } from '../state/hudStore'

let ctx: AudioContext | null = null

interface Out {
  ctx: AudioContext
  out: GainNode
}

function audio(): Out | null {
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

interface ToneOpts {
  type?: OscillatorType
  /** Trượt tới tần số này ở cuối nốt */
  to?: number
  gain?: number
  /** Lọc thông thấp (Hz) — giọng trầm, đục */
  lowpass?: number
  /** Lọc thông dải (Hz) — "khoang miệng" của tiếng meo */
  band?: number
  /** Tiếng vang ngân (chuông): thời gian tắt dần dài hơn */
  ring?: boolean
}

function tone(a: Out, freq: number, at: number, dur: number, opts: ToneOpts = {}): void {
  const osc = a.ctx.createOscillator()
  const g = a.ctx.createGain()
  osc.type = opts.type ?? 'sine'
  osc.frequency.setValueAtTime(freq, at)
  if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, at + dur * 0.9)
  const peak = opts.gain ?? 0.25
  g.gain.setValueAtTime(0.0001, at)
  g.gain.exponentialRampToValueAtTime(peak, at + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur * (opts.ring ? 2.5 : 1))
  let node: AudioNode = osc
  if (opts.lowpass || opts.band) {
    const f = a.ctx.createBiquadFilter()
    f.type = opts.band ? 'bandpass' : 'lowpass'
    f.frequency.value = opts.band ?? opts.lowpass ?? 1000
    f.Q.value = opts.band ? 4 : 0.7
    node = osc.connect(f)
  }
  node.connect(g).connect(a.out)
  osc.start(at)
  osc.stop(at + dur * (opts.ring ? 2.5 : 1) + 0.02)
}

/** Tiếng rừ rừ của mèo: tiếng ồn trầm, biên độ đập 24 lần mỗi giây */
function purr(a: Out, at: number, dur: number, gain = 0.5): void {
  const len = Math.floor(a.ctx.sampleRate * dur)
  const buf = a.ctx.createBuffer(1, len, a.ctx.sampleRate)
  const data = buf.getChannelData(0)
  let last = 0
  for (let i = 0; i < len; i++) {
    // Tiếng ồn "nâu" (tích phân tiếng ồn trắng) cho âm trầm, đập theo nhịp rừ rừ
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02
    const beat = 0.55 + 0.45 * Math.sin((2 * Math.PI * 24 * i) / a.ctx.sampleRate)
    const env = Math.min(1, i / (0.08 * a.ctx.sampleRate), (len - i) / (0.15 * a.ctx.sampleRate))
    data[i] = last * 3.5 * beat * env
  }
  const src = a.ctx.createBufferSource()
  src.buffer = buf
  const low = a.ctx.createBiquadFilter()
  low.type = 'lowpass'
  low.frequency.value = 320
  const g = a.ctx.createGain()
  g.gain.value = gain
  src.connect(low).connect(g).connect(a.out)
  src.start(at)
}

/** Tiếng meo: sóng răng cưa qua bộ lọc thông dải, cao độ lên rồi xuống */
function meow(a: Out, at: number, from: number, peak: number, end: number, dur: number, gain = 0.3): void {
  tone(a, from, at, dur * 0.45, { type: 'sawtooth', to: peak, gain, band: 1400 })
  tone(a, peak, at + dur * 0.4, dur * 0.6, { type: 'sawtooth', to: end, gain: gain * 0.9, band: 1100 })
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

export type Chirp = 'poke' | 'startled' | 'celebrate' | 'alert' | 'sleepy' | 'hello'

type Voice = (a: Out, kind: Chirp, t: number) => void

const VOICES: Record<RobotModel, Voice> = {
  // Budkin: bíp tròn, vui
  budkin: (a, kind, t) => {
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
      case 'hello':
        tone(a, 660, t, 0.1, { to: 880, type: 'triangle' })
        tone(a, 990, t + 0.12, 0.16, { to: 1320, type: 'triangle' })
        break
    }
  },
  // Orbi: "bloop" trượt cao độ, trong như chuông kính
  orbi: (a, kind, t) => {
    switch (kind) {
      case 'poke':
        tone(a, 520, t, 0.14, { to: 820, gain: 0.22 })
        tone(a, 1040, t + 0.13, 0.12, { gain: 0.14, ring: true })
        break
      case 'startled':
        tone(a, 900, t, 0.1, { to: 1500, gain: 0.2 })
        break
      case 'celebrate':
        ;[659, 784, 988, 1319].forEach((f, i) => tone(a, f, t + i * 0.09, 0.14, { gain: 0.18, ring: true }))
        break
      case 'alert':
        tone(a, 1175, t, 0.18, { gain: 0.3, ring: true })
        tone(a, 1568, t + 0.2, 0.22, { gain: 0.3, ring: true })
        break
      case 'sleepy':
        tone(a, 520, t, 0.5, { to: 260, gain: 0.1 })
        break
      case 'hello':
        tone(a, 440, t, 0.16, { to: 660, gain: 0.2 })
        tone(a, 880, t + 0.16, 0.18, { gain: 0.16, ring: true })
        break
    }
  },
  // Rover: bíp 8-bit (sóng vuông), dứt khoát
  rover: (a, kind, t) => {
    const sq = { type: 'square' as const, gain: 0.1, lowpass: 3500 }
    switch (kind) {
      case 'poke':
        tone(a, 440, t, 0.06, sq)
        tone(a, 330, t + 0.08, 0.08, sq)
        break
      case 'startled':
        tone(a, 880, t, 0.08, { ...sq, to: 1320 })
        break
      case 'celebrate':
        ;[523, 659, 784].forEach((f, i) => tone(a, f, t + i * 0.06, 0.06, sq))
        tone(a, 1047, t + 0.2, 0.22, sq)
        break
      case 'alert':
        ;[988, 740, 988, 740].forEach((f, i) => tone(a, f, t + i * 0.13, 0.11, { ...sq, gain: 0.13 }))
        break
      case 'sleepy':
        tone(a, 330, t, 0.3, { ...sq, to: 220, gain: 0.06 })
        break
      case 'hello':
        tone(a, 523, t, 0.07, sq)
        tone(a, 784, t + 0.09, 0.12, sq)
        break
    }
  },
  // Miu: meo và rừ rừ
  miu: (a, kind, t) => {
    switch (kind) {
      case 'poke':
        purr(a, t, 0.9)
        break
      case 'startled':
        meow(a, t, 900, 1300, 800, 0.16, 0.22)
        break
      case 'celebrate':
        meow(a, t, 500, 900, 700, 0.32)
        meow(a, t + 0.36, 800, 1150, 900, 0.2, 0.24)
        break
      case 'alert':
        meow(a, t, 700, 1050, 650, 0.26, 0.34)
        meow(a, t + 0.32, 700, 1050, 650, 0.26, 0.34)
        break
      case 'sleepy':
        meow(a, t, 450, 520, 330, 0.35, 0.12)
        break
      case 'hello':
        meow(a, t, 600, 950, 560, 0.36)
        break
    }
  },
  // Mech: giọng máy trầm (răng cưa qua lọc thấp), kiểu khởi động hệ thống
  mech: (a, kind, t) => {
    const saw = { type: 'sawtooth' as const, gain: 0.16, lowpass: 1200 }
    switch (kind) {
      case 'poke':
        tone(a, 220, t, 0.12, { ...saw, to: 330 })
        tone(a, 660, t + 0.14, 0.07, { type: 'square', gain: 0.07, lowpass: 2000 })
        break
      case 'startled':
        tone(a, 330, t, 0.1, { ...saw, to: 660 })
        break
      case 'celebrate':
        ;[392, 494, 587].forEach((f, i) => tone(a, f, t + i * 0.1, 0.1, saw))
        tone(a, 784, t + 0.3, 0.3, { ...saw, lowpass: 1800 })
        break
      case 'alert':
        tone(a, 587, t, 0.2, { type: 'square', gain: 0.12, lowpass: 1600 })
        tone(a, 440, t + 0.22, 0.24, { type: 'square', gain: 0.12, lowpass: 1600 })
        break
      case 'sleepy':
        tone(a, 196, t, 0.55, { ...saw, to: 110, gain: 0.1, lowpass: 600 })
        break
      case 'hello':
        ;[294, 440, 587].forEach((f, i) => tone(a, f, t + i * 0.09, 0.09, saw))
        break
    }
  }
}

/** Robot đang đứng trên bệ lên tiếng */
export function playChirp(kind: Chirp): void {
  const a = audio()
  if (!a) return
  VOICES[currentRobot()](a, kind, a.ctx.currentTime + 0.01)
}

/** Nghe thử giọng một robot (Cài đặt) */
export function previewVoice(model: RobotModel): void {
  const a = audio()
  if (!a) return
  VOICES[model](a, 'hello', a.ctx.currentTime + 0.01)
}
