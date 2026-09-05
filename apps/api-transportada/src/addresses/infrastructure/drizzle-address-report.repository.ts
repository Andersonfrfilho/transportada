/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, desc, eq, isNotNull, ne } from 'drizzle-orm'

import {
  addressComparisons,
  geocodedAddresses,
  nfeAddresses,
  nfeParticipants,
} from '../../database/database.schema.js'
import { alias } from 'drizzle-orm/pg-core'

import { destinationRolesFilter } from '../../nfe-documents/infrastructure/physical-destination.join.js'
import { buildStopAddressKey } from '../../trips/domain/stop-address-key.js'
import type {
  AddressReportRepository,
  AddressReportRow,
  AddressReportSource,
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
    async read(input): Promise<AddressReportSource> {
      const [measurements, unresolved, addresses] = await Promise.all([
        database
          .select()
          .from(addressComparisons)
          .where(eq(addressComparisons.companyId, input.companyId)),
        /**
         * ADR-0062: o endereço que a rotina paga tentou e não conseguiu apontar — carimbado e ainda
         * em `city`. `paid_refined_at` nulo é "ninguém tentou ainda", e essa não é pendência de
         * cliente nenhum: é fila nossa, e anunciá-la mandaria o operador cobrar cadastro que ainda
         * pode se resolver sozinho na próxima janela.
         */
        database
          .select({
            addressKey: geocodedAddresses.addressKey,
            paidRefinedAt: geocodedAddresses.paidRefinedAt,
          })
          .from(geocodedAddresses)
          .where(
            and(
              eq(geocodedAddresses.precision, 'city'),
              ne(geocodedAddresses.source, 'manual'),
              isNotNull(geocodedAddresses.paidRefinedAt),
            ),
          ),
        database
          .select({
            city: nfeAddresses.city,
            district: nfeAddresses.district,
            street: nfeAddresses.street,
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

      return {
        measurements: measurements.map((measurement) => toMeasurementRow(measurement, context)),
        /**
         * ⚠️ **`geocoded_addresses` não tem tenant** (ADR-0044 §3: o endereço é o mesmo para todo
         * mundo), então o recorte por empresa vem do `context` — que sai de `nfe_addresses` já
         * filtrado por `company_id`. Chave que esta empresa nunca viu simplesmente não casa, e a
         * linha não entra. Sem isto o relatório de uma empresa listaria o endereço de outra.
         */
        unresolved: unresolved.flatMap((row) => {
          const found = context.get(row.addressKey)
          if (found === undefined) return []

          return [
            toUnresolvedRow({
              addressKey: row.addressKey,
              found,
              paidRefinedAt: row.paidRefinedAt,
            }),
          ]
        }),
      }
    },
  }
}

type AddressContext = Map<string, AddressContextRow>

type AddressContextRow = {
  readonly city: null | string
  readonly contractorName: null | string
  readonly contractorTaxId: null | string
  readonly district: null | string
  readonly number: null | string
  readonly postalCode: null | string
  readonly state: null | string
  readonly street: null | string
}

function toUnresolvedRow(input: {
  readonly addressKey: string
  readonly found: AddressContextRow
  readonly paidRefinedAt: Date | null
}): AddressReportRow {
  const { found } = input

  return {
    addressKey: input.addressKey,
    city: found.city ?? '',
    cityMismatch: false,
    comparedAt: input.paidRefinedAt ?? new Date(0),
    contractorName: found.contractorName ?? '',
    contractorTaxId: found.contractorTaxId ?? '',
    distanceMetres: null,
    /** Literal: o provedor não devolveu coordenada utilizável. Não há medição guardada a exibir. */
    matchLevel: 'not_found',
    noteDistrict: found.district ?? '',
    noteNumber: found.number ?? '',
    notePostalCode: found.postalCode ?? '',
    noteStreet: found.street ?? '',
    providerDistrict: '',
    providerNumber: '',
    providerPostalCode: '',
    providerStreet: '',
    state: found.state ?? '',
  }
}

function toMeasurementRow(
  measurement: {
    readonly addressKey: string
    readonly cityMismatch: boolean
    readonly comparedAt: Date
    readonly distanceMetres: null | string
    readonly matchLevel: AddressReportRow['matchLevel']
    readonly noteDistrict: string
    readonly noteNumber: string
    readonly notePostalCode: string
    readonly noteStreet: string
    readonly providerDistrict: string
    readonly providerNumber: string
    readonly providerPostalCode: string
    readonly providerStreet: string
  },
  context: AddressContext,
): AddressReportRow {
  const found = context.get(measurement.addressKey)

  return {
    addressKey: measurement.addressKey,
    city: found?.city ?? '',
    cityMismatch: measurement.cityMismatch,
    comparedAt: measurement.comparedAt,
    contractorName: found?.contractorName ?? '',
    contractorTaxId: found?.contractorTaxId ?? '',
    distanceMetres: measurement.distanceMetres === null ? null : Number(measurement.distanceMetres),
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
}
