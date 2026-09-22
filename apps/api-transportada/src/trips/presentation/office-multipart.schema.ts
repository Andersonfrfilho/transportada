/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 156 T15 (seg B5, M12): a leitura do multipart das rotas do escritório — `field-delivery`,
 * `field-proof` e `field-occurrences` —, num lugar só. Lista fechada de campos e no máximo um
 * `file`: um campo que ninguém lê é um canal que ninguém audita.
 */
import { z } from 'zod'

import { HTTP_ERROR } from '../../shared/api.constant.js'
import { ApiError } from '../../shared/api.error.js'

export const OFFICE_MULTIPART_FILE_FIELD = 'file'

/** O `FormData` do `Request` do Bun — o global do DOM tem outro tipo de entrada. */
export type OfficeForm = Awaited<ReturnType<Request['formData']>>
export type OfficeFormValue = ReturnType<OfficeForm['get']>

const ATTACHMENT_KEY_MAX_LENGTH = 128
const RECEIVER_NAME_MAX_LENGTH = 120

/** 400 para corpo que não é multipart, campo fora de `allowedFields` ou mais de um `file`. */
export async function readOfficeMultipartForm(input: {
  readonly allowedFields: ReadonlySet<string>
  readonly request: Request
}): Promise<OfficeForm> {
  let form: OfficeForm
  try {
    form = await input.request.formData()
  } catch {
    throw new ApiError(HTTP_ERROR.invalidRequest)
  }

  for (const key of form.keys()) {
    if (!input.allowedFields.has(key)) throw new ApiError(HTTP_ERROR.invalidRequest)
  }
  if (form.getAll(OFFICE_MULTIPART_FILE_FIELD).length > 1) {
    throw new ApiError(HTTP_ERROR.invalidRequest)
  }

  return form
}

/** `null` quando não veio arquivo; 400 quando o campo `file` veio como texto. */
export async function readOfficeMultipartFile(
  form: OfficeForm,
): Promise<{ readonly bytes: Uint8Array; readonly mimeType: string } | null> {
  const file = form.get(OFFICE_MULTIPART_FILE_FIELD)
  if (file === null) return null
  if (!(file instanceof File)) throw new ApiError(HTTP_ERROR.invalidRequest)

  return { bytes: new Uint8Array(await file.arrayBuffer()), mimeType: file.type }
}

export function parseOptionalDriverId(value: OfficeFormValue): string | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined
  if (!z.uuid().safeParse(value).success) throw new ApiError(HTTP_ERROR.invalidRequest)

  return value
}

export function parseOfficeAttachmentKey(value: OfficeFormValue): string {
  if (typeof value !== 'string') return ''
  if (value.length > ATTACHMENT_KEY_MAX_LENGTH) throw new ApiError(HTTP_ERROR.invalidRequest)

  return value
}

export function parseOfficeReceiverName(value: OfficeFormValue): string {
  if (typeof value !== 'string') return ''
  if (value.length > RECEIVER_NAME_MAX_LENGTH) throw new ApiError(HTTP_ERROR.invalidRequest)

  return value
}
