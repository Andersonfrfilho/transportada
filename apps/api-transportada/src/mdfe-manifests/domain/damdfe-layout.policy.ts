/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  formatDacteAccessKey,
  formatDacteAmount,
  formatDacteDateTime,
  formatDacteDocumentNumber,
  formatDacteQuantity,
} from '../../cte-issuance/domain/dacte-format.policy.js'
import {
  FISCAL_SHEET_COLUMNS,
  type FiscalSheet,
  type FiscalSheetSection,
} from '../../shared/fiscal-sheet.types.js'

import type { DamdfeDocument } from './damdfe.types.js'

/** Exigência do MOC: documento emitido em homologação precisa dizer que não vale como fiscal. */
export const DAMDFE_HOMOLOGATION_LEGEND = 'AMBIENTE DE HOMOLOGAÇÃO - SEM VALOR FISCAL'

const FIELDS_PER_ROW = 4
const ROW_FIELD_WIDTH = FISCAL_SHEET_COLUMNS / FIELDS_PER_ROW
/**
 * A barreira confere a chave do documento que ela parou, não a lista inteira: acima disso o papel
 * vira listagem e o dado que importa se perde. O total continua impresso nos totais.
 */
const MAX_PRINTED_KEYS_PER_CITY = 20

const MODAL_NAMES: Readonly<Record<string, string>> = {
  '1': 'RODOVIÁRIO',
  '2': 'AÉREO',
  '3': 'AQUAVIÁRIO',
  '4': 'FERROVIÁRIO',
}

export function buildDamdfeSheet(document: DamdfeDocument): FiscalSheet {
  const modal = MODAL_NAMES[document.modal] ?? document.modal

  return {
    accessKeyGrouped: formatDacteAccessKey(document.accessKey),
    barcodeValue: document.accessKey,
    emitter: { lines: buildEmitterLines(document) },
    ...(document.environment === 'homologation' ? { legend: DAMDFE_HOMOLOGATION_LEGEND } : {}),
    metaLine: `MODAL ${modal}   SÉRIE ${document.series}   NÚMERO ${document.number}   EMISSÃO ${formatDacteDateTime(document.issuedAt)}`,
    ...(document.protocol === ''
      ? {}
      : {
          protocol:
            document.authorizedAt === ''
              ? document.protocol
              : `${document.protocol} - ${formatDacteDateTime(document.authorizedAt)}`,
        }),
    sections: buildSections(document),
    subtitle: 'Documento Auxiliar do Manifesto Eletrônico de Documentos Fiscais',
    title: 'DAMDFE',
  }
}

function buildEmitterLines(document: DamdfeDocument): readonly string[] {
  return [
    document.emitter.name,
    document.emitter.address,
    `CNPJ ${formatDacteDocumentNumber(document.emitter.taxId)}   IE ${document.emitter.stateRegistration}`,
  ].filter((line) => line.trim().length > 0)
}

function buildSections(document: DamdfeDocument): readonly FiscalSheetSection[] {
  return [
    buildTripSection(document),
    buildVehicleSection(document),
    ...(document.drivers.length === 0 ? [] : [buildDriversSection(document)]),
    ...buildDischargeSections(document),
    ...(document.additionalInformation === ''
      ? []
      : [
          {
            rows: [
              {
                fields: [
                  {
                    label: 'INFORMAÇÕES COMPLEMENTARES',
                    value: document.additionalInformation,
                    width: FISCAL_SHEET_COLUMNS,
                  },
                ],
              },
            ],
            title: 'OBSERVAÇÕES',
          },
        ]),
  ]
}

function buildTripSection(document: DamdfeDocument): FiscalSheetSection {
  return {
    rows: [
      {
        fields: [
          { label: 'UF DE INÍCIO', value: document.originState, width: ROW_FIELD_WIDTH },
          { label: 'UF DE FIM', value: document.destinationState, width: ROW_FIELD_WIDTH },
          {
            label: 'MUNICÍPIOS DE CARREGAMENTO',
            value: document.loadingCities.join(', '),
            width: ROW_FIELD_WIDTH * 2,
          },
        ],
      },
      {
        fields: [
          { label: 'QTD. CT-E', value: document.cteCount, width: ROW_FIELD_WIDTH },
          { label: 'QTD. NF-E', value: document.nfeCount, width: ROW_FIELD_WIDTH },
          {
            label: 'PESO TOTAL (KG)',
            value: formatDacteQuantity(document.cargoWeight),
            width: ROW_FIELD_WIDTH,
          },
          {
            label: 'VALOR TOTAL DA CARGA',
            value: formatDacteAmount(document.cargoValue),
            width: ROW_FIELD_WIDTH,
          },
        ],
      },
    ],
    title: 'DADOS DA VIAGEM',
  }
}

function buildVehicleSection(document: DamdfeDocument): FiscalSheetSection {
  return {
    rows: [
      {
        fields: [
          { label: 'PLACA', value: document.vehicle.plate, width: ROW_FIELD_WIDTH },
          { label: 'RNTRC', value: document.rntrc, width: ROW_FIELD_WIDTH },
          { label: 'TARA (KG)', value: document.vehicle.tare, width: ROW_FIELD_WIDTH },
          {
            label: 'CAPACIDADE (KG)',
            value: document.vehicle.capacityKg,
            width: ROW_FIELD_WIDTH,
          },
        ],
      },
      ...(document.trailerPlates.length === 0
        ? []
        : [
            {
              fields: [
                {
                  label: 'REBOQUES',
                  value: document.trailerPlates.join(', '),
                  width: FISCAL_SHEET_COLUMNS,
                },
              ],
            },
          ]),
    ],
    title: 'VEÍCULO',
  }
}

function buildDriversSection(document: DamdfeDocument): FiscalSheetSection {
  return {
    rows: document.drivers.map((driver) => ({
      fields: [
        { label: 'NOME', value: driver.name, width: ROW_FIELD_WIDTH * 2 },
        {
          label: 'CPF',
          value: formatDacteDocumentNumber(driver.taxId),
          width: ROW_FIELD_WIDTH * 2,
        },
      ],
    })),
    title: 'CONDUTORES',
  }
}

/**
 * Uma seção por município de descarga, e não uma lista corrida: é assim que o fiscal encontra o
 * documento da carga que ele parou, sem varrer a chave de todas as cidades da viagem.
 */
function buildDischargeSections(document: DamdfeDocument): readonly FiscalSheetSection[] {
  return document.dischargeCities.map((city) => {
    const keys = [...city.cteKeys, ...city.nfeKeys]
    const printed = keys.slice(0, MAX_PRINTED_KEYS_PER_CITY)
    const hidden = keys.length - printed.length

    return {
      rows: [
        ...printed.map((key) => ({
          fields: [
            {
              label: 'CHAVE DE ACESSO',
              value: formatDacteAccessKey(key),
              width: FISCAL_SHEET_COLUMNS,
            },
          ],
        })),
        ...(hidden === 0
          ? []
          : [
              {
                fields: [
                  {
                    label: 'DOCUMENTOS NÃO IMPRESSOS',
                    value: `${hidden} documento(s) desta cidade não couberam no papel`,
                    width: FISCAL_SHEET_COLUMNS,
                  },
                ],
              },
            ]),
      ],
      title: `DESCARREGAMENTO EM ${city.name}`,
    }
  })
}
