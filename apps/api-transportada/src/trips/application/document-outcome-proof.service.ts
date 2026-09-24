/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 156 T6 e spec 159 RF1/RF2: o comprovante dentro da baixa de uma nota — a configuração lida
 * antes da transação, o canhoto do escritório gravado dentro dela e o `proofPending` da resposta.
 */
import {
  DELIVERED_EVENT_KIND,
  PHOTO_PROOF_KIND,
  REQUIRED_PROOF_FIELD_MODE,
} from '../domain/delivery-event.constant.js'
import type { DeliveryProofFieldSettings } from '../domain/delivery-proof-settings.policy.js'
import { assertOfficeProofMeetsSettings } from '../domain/office-delivery-proof.policy.js'
import type { DriverFieldReportTransactionPort } from './driver-field-report.port.js'
import type { FieldAuthorship } from './field-trip-target.types.js'
import { assertOfficeUploadAccepted, persistOfficeProof } from './office-delivery-proof.service.js'
import type {
  DocumentOutcomeParams,
  DocumentOutcomeSettings,
  OfficeDeliveryProofInput,
} from './report-document-outcome.types.js'
import type { RemovableObjectStoragePort } from './stored-object-cleanup.service.js'

/**
 * Spec 159 T11 (item 5): a configuração do comprovante é lida **antes** de abrir a transação da
 * entrega. As duas portas leem pelo pool — chamadas lá dentro, cada baixa segurava uma conexão na
 * transação e pedia outra ao pool, e sob carga as duas esperas se somavam.
 */
export async function resolveOutcomeProofSettings(
  params: DocumentOutcomeParams,
): Promise<DocumentOutcomeSettings> {
  const { input, kind, proof, resolveProofSettings } = params
  const query = { companyId: input.companyId, documentId: input.documentId }
  const officeSettings = proof === undefined ? undefined : await proof.resolveSettings(query)
  if (kind !== DELIVERED_EVENT_KIND || resolveProofSettings === undefined) {
    return { officeSettings, pendingSettings: undefined }
  }

  return { officeSettings, pendingSettings: officeSettings ?? (await resolveProofSettings(query)) }
}

/**
 * ADR-0067 §5 (emenda 2026-09-18): o canhoto entra **dentro** da transação da entrega — se o anexo
 * for recusado, a entrega inteira desfaz, e não fica uma nota "entregue" sem o comprovante que a
 * configuração exige.
 */
export async function persistDeliveryProof(input: {
  readonly actorUserId: string
  readonly authorship: FieldAuthorship
  readonly companyId: string
  readonly eventId: string
  readonly proof: OfficeDeliveryProofInput
  /** Resolvida antes da transação (`resolveOutcomeProofSettings`). */
  readonly settings: DeliveryProofFieldSettings
  readonly storage: RemovableObjectStoragePort
  readonly transaction: DriverFieldReportTransactionPort
}): Promise<string | null> {
  const { upload } = input.proof
  assertOfficeProofMeetsSettings({ receiver: upload, settings: input.settings })
  if (upload === null) return null
  assertOfficeUploadAccepted(upload)

  const persisted = await persistOfficeProof({
    actorUserId: input.actorUserId,
    attachment: input.proof,
    authorship: input.authorship,
    companyId: input.companyId,
    eventId: input.eventId,
    /** `field-delivery` nunca aceita `kind` no corpo (spec 182 RF3): o canhoto da baixa é sempre `photo`. */
    kind: PHOTO_PROOF_KIND,
    storage: input.storage,
    transaction: input.transaction,
    upload,
  })
  return persisted.id
}

/**
 * ADR-0070 §1, spec 159 RF1/RF2: pendente = entrega (nunca `return`), foto obrigatória resolvida, e
 * nenhuma foto anexada ao evento. Sem `resolveProofSettings` o campo é `false` — nunca bloqueia
 * por falta dele.
 */
export async function resolveProofPendingFlag(params: {
  readonly companyId: string
  readonly eventId: string
  /** `undefined` num `return`, ou quando o canal não mandou `resolveProofSettings`. */
  readonly pendingSettings: DeliveryProofFieldSettings | undefined
  readonly transaction: DriverFieldReportTransactionPort
}): Promise<boolean> {
  if (params.pendingSettings?.photo !== REQUIRED_PROOF_FIELD_MODE) return false

  const hasPhoto = await params.transaction.findProofExistsForEvent({
    companyId: params.companyId,
    eventId: params.eventId,
    kind: PHOTO_PROOF_KIND,
  })
  return !hasPhoto
}
