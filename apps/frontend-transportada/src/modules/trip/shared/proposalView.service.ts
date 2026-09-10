/* Copyright (c) 2026 Ada Technology. MIT License. */
import { sumScaledAmounts } from '@/modules/shared/decimalAmount.service'
import type { VehicleType } from '@/modules/shared/vehicleType.constant'
import type { SuggestionValuation } from '@/modules/routing/shared/suggestionValuation.service'

import { resolveStopKey } from './assemblyOrder.service'
import type { StopAddressComponents } from './stopAddressKey.service'
import type { ProposalStop } from './trip.types'

/**
 * Spec 110 D2: **uma linha por viagem proposta**, e o que ela precisa dizer sem ser aberta.
 *
 * ⚠️ Puro, e é ele que junta as três origens que a tela tem em mãos: as paradas da proposta, a conta
 * da spec 101 e a frota já carregada. Fazer essa junção dentro do componente a esconderia de
 * qualquer teste — e é ela que decide o que o operador compara.
 */
export type ProposalDocumentWeight = Readonly<{
  cargoGrossWeight: null | string
  cargoWeightSource: 'estimated' | 'xml' | null
}>

export type ProposalVehicleView = Readonly<{
  cities: readonly string[]
  deliveries: number
  distanceMeters: null | number
  driverName: null | string
  durationSeconds: null | number
  hasGaps: boolean
  plate: null | string
  stops: readonly ProposalStop[]
  /**
   * ⚠️ **`null` é a conta que não veio, nunca zero.** Sem `trip.financials` — ou com a consulta em
   * erro — `R$ 0,00` afirmaria que a viagem não rende nada e não custa nada, que é o número que faz
   * alguém aceitar a distribuição errada. É a mesma regra da ocupação e do peso: ausência é dita.
   */
  totalCost: null | string
  totalMargin: null | string
  marginPercentage: null | string
  totalRevenue: null | string
  vehicleId: string
  vehicleLabel: null | string
  vehicleType: '' | VehicleType
  /**
   * ⚠️ **O teto de massa do veículo, e o quanto a carga proposta o ocupa.**
   *
   * Medido em 2026-09-09 na distribuição real: quatro dos cinco caminhões nasceram acima do teto —
   * a Fiorino de 650 kg com 4.307 kg (663%) —, e a linha oferecia "aceitar" sem dizer nada. O aviso
   * existia escondido dentro do expandido, um veículo por vez. Peso declarado em MDF-e **não admite
   * tolerância** (Res. CONTRAN 882/2021, Art. 49 §3º): a viagem que nasce estourada nasce ilegal.
   *
   * `null` nos dois é ausência de teto ou de massa conhecida — **nunca 0%, nunca 100%** (spec 093).
   */
  maxPayloadKilograms: null | string
  payloadRatio: null | number
  /** `null` quando nenhuma nota do veículo declara massa — ausência, nunca zero (ADR-0052). */
  weightKilograms: null | string
  /** ⚠️ **Uma nota estimada marca o veículo inteiro**: é a marca que o conferente lê antes de aceitar. */
  weightEstimated: boolean
}>

/**
 * A ordem das paradas da viagem proposta, na chave que o resto do produto entende.
 *
 * ⚠️ **Chave de parada, nunca rótulo.** A proposta entregava `view.cities` ao mapa e à prévia de
 * carga — `"FRANCA"` —, e os dois ranqueiam por `cidade|CEP|número`. Rótulo não casa com chave
 * nenhuma: tudo empatava em `MAX_SAFE_INTEGER`, o `sort` estável deixava as paradas na ordem em
 * que as **notas** chegaram, e a planta desenhava um baú carregado por um critério que não era o
 * roteiro. É a mesma armadilha que o comentário de `TripAssemblyMap` já descrevia por extenso.
 */
