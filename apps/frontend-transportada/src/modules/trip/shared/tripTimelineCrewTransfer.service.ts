/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  compareScaledAmounts,
  formatAmount,
  zeroAmount,
} from '@/modules/shared/decimalAmount.service'
import type { Translate } from '@/modules/trip-financials/shared/tripCostParcelDetail.service'

import {
  TRIP_TIMELINE_CREW_ROLES,
  type TripTimelineCrewMember,
  type TripTimelineCrewRole,
  type TripTimelineItem,
} from './trip.types'

export type TripTimelineCrewTransferText = Readonly<{
  /** Uma frase por papel que mudou, motorista primeiro: "Motorista: Maria → João". */
  changes: readonly string[]
  /** `null` quando a chave não veio — a rota a tira de quem não tem `trip.financials`. */
  costDifference: null | string
  hasMdfeDivergence: boolean
  reason: string
}>

const MONEY_SCALE = 2
const NAME_SEPARATOR = ', '

function namesOf(members: readonly TripTimelineCrewMember[], t: Translate): string {
  if (members.length === 0) return t('eventTimeline.crewTransfer.nobody')
  return [...members]
    .sort((left, right) => left.position - right.position)
    .map((member) => member.name)
    .join(NAME_SEPARATOR)
}

type RoleChangeInput = Readonly<{
  next: readonly TripTimelineCrewMember[]
  previous: readonly TripTimelineCrewMember[]
  role: TripTimelineCrewRole
}>

/** Quem continua no papel não entra na frase: o leitor quer saber quem saiu e quem assumiu. */
function resolveRoleChange(input: RoleChangeInput, t: Translate): null | string {
  const previousInRole = input.previous.filter((member) => member.role === input.role)
  const nextInRole = input.next.filter((member) => member.role === input.role)
  const previousIds = new Set(previousInRole.map((member) => member.driverId))
  const nextIds = new Set(nextInRole.map((member) => member.driverId))
  const leaving = previousInRole.filter((member) => !nextIds.has(member.driverId))
  const entering = nextInRole.filter((member) => !previousIds.has(member.driverId))
  if (leaving.length === 0 && entering.length === 0) return null
  return t(`eventTimeline.crewTransfer.change.${input.role}`, {
    from: namesOf(leaving, t),
    to: namesOf(entering, t),
  })
}

/** O sinal fica: `+` quando o custo subiu, o `-` do próprio número quando desceu, nada em zero. */
function formatSignedAmount(value: string): string {
  const sign = compareScaledAmounts(value, zeroAmount(MONEY_SCALE))
  return sign > 0 ? `+${formatAmount(value)}` : formatAmount(value)
}

/** Spec 249 RF4: "Maria → João" por papel, o motivo, a diferença de custo e o aviso do MDF-e. */
export function resolveTripTimelineCrewTransfer(
  item: TripTimelineItem,
  t: Translate,
): null | TripTimelineCrewTransferText {
  if (item.kind !== 'crew_transfer' || item.crewTransfer === undefined) return null
  const { costDifference, mdfeDriverDivergence, nextCrew, previousCrew, reason } = item.crewTransfer
  const changes = TRIP_TIMELINE_CREW_ROLES.flatMap((role) => {
    const change = resolveRoleChange({ next: nextCrew, previous: previousCrew, role }, t)
    return change === null ? [] : [change]
  })

  return {
    changes,
    costDifference:
      costDifference === undefined
        ? null
        : t('eventTimeline.crewTransfer.costDifference', {
            amount: formatSignedAmount(costDifference),
          }),
    hasMdfeDivergence: mdfeDriverDivergence,
    reason: t('eventTimeline.crewTransfer.reason', { reason }),
  }
}
