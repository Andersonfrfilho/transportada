/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Os dados da nota para o "Confirma a entrega?": contratante, cliente e valor pela mesma consulta do resumo da
 * ocorrência no grupo, e o endereço pela parada da viagem ativa do motorista (o mesmo rótulo do cartão da parada).
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import type { DriverTrip } from '../../trips/application/find-current-driver-trip.use-case.js'
import { noteSummaryOf } from '../../whatsapp/infrastructure/whatsapp-group-occurrence.adapter.js'
import type { DeliveryConfirmDocument } from '../domain/whatsapp-delivery-confirm-summary.policy.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export type DescribeDeliveryNoteInput = {
  readonly companyId: string
  readonly documentId: string
  readonly driverId: string
}

export function createDeliveryConfirmNoteReader(dependencies: {
  readonly database: Database
  readonly listActiveTrips: (input: {
    readonly companyId: string
    readonly driverId: string
  }) => Promise<readonly DriverTrip[]>
}): (input: DescribeDeliveryNoteInput) => Promise<DeliveryConfirmDocument> {
  return async ({ companyId, documentId, driverId }) => {
    // O endereço é refinamento: sem a viagem, o resumo segue com contratante, cliente e valor.
    const [summary, trips] = await Promise.all([
      noteSummaryOf(dependencies.database, { companyId, documentId }),
      dependencies.listActiveTrips({ companyId, driverId }).catch(() => []),
    ])
    const stop = trips
      .flatMap((trip) => trip.stops)
      .find((candidate) => candidate.documents.some((document) => document.id === documentId))
    const document = stop?.documents.find((candidate) => candidate.id === documentId)
    const client = document?.recipientDisplayName || summary.clientName
    return {
      address: stop?.label,
      amount: summary.totalValue,
      client,
      contractor: summary.contractorName,
    }
  }
}
