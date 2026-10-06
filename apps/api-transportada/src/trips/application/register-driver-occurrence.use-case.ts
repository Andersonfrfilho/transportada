/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 079: o motorista registra a ocorrência do próprio celular.
 *
 * ⚠️ **Esta é a rota que faltava** — e ela mora na árvore `/me` por um motivo medido: em 02/09 uma
 * versão dela nasceu em `/trips/:id` pedindo `trip.report`, e `test/driver-trip/me-routes.contract.ts`
 * reprovou. O motorista tem `trip.report` para **toda a empresa**; numa rota que recebe o id da
 * viagem, ele alcançaria qualquer viagem. Aqui não há id de viagem no caminho: o escopo é a viagem
 * ativa dele, e quem o garante é a consulta, não a permissão.
 */
import { OCCURRENCE_MOMENT, TRIP_OCCURRENCE_STAGE } from '../../shared/trip-occurrence.constant.js'
import { TripDocumentNotReachableError } from '../domain/trip.error.js'
import { assertOccurrenceTypeAcceptsProducts } from '../domain/occurrence-items-mode.policy.js'
import { occurrenceTypeAcceptsMoment } from '../domain/occurrence-moment.policy.js'
import { assertDriverOccurrenceRequirements } from '../domain/occurrence-requirement-guard.policy.js'
import { resolveOccurrenceProductScope } from '../domain/occurrence-scope.policy.js'
import type { DriverFieldReportUnitOfWork, ReportedLocation } from './driver-field-report.port.js'
import { resolveFieldTapLocationStamp } from './field-tap-location-stamp.service.js'
import {
  deriveFieldAuthorship,
  toFieldTripTarget,
  type FieldTripLocator,
  type FieldTripTarget,
} from './field-trip-target.types.js'
import type { OccurrenceTypeRecord, TripOccurrence } from './register-trip-occurrence.use-case.js'
import type { OccurrenceUploadAttachmentPort } from './resolve-occurrence-upload-attachment.use-case.js'
import { resolveOccurrenceUploadAttachment } from './resolve-occurrence-upload-attachment.use-case.js'
import {
  resolveDocumentOccurrenceRequirements,
  type OccurrenceTypeOverridesReadPort,
} from './resolve-document-occurrence-requirements.service.js'
import { resolveFieldReportOperation, withFieldReport } from './trip-field-report.port.js'

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

const DOCUMENT_OCCURRENCE_OPERATION = 'document.occurrence'

