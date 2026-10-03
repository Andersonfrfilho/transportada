/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { LOCATION_RETENTION_MAX_DAYS } from '../../shared/location-retention.constant.js'

/** Teto da contagem de impacto: acima disso a tela diz "mais de 100 mil" (spec 239 D5). */
export const LOCATION_RETENTION_IMPACT_CAP = 100_000

/** Nomes estáveis da resposta: o nome da tabela é detalhe interno e não sai da API. */
export const LOCATION_RETENTION_IMPACT_KIND = {
  stopEvent: 'stop_event',
  deliveryProof: 'delivery_proof',
  statusEvent: 'status_event',
  stopOccurrence: 'stop_occurrence',
  documentOccurrence: 'document_occurrence',
} as const

export type LocationRetentionImpactKind =
  (typeof LOCATION_RETENTION_IMPACT_KIND)[keyof typeof LOCATION_RETENTION_IMPACT_KIND]

export const LOCATION_RETENTION_ORIGIN = { company: 'company', default: 'default' } as const

export type LocationRetentionOrigin =
  (typeof LOCATION_RETENTION_ORIGIN)[keyof typeof LOCATION_RETENTION_ORIGIN]

/** Sem linha vale o padrão seguro: ninguém expurga, e o prazo é o teto da ADR-0045 §3.3. */
export const DEFAULT_LOCATION_RETENTION = {
  purgeEnabled: false,
  retentionDays: LOCATION_RETENTION_MAX_DAYS,
} as const

export const LOCATION_RETENTION_SAVED_ACTION = 'company-location-retention.saved'
export const LOCATION_RETENTION_CLEARED_ACTION = 'company-location-retention.cleared'
export const LOCATION_RETENTION_AUDIT_TARGET_TYPE = 'company_location_retention_settings'
export const LOCATION_RETENTION_AUDIT_PERMISSION = 'settings.manage'
