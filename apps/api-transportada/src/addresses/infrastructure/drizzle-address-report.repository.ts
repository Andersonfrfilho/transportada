/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, desc, eq, isNotNull } from 'drizzle-orm'

import {
  addressComparisons,
  nfeAddresses,
  nfeParticipants,
} from '../../database/database.schema.js'
import { alias } from 'drizzle-orm/pg-core'

import { destinationRolesFilter } from '../../nfe-documents/infrastructure/physical-destination.join.js'
import { buildStopAddressKey } from '../../trips/domain/stop-address-key.js'
import type {
  AddressReportRepository,
  AddressReportRow,
} from '../application/address-report.port.js'

/** O emitente é uma segunda linha de `nfe_participants` do mesmo documento — daí o alias. */
const emitter = alias(nfeParticipants, 'emitter_participant')

export type AddressReportDatabase = ReturnType<typeof createDrizzleProvider>['db']

/**
 * O relatório contra o banco (spec 084, G8).
 *
 * ⚠️ **A chave se monta em TypeScript, como no lote.** `address_comparisons` é chaveada por
 * `addressKey`, e `nfe_addresses` não tem essa coluna — reproduzir a normalização como expressão do
 * Postgres criaria uma segunda definição de "mesmo lugar", livre para divergir da que agrupa paradas
 * e da que o lote usou para medir.
 */
export function createDrizzleAddressReportRepository(
  database: AddressReportDatabase,
): AddressReportRepository {
  return {
    async listMeasurements(input) {
      const [measurements, addresses] = await Promise.all([
        database
          .select()
          .from(addressComparisons)
          .where(eq(addressComparisons.companyId, input.companyId)),
        database
          .select({
            city: nfeAddresses.city,
            cityCode: nfeAddresses.cityCode,
            contractorName: emitter.legalName,
            contractorTaxId: emitter.taxId,
            number: nfeAddresses.number,
            postalCode: nfeAddresses.postalCode,
            state: nfeAddresses.state,
          })
          .from(nfeAddresses)
          .innerJoin(
            nfeParticipants,
            and(
              eq(nfeParticipants.id, nfeAddresses.participantId),
              eq(nfeParticipants.companyId, nfeAddresses.companyId),
            ),
          )
          /**
           * O **emitente** da mesma nota: a ADR-0057 endereça o aviso a quem emitiu, não ao
           * destinatário — que recebe a carga e não tem acesso ao cadastro que gerou o texto.
           */
          .innerJoin(
            emitter,
            and(
              eq(emitter.documentId, nfeParticipants.documentId),
              eq(emitter.companyId, nfeParticipants.companyId),
              eq(emitter.role, 'emitter'),
            ),
          )
          .where(
            and(
              eq(nfeAddresses.companyId, input.companyId),
              destinationRolesFilter(nfeParticipants.role),
              isNotNull(nfeAddresses.postalCode),
            ),
          )
          .orderBy(desc(nfeAddresses.createdAt)),
      ])

      /** Um endereço recebe de vários emitentes; o aviso vai ao que despachou por último. */
      const context = new Map<string, (typeof addresses)[number]>()
      for (const address of addresses) {
        const key = buildStopAddressKey(address)
        if (key !== null && !context.has(key)) context.set(key, address)
      }

      return measurements.map((measurement): AddressReportRow => {
        const found = context.get(measurement.addressKey)

        return {
          addressKey: measurement.addressKey,
          city: found?.city ?? '',
          cityMismatch: measurement.cityMismatch,
          comparedAt: measurement.comparedAt,
          contractorName: found?.contractorName ?? '',
          contractorTaxId: found?.contractorTaxId ?? '',
          distanceMetres:
            measurement.distanceMetres === null ? null : Number(measurement.distanceMetres),
          matchLevel: measurement.matchLevel,
          noteDistrict: measurement.noteDistrict,
          noteNumber: measurement.noteNumber,
          notePostalCode: measurement.notePostalCode,
          noteStreet: measurement.noteStreet,
          providerDistrict: measurement.providerDistrict,
          providerNumber: measurement.providerNumber,
          providerPostalCode: measurement.providerPostalCode,
          providerStreet: measurement.providerStreet,
          state: found?.state ?? '',
        }
      })
    },
  }
}
