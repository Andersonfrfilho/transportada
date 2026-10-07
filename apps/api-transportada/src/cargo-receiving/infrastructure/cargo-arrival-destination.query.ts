/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T2.6: a cidade da nota na chegada é onde a carga será entregue — o destino físico que a
 * parada, o roteirizador e o MDF-e já seguem (`<entrega>` → `<enderDest>`, spec 073) —, nunca o cadastro
 * do destinatário. A escolha é da política compartilhada; aqui só se traz as linhas, em lote e pela empresa.
 */
import { and, asc, eq, inArray } from 'drizzle-orm'

import { nfeAddresses, nfeParticipants } from '../../database/nfe.schema.js'
import {
  destinationRolesFilter,
  pickPhysicalDestinationByDocument,
} from '../../nfe-documents/infrastructure/physical-destination.join.js'
import type { Database } from './cargo-arrival-persistence.support.js'
import { toIbgeCityCode } from './cargo-arrival-document.query.js'

export type ArrivalDestinationCity = {
  readonly cityIbgeCode: string | null
  readonly cityName: string | null
  readonly state: string | null
}

export const NO_ARRIVAL_DESTINATION_CITY: ArrivalDestinationCity = {
  cityIbgeCode: null,
  cityName: null,
  state: null,
}

/** Nota sem destino resolvível não entra no mapa: o chamador cai em `NO_ARRIVAL_DESTINATION_CITY`. */
export async function selectArrivalDestinationCities(
  executor: Pick<Database, 'select'>,
  params: { readonly companyId: string; readonly documentIds: readonly string[] },
): Promise<ReadonlyMap<string, ArrivalDestinationCity>> {
  if (params.documentIds.length === 0) return new Map()
  const rows = await executor
    .select({
      city: nfeAddresses.city,
      cityCode: nfeAddresses.cityCode,
      documentId: nfeParticipants.documentId,
      number: nfeAddresses.number,
      postalCode: nfeAddresses.postalCode,
      role: nfeParticipants.role,
      state: nfeAddresses.state,
    })
    .from(nfeParticipants)
    .innerJoin(
      nfeAddresses,
      and(
        eq(nfeAddresses.companyId, nfeParticipants.companyId),
        eq(nfeAddresses.participantId, nfeParticipants.id),
      ),
    )
    .where(
      and(
        eq(nfeParticipants.companyId, params.companyId),
        inArray(nfeParticipants.documentId, [...new Set(params.documentIds)]),
        destinationRolesFilter(nfeParticipants.role),
      ),
    )
    .orderBy(asc(nfeAddresses.createdAt), asc(nfeAddresses.id))

  const chosen = pickPhysicalDestinationByDocument(
    rows.flatMap((row) =>
      row.role === 'delivery' || row.role === 'recipient'
        ? [
            {
              components: {
                cityCode: row.cityCode,
                number: row.number,
                postalCode: row.postalCode,
              },
              documentId: row.documentId,
              origin: row.role,
              row,
            },
          ]
        : [],
    ),
  )
  return new Map(
    [...chosen].map(([documentId, { row }]) => [
      documentId,
      { cityIbgeCode: toIbgeCityCode(row.cityCode), cityName: row.city, state: row.state },
    ]),
  )
}
