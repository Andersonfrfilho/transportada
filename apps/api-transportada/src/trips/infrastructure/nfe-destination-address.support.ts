/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, eq, inArray } from 'drizzle-orm'

import {
  freightCalculations,
  nfeAddresses,
  nfeParticipants,
} from '../../database/database.schema.js'
import { destinationRolesFilter } from '../../nfe-documents/infrastructure/physical-destination.join.js'
import { chooseNfeDestinationRow } from '../domain/nfe-destination-choice.policy.js'
import type { PhysicalDestinationOrigin } from '../../nfe-documents/domain/physical-destination.policy.js'
import type { StopAddressComponents } from '../domain/stop-address-key.js'
import type { TripQueryable } from './trip-queryable.type.js'

export type NfeDestinationAddress = {
  readonly components: StopAddressComponents
  readonly label: string
  readonly origin: PhysicalDestinationOrigin
}

/** O vínculo aceita nota crua ou frete já calculado sobre ela (ADR-0023 §2) — os dois resolvem à
 * mesma NF-e no fim, só que o frete guarda o id um passo adiante. */
export async function resolveNfeDocumentId(
  queryable: TripQueryable,
  input: {
    readonly companyId: string
    readonly freightCalculationId: string | null
    readonly nfeDocumentId: string | null
  },
): Promise<string | null> {
  if (input.nfeDocumentId !== null) return input.nfeDocumentId
  if (input.freightCalculationId === null) return null

  const [calculation] = await queryable
    .select({ nfeDocumentId: freightCalculations.nfeDocumentId })
    .from(freightCalculations)
    .where(
      and(
        eq(freightCalculations.companyId, input.companyId),
        eq(freightCalculations.id, input.freightCalculationId),
      ),
    )
    .limit(1)
  return calculation?.nfeDocumentId ?? null
}

/**
 * ADR-0043 §3 (D3) com a spec 073: a parada agrupa pelo endereço **físico** da NF-e — o de
 * `<entrega>` quando a nota traz um, o do destinatário caso contrário. `null` quando a nota não
 * resolve a destino algum — vira nota `SEM ENDEREÇO` (T010), não erro.
 *
 * A consulta traz os **dois** papéis de destino e a escolha acontece sobre as linhas que já
 * vieram: uma consulta só, e uma definição só de "endereço utilizável" (spec 073 RF3).
 */
export async function resolveNfeDestinationAddress(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly nfeDocumentId: string },
): Promise<NfeDestinationAddress | null> {
  const rows = await queryable
    .select({
      city: nfeAddresses.city,
      cityCode: nfeAddresses.cityCode,
      number: nfeAddresses.number,
      postalCode: nfeAddresses.postalCode,
      role: nfeParticipants.role,
      state: nfeAddresses.state,
      street: nfeAddresses.street,
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
        eq(nfeParticipants.companyId, input.companyId),
        eq(nfeParticipants.documentId, input.nfeDocumentId),
        destinationRolesFilter(nfeParticipants.role),
      ),
    )

  return chooseNfeDestinationRow(rows)
}

/**
 * A mesma escolha de participante do singular, em lote: uma consulta para todas as notas da viagem,
 * nunca uma por parada (§15 do code-standart). Alimenta o rótulo derivado na leitura do detalhe.
 */
export async function listStopAddresses(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly nfeDocumentIds: readonly string[] },
): Promise<Map<string, NfeDestinationAddress>> {
  const found = new Map<string, NfeDestinationAddress>()
  if (input.nfeDocumentIds.length === 0) return found

  const rows = await queryable
    .select({
      city: nfeAddresses.city,
      cityCode: nfeAddresses.cityCode,
      documentId: nfeParticipants.documentId,
      number: nfeAddresses.number,
      postalCode: nfeAddresses.postalCode,
      role: nfeParticipants.role,
      state: nfeAddresses.state,
      street: nfeAddresses.street,
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
        eq(nfeParticipants.companyId, input.companyId),
        inArray(nfeParticipants.documentId, [...new Set(input.nfeDocumentIds)]),
        destinationRolesFilter(nfeParticipants.role),
      ),
    )

  const byDocument = new Map<string, typeof rows>()
  for (const row of rows) {
    const bucket = byDocument.get(row.documentId)
    if (bucket === undefined) byDocument.set(row.documentId, [row])
    else bucket.push(row)
  }
  for (const [documentId, documentRows] of byDocument) {
    const chosen = chooseNfeDestinationRow(documentRows)
    if (chosen !== null) found.set(documentId, chosen)
  }

  return found
}
