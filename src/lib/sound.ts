// Board sounds, synthesised with the Web Audio API: no audio files to ship or license.
// Every sound is built from two parts: a "tap" (a wooden piece meeting the board) and
// a "chime" (a soft bell, for the moments that deserve a little ceremony).

export type SoundKind = 'move' | 'capture' | 'castle' | 'check' | 'promote' | 'end' | 'success' | 'fail' | 'legendary' | 'swell'

/** The sound for a move, read off its SAN. A check outranks everything else it might also be. */
export function moveSoundKind(san: string): SoundKind {
  if (/[+#]/.test(san)) return 'check'
  if (san.includes('=')) return 'promote'
  if (san.startsWith('O-O')) return 'castle'
  if (san.includes('x')) return 'capture'
  return 'move'
}

/** A position on the board, with the position before it (to tell a real step from a lookalike). */
export interface Step {
  id: string
  parentId: string | null
  fen: string
  san?: string
  parentFen?: string
}

/**
 * The move to hear when the board goes from `prev` to `next`: one step forward plays the
 * move just made, one step back replays the move taken back. Jumps are silent.
 */
export function stepSound(prev: Step, next: Step): { san: string; forward: boolean } | null {
  // Ids come from the move path, so a newly loaded game can reuse them: check the positions too.
  if (next.parentId === prev.id && next.parentFen === prev.fen && next.san) return { san: next.san, forward: true }
  if (prev.parentId === next.id && prev.parentFen === next.fen && prev.san) return { san: prev.san, forward: false }
  return null
}

let ctx: AudioContext | null = null
let master: GainNode | null = null
let noise: AudioBuffer | null = null
/** Strikes by length in milliseconds: a shorter contact is a harder, brighter hit. */
const pulses = new Map<number, AudioBuffer>()
/** The last move's sound, faded out when the next one starts. */
let voice: GainNode | null = null

/** How long a cut-off sound takes to fade: quick enough not to smear into the next move, slow enough not to click. */
const CUT_S = 0.012

function audio() {
  if (!ctx) {
    ctx = new AudioContext()
    master = ctx.createGain()
    master.connect(ctx.destination)
    // Half a second of white noise, for the grain of each strike.
    noise = ctx.createBuffer(1, ctx.sampleRate / 2, ctx.sampleRate)
    const data = noise.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  }
  // Browsers start the context suspended until a user gesture; moves always follow one.
  if (ctx.state === 'suspended') void ctx.resume()
  return { ctx, master: master!, noise: noise! }
}

/** The strike itself: a bump `ms` long, the same every time, so taps sound alike. */
function pulse(ctx: AudioContext, ms: number) {
  let buffer = pulses.get(ms)
  if (!buffer) {
    const width = Math.max(2, Math.round((ctx.sampleRate * ms) / 1000))
    buffer = ctx.createBuffer(1, width, ctx.sampleRate)
    const bump = buffer.getChannelData(0)
    for (let i = 0; i < width; i++) bump[i] = Math.sin((Math.PI * i) / width)
    pulses.set(ms, buffer)
  }
  return buffer
}

/** A gain envelope: near-silent, a fast attack to `peak`, then an exponential decay. */
function envelope(ctx: AudioContext, t: number, peak: number, attack: number, decay: number) {
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(peak, t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay)
  return g
}

interface TapOptions {
  /** Loudness. */
  gain?: number
  /** Pitch of the wood: above 1 is a smaller, harder piece. */
  pitch?: number
  /** Weight of the upper resonance and the contact click: above 1 is a sharper hit. */
  bright?: number
  /** How long the wood rings: above 1 is longer. */
  ring?: number
  /** Length of the contact in ms: shorter is harder, and reaches higher resonances. */
  contact?: number
}

/**
 * The resonances of a piece meeting the board, as [frequency Hz, Q, level]. A wooden "tok" lives
 * between 400 Hz and 2 kHz, which is also where ears and small speakers are most sensitive. Q sets
 * how long each rings: about Q / (π·f) seconds, a few milliseconds here.
 */
const WOOD: [number, number, number][] = [
  [510, 9, 1],
  [1030, 12, 1.5],
]
/** The contact itself: a broad click above the wood. */
const CLICK: [number, number, number] = [2600, 1.2, 0.05]
/** A little weight underneath, so it doesn't sound like plastic. */
const THUD: [number, number, number] = [230, 4, 0.9]
/** Brings a move's peak to about -3 dB at full volume, a little louder on small speakers than Chess.com's move sound. */
const LOUDNESS = 0.36

/** A piece landing: a short strike ringing through the resonances of a block of wood. */
function tap(out: AudioNode, t: number, { gain = 1, pitch = 1, bright = 1, ring = 1, contact = 1 }: TapOptions = {}) {
  const { ctx, noise } = audio()
  // A touch of variety: no two pieces land exactly alike.
  const tune = pitch * (1 + (Math.random() - 0.5) * 0.04)
  const strike = ctx.createGain()
  const bump = ctx.createBufferSource()
  bump.buffer = pulse(ctx, contact)
  // A shorter strike carries less energy: make up for it.
  strike.gain.value = 1 / contact
  bump.connect(strike)
  bump.start(t)
  const grain = ctx.createBufferSource()
  grain.buffer = noise
  grain.connect(envelope(ctx, t, 0.15, 0.0005, 0.003)).connect(strike)
  grain.start(t, Math.random() * 0.4)
  grain.stop(t + 0.01)
  const modes: [number, number, number][] = [
    [WOOD[0][0] * tune, WOOD[0][1] * ring, WOOD[0][2]],
    [WOOD[1][0] * tune, WOOD[1][1] * ring, WOOD[1][2] * bright],
    [CLICK[0], CLICK[1], CLICK[2] * bright],
    [THUD[0] * tune, THUD[1], THUD[2]],
  ]
  for (const [freq, q, level] of modes) {
    const band = ctx.createBiquadFilter()
    band.type = 'bandpass'
    band.frequency.value = freq
    band.Q.value = q
    const g = ctx.createGain()
    // A narrower band passes less of the strike: scale by Q to keep each mode at its level.
    g.gain.value = level * gain * q * LOUDNESS
    strike.connect(band).connect(g).connect(out)
  }
}

/** A soft bell: a sine with a quieter octave above it. */
function chime(out: AudioNode, t: number, freq: number, gain = 0.14, decay = 0.45) {
  const { ctx } = audio()
  for (const [mult, level] of [
    [1, 1],
    [2, 0.25],
  ]) {
    const osc = ctx.createOscillator()
    osc.frequency.value = freq * mult
    osc.connect(envelope(ctx, t, gain * level, 0.006, decay)).connect(out)
    osc.start(t)
    osc.stop(t + decay + 0.05)
  }
}

/** The approach to a Legendary landing (`length` seconds): a breath of air rising in pitch and loudness, cut off by the impact. */
function swell(out: AudioNode, t: number, length: number) {
  const { ctx, noise } = audio()
  const air = ctx.createBufferSource()
  air.buffer = noise
  air.loop = true
  const band = ctx.createBiquadFilter()
  band.type = 'bandpass'
  band.Q.value = 2.5
  band.frequency.setValueAtTime(300, t)
  band.frequency.exponentialRampToValueAtTime(2600, t + length)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.22, t + length * 0.92)
  g.gain.exponentialRampToValueAtTime(0.0001, t + length)
  air.connect(band).connect(g).connect(out)
  air.start(t)
  air.stop(t + length + 0.02)
  // A tone climbing under it, so it reads as building up rather than as wind.
  const tone = ctx.createOscillator()
  tone.frequency.setValueAtTime(220, t)
  tone.frequency.exponentialRampToValueAtTime(660, t + length)
  const tg = ctx.createGain()
  tg.gain.setValueAtTime(0.0001, t)
  tg.gain.exponentialRampToValueAtTime(0.06, t + length * 0.92)
  tg.gain.exponentialRampToValueAtTime(0.0001, t + length)
  tone.connect(tg).connect(out)
  tone.start(t)
  tone.stop(t + length + 0.02)
}

/** A Legendary move landing: a deep drop under the board, and a shimmer rising above it. */
function legendary(out: AudioNode, t: number) {
  const { ctx } = audio()
  const sweep = (type: OscillatorType, from: number, to: number, glide: number, gain: number, decay: number) => {
    const osc = ctx.createOscillator()
    osc.type = type
    osc.frequency.setValueAtTime(from, t)
    osc.frequency.exponentialRampToValueAtTime(to, t + glide)
    osc.connect(envelope(ctx, t, gain, 0.01, decay)).connect(out)
    osc.start(t)
    osc.stop(t + decay + 0.05)
  }
  sweep('sine', 180, 70, 0.35, 0.5, 0.45)
  sweep('triangle', 520, 260, 0.25, 0.18, 0.3)
  chime(out, t + 0.06, 1568, 0.07, 0.6)
  chime(out, t + 0.12, 2093, 0.06, 0.6)
  chime(out, t + 0.18, 2637, 0.05, 0.6)
}

/** The sounds of a move on the board: a new one cuts the last one short, so fast stepping never piles them up. */
const MOVE_KINDS: SoundKind[] = ['move', 'capture', 'castle', 'check', 'promote']

/**
 * Plays a sound at `volume` (0–1; 0 is silent). Safe to call where Web Audio is missing.
 * `lengthMs` is for the swell, which lasts as long as the move it builds up to.
 */
export function playSound(kind: SoundKind, volume: number, lengthMs = 800) {
  if (volume <= 0 || typeof AudioContext === 'undefined') return
  try {
    const { ctx, master } = audio()
    master.gain.value = volume
    const t = ctx.currentTime + 0.005
    const out = ctx.createGain()
    out.connect(master)
    if (MOVE_KINDS.includes(kind)) {
      if (voice) {
        voice.gain.setValueAtTime(1, t)
        voice.gain.linearRampToValueAtTime(0, t + CUT_S)
      }
      voice = out
    }
    switch (kind) {
      case 'move':
        tap(out, t)
        break
      case 'capture':
        // Two pieces meeting: a harder, brighter, higher crack.
        tap(out, t, { gain: 0.16, pitch: 1.35, bright: 2.2, ring: 3, contact: 0.35 })
        break
      case 'castle':
        // The king, then the rook a beat later.
        tap(out, t, { gain: 0.35, pitch: 0.95 })
        tap(out, t + 0.09, { gain: 1, pitch: 1.05 })
        break
      case 'check':
        tap(out, t, { gain: 0.85, bright: 1.4 })
        chime(out, t + 0.01, 1318.5, 0.08, 0.28)
        break
      case 'promote':
        tap(out, t)
        chime(out, t + 0.04, 784, 0.18, 0.25)
        chime(out, t + 0.12, 1174.7, 0.18, 0.4)
        break
      case 'end':
        // A gentle open fifth plus octave, slightly rolled.
        chime(out, t, 523.25, 0.24, 1.2)
        chime(out, t + 0.05, 784, 0.2, 1.1)
        chime(out, t + 0.1, 1046.5, 0.14, 1)
        break
      case 'success':
        // A quick, bright rising pair: puzzle solved.
        chime(out, t, 880, 0.22, 0.35)
        chime(out, t + 0.09, 1318.5, 0.22, 0.6)
        break
      case 'legendary':
        legendary(out, t)
        break
      case 'swell':
        swell(out, t, lengthMs / 1000)
        break
      case 'fail':
        // One low, short note: not the move.
        chime(out, t, 220, 0.32, 0.3)
        break
    }
  } catch {
    // Audio unavailable (e.g. too many contexts): sounds are a nicety, never an error.
  }
}