export type RegisterDriverOccurrenceInput = FieldTripLocator & {
  readonly actorUserId: string
  /**
   * Spec 179 T203 (RF2/RF2b): a referência ao upload já confirmado (`trip_occurrence_uploads`) —
   * nunca o arquivo. `undefined`/`null` é "sem anexo", válido para todo tipo que não seja
   * `required`. Quando presente, é sempre conferido contra empresa e viagem, mesmo em tipo
   * `optional` — o cliente nunca escolhe qual objeto anexar sem essa conferência (RF2b).
   */
  readonly attachmentObjectId?: string | null | undefined
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

/**
 * ⚠️ **O motorista registra só o que acontece na rua.** `item_faltante` é do galpão — ele não
 * separou a carga —, e aceitar isso dele apagaria a linha que a ADR-0043 traçou entre barracão e
 * rua, a mesma que decide quem pode o quê no resto do produto.
 *
 * Tipo de galpão e nota fora da viagem dele respondem **igual**: inalcançável. Distinguir os dois
 * diria a quem tenta qual das duas barreiras ele encontrou.
 */
export async function registerDriverOccurrence(
  input: RegisterDriverOccurrenceInput,
): Promise<TripOccurrence> {
  const occurrenceType = await input.repository.findOccurrenceType({
    companyId: input.companyId,
    occurrenceTypeId: input.occurrenceTypeId,
  })

  /**
   * ⚠️ Tipo de galpão, tipo aposentado, tipo de outra empresa, tipo de parada (`flow: stop` — a
   * lista que a tela oferece aqui já filtra por `flow: document`, mas a API não confia só nisso,
   * spec 218 evidence.md "Limites que ficam") e nota fora da viagem dele respondem **igual**:
   * inalcançável. Distinguir os cinco diria a quem tenta qual barreira encontrou. Spec 246 (RF0b):
   * "de rua e de nota" é o momento fixo `document` no conjunto do tipo, nunca o `stage`.
   */
  if (
    occurrenceType === null ||
    !occurrenceType.active ||
    !occurrenceTypeAcceptsMoment({ moment: OCCURRENCE_MOMENT.document, type: occurrenceType })
  ) {
    throw new TripDocumentNotReachableError()
  }

  /** Spec 241 (RF6, CA03): o app manda `productCode: ''`; produto em tipo sem itens é cliente fora do contrato. */
  assertOccurrenceTypeAcceptsProducts({
    itemsMode: occurrenceType.itemsMode,
    productCode: input.productCode,
  })

  const reachable = await input.repository.findReachableDocument({
    companyId: input.companyId,
    documentId: input.documentId,
    target: toFieldTripTarget(input),
  })
  if (reachable === null) throw new TripDocumentNotReachableError()

  const scope = resolveOccurrenceProductScope({
    productCode: input.productCode,
    products: await input.repository.listDocumentProducts({
      companyId: input.companyId,
      documentId: input.documentId,
      tripId: reachable.tripId,
    }),
  })
  if (scope === null) throw new TripDocumentNotReachableError()

  const authorship = deriveFieldAuthorship(input)
  const tripId = reachable.tripId

  /**
   * Spec 179 T203 (RF3) e 246 (RF6, RF8): a exigência é a **efetiva da nota** — tipo, exceção do
   * contratante e do destinatário, lidos da nota no servidor —, e cada campo é cobrado pelo seu modo.
   * A rota leva um anexo só.
   */
  const hasAttachment = input.attachmentObjectId !== undefined && input.attachmentObjectId !== null
  const requirements = await resolveDocumentOccurrenceRequirements({
    companyId: input.companyId,
    document: reachable,
    occurrenceType,
    repository: input.repository,
  })
  assertDriverOccurrenceRequirements({
    attachmentCount: hasAttachment ? 1 : 0,
    hasSignature: input.signatureObjectId !== undefined && input.signatureObjectId !== null,
    note: input.note,
    requirements,
  })

  /**
   * Spec 179 T203 (RF2b): qualquer referência recebida é conferida — existe, é desta empresa e veio
   * desta viagem —, mesmo em tipo que não exige. O cliente nunca escolhe qual objeto anexar sem essa
   * conferência; `resolveOccurrenceUploadAttachment` lança `TripOccurrenceUploadNotReachableError`
   * quando não bate.
   */
  const attachmentObjectId =
    input.attachmentObjectId === undefined || input.attachmentObjectId === null
      ? null
      : (
          await resolveOccurrenceUploadAttachment({
            companyId: input.companyId,
            objectId: input.attachmentObjectId,
            repository: input.repository,
            tripId,
          })
        ).id
  const signatureObjectId = await resolveSignatureObjectId({ input, tripId })

  /**
   * Spec 179 T200: a chave de idempotência que esta rota não tinha (ADR-0045 §5, revisão de
   * arquitetura de 23/09). Reserva e escrita na **mesma transação** — o reenvio da fila offline
   * (Fase 3) não pode duplicar a ocorrência.
   */
  const saved = await input.unitOfWork.execute((transaction) =>
    withFieldReport<TripOccurrence>({
      guard: {
        actorUserId: input.actorUserId,
        authorship,
        companyId: input.companyId,
        idempotencyKey: input.idempotencyKey,
        operation: resolveFieldReportOperation({
          locator: input,
          operation: DOCUMENT_OCCURRENCE_OPERATION,
        }),
        transaction,
      },
      perform: async () => {
        const result = await transaction.saveDocumentOccurrence({
          actorUserId: input.actorUserId,
          attachmentObjectId,
          authorship,
          companyId: input.companyId,
          documentId: input.documentId,
          locationStamp: resolveFieldTapLocationStamp({
            location: input.location,
            locator: input,
          }),
          note: input.note,
          occurrenceTypeId: occurrenceType.id,
          productCode: scope.productCode,
          signatureObjectId,
          stage: TRIP_OCCURRENCE_STAGE.delivery,
          tripId,
          typeName: occurrenceType.name,
        })
        if (result === null) throw new TripDocumentNotReachableError()

        return result
      },
      recall: (occurrenceId) =>
        transaction.findDocumentOccurrenceById({ companyId: input.companyId, occurrenceId }),
    }),
  )

  return saved
}

/**
 * Spec 246 (RF9, T2.4): a assinatura é conferida como o anexo (RF2b da 179) — existe, é desta empresa e
 * desta viagem — e, vindo do motorista, **é dele**: a referência de outro motorista da mesma viagem não
 * serve. Resolve para o id que a coluna `signature_object_id` guarda; nunca vira linha de anexo.
 */
async function resolveSignatureObjectId(params: {
  readonly input: RegisterDriverOccurrenceInput
  readonly tripId: string
}): Promise<null | string> {
  const { input, tripId } = params
  if (input.signatureObjectId === undefined || input.signatureObjectId === null) return null

  const upload = await resolveOccurrenceUploadAttachment({
    companyId: input.companyId,
    ...(input.driverId === undefined ? {} : { driverId: input.driverId }),
    objectId: input.signatureObjectId,
    repository: input.repository,
    tripId,
  })
  return upload.id
}
