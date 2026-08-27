/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'

import {
  fleetVehicles,
  nfeDocuments,
  routeSuggestionDocuments,
  routeSuggestionStopDocuments,
  routeSuggestionStops,
  routeSuggestionVehicles,
  routeSuggestions,
} from '../../database/database.schema.js'
import { tripDocuments } from '../../database/trip.schema.js'
import type {
  MultiVehicleSuggestionGroup,
  MultiVehicleSuggestionRepository,
} from '../application/multi-vehicle-suggestion.repository.js'
import { createDrizzleRouteSuggestionRepository } from './drizzle-route-suggestion.repository.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export function createDrizzleMultiVehicleSuggestionRepository(
  database: Database,
): MultiVehicleSuggestionRepository {
  const suggestions = createDrizzleRouteSuggestionRepository(database)

  return {
    /**
     * A sugestão, o pool e a frota nascem na **mesma transação**: uma sugestão sem pool é uma
     * sugestão que o worker pega, não acha nota nenhuma e conclui `ready` com zero paradas —
     * indistinguível, na tela, de "não havia o que roteirizar".
     */
    async create(input) {
      return database.transaction(async (transaction) => {
        const [row] = await transaction
          .insert(routeSuggestions)
          .values({
            assumptions: input.assumptions,
            companyId: input.companyId,
            seed: input.seed,
            status: 'queued',
            tripId: null,
          })
          .returning({ id: routeSuggestions.id })
        if (row === undefined) throw new Error('multi vehicle suggestion insert returned no row')

        await transaction.insert(routeSuggestionDocuments).values(
          input.documentIds.map((nfeDocumentId) => ({
            companyId: input.companyId,
            nfeDocumentId,
            suggestionId: row.id,
          })),
        )
        await transaction.insert(routeSuggestionVehicles).values(
          input.vehicleIds.map((vehicleId, index) => ({
            companyId: input.companyId,
            position: BigInt(index),
            suggestionId: row.id,
            vehicleId,
          })),
        )

        const created = await suggestions.find({
          companyId: input.companyId,
          suggestionId: row.id,
        })
        if (created === null) throw new Error('multi vehicle suggestion vanished after insert')

        return created
      })
    },

    /**
     * A pergunta é feita ao contrário — quais **estão** disponíveis —, e o que sobra da subtração é a
     * resposta. Assim nota inexistente e nota já em viagem caem juntas sem um segundo `select`, e
     * sem a rota poder distinguir uma da outra por tempo de resposta.
     */
    async findUnavailableDocumentIds({ companyId, documentIds }) {
      const rows = await database
        .selectDistinct({ id: nfeDocuments.id })
        .from(nfeDocuments)
        .leftJoin(
          tripDocuments,
          and(
            eq(tripDocuments.companyId, nfeDocuments.companyId),
            eq(tripDocuments.nfeDocumentId, nfeDocuments.id),
            isNull(tripDocuments.releasedAt),
          ),
        )
        .where(
          and(
            eq(nfeDocuments.companyId, companyId),
            inArray(nfeDocuments.id, [...documentIds]),
            eq(nfeDocuments.status, 'authorized'),
            isNull(tripDocuments.id),
          ),
        )

      const available = new Set(rows.map((row) => row.id))

      return documentIds.filter((documentId) => !available.has(documentId))
    },

    async findUnavailableVehicleIds({ companyId, vehicleIds }) {
      const rows = await database
        .select({ id: fleetVehicles.id })
        .from(fleetVehicles)
        .where(
          and(
            eq(fleetVehicles.companyId, companyId),
            inArray(fleetVehicles.id, [...vehicleIds]),
            eq(fleetVehicles.status, 'active'),
            /** Implemento sozinho não puxa carga — o solver precisa de quem traciona. */
            eq(fleetVehicles.role, 'traction'),
          ),
        )

      const available = new Set(rows.map((row) => row.id))

      return vehicleIds.filter((vehicleId) => !available.has(vehicleId))
    },

    /**
     * ⚠️ A ordem é por **posição do veículo**, não por id. Ordenar por `vehicle_id` era ordenar por
     * UUID sorteado: a mesma sugestão devolvia os grupos em ordem diferente a cada execução, e o
     * determinismo prometido no RNF morria aqui, depois de o solver tê-lo respeitado. Foi o teste de
     * integração que pegou — em oito execuções isoladas ele passou, e falhou na primeira sob carga.
     */
    async readGroups({ companyId, suggestionId }) {
      const rows = await database
        .select({
          addressKey: routeSuggestionStops.addressKey,
          nfeDocumentId: routeSuggestionStopDocuments.nfeDocumentId,
          position: routeSuggestionVehicles.position,
          sequence: routeSuggestionStops.sequence,
          vehicleId: routeSuggestionStops.vehicleId,
        })
        .from(routeSuggestionStops)
        .innerJoin(
          routeSuggestionVehicles,
          and(
            eq(routeSuggestionVehicles.companyId, routeSuggestionStops.companyId),
            eq(routeSuggestionVehicles.suggestionId, routeSuggestionStops.suggestionId),
            eq(routeSuggestionVehicles.vehicleId, routeSuggestionStops.vehicleId),
          ),
        )
        .leftJoin(
          routeSuggestionStopDocuments,
          and(
            eq(routeSuggestionStopDocuments.companyId, routeSuggestionStops.companyId),
            eq(routeSuggestionStopDocuments.suggestionStopId, routeSuggestionStops.id),
          ),
        )
        .where(
          and(
            eq(routeSuggestionStops.companyId, companyId),
            eq(routeSuggestionStops.suggestionId, suggestionId),
            sql`${routeSuggestionStops.vehicleId} is not null`,
          ),
        )
        .orderBy(routeSuggestionVehicles.position, routeSuggestionStops.sequence)

      const groups = new Map<string, { addressKeys: string[]; documentIds: string[] }>()
      for (const row of rows) {
        if (row.vehicleId === null) continue
        const group = groups.get(row.vehicleId) ?? { addressKeys: [], documentIds: [] }
        /** A mesma parada volta uma vez por nota: a ordem é por parada, não por linha. */
        if (group.addressKeys.at(-1) !== row.addressKey) group.addressKeys.push(row.addressKey)
        if (row.nfeDocumentId !== null) group.documentIds.push(row.nfeDocumentId)
        groups.set(row.vehicleId, group)
      }

      const result: MultiVehicleSuggestionGroup[] = []
      for (const [vehicleId, group] of groups) {
        result.push({
          documentIds: group.documentIds,
          orderedAddressKeys: group.addressKeys,
          vehicleId,
        })
      }

      return result
    },
  }
}