export function buildProposalStopOrder(
  input: Readonly<{
    documentsById: ReadonlyMap<string, StopAddressComponents>
    stops: readonly Readonly<{ nfeDocumentIds: readonly string[] }>[]
  }>,
): readonly string[] {
  const order: string[] = []
  const known = new Set<string>()

  for (const stop of input.stops) {
    for (const documentId of stop.nfeDocumentIds) {
      const components = input.documentsById.get(documentId)
      if (components === undefined) continue
      const key = resolveStopKey(components)
      /** ⚠️ Chave repetida trava `moveCity`: ele acha a primeira e devolve na posição da segunda. */
      if (known.has(key)) continue
      known.add(key)
      order.push(key)
    }
  }

  return order
}

export function buildProposalVehicleViews(
  input: Readonly<{
    documentsById: ReadonlyMap<string, ProposalDocumentWeight>
    /** O par veículo→motorista que a montagem enviou: é ele que decide quem dirige. */
    driverIdByVehicleId: ReadonlyMap<string, string>
    driverNameById: ReadonlyMap<string, string>
    /**
     * Caminhões alterados à mão e salvos (ordem ou movimento, spec 111/112). ⚠️ A conta que o
     * roteirizador fez para eles descreve outra carga ou outro caminho: dinheiro, tempo e distância
     * viram ausência, nunca o número antigo com cara de atual.
     */
    staleValuationVehicleIds?: ReadonlySet<string>
    stops: readonly ProposalStop[]
    valuation: null | SuggestionValuation
    vehicleById: ReadonlyMap<
      string,
      Readonly<{
        /** ⚠️ `null` é ficha sem teto declarado; zero na ficha já é ausência (spec 088). */
        capacityKilograms: null | string
        label: string
        plate: string
        type: '' | VehicleType
      }>
    >
  }>,
): readonly ProposalVehicleView[] {
  const grouped = new Map<string, { documentIds: Set<string>; stops: ProposalStop[] }>()

  for (const stop of input.stops) {
    /** Parada sem veículo é **sobra**, e sobra tem painel próprio: contá-la aqui a faria parecer distribuída. */
    if (stop.vehicleId === null) continue
    const current = grouped.get(stop.vehicleId) ?? { documentIds: new Set<string>(), stops: [] }
    current.stops.push(stop)
    for (const documentId of stop.nfeDocumentIds) current.documentIds.add(documentId)
    grouped.set(stop.vehicleId, current)
  }

  const valuationByVehicle = new Map(
    (input.valuation?.vehicles ?? []).map((entry) => [entry.vehicleId, entry]),
  )

  return [...grouped.entries()].map(([vehicleId, group]) => {
    const vehicle = input.vehicleById.get(vehicleId)
    const entry =
      input.staleValuationVehicleIds?.has(vehicleId) === true
        ? undefined
        : valuationByVehicle.get(vehicleId)
    const weights = [...group.documentIds].map((documentId) => input.documentsById.get(documentId))
    const declared = weights.flatMap((weight) =>
      weight?.cargoGrossWeight === null || weight?.cargoGrossWeight === undefined
        ? []
        : [weight.cargoGrossWeight],
    )

    const weightKilograms = declared.length === 0 ? null : sumScaledAmounts(declared)
    const maxPayloadKilograms = readCeiling(vehicle?.capacityKilograms ?? null)

    return {
      /** As cidades **na ordem do roteiro**, sem repetir: elas são o subtítulo da linha. */
      cities: [...new Set(group.stops.map((stop) => stop.label).filter((label) => label !== ''))],
      deliveries: group.documentIds.size,
      distanceMeters: entry?.distanceMeters ?? null,
      driverName: resolveDriverName({
        driverIdByVehicleId: input.driverIdByVehicleId,
        driverNameById: input.driverNameById,
        fallbackDriverId: entry?.driverId ?? null,
        vehicleId,
      }),
      durationSeconds: entry?.durationSeconds ?? null,
      hasGaps: entry?.valuation.hasGaps ?? false,
      marginPercentage: entry?.valuation.marginPercentage ?? null,
      maxPayloadKilograms,
      payloadRatio: resolvePayloadRatio({ maxPayloadKilograms, weightKilograms }),
      plate: vehicle?.plate ?? null,
      stops: group.stops,
      totalCost: entry?.valuation.totalCost ?? null,
      totalMargin: entry?.valuation.totalMargin ?? null,
      totalRevenue: entry?.valuation.totalRevenue ?? null,
      vehicleId,
      vehicleLabel: vehicle?.label ?? null,
      vehicleType: vehicle?.type ?? '',
      weightEstimated: weights.some((weight) => weight?.cargoWeightSource === 'estimated'),
      weightKilograms,
    }
  })
}

