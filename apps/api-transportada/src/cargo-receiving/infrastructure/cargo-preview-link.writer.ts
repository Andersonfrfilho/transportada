/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 RF5a item 5: ligar e soltar a nota da prévia. O unique `(company_id, document_id)` do
 * vínculo é quem garante o 1:1 — a nota de outra prévia não entra, e a desta prévia junta a linha ao
 * grupo que já fecha nela.
 */
import { and, eq, sql } from 'drizzle-orm'

import { cargoPreviewDocumentLinks } from '../../database/cargo-preview-link.schema.js'
import { contractors } from '../../database/delivery-client.schema.js'
import { nfeDocuments } from '../../database/nfe.schema.js'
import { CARGO_PREVIEW_DECIDED_BY } from '../../shared/cargo-preview.constant.js'
import type { Transaction } from './cargo-arrival-persistence.support.js'
import { emitterJoin, emitterParticipant } from './cargo-arrival-document.query.js'

const AUTHORIZED_STATUS = 'authorized'

type LinkScope = {
  readonly companyId: string
  readonly contractorId: string
  readonly documentId: string
  readonly previewId: string
}

/** Candidata é nota da empresa, autorizada, emitida pelo CNPJ do contratante da prévia. */
export async function isCandidateDocument(
  transaction: Transaction,
  scope: LinkScope,
): Promise<boolean> {
  const [row] = await transaction
    .select({ id: nfeDocuments.id })
    .from(nfeDocuments)
    .innerJoin(emitterParticipant, emitterJoin())
    .innerJoin(
      contractors,
      and(
        eq(contractors.companyId, nfeDocuments.companyId),
        eq(contractors.id, scope.contractorId),
        eq(contractors.taxId, emitterParticipant.taxId),
      ),
    )
    .where(
      and(
        eq(nfeDocuments.companyId, scope.companyId),
        eq(nfeDocuments.id, scope.documentId),
        eq(nfeDocuments.status, AUTHORIZED_STATUS),
      ),
    )
  return row !== undefined
}

/** `linked`: a nota é desta prévia (nova ou já ligada); `elsewhere`: outra prévia a tem. */
export async function linkDocumentByUser(
  transaction: Transaction,
  scope: LinkScope & { readonly actorUserId: string },
): Promise<'elsewhere' | 'linked'> {
  await transaction
    .insert(cargoPreviewDocumentLinks)
    .values({
      companyId: scope.companyId,
      documentId: scope.documentId,
      linkedBy: CARGO_PREVIEW_DECIDED_BY.user,
      linkedByUserId: scope.actorUserId,
      previewId: scope.previewId,
    })
    .onConflictDoNothing({
      target: [cargoPreviewDocumentLinks.companyId, cargoPreviewDocumentLinks.documentId],
    })
  const [link] = await transaction
    .select({ previewId: cargoPreviewDocumentLinks.previewId })
    .from(cargoPreviewDocumentLinks)
    .where(
      and(
        eq(cargoPreviewDocumentLinks.companyId, scope.companyId),
        eq(cargoPreviewDocumentLinks.documentId, scope.documentId),
      ),
    )
  return link?.previewId === scope.previewId ? 'linked' : 'elsewhere'
}

/** Solta a nota só quando nenhum item desta prévia aponta mais para ela. */
export async function releaseDocumentIfUnused(
  transaction: Transaction,
  scope: Omit<LinkScope, 'contractorId'>,
): Promise<void> {
  await transaction.execute(sql`
    delete from ${cargoPreviewDocumentLinks}
    where ${cargoPreviewDocumentLinks.companyId} = ${scope.companyId}
      and ${cargoPreviewDocumentLinks.previewId} = ${scope.previewId}
      and ${cargoPreviewDocumentLinks.documentId} = ${scope.documentId}
      and not exists (
        select 1 from cargo_preview_items item
        where item.company_id = ${scope.companyId}
          and item.preview_id = ${scope.previewId}
          and item.matched_document_id = ${scope.documentId}
      )`)
}
