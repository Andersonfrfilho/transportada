/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { COMPANY_LOGO_MAX_BYTES } from '../../database/company-logo.schema.js'
import { HTTP_ERROR } from '../../shared/api.constant.js'
import { ApiError } from '../../shared/api.error.js'
import { CompanyLogoTooLargeError } from '../domain/company-logo.error.js'

export const COMPANY_LOGO_FORM_FIELD = 'file'

export async function parseCompanyLogoUpload(request: Request): Promise<Uint8Array> {
  const form = await readForm(request)
  const file = form.get(COMPANY_LOGO_FORM_FIELD)
  if (!(file instanceof File)) throw new ApiError(HTTP_ERROR.invalidRequest)
  if (file.size > COMPANY_LOGO_MAX_BYTES) throw new CompanyLogoTooLargeError()
  return new Uint8Array(await file.arrayBuffer())
}

async function readForm(request: Request): Promise<Awaited<ReturnType<Request['formData']>>> {
  try {
    return await request.formData()
  } catch {
    throw new ApiError(HTTP_ERROR.invalidRequest)
  }
}
