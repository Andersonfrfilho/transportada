/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { DacteCargo, DacteDocument, DacteService, DacteTax } from './dacte.types.js'
import {
  describeDacteDocumentType,
  describeDacteModal,
  describeDacteServiceType,
  describeDacteTaxSituation,
  formatDacteAccessKey,
  formatDacteAmount,
  formatDacteDateTime,
  formatDacteQuantity,
} from './dacte-format.policy.js'
import {
  buildDacteEmitterLines,
  buildDacteInvoiceKeysSection,
  buildDactePartySection,
  describeDacteTakerRole,
} from './dacte-party-layout.policy.js'
import {
  DACTE_LAYOUT_COLUMNS,
  type DacteLayout,
  type DacteLayoutField,
  type DacteLayoutRow,
  type DacteLayoutSection,
} from './dacte-layout.types.js'

/** Exigência do MOC: documento emitido em homologação precisa dizer que não vale como fiscal. */
export const DACTE_HOMOLOGATION_LEGEND = 'AMBIENTE DE HOMOLOGAÇÃO - SEM VALOR FISCAL'

const FIELDS_PER_ROW = 4
const ROW_FIELD_WIDTH = DACTE_LAYOUT_COLUMNS / FIELDS_PER_ROW

export function buildDacteLayout(document: DacteDocument): DacteLayout {
  return {
    accessKeyGrouped: formatDacteAccessKey(document.accessKey),
    barcodeValue: document.accessKey,
    emitter: { lines: buildDacteEmitterLines(document.emitter) },
    invoiceKeys: document.relatedDocuments.map((related) => related.accessKey),
    issuedAt: formatDacteDateTime(document.issuedAt),
    modal: describeDacteModal(document.modal),
    number: document.number,
    sections: buildSections(document),
    series: document.series,
    ...(document.environment === 'homologation' ? { legend: DACTE_HOMOLOGATION_LEGEND } : {}),
    ...(document.authorization === undefined
      ? {}
      : {
          protocol: `${document.authorization.protocol} - ${formatDacteDateTime(document.authorization.receivedAt)}`,
        }),
    ...(document.qrCodeUrl === undefined ? {} : { qrCodeValue: document.qrCodeUrl }),
  }
}

function buildSections(document: DacteDocument): readonly DacteLayoutSection[] {
  return [
    buildServiceSection(document),
    buildDactePartySection('REMETENTE', document.sender),
    ...(document.shipper === undefined
      ? []
      : [buildDactePartySection('EXPEDIDOR', document.shipper)]),
    ...(document.deliveryParty === undefined
      ? []
      : [buildDactePartySection('RECEBEDOR', document.deliveryParty)]),
    buildDactePartySection('DESTINATÁRIO', document.receiver),
    buildTakerSection(document),
    ...(document.relatedDocuments.length === 0
      ? []
      : [
          buildDacteInvoiceKeysSection(
            document.relatedDocuments.map((related) => related.accessKey),
          ),
        ]),
    buildComponentsSection(document.service),
    buildTaxSection(document.tax),
    buildCargoSection(document.cargo),
    ...(document.rntrc === undefined ? [] : [buildModalSection(document.rntrc)]),
    ...(document.observations === undefined
      ? []
      : [buildObservationsSection(document.observations)]),
  ]
}

function buildServiceSection(document: DacteDocument): DacteLayoutSection {
  return {
    rows: [
      {
        fields: [
          sized('ORIGEM', `${document.origin.city} - ${document.origin.state}`, 4),
          sized('DESTINO', `${document.destination.city} - ${document.destination.state}`, 4),
          sized('CFOP', document.cfop, 2),
          sized('MODAL', describeDacteModal(document.modal), 2),
        ],
      },
      {
        // A natureza da operação é frase inteira: espremê-la em uma coluna a corta com reticências.
        fields: [
          sized('NATUREZA DA OPERAÇÃO', document.natureOfOperation, 5),
          sized('TIPO DO SERVIÇO', describeDacteServiceType(document.serviceType), 3),
          sized('TIPO DO CT-E', describeDacteDocumentType(document.documentType), 2),
          sized('DATA E HORA DE EMISSÃO', formatDacteDateTime(document.issuedAt), 2),
        ],
      },
    ],
    title: 'PRESTAÇÃO DO SERVIÇO',
  }
}