/**
 * ⚠️ **Zero na ficha é ausência de medida, nunca teto de zero quilo** — é o mesmo vocabulário que
 * o resolvedor de capacidade lê (spec 088). Ficha sem teto vira `null`, e a linha não desenha
 * percentual nenhum em vez de afirmar que a carga cabe.
 */
function readCeiling(value: null | string): null | string {
  if (value === null) return null
  const parsed = Number.parseFloat(value)

  return Number.isFinite(parsed) && parsed > 0 ? value : null
}

/**
 * A fração do teto que a carga proposta ocupa. **O estouro sai como está** (spec 093): 663% é o
 * número que diz ao operador que aquele caminhão não leva a carga, e aparar em 100% esconderia
 * justamente o tamanho do problema.
 */
function resolvePayloadRatio(
  input: Readonly<{ maxPayloadKilograms: null | string; weightKilograms: null | string }>,
): null | number {
  if (input.maxPayloadKilograms === null || input.weightKilograms === null) return null
  const ceiling = Number.parseFloat(input.maxPayloadKilograms)
  const load = Number.parseFloat(input.weightKilograms)
  if (!Number.isFinite(ceiling) || !Number.isFinite(load) || ceiling <= 0) return null

  return load / ceiling
}

/** Acima do teto é violação, não aperto: o peso declarado em MDF-e não admite tolerância. */
export function isOverPayload(view: ProposalVehicleView): boolean {
  return view.payloadRatio !== null && view.payloadRatio > 1
}

/** Quantas viagens **marcadas** nascem acima do teto — é o que o aceite precisa dizer antes. */
export function countOverPayload(
  views: readonly ProposalVehicleView[],
  selected: ReadonlySet<string>,
): number {
  return views.filter((view) => selected.has(view.vehicleId) && isOverPayload(view)).length
}

function resolveDriverName(
  input: Readonly<{
    driverIdByVehicleId: ReadonlyMap<string, string>
    driverNameById: ReadonlyMap<string, string>
    /** A conta também sabe o motorista; ela é a segunda opinião, não a primeira. */
    fallbackDriverId: null | string
    vehicleId: string
  }>,
): null | string {
  const driverId = input.driverIdByVehicleId.get(input.vehicleId) ?? input.fallbackDriverId
  return driverId === null ? null : (input.driverNameById.get(driverId) ?? null)
}

/**
 * ⚠️ **Acima de quatro cidades, o resto vira contagem** (D2).
 *
 * Sem o corte a linha de uma viagem com dezessete destinos ocupa três alturas de texto, empurra as
 * seis colunas de número para fora do alinhamento e a comparação entre viagens — que é a tela
 * inteira — deixa de existir. Medido em produção: um caminhão com 45 entregas cobria 17 cidades.
 */
export const PROPOSAL_CITY_LIMIT = 4

export function summarizeProposalCities(
  cities: readonly string[],
): Readonly<{ hidden: number; shown: readonly string[] }> {
  return {
    hidden: Math.max(0, cities.length - PROPOSAL_CITY_LIMIT),
    shown: cities.slice(0, PROPOSAL_CITY_LIMIT),
  }
}
