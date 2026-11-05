/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import {
  FLEET_DRIVER_ATTACHMENT_DECISIONS,
  FLEET_DRIVER_ATTACHMENT_TYPES,
  type FleetDriverAttachmentDecision,
  type FleetDriverAttachmentType,
} from '../../database/fleet-driver-attachment.schema.js'
import { HTTP_ERROR } from '../../shared/api.constant.js'
import { ApiError } from '../../shared/api.error.js'
import {
  assertJsonContentType,
  parseJson,
  readBoundedRequestBody,
} from '../../shared/request-body.service.js'

/**
 * O teto é do **transporte**: o servidor recusa corpo acima de 2 MiB, e o multipart gasta parte disso
 * em cabeçalho de campo. 1,5 MiB deixa a folga e mantém a recusa **nossa**, com código estável.
 */
export const FLEET_DRIVER_ATTACHMENT_MAX_BYTES = 1_572_864

export type UploadFleetDriverAttachmentRequest = Readonly<{
  bytes: Uint8Array
  declaredMimeType: string
  fileName: string
  type: FleetDriverAttachmentType
}>

const fieldsSchema = z.object({ type: z.enum(FLEET_DRIVER_ATTACHMENT_TYPES) }).strict()

/** O `FormData` que o `Request` devolve não é o global: derivar da fonte evita casar tipos à mão. */
type RequestFormData = Awaited<ReturnType<Request['formData']>>

function readText(form: RequestFormData, field: string): string | undefined {
  const value = form.get(field)
  return typeof value === 'string' ? value : undefined
}

export async function parseUploadFleetDriverAttachmentRequest(
  request: Request,
): Promise<UploadFleetDriverAttachmentRequest> {
  const form = await request.formData().catch(() => {
    throw new ApiError(HTTP_ERROR.invalidRequest)
  })

  const fields = fieldsSchema.safeParse({ type: readText(form, 'type') })
  if (!fields.success) throw new ApiError(HTTP_ERROR.invalidRequest)

  const file = form.get('file')
  if (!(file instanceof Blob)) throw new ApiError(HTTP_ERROR.invalidRequest)
  // Conferido **antes** de materializar os bytes: ler 100 MiB para depois recusar paga o abuso.
  if (file.size > FLEET_DRIVER_ATTACHMENT_MAX_BYTES) throw new ApiError(HTTP_ERROR.payloadTooLarge)

  return {
    bytes: new Uint8Array(await file.arrayBuffer()),
    declaredMimeType: file.type,
    fileName: file instanceof File ? file.name : '',
    type: fields.data.type,
  }
}

const decisionSchema = z.object({ decision: z.enum(FLEET_DRIVER_ATTACHMENT_DECISIONS) }).strict()

export async function parseDecideSuggestionRequest(
  request: Request,
): Promise<{ readonly decision: FleetDriverAttachmentDecision }> {
  assertJsonContentType(request.headers.get('content-type'))
  const result = decisionSchema.safeParse(parseJson(await readBoundedRequestBody(request)))
  if (!result.success) throw new ApiError(HTTP_ERROR.invalidRequest)
  return result.data
}
