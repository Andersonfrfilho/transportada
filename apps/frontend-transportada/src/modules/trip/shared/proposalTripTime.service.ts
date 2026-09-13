/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  formatDuration,
  type DurationUnitLabels,
  type SuggestionDurationParts,
} from '@/modules/routing/shared/suggestionValuation.service'

type Translate = (key: string, values?: Record<string, number | string>) => string

const PREFIX = 'assemblyMap.proposalTime'

/**
 * A frase "Tempo do roteiro" da proposta (decisão do usuário, 2026-09-13).
 *
 * ⚠️ **Ela não soma nada.** O total e cada parcela vêm do servidor — o mesmo `durationSeconds` que
 * o cartão e a faixa do detalhe imprimem. O mapa refazia a estrada no OSRM e somava 20 min por
 * trecho, e a primeira entrega não parava: o número do mapa discordava do cartão logo acima.
 */
export function describeProposalTripTime(input: {
  readonly durationParts: null | SuggestionDurationParts
  readonly durationSeconds: null | number
  /** Ordem trocada à mão: o total do servidor descreve a ordem do roteirizador, não esta. */
  readonly isReordered: boolean
  readonly stopCount: number
  readonly translate: Translate
  readonly units: DurationUnitLabels
}): string {
  const { durationParts: parts, translate, units } = input
  if (input.isReordered) return translate(`${PREFIX}.reordered`)

  const duration = formatDuration(input.durationSeconds, units)
  if (duration === null) return translate(`${PREFIX}.unmeasured`)

  const driving = formatDuration(parts?.drivingSeconds ?? null, units)
  if (parts === null || driving === null) return translate(`${PREFIX}.total`, { duration })

  const values = {
    deliveries: describeDeliveries({
      serviceSeconds: parts.serviceSeconds,
      stopCount: input.stopCount,
      translate,
      units,
    }),
    driving,
    duration,
    return: formatDuration(parts.returnSeconds, units) ?? '',
    service: formatDuration(parts.serviceSeconds, units) ?? '',
  }
  if (parts.returnStatus === 'unknown') return translate(`${PREFIX}.withoutReturn`, values)
  if (parts.returnStatus === 'included') return translate(`${PREFIX}.withReturn`, values)
  return translate(`${PREFIX}.noReturn`, values)
}

/** "24 entregas × 20 min" só quando o tempo parado divide igual — média desigual seria inventada. */
function describeDeliveries(input: {
  readonly serviceSeconds: number
  readonly stopCount: number
  readonly translate: Translate
  readonly units: DurationUnitLabels
}): string {
  const deliveries = input.translate(`${PREFIX}.deliveries`, { count: input.stopCount })
  const isUniform = input.stopCount > 0 && input.serviceSeconds % input.stopCount === 0
  if (!isUniform || input.serviceSeconds === 0) return deliveries

  const each = formatDuration(input.serviceSeconds / input.stopCount, input.units) ?? ''
  return input.translate(`${PREFIX}.deliveriesEach`, { deliveries, each })
}
