import { useEffect, useRef, useState } from 'react'
import { moveSoundKind, playSound, stepSound, type Step } from '../lib/sound'
import type { GameTree, MoveNode } from '../lib/tree'

/**
 * Plays the board sound whenever the position moves by a single step, whether it was a
 * move on the board, the arrow keys, autoplay or a click in the move list.
 * `gameOver` adds the end-of-game chime when stepping forward onto the final position.
 */
export function useMoveSounds(tree: GameTree, node: MoveNode, volume: number, gameOver: boolean) {
  const prev = useRef<Step | null>(null)

  useEffect(() => {
    const step: Step = { ...node, parentFen: node.parentId ? tree.nodes[node.parentId]?.fen : undefined }
    const from = prev.current
    prev.current = step
    // Only a change of position makes a sound, not a new tree or a change of volume.
    if (!from || (from.id === step.id && from.fen === step.fen)) return
    const sound = stepSound(from, step)
    if (!sound) return
    playSound(moveSoundKind(sound.san), volume)
    if (sound.forward && gameOver) setTimeout(() => playSound('end', volume), 160)
  }, [tree, node, volume, gameOver])
}

/** Whether the board came to `node` by one step forward along the moves: not a jump, not a step back. */
export function useSteppedForward(tree: GameTree, node: MoveNode): boolean {
  const step: Step = { ...node, parentFen: node.parentId ? tree.nodes[node.parentId]?.fen : undefined }
  const [last, setLast] = useState({ step, forward: false })
  if (last.step.id !== step.id || last.step.fen !== step.fen) {
    const forward = Boolean(stepSound(last.step, step)?.forward)
    setLast({ step, forward })
    return forward
  }
  return last.forward
}
