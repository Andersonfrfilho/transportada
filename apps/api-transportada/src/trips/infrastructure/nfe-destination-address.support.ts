/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, eq } from 'drizzle-orm'

import {
  freightCalculations,
  nfeAddresses,
  nfeParticipants,
} from '../../database/database.schema.js'
import type { StopAddressComponents } from '../domain/stop-address-key.js'
import type { TripQueryable } from './trip-queryable.type.js'

export type NfeDestinationAddress = {
  readonly components: StopAddressComponents
  readonly label: string
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
 * ADR-0043 §3 (D3): a parada agrupa pelo endereço do destinatário da NF-e. `null` quando a nota
 * não resolve a nenhum destinatário cadastrado — vira nota `SEM ENDEREÇO` (T010), não erro.
 */
export async function resolveNfeDestinationAddress(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly nfeDocumentId: string },
): Promise<NfeDestinationAddress | null> {
  const [recipient] = await queryable
    .select({
      city: nfeAddresses.city,
      cityCode: nfeAddresses.cityCode,
      number: nfeAddresses.number,
      postalCode: nfeAddresses.postalCode,
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
        eq(nfeParticipants.role, 'recipient'),
      ),
    )
    .limit(1)
  if (recipient === undefined) return null

  return {
    components: {
      cityCode: recipient.cityCode,
      number: recipient.number,
      postalCode: recipient.postalCode,
    },
    label: [recipient.street, recipient.city, recipient.state].filter(Boolean).join(', '),
  }
}
