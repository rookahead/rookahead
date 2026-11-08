import type { ComponentProps } from 'react'
import { useCoachLine } from '../hooks/useCoachLine'
import type { CoachRequest } from '../lib/coachClient'
import { CoachCard } from './CoachCard'

type Props = ComponentProps<typeof CoachCard> & { commentary: CoachRequest | null }

/** Only this card re-renders when background commentary arrives, leaving the board alone. */
export function ReviewCoachCard({ commentary, detail, ...props }: Props) {
  const coach = useCoachLine(commentary?.input ?? null, commentary ? commentary.you : 'white', commentary?.opening)
  return <CoachCard {...props} detail={coach ?? detail} />
}
