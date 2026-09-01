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
  /**
   * Ausente, o anexo é guardado sem leitura e o operador revisa abrindo o arquivo — mesma regra de
   * capacidade por ausência do OCR do documento do agregado.
   */
  readonly extractFields?: (input: {
    readonly bytes: Uint8Array
    readonly type: AggregateApplicationAttachmentType
  }) => Promise<Readonly<Record<string, unknown>> | null>
  readonly repository: AggregateApplicationAttachmentRepositoryPort
  readonly storage: AggregateDocumentStoragePort
}

export type AggregateApplicationAttachmentUseCase = Readonly<{
  uploadDraft: (input: {
    readonly bytes: Uint8Array
    readonly companyId: string
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
    async uploadDraft({ bytes, companyId, type }) {
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

      // A leitura roda **depois** do armazenamento e não pode derrubá-lo: o arquivo salvo com
      // extração vazia continua revisável à mão; o inverso perde o anexo.
      const extractedFields =
        dependencies.extractFields === undefined
          ? null
          : await dependencies.extractFields({ bytes, type }).catch(() => null)

      return dependencies.repository.createDraft({
        bucket: dependencies.bucket,
        extractedFields,
        companyId,
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
