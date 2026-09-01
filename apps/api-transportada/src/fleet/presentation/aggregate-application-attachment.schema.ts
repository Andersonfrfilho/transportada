/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import {
  AGGREGATE_APPLICATION_ATTACHMENT_TYPES,
  type AggregateApplicationAttachmentType,
} from '../../database/aggregate-application.schema.js'
import { HTTP_ERROR } from '../../shared/api.constant.js'
import { ApiError } from '../../shared/api.error.js'

/**
 * O teto é do **transporte**, não do domínio: `assertAggregateDocumentBytes` aceita 10 MiB, mas o
 * servidor recusa corpo acima de 2 MiB (`SERVER_MAX_REQUEST_BODY_SIZE_BYTES`), e o multipart ainda
 * gasta parte disso em cabeçalho de campo. 1,5 MiB deixa a folga e mantém a recusa **nossa**, com
 * código estável, em vez de o corpo ser cortado pelo servidor sem explicação.
 *
 * Para dimensionar: o CCMEI real medido tem ~100 kB e a CNH-e ~280 kB.
 */
export const PUBLIC_ATTACHMENT_MAX_BYTES = 1_572_864

export type UploadAggregateApplicationAttachmentRequest = Readonly<{
  bytes: Uint8Array
  companyId: string
  turnstileToken: string
  type: AggregateApplicationAttachmentType
}>

const fieldsSchema = z
  .object({
    companyId: z.string().uuid(),
    turnstileToken: z.string().default(''),
    type: z.enum(AGGREGATE_APPLICATION_ATTACHMENT_TYPES),
  })
  .strict()

/** O `FormData` que o `Request` devolve não é o global: derivar da fonte evita casar tipos à mão. */
type RequestFormData = Awaited<ReturnType<Request['formData']>>

function readText(form: RequestFormData, field: string): string | undefined {
  const value = form.get(field)
  return typeof value === 'string' ? value : undefined
}

export async function parseUploadAggregateApplicationAttachmentRequest(
  request: Request,
): Promise<UploadAggregateApplicationAttachmentRequest> {
  const form = await request.formData().catch(() => {
    throw new ApiError(HTTP_ERROR.invalidRequest)
  })

  const fields = fieldsSchema.safeParse({
    companyId: readText(form, 'companyId'),
    turnstileToken: readText(form, 'turnstileToken') ?? '',
    type: readText(form, 'type'),
  })
  if (!fields.success) throw new ApiError(HTTP_ERROR.invalidRequest)

  const file = form.get('file')
  if (!(file instanceof Blob)) throw new ApiError(HTTP_ERROR.invalidRequest)
  // O tamanho é conferido **antes** de materializar os bytes: ler 100 MiB para depois recusar seria
  // pagar o custo do abuso antes de negá-lo.
  if (file.size > PUBLIC_ATTACHMENT_MAX_BYTES) throw new ApiError(HTTP_ERROR.payloadTooLarge)

  return {
    bytes: new Uint8Array(await file.arrayBuffer()),
    companyId: fields.data.companyId,
    turnstileToken: fields.data.turnstileToken,
    type: fields.data.type,
  }
}
