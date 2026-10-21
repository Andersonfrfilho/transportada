/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 276 T2: the note the boleto has to name — number and total of the NF-e of the occurrence that opened
 * the reply. Read in the transaction that already holds the reply, only when the type checks the boleto.
 *
 * ⚠️ SQL puro, sem tabela importada, para viver idêntico na API e no worker (nenhuma app importa a outra); o
 * contrato `contractor-reply-parity.contract.ts` do worker compara os dois arquivos. Nenhum log aqui.
 */
import { sql, type SQL } from 'drizzle-orm'

import type { BoletoNoteReference } from '../domain/contractor-reply-document.policy.js'

export type ContractorReplyDocumentNoteRunner = {
  execute(query: SQL): PromiseLike<unknown>
}

/** `null` when the occurrence has no note (it never happens for a reply, but the check then confirms nothing). */
export async function findContractorReplyDocumentNote(
  runner: ContractorReplyDocumentNoteRunner,
  params: { readonly companyId: string; readonly replyId: string },
): Promise<BoletoNoteReference | null> {
  const rows = (await runner.execute(sql`
    select note.number as number, note.total_value::text as total_value
      from occurrence_contractor_replies reply
      join trip_document_occurrences occurrence
        on occurrence.company_id = reply.company_id and occurrence.id = reply.occurrence_id
      join trip_documents document
        on document.company_id = occurrence.company_id and document.id = occurrence.trip_document_id
      join nfe_documents note
        on note.company_id = document.company_id and note.id = document.nfe_document_id
     where reply.company_id = ${params.companyId}
       and reply.id = ${params.replyId}
     limit 1
  `)) as readonly Record<string, unknown>[]
  const [row] = rows
  const number = row?.number
  const totalValue = row?.total_value
  return typeof number === 'string' && typeof totalValue === 'string'
    ? { number, totalValue }
    : null
}
