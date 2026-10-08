/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { DeclaredAmountScope, OccurrenceAttachmentMode } from './occurrence.constant'
import type { TripOccurrenceRequirements } from './tripOccurrenceFeed.service'

/**
 * Spec 247 T7.2b: o que o **tipo** pede do número do documento e do valor pago — modo, rótulo e nível.
 * Tudo `undefined` é o genérico (ocorrência antiga, API anterior, tipo fora do catálogo): campos opcionais
 * com os rótulos de sempre.
 */
export type OccurrenceTypeRecordConfig = Readonly<{
  amountLabel: string | undefined
  amountMode: OccurrenceAttachmentMode | undefined
  referenceLabel: string | undefined
  referenceMode: OccurrenceAttachmentMode | undefined
  scope: DeclaredAmountScope | undefined
}>

export const GENERIC_RECORD_CONFIG: OccurrenceTypeRecordConfig = {
  amountLabel: undefined,
  amountMode: undefined,
  referenceLabel: undefined,
  referenceMode: undefined,
  scope: undefined,
}

/** O requisito efetivo que a API publica no detalhe vira a configuração da correção, sem catálogo. */
export function buildRecordConfigFromRequirements(
  requirements: TripOccurrenceRequirements,
): OccurrenceTypeRecordConfig {
  return {
    amountLabel: requirements.declaredAmountLabel,
    amountMode: requirements.declaredAmountMode,
    referenceLabel: requirements.referenceNumberLabel,
    referenceMode: requirements.referenceNumberMode,
    scope: requirements.declaredAmountScope,
  }
}

/** O requisito que a API publicou vale; só sem ele a leitura do catálogo (quando permitida) é o fallback. */
export function selectRecordConfig(
  input: Readonly<{
    fallback: OccurrenceTypeRecordConfig
    requirements: null | TripOccurrenceRequirements | undefined
  }>,
): OccurrenceTypeRecordConfig {
  return input.requirements === null || input.requirements === undefined
    ? input.fallback
    : buildRecordConfigFromRequirements(input.requirements)
}
