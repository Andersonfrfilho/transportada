/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, desc, eq, inArray, isNull } from 'drizzle-orm'

import { nfeDocuments, nfeParticipants } from '../../database/nfe.schema.js'
import { tripDocuments, tripStops, trips } from '../../database/trip.schema.js'
import type { ContractorDelivery } from '../application/contractor-portal.types.js'
import type { ContractorScope } from '../domain/contractor-scope.policy.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

/**
 * Os dois papéis que fazem a nota ser "do contratante": ele despachou ou ele recebe. Restringir ao
 * destinatário deixaria de fora a indústria que contrata o frete para entregar na loja do cliente
 * dela — que é o caso mais comum da carteira.
 */
const CONTRACTOR_ROLES = ['emitter', 'recipient'] as const

/**
 * ADR-0050 §4: o servidor decide o que é do cliente. Esta query **não recebe filtro de documento** —
 * ela recebe o escopo, que só `resolveContractorScope` produz a partir do vínculo da conta.
 */
export async function listContractorDeliveries(
  database: Database,
  input: {
    readonly companyId: string
    readonly limit: number
    readonly scope: ContractorScope
  },
): Promise<readonly ContractorDelivery[]> {
  const rows = await database
    .selectDistinct({
      accessKey: nfeDocuments.accessKey,
      deliveredAt: tripDocuments.deliveredAt,
      documentId: nfeDocuments.id,
      estimatedArrivalAt: tripStops.estimatedArrivalAt,
      issuedAt: nfeDocuments.issuedAt,
      number: nfeDocuments.number,
      returnReason: tripDocuments.returnReason,
      separationStatus: tripDocuments.separationStatus,
      series: nfeDocuments.series,
      tripStatus: trips.status,
    })
    .from(nfeDocuments)
    .innerJoin(
      nfeParticipants,
      and(
        eq(nfeParticipants.companyId, nfeDocuments.companyId),
        eq(nfeParticipants.documentId, nfeDocuments.id),
        inArray(nfeParticipants.role, [...CONTRACTOR_ROLES]),
        inArray(nfeParticipants.taxId, [...input.scope.taxIds]),
      ),
    )
    /**
     * O vínculo com a viagem é `left`: a nota importada que ainda não entrou em viagem nenhuma é
     * exatamente a que o contratante quer ver como "recebida, ainda não saiu". `inner` a esconderia
     * até o dia do carregamento, e o portal responderia "não temos essa nota" para uma nota que a
     * transportadora tem.
     */
    .leftJoin(
      tripDocuments,
      and(
        eq(tripDocuments.companyId, nfeDocuments.companyId),
        eq(tripDocuments.nfeDocumentId, nfeDocuments.id),
        // Nota desvinculada volta a ser nota sem viagem, não nota entregue por aquela.
        isNull(tripDocuments.releasedAt),
      ),
    )
    .leftJoin(
      trips,
      and(eq(trips.companyId, tripDocuments.companyId), eq(trips.id, tripDocuments.tripId)),
    )
    .leftJoin(
      tripStops,
      and(eq(tripStops.companyId, tripDocuments.companyId), eq(tripStops.id, tripDocuments.stopId)),
    )
    .where(eq(nfeDocuments.companyId, input.companyId))
    .orderBy(desc(nfeDocuments.issuedAt))
    .limit(input.limit)

  return rows.map((row) => ({
    accessKey: row.accessKey,
    deliveredAt: row.deliveredAt?.toISOString() ?? null,
    documentId: row.documentId,
    estimatedArrivalAt: row.estimatedArrivalAt?.toISOString() ?? null,
    issuedAt: row.issuedAt.toISOString(),
    number: row.number,
    returnReason: row.returnReason ?? null,
    separationStatus: row.separationStatus ?? null,
    series: row.series,
    tripStatus: row.tripStatus ?? null,
  }))
}
