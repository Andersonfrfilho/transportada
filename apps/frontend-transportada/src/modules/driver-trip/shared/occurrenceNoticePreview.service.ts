/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { DriverOccurrenceKind } from './driverTrip.types'

/**
 * Spec 082 D8/G003: a prévia mostra ao motorista o aviso que o escritório vai mandar ao cliente.
 *
 * ⚠️ Os textos são **cópia por valor** do catálogo da API
 * (`notification/domain/notification-catalog.constant.ts`, corpo `inbox`) — o bundle não importa
 * código de lá. A paridade de texto e placeholders é contrato:
 * `test/driver-trip/occurrence-preview.contract.ts` lê o arquivo da API e falha na divergência.
 */
export const OCCURRENCE_NOTICE_TEMPLATES = {
  appointment_required: {
    body: 'Agendamento exigido na parada {{stopLabel}} às {{occurredAt}} (nota {{documentLabel}}).',
    templateKey: 'trip.occurrence-appointment-required',
  },
  dock_closed: {
    body: 'Doca fechada na parada {{stopLabel}} às {{occurredAt}} (nota {{documentLabel}}).',
    templateKey: 'trip.occurrence-dock-closed',
  },
  long_wait: {
    body: 'Espera longa na parada {{stopLabel}} às {{occurredAt}} (nota {{documentLabel}}).',
    templateKey: 'trip.occurrence-long-wait',
  },
  unexpected_charge: {
    body: 'Cobrança não prevista na parada {{stopLabel}} às {{occurredAt}} (nota {{documentLabel}}).',
    templateKey: 'trip.occurrence-unexpected-charge',
  },
} as const satisfies Partial<
  Record<DriverOccurrenceKind, Readonly<{ body: string; templateKey: string }>>
>

export type OccurrenceNoticePreview = Readonly<{ templateKey: string; text: string }>

export type OccurrenceNoticePreviewParams = Readonly<{
  documentLabel: string
  kind: DriverOccurrenceKind
  occurredAt: string
  stopLabel: string
}>

/** `null` é "nenhum aviso será enviado" — o caso do `other`, que a G003 deixou sem template. */
export function renderOccurrenceNoticePreview(
  params: OccurrenceNoticePreviewParams,
): OccurrenceNoticePreview | null {
  const template = params.kind === 'other' ? undefined : OCCURRENCE_NOTICE_TEMPLATES[params.kind]
  if (template === undefined) return null

  const values: Readonly<Record<string, string>> = {
    documentLabel: params.documentLabel,
    occurredAt: params.occurredAt,
    stopLabel: params.stopLabel,
  }
  const text = template.body.replace(
    /\{\{(\w+)\}\}/gu,
    (match, name: string) => values[name] ?? match,
  )
  return { templateKey: template.templateKey, text }
}
