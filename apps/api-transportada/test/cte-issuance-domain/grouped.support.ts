/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  CtePayloadInvoice,
  CtePayloadParty,
} from '../../src/cte-issuance/domain/cte-payload.types.js'

export const GROUPED_ACCESS_KEYS = [
  '22222222222222222222222222222222222222220001',
  '22222222222222222222222222222222222222220002',
  '22222222222222222222222222222222222222220003',
] as const

export const GROUPED_SENDER: CtePayloadParty = {
  city: 'Cidade Alfa',
  cityCode: '3500001',
  district: 'DISTRITO ALFA',
  email: null,
  legalName: 'REMETENTE ALFA LTDA',
  number: '100',
  phone: '1130000000',
  postalCode: '01000000',
  state: 'SP',
  stateRegistration: '110000000000',
  street: 'RUA ALFA',
  taxId: '11222333000181',
  tradeName: 'ALFA MATRIZ',
}

export const GROUPED_RECIPIENT: CtePayloadParty = {
  city: 'Cidade Bravo',
  cityCode: '3500002',
  district: 'DISTRITO BRAVO',
  email: null,
  legalName: 'DESTINATARIO BRAVO LTDA',
  number: '200',
  phone: '1140000000',
  postalCode: '02000000',
  state: 'SP',
  stateRegistration: '220000000000',
  street: 'RUA BRAVO',
  taxId: '44555666000172',
  tradeName: null,
}

/**
 * Cada modo calculado vence em uma nota diferente: quantidade na primeira, valor na segunda e peso na
 * terceira — assim a escolha só passa se percorrer os itens de todas as notas do agrupamento.
 */
export const GROUPED_INVOICES: readonly CtePayloadInvoice[] = [
  {
    accessKey: GROUPED_ACCESS_KEYS[0],
    products: [
      {
        description: 'PRODUTO ALFA',
        grossWeight: '5.0000',
        ordinal: 1,
        quantity: '30.0000',
        totalValue: '60.0000',
      },
      {
        description: 'PRODUTO BRAVO',
        grossWeight: '1.0000',
        ordinal: 2,
        quantity: '2.0000',
        totalValue: '40.0000',
      },
    ],
    recipient: GROUPED_RECIPIENT,
    sender: GROUPED_SENDER,
    totalAmount: '100.0000',
    volumes: [{ grossWeight: '12.5000', netWeight: '10.0000', quantity: '3.0000' }],
  },
  {
    accessKey: GROUPED_ACCESS_KEYS[1],
    products: [
      {
        description: 'PRODUTO CHARLIE',
        grossWeight: '9.0000',
        ordinal: 1,
        quantity: '4.0000',
        totalValue: '250.5000',
      },
    ],
    recipient: GROUPED_RECIPIENT,
    sender: GROUPED_SENDER,
    totalAmount: '250.5000',
    volumes: [{ grossWeight: '20.2500', netWeight: '18.0000', quantity: '2.0000' }],
  },
  {
    accessKey: GROUPED_ACCESS_KEYS[2],
    products: [
      {
        description: 'PRODUTO DELTA',
        grossWeight: '40.0000',
        ordinal: 1,
        quantity: '1.0000',
        totalValue: '80.0000',
      },
    ],
    recipient: GROUPED_RECIPIENT,
    sender: GROUPED_SENDER,
    totalAmount: '80.0000',
    volumes: [{ grossWeight: '30.0000', netWeight: '25.0000', quantity: '1.0000' }],
  },
]
