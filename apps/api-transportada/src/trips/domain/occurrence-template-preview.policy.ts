/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 247 (RF4): a prévia do modelo de e-mail do tipo, com dados de exemplo FIXOS.
 *
 * ⚠️ **A prévia é `renderOccurrenceTemplate` e mais nada.** O envio e a prévia chamam a mesma função;
 * uma segunda implementação no painel (ou aqui) mostraria um e-mail que o envio não produz.
 */
import {
  buildOccurrenceItemValues,
  renderOccurrenceTemplate,
} from './occurrence-template.policy.js'
import type {
  OccurrenceTemplateLine,
  OccurrenceTemplateValues,
} from './occurrence-template.types.js'

const SAMPLE_LINES: readonly OccurrenceTemplateLine[] = [
  {
    code: '7000001 01',
    declaredAmount: null,
    description: 'PRODUTO EXEMPLO A 500G',
    nfeQuantity: '10.000',
    quantity: '1.000',
    totalValue: '572.0000',
    unit: 'FD',
    unitValue: '57.2000',
  },
  {
    code: '7000002 02',
    declaredAmount: null,
    description: 'PRODUTO EXEMPLO B 1KG',
    nfeQuantity: '6.000',
    quantity: '3.000',
    totalValue: '119.9700',
    unit: 'CX',
    unitValue: '19.9950',
  },
]

const SAMPLE_ITEM_VALUES = buildOccurrenceItemValues(
  SAMPLE_LINES.map((line) => ({
    code: line.code,
    description: line.description,
    quantity: line.quantity ?? line.nfeQuantity,
  })),
)

export const OCCURRENCE_TEMPLATE_PREVIEW_SAMPLE: OccurrenceTemplateValues = {
  contractorName: 'Contratante Exemplo',
  declaredAmount: null,
  documentLabel: '123456/1',
  documentNumber: '123456',
  driverName: 'Motorista Exemplo',
  ...SAMPLE_ITEM_VALUES,
  lines: SAMPLE_LINES,
  note: 'Avaria identificada no momento da conferência das mercadorias',
  occurredOn: '01/01/2026',
  recipientName: 'Supermercado Exemplo Ltda',
  referenceNumber: '45029',
  stopLabel: 'Rua Exemplo, 100',
  totalValue: '7840.6400',
}

export type RenderOccurrenceEmailPreviewParams = {
  readonly emailBody: string
  readonly emailItemLineTemplate: string
  readonly emailSubject: string
}

export type OccurrenceEmailPreview = {
  readonly body: string
  readonly subject: string
}

export function renderOccurrenceEmailPreview(
  params: RenderOccurrenceEmailPreviewParams,
): OccurrenceEmailPreview {
  const values: OccurrenceTemplateValues = {
    ...OCCURRENCE_TEMPLATE_PREVIEW_SAMPLE,
    itemLineTemplate: params.emailItemLineTemplate,
  }
  return {
    body: renderOccurrenceTemplate({ template: params.emailBody, values }),
    subject: renderOccurrenceTemplate({ template: params.emailSubject, values }),
  }
}
