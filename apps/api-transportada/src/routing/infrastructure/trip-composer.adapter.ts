/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { TripStopSummary } from '../../trips/application/list-trip-stops.use-case.js'
import type { MultiVehicleScope } from '../application/multi-vehicle-suggestion.port.js'
import type { TripComposer } from '../application/multi-vehicle-suggestion.use-case.js'

/**
 * ADR-0044 §5, aplicado ao aceite da P2: **a sugestão não escreve viagem.** Este adaptador só sabe
 * chamar quatro casos de uso que já existiam antes dela — criar, vincular, ordenar e planejar. Se
 * ele falasse com repositório, o roteirizador seria o único caminho do sistema a criar viagem sem
 * passar pelas regras da 056, e seria o primeiro a esquecer alguma.
 */
export type TripComposerDependencies = Readonly<{
  create: (input: {
    readonly context: MultiVehicleScope
    readonly driverIds: readonly string[]
    readonly vehicleId: string
  }) => Promise<{ readonly id: string }>
  link: (input: {
    readonly context: MultiVehicleScope
    readonly freightCalculationId: string | null
    readonly nfeDocumentId: string | null
    readonly tripId: string
  }) => Promise<unknown>
  listStops: (input: {
    readonly companyId: string
    readonly tripId: string
  }) => Promise<readonly TripStopSummary[]>
  planRoute: (input: {
    readonly context: MultiVehicleScope
    readonly tripId: string
  }) => Promise<unknown>
  reorder: (input: {
    readonly context: MultiVehicleScope
    readonly stopIds: readonly string[]
    readonly tripId: string
  }) => Promise<unknown>
}>

export function createTripComposer(dependencies: TripComposerDependencies): TripComposer {
  return {
    async createTrip({ context, vehicleId }) {
      /**
       * Viagem nasce **sem motorista**: o solver decide o veículo, não quem dirige. Escolher a
       * tripulação é decisão de escala, e inventá-la aqui poria alguém na estrada por dedução.
       */
      const created = await dependencies.create({ context, driverIds: [], vehicleId })

      return { tripId: created.id }
    },

    async linkDocument({ context, nfeDocumentId, tripId }) {
      await dependencies.link({ context, freightCalculationId: null, nfeDocumentId, tripId })
    },

    async planRoute({ context, tripId }) {
      await dependencies.planRoute({ context, tripId })
    },

    /**
     * A sugestão fala em **endereço**, e a viagem em **parada** — porque a parada só nasce depois do
     * vínculo, pela reconciliação (ADR-0043 §3). A tradução é feita aqui, depois de vincular, lendo
     * as paradas que acabaram de nascer.
     *
     * Endereço proposto que não virou parada é **ignorado**, não erro: a nota pode ter chegado sem
     * endereço de destinatário, e nesse caso ela cai no balde "sem parada" da viagem — recusar o
     * aceite inteiro por causa dela desfaria as outras trinta e nove entregas já vinculadas.
     */
    async reorderStops({ context, orderedAddressKeys, tripId }) {
      const stops = await dependencies.listStops({ companyId: context.companyId, tripId })
      const byAddressKey = new Map(stops.map((stop) => [stop.addressKey, stop.id]))

      const orderedStopIds = orderedAddressKeys
        .map((addressKey) => byAddressKey.get(addressKey))
        .filter((stopId): stopId is string => stopId !== undefined)

      /**
       * `reorderTripStops` exige o conjunto **exato** de paradas da viagem: mandar uma lista parcial
       * é recusa, não reordenação parcial. Então as paradas que a sugestão não nomeou vão para o fim,
       * na ordem em que já estavam — que é o mesmo tratamento que a precisão `city` recebe.
       */
      const named = new Set(orderedStopIds)
      const remaining = stops.map((stop) => stop.id).filter((stopId) => !named.has(stopId))
      const complete = [...orderedStopIds, ...remaining]
      if (complete.length === 0) return

      await dependencies.reorder({ context, stopIds: complete, tripId })
    },
  }
}
