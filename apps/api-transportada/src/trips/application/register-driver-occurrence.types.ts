/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * As portas e a entrada de `registerDriverOccurrence` (spec 079, 179, 246) — em arquivo próprio para o
 * caso de uso e a avaliação da ocorrência (`driver-occurrence-assessment.service.ts`) o compartilharem.
 */
import type { ReportedLocation, DriverFieldReportUnitOfWork } from './driver-field-report.port.js'
import type { FieldTripLocator, FieldTripTarget } from './field-trip-target.types.js'
import type { OccurrenceTypeRecord } from './register-trip-occurrence.use-case.js'
import type { OccurrenceTypeOverridesReadPort } from './resolve-document-occurrence-requirements.service.js'
import type { OccurrenceUploadAttachmentPort } from './resolve-occurrence-upload-attachment.use-case.js'

/**
 * Spec 179 T200: só as três leituras — a escrita passou a viver na transação da chave (T203).
 * `findConfirmedUpload` (T203/RF2b) entrou na mesma leitura: confere o anexo referenciado antes de
 * abrir a transação, exatamente como as outras três já conferem tipo, nota e produto.
 */
export type DriverOccurrenceReadPort = OccurrenceTypeOverridesReadPort &
  OccurrenceUploadAttachmentPort & {
    findOccurrenceType(input: {
      readonly companyId: string
      readonly occurrenceTypeId: string
    }): Promise<null | OccurrenceTypeRecord>
    /**
     * `null` quando a nota não é de uma viagem ativa do alvo — inalcançável, não proibida. Spec 246
     * (RF6): o contratante (emitente cadastrado) e o CNPJ do destinatário saem **da nota**, no
     * servidor — é com eles que a exceção do tipo é resolvida, nunca com o que o cliente mandar.
     * Opcionais só para os dublês de teste: ausente é "sem contratante/destinatário resolvido".
     */
    findReachableDocument(input: {
      readonly companyId: string
      readonly documentId: string
      readonly target: FieldTripTarget
    }): Promise<null | {
      readonly contractorId?: null | string | undefined
      readonly recipientTaxId?: null | string | undefined
      readonly tripId: string
    }>
    listDocumentProducts(input: {
      readonly companyId: string
      readonly documentId: string
      readonly tripId: string
    }): Promise<readonly { readonly code: string; readonly description: string }[]>
  }

export type RegisterDriverOccurrenceInput = FieldTripLocator & {
  readonly actorUserId: string
  /**
   * Spec 179 T203 (RF2/RF2b): a referência ao upload já confirmado (`trip_occurrence_uploads`) —
   * nunca o arquivo. `undefined`/`null` é "sem anexo", válido para todo tipo que não seja
   * `required`. Quando presente, é sempre conferido contra empresa e viagem, mesmo em tipo
   * `optional` — o cliente nunca escolhe qual objeto anexar sem essa conferência (RF2b).
   */
  readonly attachmentObjectId?: string | null | undefined
  /**
   * Spec 246 (T2.7): a **lista** de uploads já confirmados (1 a 5), para o tipo que exige mais de uma
   * foto (`photo_minimum_count`). Retrocompatível com `attachmentObjectId`: o app antigo manda o único;
   * a rota recusa os dois juntos. Cada objeto é conferido como o único sempre foi, e a coluna antiga
   * leva o primeiro.
   */
  readonly attachmentObjectIds?: readonly string[] | undefined
  readonly companyId: string
  readonly documentId: string
  readonly idempotencyKey: string
  /** Spec 196 T3.3: o ponto do toque; ausente é o aparelho que não mandou, e carimba `unavailable`. */
  readonly location?: ReportedLocation | null | undefined
  readonly note: string
  readonly occurrenceTypeId: string
  /** Vazio é a nota inteira: o motorista aponta o item quando o cliente recusou só parte. */
  readonly productCode: string
  readonly repository: DriverOccurrenceReadPort
  /**
   * Spec 246 (RF9): a referência à assinatura já confirmada — nunca o arquivo, e nunca uma linha de
   * anexo de foto. Ausente é "sem assinatura", válido para todo tipo cuja assinatura não seja `required`.
   */
  readonly signatureObjectId?: string | null | undefined
  readonly unitOfWork: DriverFieldReportUnitOfWork
}
