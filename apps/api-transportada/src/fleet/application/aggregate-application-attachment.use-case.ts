/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createHash, randomUUID } from 'node:crypto'

import type { AggregateApplicationAttachmentType } from '../../database/aggregate-application.schema.js'
import { assertAggregateDocumentBytes } from '../domain/aggregate-document.policy.js'
import { AGGREGATE_STORAGE_PROVIDER } from '../domain/aggregate-storage.constant.js'
import type {
  AggregateApplicationAttachmentDraft,
  AggregateApplicationAttachmentRepositoryPort,
} from './aggregate-application-attachment.port.js'
import type { AggregateDocumentStoragePort } from './aggregate-document.port.js'

type Dependencies = {
  readonly bucket: string
  readonly repository: AggregateApplicationAttachmentRepositoryPort
  readonly storage: AggregateDocumentStoragePort
}

export type AggregateApplicationAttachmentUseCase = Readonly<{
  uploadDraft: (input: {
    readonly bytes: Uint8Array
    readonly companyId: string
    readonly correlationId: string
    readonly type: AggregateApplicationAttachmentType
  }) => Promise<AggregateApplicationAttachmentDraft>
}>

/**
 * A chave **não** carrega documento nem nome: quem envia é anônimo e o arquivo ainda não pertence a
 * candidatura nenhuma. `security.md` §7 proíbe dado pessoal no nome da chave, e aqui não haveria
 * sequer o que colocar sem inventar identidade para quem ainda não a declarou.
 */
function buildDraftObjectKey(input: {
  readonly companyId: string
  readonly draftId: string
  readonly type: AggregateApplicationAttachmentType
}): string {
  return `tenants/${input.companyId}/aggregate-application-attachments/${input.type}/${input.draftId}`
}

export function createAggregateApplicationAttachmentUseCase(
  dependencies: Dependencies,
): AggregateApplicationAttachmentUseCase {
  return {
    async uploadDraft({ bytes, companyId, correlationId, type }) {
      // O tipo declarado vem do cliente; só a assinatura do arquivo decide o que é gravado.
      const mimeType = assertAggregateDocumentBytes(bytes)
      const draftId = randomUUID()
      const key = buildDraftObjectKey({ companyId, draftId, type })
      const sha256 = createHash('sha256').update(bytes).digest('hex')

      // O arquivo primeiro: rascunho gravado sem objeto é linha que aponta para lugar nenhum, e o
      // operador abriria a revisão com um anexo que não existe.
      await dependencies.storage.storeObject({
        body: bytes,
        bucket: dependencies.bucket,
        contentLength: bytes.byteLength,
        contentType: mimeType,
        key,
        sha256,
      })

      /**
       * **Ninguém lê PDF aqui** (ADR-0053). A rota é anônima: quem passa pelo Turnstile escolheria
       * quanto CPU a API gasta, num runtime de um event loop só. O repositório grava o rascunho e o
       * pedido de leitura na mesma transação, e quem lê é o `worker-transportada`.
       */
      return dependencies.repository.createDraft({
        bucket: dependencies.bucket,
        companyId,
        correlationId,
        draftId,
        mimeType,
        objectKey: key,
        provider: AGGREGATE_STORAGE_PROVIDER,
        sha256,
        sizeBytes: bytes.byteLength,
        type,
      })
    },
  }
}
