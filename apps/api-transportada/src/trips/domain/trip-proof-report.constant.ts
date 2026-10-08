/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 253 RF10-RF12: textos pt-BR do PDF de canhotos. O gateway só desenha o que a política monta.
 */
import type { TripDocumentSeparationStatus } from '../../database/trip.schema.js'
import { TRIP_REPORT_TONES, type TripReportTone } from './resolve-trip-report-tone.policy.js'

export const TRIP_PROOF_REPORT_TIME_ZONE = 'America/Sao_Paulo'
export const TRIP_PROOF_REPORT_FILENAME_PREFIX = 'canhotos'
export const TRIP_PROOF_REPORT_FIELD_SEPARATOR = ' · '
export const TRIP_PROOF_REPORT_DRAWABLE_MIME_TYPES: ReadonlySet<string> = new Set([
  'image/jpeg',
  'image/png',
])

export const TRIP_PROOF_REPORT_TEXT = {
  documentSeries: 'Série',
  documentTitle: 'NF-e',
  exportedBy: 'Exportado por',
  generatedAt: 'Gerado em',
  imageUnavailable: 'Imagem indisponível',
  noProof: 'Canhoto não anexado',
  pageLabel: 'Página',
  pageOf: 'de',
  proofOf: 'Canhoto',
  returnReason: 'Motivo',
  tripLabel: 'Viagem',
  unknownCarrier: 'Transportadora',
  unknownExporter: 'Usuário não identificado',
  valueLabel: 'Valor',
} as const

export const TRIP_PROOF_REPORT_TONE_LABELS: Readonly<Record<TripReportTone, string>> = {
  [TRIP_REPORT_TONES.finished]: 'Finalizada',
  [TRIP_REPORT_TONES.onRoute]: 'Em rota',
  [TRIP_REPORT_TONES.totalReturn]: 'Devolução total',
  [TRIP_REPORT_TONES.warehouse]: 'No galpão',
}

export const TRIP_PROOF_REPORT_STATUS_LABELS: Readonly<
  Record<TripDocumentSeparationStatus, string>
> = {
  delivered: 'Entregue',
  loaded: 'Carregada',
  pending: 'Pendente',
  returned: 'Devolvida',
  separated: 'Separada',
}

export const TRIP_PROOF_REPORT_DATE_LABELS = {
  delivered: 'Entregue em',
  returned: 'Devolvida em',
} as const
