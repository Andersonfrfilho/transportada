/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 101: quanto rende cada viagem que a sugestão multi-veículo propõe, e quanto rende o conjunto.
 *
 * É a tela em que o operador escolhe entre distribuir a carga de um jeito ou de outro — e até esta
 * spec era a única tela do produto que não dizia qual dos jeitos paga.
 */
import {
  RouteSuggestionNotDecidableError,
  RouteSuggestionNotFoundError,
} from '../domain/routing.error.js'
import {
  buildSuggestionValuationReport,
  isReturnPlanned,
  sumVehicleTrip,
  type SuggestionValuationReport,
  type SuggestionVehicleValuation,
} from '../domain/suggestion-valuation.policy.js'
import type { SuggestionValuationPort } from './suggestion-valuation.port.js'

export type SuggestionValuation = {
  readonly report: SuggestionValuationReport
  readonly vehicles: readonly SuggestionVehicleValuation[]
}

export type ReadSuggestionValuationInput = {
  readonly companyId: string
  readonly repository: SuggestionValuationPort
  readonly suggestionId: string
}

export async function readSuggestionValuation(
  input: ReadSuggestionValuationInput,
): Promise<SuggestionValuation> {
  const { companyId, repository, suggestionId } = input

  const status = await repository.readSuggestionStatus({ companyId, suggestionId })
  /** Sugestão de outra empresa é ausência, nunca 403: o id não é adivinhável. */
  if (status === null) throw new RouteSuggestionNotFoundError()
  /**
   * ⚠️ Sugestão que ainda roda não tem parada, e devolver conjunto vazio seria indistinguível de
   * "o solver não distribuiu nada" — duas situações que pedem ações opostas do operador.
   */
  if (status !== 'ready') throw new RouteSuggestionNotDecidableError()

  const [groups, roads] = await Promise.all([
    repository.readGroups({ companyId, suggestionId }),
    repository.readVehicleRoads({ companyId, suggestionId }),
  ])

  const roadByVehicle = new Map(roads.map((road) => [road.vehicleId, road]))

  const vehicles: SuggestionVehicleValuation[] = []
  for (const group of groups) {
    const vehicleRoad = roadByVehicle.get(group.vehicleId)
    const stops = vehicleRoad?.stops ?? []
    /**
     * D1: a distância é a soma das paradas que o solver escolheu — nunca uma rota pedida agora. Tempo
     * e distância são os do seam único (decisão 2026-09-13): a volta gravada entra nos dois, e a
     * distância com ela é a que o combustível e o R$/km da conta usam.
     */
    const road = sumVehicleTrip({
      isReturnPlanned: vehicleRoad === undefined ? false : isReturnPlanned(vehicleRoad.endPolicy),
      returnLeg:
        vehicleRoad === undefined
          ? null
          : {
              distanceMeters: vehicleRoad.returnDistanceMeters,
              durationSeconds: vehicleRoad.returnDurationSeconds,
            },
      stops,
    })

    const context = await repository.readPreviewContext({
      companyId,
      driverIds: group.driverId === null ? [] : [group.driverId],
      nfeDocumentIds: group.documentIds,
      vehicleId: group.vehicleId,
    })
    /** Veículo apagado entre a sugestão e a leitura: some da conta em vez de derrubar a tela. */
    if (context === null) continue

    const valuation = await repository.resolveValuation({
      companyId,
      /**
       * ⚠️ `toll: null` é a D2 por extenso: o pedágio precisa dos `nodeIds` que o OSRM devolve, e a
       * sugestão não os persiste. A parcela sai como lacuna nomeada — nunca zero, que diria que o
       * trajeto não tem pedágio.
       */
      context: {
        ...context,
        distanceMeters: road.distanceMeters,
        /**
         * Spec 143 D4: os dias da diária precisam da duração **desta** rota proposta pelo solver —
         * nunca da duração que o motorista informou numa viagem já criada, que ainda não conhece
         * o roteiro que está sendo comparado agora.
         */
        estimatedDurationSeconds: road.durationSeconds,
        toll: null,
        tollUnavailableReason: 'suggestion',
      },
    })

    vehicles.push({
      distanceMeters: road.distanceMeters,
      distanceParts: road.distanceParts,
      documentCount: group.documentIds.length,
      driverId: group.driverId,
      durationParts: road.durationParts,
      durationSeconds: road.durationSeconds,
      stopCount: stops.length,
      valuation,
      vehicleId: group.vehicleId,
    })
  }

  return { report: buildSuggestionValuationReport({ vehicles }), vehicles }
}
