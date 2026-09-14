/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  formatDistance,
  type SuggestionDistanceParts,
} from '@/modules/routing/shared/suggestionValuation.service'

type Translate = (key: string, values?: Record<string, number | string>) => string

type ProposalDistanceInput = Readonly<{
  distanceMeters: null | number
  distanceParts: null | SuggestionDistanceParts
  translate: Translate
}>

const PREFIX = 'assemblyMap.proposalDistance'

/**
 * A distância da proposta no cartão e no detalhe (decisão do usuário, 2026-09-13).
 *
 * ⚠️ **Ela não soma nada.** O total (ida + volta ao barracão) vem do servidor — o mesmo que o
 * combustível da conta usa. Sem a volta gravada, o número é só a ida, e a frase diz isso.
 */
export function describeProposalDistance(input: ProposalDistanceInput): null | string {
  const distance = formatDistance(input.distanceMeters)
  if (distance === null) return null
  if (input.distanceParts?.returnStatus !== 'unknown') return distance
  return input.translate('proposal.distanceWithoutReturn', { distance })
}

/** A frase "Rodagem do roteiro" do mapa: o mesmo total, com a composição que o servidor mandou. */
export function describeProposalTripDistance(
  input: ProposalDistanceInput & Readonly<{ isReordered: boolean }>,
): null | string {
  const { distanceParts: parts, translate } = input
  /** Ordem trocada à mão: o total do servidor descreve a ordem do roteirizador, não esta. */
  if (input.isReordered) return null

  const distance = formatDistance(input.distanceMeters)
  if (distance === null) return null

  const outbound = formatDistance(parts?.outboundMeters ?? null)
  const back = formatDistance(parts?.returnMeters ?? null)
  if (parts?.returnStatus === 'unknown') return translate(`${PREFIX}.withoutReturn`, { distance })
  if (parts?.returnStatus === 'included' && outbound !== null && back !== null) {
    return translate(`${PREFIX}.withReturn`, { distance, outbound, return: back })
  }
  return translate(`${PREFIX}.total`, { distance })
}
