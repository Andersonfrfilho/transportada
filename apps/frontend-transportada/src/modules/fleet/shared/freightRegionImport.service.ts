/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { FreightRegionImportInput } from './freightRegion.types'

export type FreightRegionImportDraft = Readonly<{
  rates: string
  ratesName: string
  regions: string
  regionsName: string
}>

export const EMPTY_FREIGHT_REGION_IMPORT_DRAFT: FreightRegionImportDraft = {
  rates: '',
  ratesName: '',
  regions: '',
  regionsName: '',
}

export const FREIGHT_REGION_IMPORT_BLOCK_REASON = {
  RATES_REQUIRED: 'rates_required',
  REGIONS_REQUIRED: 'regions_required',
} as const

export type FreightRegionImportBlockReason =
  (typeof FREIGHT_REGION_IMPORT_BLOCK_REASON)[keyof typeof FREIGHT_REGION_IMPORT_BLOCK_REASON]

export type FreightRegionImportSubmission =
  | Readonly<{ body: FreightRegionImportInput; status: 'ready' }>
  | Readonly<{ reason: FreightRegionImportBlockReason; status: 'blocked' }>

/**
 * Meia importação é recusa da tela: o 400 da API não diz qual das duas metades ficou de fora, e
 * arquivo de rotas em branco inativaria a tabela inteira à qual os motoristas estão ligados. O
 * `trim` só decide se está vazio — o conteúdo vai como veio, porque quem lê a planilha é a API.
 */
export function buildFreightRegionImportSubmission(
  draft: FreightRegionImportDraft,
): FreightRegionImportSubmission {
  if (draft.regions.trim() === '') {
    return { reason: FREIGHT_REGION_IMPORT_BLOCK_REASON.REGIONS_REQUIRED, status: 'blocked' }
  }
  if (draft.rates.trim() === '') {
    return { reason: FREIGHT_REGION_IMPORT_BLOCK_REASON.RATES_REQUIRED, status: 'blocked' }
  }

  return { body: { rates: draft.rates, regions: draft.regions }, status: 'ready' }
}
