/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 271 (ADR-0108, D12): os destinatários do e-mail à contratante escolhidos no tipo — só num tipo `listed`, só
 * contatos das contratantes da lista. A poda é **explícita** (não FK em cascata): tirar a contratante da lista ou
 * trocar para `all` apaga a escolha na mesma transação da gravação do escopo da 270, que apaga e regrava a lista.
 * Roda com o tipo já travado `FOR UPDATE`.
 */
import { and, eq, exists, inArray, notExists, sql } from 'drizzle-orm'

import {
  companyOccurrenceTypeContractors,
  companyOccurrenceTypeRecipients,
  contractorContacts,
} from '../../database/database.schema.js'
import { ContractorContactNotFoundError } from '../../contractor-mail/domain/contractor-mail.error.js'
import { companyOccurrenceTypes } from '../../database/trip.schema.js'
import { OCCURRENCE_TYPE_CONTRACTOR_SCOPE } from '../../shared/trip-occurrence.constant.js'
import {
  OccurrenceTypeRecipientNotInScopeError,
  OccurrenceTypeRecipientsRequireListedScopeError,
} from '../domain/occurrence-type-mail.error.js'
import type { TripQueryable } from './trip-queryable.type.js'

const ACTIVE_CONTACT_STATUS = 'active'

export async function readOccurrenceTypeRecipientContactIds(
  queryable: TripQueryable,
  params: { readonly companyId: string; readonly occurrenceTypeId: string },
): Promise<readonly string[]> {
  const rows = await queryable
    .select({ contactId: companyOccurrenceTypeRecipients.contactId })
    .from(companyOccurrenceTypeRecipients)
    .where(
      and(
        eq(companyOccurrenceTypeRecipients.companyId, params.companyId),
        eq(companyOccurrenceTypeRecipients.occurrenceTypeId, params.occurrenceTypeId),
      ),
    )
  return rows.map((row) => row.contactId).toSorted()
}

/**
 * A invariante da D12: o tipo `all` não tem destinatário, e todo contato escolhido é de uma contratante da lista
 * do tipo. Apaga o que sobrou — depois de a lista do escopo ser regravada, nunca por cascata.
 */
export async function pruneOccurrenceTypeMailRecipients(
  transaction: TripQueryable,
  params: { readonly companyId: string; readonly occurrenceTypeId: string },
): Promise<void> {
  const [type] = await transaction
    .select({ scope: companyOccurrenceTypes.contractorScope })
    .from(companyOccurrenceTypes)
    .where(
      and(
        eq(companyOccurrenceTypes.companyId, params.companyId),
        eq(companyOccurrenceTypes.id, params.occurrenceTypeId),
      ),
    )
    .limit(1)
  if (type === undefined) return
  const ofType = and(
    eq(companyOccurrenceTypeRecipients.companyId, params.companyId),
    eq(companyOccurrenceTypeRecipients.occurrenceTypeId, params.occurrenceTypeId),
  )
  if (type.scope !== OCCURRENCE_TYPE_CONTRACTOR_SCOPE.listed) {
    await transaction.delete(companyOccurrenceTypeRecipients).where(ofType)
    return
  }
  await transaction.delete(companyOccurrenceTypeRecipients).where(
    and(
      ofType,
      exists(
        transaction
          .select({ one: sql`1` })
          .from(contractorContacts)
          .where(
            and(
              eq(contractorContacts.companyId, companyOccurrenceTypeRecipients.companyId),
              eq(contractorContacts.id, companyOccurrenceTypeRecipients.contactId),
              notExists(
                transaction
                  .select({ one: sql`1` })
                  .from(companyOccurrenceTypeContractors)
                  .where(
                    and(
                      eq(
                        companyOccurrenceTypeContractors.companyId,
                        companyOccurrenceTypeRecipients.companyId,
                      ),
                      eq(
                        companyOccurrenceTypeContractors.occurrenceTypeId,
                        companyOccurrenceTypeRecipients.occurrenceTypeId,
                      ),
                      eq(
                        companyOccurrenceTypeContractors.contractorId,
                        contractorContacts.contractorId,
                      ),
                    ),
                  ),
              ),
            ),
          ),
      ),
    ),
  )
}

