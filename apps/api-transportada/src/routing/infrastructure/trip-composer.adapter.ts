/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { TripDocumentAlreadyLinkedError } from '../../trips/domain/trip.error.js'
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
  /**
   * Spec 107 D3: grava o ETA nas paradas e **carimba quando** ele foi calculado, na mesma
   * transação — o valor sem o carimbo é uma hora sem idade, e a hora envelhece.
   */
  writeEstimatedArrivals: (input: {
    readonly arrivals: readonly { readonly estimatedArrivalAt: string; readonly stopId: string }[]
    readonly context: MultiVehicleScope
    readonly tripId: string
  }) => Promise<void>
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
    async createTrip({ context, driverId, vehicleId }) {
      /**
       * ADR-0055: a viagem nasce **com** o motorista que o humano pareou no diálogo. O solver
       * continua sem saber que motorista existe — quem escolhe é quem monta a escala —, mas o par
       * escolhido chega até aqui, e é o que faz a viagem aparecer no PWA de quem dirige: o caminho
       * de leitura do campo parte de `trip_drivers`, e viagem sem linha ali não existe para ele.
       *
       * `null` continua sendo legítimo: distribuir a carga na véspera, antes de saber quem pega o
       * caminhão, era o único comportamento possível antes desta ADR e segue sendo válido.
       */
      const created = await dependencies.create({
        context,
        driverIds: driverId === null ? [] : [driverId],
        vehicleId,
      })

      return { tripId: created.id }
    },

    /**
     * Spec 107 D1: nota já viva em outra viagem devolve `false` em vez de derrubar o aceite. É o
     * único erro engolido aqui, e de propósito — qualquer outro sobe, porque só este significa
     * "alguém chegou antes", e não "algo quebrou".
     */
    async linkDocument({ context, nfeDocumentId, tripId }) {
      try {
        await dependencies.link({ context, freightCalculationId: null, nfeDocumentId, tripId })

        return true
      } catch (cause) {
        if (cause instanceof TripDocumentAlreadyLinkedError) return false
        throw cause
      }
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
    /**
     * Spec 107 D3: grava o ETA que a sugestão calculou, casando por **endereço** — a mesma chave que
     * `reorderStops` usa, porque a parada nasce da reconciliação e o id dela não existe na sugestão.
     *
     * ⚠️ Endereço proposto que não virou parada é **ignorado**, como na reordenação: a nota pode ter
     * chegado sem endereço de destinatário, e recusar por causa dela desfaria as outras entregas.
     */
    async applyEstimatedArrivals({ context, estimatedArrivalByAddressKey, tripId }) {
      if (estimatedArrivalByAddressKey.size === 0) return

      const stops = await dependencies.listStops({ companyId: context.companyId, tripId })
      const arrivals = stops.flatMap((stop) => {
        const arrival = estimatedArrivalByAddressKey.get(stop.addressKey)

        return arrival === undefined ? [] : [{ estimatedArrivalAt: arrival, stopId: stop.id }]
      })
      if (arrivals.length === 0) return

      await dependencies.writeEstimatedArrivals({ arrivals, context, tripId })
    },

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
