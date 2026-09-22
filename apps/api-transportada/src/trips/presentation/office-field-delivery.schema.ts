/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 156 T6/T15: o multipart de `field-delivery` e `field-proof` — o canhoto do escritório. Lista
 * fechada de campos e um `file` só (`readOfficeMultipartForm`, seg B5). `kind` nunca é lido do
 * corpo: o canhoto do escritório é sempre `'photo'` (ADR-0067 §5).
 */
import { HTTP_ERROR } from '../../shared/api.constant.js'
import { ApiError } from '../../shared/api.error.js'
import { parseTaxIdValue, TAX_ID_PATTERN } from '../../shared/tax-id.service.js'
import type { OfficeDeliveryProofUpload } from '../application/office-delivery-proof.service.js'
import {
  OFFICE_MULTIPART_FILE_FIELD,
  type OfficeForm,
  type OfficeFormValue,
  parseOfficeAttachmentKey,
  parseOfficeReceiverName,
  parseOptionalDriverId,
  readOfficeMultipartFile,
  readOfficeMultipartForm,
} from './office-multipart.schema.js'
import { deliveredAtSchema, parseDeliveredAt } from './trip-field-office.schema.js'

const FIELD = {
  attachmentKey: 'attachmentKey',
  deliveredAt: 'deliveredAt',
  driverId: 'driverId',
  receiverDocument: 'receiverDocument',
  receiverName: 'receiverName',
} as const

const PROOF_FIELDS = new Set<string>([
  FIELD.attachmentKey,
  FIELD.driverId,
  FIELD.receiverDocument,
  FIELD.receiverName,
  OFFICE_MULTIPART_FILE_FIELD,
])
const DELIVERY_FIELDS = new Set<string>([...PROOF_FIELDS, FIELD.deliveredAt])

/** Vazio é o caso de fábrica; presente, ele precisa ser CPF ou CNPJ na forma canônica. */
function parseReceiverDocument(value: OfficeFormValue): string {
  if (typeof value !== 'string' || value.length === 0) return ''

  const parsed = parseTaxIdValue(value, TAX_ID_PATTERN)
  if (parsed === undefined) throw new ApiError(HTTP_ERROR.invalidRequest)

  return parsed
}

async function readProofUpload(form: OfficeForm): Promise<OfficeDeliveryProofUpload | null> {
  const file = await readOfficeMultipartFile(form)
  if (file === null) return null

  return {
    ...file,
    attachmentKey: parseOfficeAttachmentKey(form.get(FIELD.attachmentKey)),
    receiverDocument: parseReceiverDocument(form.get(FIELD.receiverDocument)),
    receiverName: parseOfficeReceiverName(form.get(FIELD.receiverName)),
  }
}

/**
 * `POST .../field-delivery`. A foto é opcional aqui — quem decide se ela é obrigatória é a
 * configuração da empresa, no caso de uso (aceite 9), nunca o formato do corpo.
 */
export async function parseOfficeFieldDeliveryRequest(request: Request): Promise<{
  readonly deliveredAt: Date
  readonly driverId: string | undefined
  readonly proof: OfficeDeliveryProofUpload | null
}> {
  const form = await readOfficeMultipartForm({ allowedFields: DELIVERY_FIELDS, request })

  const deliveredAtRaw = form.get(FIELD.deliveredAt)
  if (typeof deliveredAtRaw !== 'string' || !deliveredAtSchema.safeParse(deliveredAtRaw).success) {
    throw new ApiError(HTTP_ERROR.invalidRequest)
  }

  return {
    deliveredAt: parseDeliveredAt(deliveredAtRaw),
    driverId: parseOptionalDriverId(form.get(FIELD.driverId)),
    proof: await readProofUpload(form),
  }
}

/**
 * `POST .../field-proof` — anexa a uma entrega **já feita**. Mesmo corpo de `field-delivery`, sem
 * `deliveredAt`: esta rota nunca muda `delivered_at` (ADR-0067 §2). O arquivo é obrigatório.
 */
export async function parseOfficeFieldProofRequest(request: Request): Promise<{
  readonly driverId: string | undefined
  readonly proof: OfficeDeliveryProofUpload
}> {
  const form = await readOfficeMultipartForm({ allowedFields: PROOF_FIELDS, request })
  const proof = await readProofUpload(form)
  if (proof === null) throw new ApiError(HTTP_ERROR.invalidRequest)

  return { driverId: parseOptionalDriverId(form.get(FIELD.driverId)), proof }
}