/**
 * Substituição total da escolha, depois do escopo gravado. Tipo `all`: só `[]` passa (400 com ids). Contato de outra
 * empresa ou inexistente: o mesmo 404. Contato de contratante fora da lista do tipo, ou **novo** e inativo/sem
 * `receives_occurrences`: 400; o já escolhido que ficou inativo continua, marcado.
 */
export async function replaceOccurrenceTypeMailRecipients(
  transaction: TripQueryable,
  params: {
    readonly actorUserId: string
    readonly companyId: string
    readonly contactIds: readonly string[]
    readonly occurrenceTypeId: string
  },
): Promise<void> {
  const { companyId, occurrenceTypeId } = params
  const contactIds = [...new Set(params.contactIds)]
  const [type] = await transaction
    .select({ scope: companyOccurrenceTypes.contractorScope })
    .from(companyOccurrenceTypes)
    .where(
      and(
        eq(companyOccurrenceTypes.companyId, companyId),
        eq(companyOccurrenceTypes.id, occurrenceTypeId),
      ),
    )
    .limit(1)
  const isListed = type?.scope === OCCURRENCE_TYPE_CONTRACTOR_SCOPE.listed
  if (!isListed && contactIds.length > 0)
    throw new OccurrenceTypeRecipientsRequireListedScopeError()

  const current = new Set(await readOccurrenceTypeRecipientContactIds(transaction, params))
  if (contactIds.length > 0) {
    const contacts = await transaction
      .select({
        contractorId: contractorContacts.contractorId,
        id: contractorContacts.id,
        receivesOccurrences: contractorContacts.receivesOccurrences,
        status: contractorContacts.status,
      })
      .from(contractorContacts)
      .where(
        and(
          eq(contractorContacts.companyId, companyId),
          inArray(contractorContacts.id, contactIds),
        ),
      )
      .for('key share')
    if (contacts.length !== contactIds.length) throw new ContractorContactNotFoundError()

    const listedRows = await transaction
      .select({ contractorId: companyOccurrenceTypeContractors.contractorId })
      .from(companyOccurrenceTypeContractors)
      .where(
        and(
          eq(companyOccurrenceTypeContractors.companyId, companyId),
          eq(companyOccurrenceTypeContractors.occurrenceTypeId, occurrenceTypeId),
        ),
      )
    const listedContractors = new Set(listedRows.map((row) => row.contractorId))
    for (const contact of contacts) {
      const isUnusable = contact.status !== ACTIVE_CONTACT_STATUS || !contact.receivesOccurrences
      if (
        !listedContractors.has(contact.contractorId) ||
        (isUnusable && !current.has(contact.id))
      ) {
        throw new OccurrenceTypeRecipientNotInScopeError()
      }
    }
  }

  const removed = [...current].filter((contactId) => !contactIds.includes(contactId))
  if (removed.length > 0) {
    await transaction
      .delete(companyOccurrenceTypeRecipients)
      .where(
        and(
          eq(companyOccurrenceTypeRecipients.companyId, companyId),
          eq(companyOccurrenceTypeRecipients.occurrenceTypeId, occurrenceTypeId),
          inArray(companyOccurrenceTypeRecipients.contactId, removed),
        ),
      )
  }
  const added = contactIds.filter((contactId) => !current.has(contactId))
  if (added.length > 0) {
    await transaction.insert(companyOccurrenceTypeRecipients).values(
      added.map((contactId) => ({
        companyId,
        contactId,
        createdByUserId: params.actorUserId,
        occurrenceTypeId,
      })),
    )
  }
}