function buildTakerSection(document: DacteDocument): DacteLayoutSection {
  const section = buildDactePartySection('TOMADOR DO SERVIÇO', document.serviceTaker.party)
  const role = {
    label: 'PAPEL DO TOMADOR',
    value: describeDacteTakerRole(document.serviceTaker.role),
    width: DACTE_LAYOUT_COLUMNS,
  }
  return { rows: [...section.rows, { fields: [role] }], title: section.title }
}

function buildComponentsSection(service: DacteService): DacteLayoutSection {
  const components = service.components.map((component) =>
    field(component.name.toUpperCase(), formatDacteAmount(component.value)),
  )
  const totals = [
    field('VALOR TOTAL', formatDacteAmount(service.totalAmount)),
    ...(service.receivedAmount === undefined
      ? []
      : [field('VALOR A RECEBER', formatDacteAmount(service.receivedAmount))]),
  ]
  return {
    rows: [...chunkFields(components), ...chunkFields(totals)],
    title: 'COMPONENTES DO VALOR DA PRESTAÇÃO',
  }
}

function buildTaxSection(tax: DacteTax): DacteLayoutSection {
  return {
    rows: chunkFields([
      field('SITUAÇÃO TRIBUTÁRIA', describeDacteTaxSituation(tax)),
      field('BASE DE CÁLCULO', optionalAmount(tax.baseAmount)),
      field('ALÍQUOTA ICMS', optionalAmount(tax.rate)),
      field('VALOR DO ICMS', optionalAmount(tax.amount)),
      field('% RED. BASE DE CÁLCULO', optionalAmount(tax.reductionPercent)),
      field('TRIBUTOS APROXIMADOS', optionalAmount(tax.approximateTaxAmount)),
    ]),
    title: 'INFORMAÇÕES RELATIVAS AO IMPOSTO',
  }
}

function buildCargoSection(cargo: DacteCargo): DacteLayoutSection {
  const quantities = cargo.quantities.map((quantity) =>
    field(quantity.measureType.toUpperCase(), formatDacteQuantity(quantity.quantity)),
  )
  return {
    rows: [
      ...chunkFields([
        field('PRODUTO PREDOMINANTE', cargo.predominantProduct),
        field('VALOR TOTAL DA CARGA', optionalAmount(cargo.totalAmount)),
        field('VALOR AVERBADO', optionalAmount(cargo.insuredAmount)),
      ]),
      ...chunkFields(quantities),
    ],
    title: 'INFORMAÇÕES DA CARGA',
  }
}

function buildModalSection(rntrc: string): DacteLayoutSection {
  return { rows: chunkFields([field('RNTRC', rntrc)]), title: 'MODAL RODOVIÁRIO' }
}

function buildObservationsSection(observations: string): DacteLayoutSection {
  return {
    rows: [
      { fields: [{ label: 'OBSERVAÇÕES', value: observations, width: DACTE_LAYOUT_COLUMNS }] },
    ],
    title: 'OBSERVAÇÕES',
  }
}

function optionalAmount(value: string | undefined): string {
  return value === undefined ? '' : formatDacteAmount(value)
}

function field(label: string, value: string): DacteLayoutField {
  return { label, value, width: ROW_FIELD_WIDTH }
}

function sized(label: string, value: string, width: number): DacteLayoutField {
  return { label, value, width }
}

function chunkFields(fields: readonly DacteLayoutField[]): readonly DacteLayoutRow[] {
  const rows: DacteLayoutRow[] = []
  for (let index = 0; index < fields.length; index += FIELDS_PER_ROW) {
    rows.push({ fields: fields.slice(index, index + FIELDS_PER_ROW) })
  }
  return rows
}
