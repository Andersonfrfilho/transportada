/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { eq, type SQL } from 'drizzle-orm'

import { nfseEmissionProfiles } from '../../database/database.schema.js'

/**
 * Só perfil ativo chega ao diálogo de emissão: rascunho não tem parâmetro fiscal fechado e
 * desativado foi tirado de circulação de propósito — emitir por qualquer um dos dois é nota
 * rejeitada pela prefeitura.
 */
export const NFSE_EMISSION_PROFILE_OPTION_STATUS = 'active' as const

export function buildNfseEmissionProfileOptionFilters(input: {
  readonly companyId: string
}): readonly SQL[] {
  return [
    eq(nfseEmissionProfiles.companyId, input.companyId),
    eq(nfseEmissionProfiles.status, NFSE_EMISSION_PROFILE_OPTION_STATUS),
  ]
}
