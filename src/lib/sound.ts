// Board sounds, synthesised with the Web Audio API: no audio files to ship or license.
// Every sound is built from two parts: a "tap" (a wooden piece meeting the board) and
// a "chime" (a soft bell, for the moments that deserve a little ceremony).

export type SoundKind = 'move' | 'capture' | 'castle' | 'check' | 'promote' | 'end'

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

function audio() {
  if (!ctx) {
    ctx = new AudioContext()
    master = ctx.createGain()
    master.connect(ctx.destination)
    // A quarter-second of white noise, reused for every tap's contact click.
    noise = ctx.createBuffer(1, ctx.sampleRate / 4, ctx.sampleRate)
    const data = noise.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  }
  // Browsers start the context suspended until a user gesture; moves always follow one.
  if (ctx.state === 'suspended') void ctx.resume()
  return { ctx, out: master!, noise: noise! }
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
  /** Pitch of the thump: below 1 is a heavier piece. */
  tone?: number
  /** Pitch of the click: above 1 is a harder, brighter contact. */
  bright?: number
}

/** A piece landing: a band-passed click for the contact, a falling low sine for the body. */
function tap(t: number, { gain = 1, tone = 1, bright = 1 }: TapOptions = {}) {
  const { ctx, out, noise } = audio()

  const click = ctx.createBufferSource()
  click.buffer = noise
  const band = ctx.createBiquadFilter()
  band.type = 'bandpass'
  band.frequency.value = 2400 * bright
  band.Q.value = 0.8
  click.connect(band).connect(envelope(ctx, t, 0.45 * gain, 0.002, 0.03)).connect(out)
  click.start(t)
  click.stop(t + 0.05)

  // The knock: a short mid resonance, what makes it sound like wood rather than plastic.
  const knock = ctx.createOscillator()
  knock.frequency.setValueAtTime(880 * tone, t)
  knock.frequency.exponentialRampToValueAtTime(620 * tone, t + 0.03)
  knock.connect(envelope(ctx, t, 0.18 * gain, 0.002, 0.035)).connect(out)
  knock.start(t)
  knock.stop(t + 0.05)

  const body = ctx.createOscillator()
  body.frequency.setValueAtTime(300 * tone, t)
  body.frequency.exponentialRampToValueAtTime(120 * tone, t + 0.07)
  body.connect(envelope(ctx, t, 0.55 * gain, 0.003, 0.085)).connect(out)
  body.start(t)
  body.stop(t + 0.1)
}

/** A soft bell: a sine with a quieter octave above it. */
function chime(t: number, freq: number, gain = 0.14, decay = 0.45) {
  const { ctx, out } = audio()
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

/** Plays a sound at `volume` (0–1; 0 is silent). Safe to call where Web Audio is missing. */
export function playSound(kind: SoundKind, volume: number) {
  if (volume <= 0 || typeof AudioContext === 'undefined') return
  try {
    const { ctx, out } = audio()
    out.gain.value = volume
    const t = ctx.currentTime + 0.005
    switch (kind) {
      case 'move':
        tap(t)
        break
      case 'capture':
        // Two pieces meeting: a harder, brighter hit with a quick second contact.
        tap(t, { gain: 1.25, tone: 0.85, bright: 1.6 })
        tap(t + 0.014, { gain: 0.55, tone: 1.1, bright: 1.3 })
        break
      case 'castle':
        tap(t, { gain: 0.85, tone: 0.9 })
        tap(t + 0.09, { gain: 0.95, tone: 1.05 })
        break
      case 'check':
        tap(t, { gain: 1.1, bright: 1.2 })
        chime(t + 0.01, 1318.5, 0.09, 0.28)
        break
      case 'promote':
        tap(t)
        chime(t + 0.04, 784, 0.1, 0.25)
        chime(t + 0.12, 1174.7, 0.1, 0.4)
        break
      case 'end':
        // A gentle open fifth plus octave, slightly rolled.
        chime(t, 523.25, 0.12, 1.2)
        chime(t + 0.05, 784, 0.1, 1.1)
        chime(t + 0.1, 1046.5, 0.07, 1)
        break
    }
  } catch {
    // Audio unavailable (e.g. too many contexts): sounds are a nicety, never an error.
  }
}
