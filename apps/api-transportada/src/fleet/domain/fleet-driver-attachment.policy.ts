/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { FleetDriverAttachmentType } from '../../database/fleet-driver-attachment.schema.js'
import { FleetDriverAttachmentInvalidUploadError } from './fleet-driver-attachment.error.js'
import {
  assertAggregateDocumentBytes,
  type AggregateDocumentMimeType,
} from './aggregate-document.policy.js'

const EXTENSIONS_BY_MIME_TYPE: Readonly<Record<AggregateDocumentMimeType, readonly string[]>> = {
  'application/pdf': ['pdf'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
}

/** Um documento vivo por tipo e motorista; `other` aceita vários e, por isso, nunca é substituído. */
export function isSingleDocumentType(type: FleetDriverAttachmentType): boolean {
  return type !== 'other'
}

/**
 * Só a CNH é lida pelo servidor (D4). Comprovante de endereço não tem parser: conta de luz, água e
 * telefone não têm layout que se ancore, e um parser genérico seria palpite com aparência de leitura.
 * O RG e o `other` ficam fora pelo mesmo motivo — ninguém prometeu ler.
 */
export const FLEET_DRIVER_ATTACHMENT_READABLE_TYPES: readonly FleetDriverAttachmentType[] = ['cnh']

export type FleetDriverAttachmentUploadInput = Readonly<{
  bytes: Uint8Array
  declaredMimeType: string
  fileName: string
}>

/**
 * Quem decide o que o arquivo é são os primeiros bytes. O nome e o tipo declarado só podem **confirmar**:
 * um JPEG chamado `.pdf` é recusado, e não gravado com o tipo certo, porque a contradição mostra que
 * quem enviou não sabe o que está anexando.
 */
export function assertFleetDriverAttachmentUpload(
  input: FleetDriverAttachmentUploadInput,
): AggregateDocumentMimeType {
  const mimeType = readSignature(input.bytes)

  const extension = input.fileName.split('.').at(-1)?.toLowerCase() ?? ''
  const hasExtension = input.fileName.includes('.') && extension.length > 0
  if (hasExtension && !EXTENSIONS_BY_MIME_TYPE[mimeType].includes(extension)) {
    throw new FleetDriverAttachmentInvalidUploadError()
  }

  const declared = input.declaredMimeType.trim().toLowerCase()
  if (declared.length > 0 && declared !== mimeType && declared !== 'application/octet-stream') {
    throw new FleetDriverAttachmentInvalidUploadError()
  }

  return mimeType
}

function readSignature(bytes: Uint8Array): AggregateDocumentMimeType {
  try {
    return assertAggregateDocumentBytes(bytes)
  } catch {
    throw new FleetDriverAttachmentInvalidUploadError()
  }
}

/**
 * A chave leva só identificadores opacos — nunca CPF, nome ou número de CNH (`security.md` §7). O
 * documento é de uma pessoa, e o nome do objeto aparece em log de bucket, em URL assinada e em backup.
 */
export function buildFleetDriverAttachmentObjectKey(input: {
  readonly companyId: string
  readonly driverId: string
  readonly objectId: string
  readonly type: FleetDriverAttachmentType
}): string {
  return `tenants/${input.companyId}/fleet-driver-attachments/${input.driverId}/${input.type}/${input.objectId}`
}
