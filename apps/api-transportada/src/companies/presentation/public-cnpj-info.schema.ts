/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { HTTP_ERROR } from '../../shared/api.constant.js'
import { ApiError } from '../../shared/api.error.js'
import { CNPJ_PATTERN, parseTaxIdValue } from '../../shared/tax-id.service.js'

export function parsePublicCnpjInfoRequest(request: Request): string {
  const cnpj = new URL(request.url).searchParams.get('cnpj')?.trim() ?? ''
  const normalized = parseTaxIdValue(cnpj, CNPJ_PATTERN)
  if (normalized === undefined) throw new ApiError(HTTP_ERROR.invalidRequest)
  return normalized
}
