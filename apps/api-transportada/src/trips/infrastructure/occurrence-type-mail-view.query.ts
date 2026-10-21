/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 271 (ADR-0108): o bloco "E-mail à contratante" do tipo como o cadastro o lê — responsáveis em cópia e
 * destinatários escolhidos, em lote (uma leitura para N tipos, nunca uma por tipo). Nunca devolve endereço de
 * usuário da empresa: `eligible` diz se ele recebe.
 */
import { and, asc, eq, inArray } from 'drizzle-orm'

import { ContractorNotFoundError } from '../../delivery-clients/domain/delivery-client.error.js'
import { contractors } from '../../database/delivery-client.schema.js'
import { findOccurrenceWatcherUsers } from '../../contractor-mail/infrastructure/occurrence-watcher-directory.query.js'
import {
  companyOccurrenceTypeRecipients,
  companyOccurrenceTypeWatchers,
  companyOccurrenceWatchers,
  contractorContacts,
} from '../../database/database.schema.js'
import type { TripQueryable } from './trip-queryable.type.js'

export type OccurrenceTypeMailWatcherView = {
  /** Vínculo ativo, `occurrences.resolve` e e-mail; falso fica marcado no editor e não recebe. */
  readonly eligible: boolean
  readonly name: string
  readonly status: 'active' | 'inactive'
  readonly userId: string
}

export async function readOccurrenceTypeMailWatchers(
  queryable: TripQueryable,
  params: { readonly companyId: string; readonly occurrenceTypeIds: readonly string[] },
): Promise<ReadonlyMap<string, readonly OccurrenceTypeMailWatcherView[]>> {
  if (params.occurrenceTypeIds.length === 0) return new Map()
  const rows = await queryable
    .select({
      occurrenceTypeId: companyOccurrenceTypeWatchers.occurrenceTypeId,
      status: companyOccurrenceWatchers.status,
      userId: companyOccurrenceTypeWatchers.userId,
    })
    .from(companyOccurrenceTypeWatchers)
    .innerJoin(
      companyOccurrenceWatchers,
      and(
        eq(companyOccurrenceWatchers.companyId, companyOccurrenceTypeWatchers.companyId),
        eq(companyOccurrenceWatchers.userId, companyOccurrenceTypeWatchers.userId),
      ),
    )
    .where(
      and(
        eq(companyOccurrenceTypeWatchers.companyId, params.companyId),
        inArray(companyOccurrenceTypeWatchers.occurrenceTypeId, [...params.occurrenceTypeIds]),
      ),
    )
  if (rows.length === 0) return new Map()

  const users = new Map(
    (
      await findOccurrenceWatcherUsers(queryable, {
        companyId: params.companyId,
        userIds: [...new Set(rows.map((row) => row.userId))],
      })
    ).map((user) => [user.userId, user]),
  )
  const byType = new Map<string, OccurrenceTypeMailWatcherView[]>()
  for (const row of rows) {
    const user = users.get(row.userId)
    const views = byType.get(row.occurrenceTypeId) ?? []
    views.push({
      eligible: user?.canResolve === true && user.address !== undefined,
      name: user?.name ?? '',
      status: row.status,
      userId: row.userId,
    })
    byType.set(row.occurrenceTypeId, views)
  }
  for (const views of byType.values()) {
    views.sort(
      (left, right) =>
        left.name.localeCompare(right.name) || left.userId.localeCompare(right.userId),
    )
  }
  return byType
}

export type OccurrenceTypeMailRecipientView = {
  readonly contactId: string
  readonly contractorId: string
  /** O cadastro de contatos já mostra o e-mail ao mesmo papel (`settings.manage`); o editor o exibe ao lado do nome. */
  readonly email: string
  readonly name: string
  readonly receivesOccurrences: boolean
  readonly status: string
}

export async function readOccurrenceTypeMailRecipients(
  queryable: TripQueryable,
  params: { readonly companyId: string; readonly occurrenceTypeIds: readonly string[] },
): Promise<ReadonlyMap<string, readonly OccurrenceTypeMailRecipientView[]>> {
  if (params.occurrenceTypeIds.length === 0) return new Map()
  const rows = await queryable
    .select({
      contactId: contractorContacts.id,
      contractorId: contractorContacts.contractorId,
      email: contractorContacts.email,
      name: contractorContacts.name,
      occurrenceTypeId: companyOccurrenceTypeRecipients.occurrenceTypeId,
      receivesOccurrences: contractorContacts.receivesOccurrences,
      status: contractorContacts.status,
    })
    .from(companyOccurrenceTypeRecipients)
    .innerJoin(
      contractorContacts,
      and(
        eq(contractorContacts.companyId, companyOccurrenceTypeRecipients.companyId),
        eq(contractorContacts.id, companyOccurrenceTypeRecipients.contactId),
      ),
    )
    .where(
      and(
        eq(companyOccurrenceTypeRecipients.companyId, params.companyId),
        inArray(companyOccurrenceTypeRecipients.occurrenceTypeId, [...params.occurrenceTypeIds]),
      ),
    )
    .orderBy(asc(contractorContacts.name), asc(contractorContacts.id))
  const byType = new Map<string, OccurrenceTypeMailRecipientView[]>()
  for (const { occurrenceTypeId, ...view } of rows) {
    const views = byType.get(occurrenceTypeId) ?? []
    views.push(view)
    byType.set(occurrenceTypeId, views)
  }
  return byType
}

/**
 * Os contatos que o editor oferece como destinatários: ativos e que recebem ocorrências, das contratantes pedidas.
 * Contratante de outra empresa ou inexistente é o mesmo 404, sem dizer qual.
 */
export async function listOccurrenceTypeRecipientCandidates(
  queryable: TripQueryable,
  params: { readonly companyId: string; readonly contractorIds: readonly string[] },
): Promise<readonly OccurrenceTypeMailRecipientView[]> {
  const contractorIds = [...new Set(params.contractorIds)]
  if (contractorIds.length === 0) return []
  const owned = await queryable
    .select({ id: contractors.id })
    .from(contractors)
    .where(and(eq(contractors.companyId, params.companyId), inArray(contractors.id, contractorIds)))
  if (owned.length !== contractorIds.length) throw new ContractorNotFoundError()
  return queryable
    .select({
      contactId: contractorContacts.id,
      contractorId: contractorContacts.contractorId,
      email: contractorContacts.email,
      name: contractorContacts.name,
      receivesOccurrences: contractorContacts.receivesOccurrences,
      status: contractorContacts.status,
    })
    .from(contractorContacts)
    .where(
      and(
        eq(contractorContacts.companyId, params.companyId),
        inArray(contractorContacts.contractorId, contractorIds),
        eq(contractorContacts.status, 'active'),
        eq(contractorContacts.receivesOccurrences, true),
      ),
    )
    .orderBy(asc(contractorContacts.name), asc(contractorContacts.id))
}
