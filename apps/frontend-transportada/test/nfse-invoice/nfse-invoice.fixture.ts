/**
 * Todo dado aqui é sintético. Nota de serviço carrega CNPJ e razão social de tomador — nenhum
 * cliente real entra em fixture, e o que o cliente digita nunca vira literal de teste.
 */
export const SYNTHETIC_ACCESS_TOKEN = 'synthetic-access-token'
export const SYNTHETIC_IDEMPOTENCY_KEY = 'nfse-contract-idempotency-key'
export const SYNTHETIC_CURSOR = '2026-08-11T12:00:00.000Z::7f3c2d61-9a4b-4c2e-8f10-2b6d5a9c4e31'

export const INVOICE_ID = '7f3c2d61-9a4b-4c2e-8f10-2b6d5a9c4e31'
export const SECOND_INVOICE_ID = '1c8e4b90-2d55-4a71-9e33-84b0c7d21f45'
export const PROFILE_ID = '2a5f8c13-64d9-4e07-b1a8-90c3e5d76b22'
export const DOCUMENT_ID = '4b17e2a8-3c60-4d95-8e22-51f7a0c9d3b6'
export const SECOND_DOCUMENT_ID = '9d24f5c7-8b13-4e60-a7c9-3f5b1d82e047'
export const ATTEMPT_ID = '6e91a3d5-72c4-4b18-9f06-2d8c4e5a7b93'

const TAKER_TAX_ID = '11222333000181'
const TAKER_LEGAL_NAME = 'Comércio Sintético de Cargas Ltda'

export const INVOICE_LIST_ITEM = {
  authorizedAt: null,
  cancelledAt: null,
  createdAt: '2026-08-11T12:00:00.000Z',
  documentCount: 2,
  emissionProfileId: PROFILE_ID,
  id: INVOICE_ID,
  issAmount: '13.44',
  providerNumber: null,
  serviceAmount: '672.22',
  status: 'pending_authorization',
  takerLegalName: TAKER_LEGAL_NAME,
  takerTaxId: TAKER_TAX_ID,
  updatedAt: '2026-08-11T12:05:00.000Z',
  verificationCode: null,
} as const

export const AUTHORIZED_INVOICE_LIST_ITEM = {
  ...INVOICE_LIST_ITEM,
  authorizedAt: '2026-08-11T13:00:00.000Z',
  id: SECOND_INVOICE_ID,
  providerNumber: '63',
  status: 'authorized',
  verificationCode: 'SYNTH39F2',
} as const

export const INVOICE_PAGE = {
  items: [INVOICE_LIST_ITEM, AUTHORIZED_INVOICE_LIST_ITEM],
  nextCursor: SYNTHETIC_CURSOR,
} as const

/** A entrega é automática: a tela mostra em que tentativa está e o que a última falha disse. */
export const INVOICE_DELIVERY = {
  attemptCount: 2,
  lastErrorCause: 'transport_failure',
  lastErrorCode: null,
  lastErrorMessage: null,
  nextAttemptAt: '2026-08-11T12:10:00.000Z',
  status: 'retry_scheduled',
  updatedAt: '2026-08-11T12:05:00.000Z',
} as const

/** O payload congelado da última tentativa — as entradas do diálogo de reemissão nascem dele. */
export const LAST_ISSUANCE_PAYLOAD = {
  cnaeCode: '4930202',
  description: 'Entregas na cidade de Ribeirão Preto de 27-07-2026 a 31-07-2026.',
  documentCount: 2,
  issAmount: '13.44',
  issExigibility: '1',
  issRate: '0.020000',
  issWithheld: false,
  municipalTaxationCode: '',
  municipalityIbgeCode: '3543402',
  nbsCode: '',
  serviceAmount: '672.22',
  serviceListItem: '16.02',
  takerLegalName: TAKER_LEGAL_NAME,
  takerTaxId: TAKER_TAX_ID,
} as const

export const INVOICE_DETAIL = {
  ...INVOICE_LIST_ITEM,
  cancellationReason: null,
  charges: [
    {
      amount: '672.22',
      baseAmount: '13444.40',
      calculationType: 'percentage_of_cargo',
      label: 'Frete peso',
      ordinal: 1,
      rate: '5.00',
    },
  ],
  delivery: INVOICE_DELIVERY,
  description: 'Entregas na cidade de Ribeirão Preto de 27-07-2026 a 31-07-2026.',
  lastPayload: LAST_ISSUANCE_PAYLOAD,
  rejectionCode: null,
  rejectionMessage: null,
  version: '1',
} as const

export const REJECTED_INVOICE_DETAIL = {
  ...INVOICE_DETAIL,
  delivery: {
    ...INVOICE_DELIVERY,
    lastErrorCause: null,
    lastErrorCode: 'E0142',
    lastErrorMessage: 'Atividade não habilitada para o prestador',
    nextAttemptAt: null,
    status: 'rejected',
  },
  rejectionCode: 'E0142',
  rejectionMessage: 'Atividade não habilitada para o prestador',
  status: 'rejected',
} as const

export const INVOICE_DOCUMENTS = [
  {
    accessKey: '35260800011122233300018155001000000001100000000018',
    cancelledAt: null,
    documentId: DOCUMENT_ID,
    issuedAt: '2026-07-27T09:00:00.000Z',
    number: '1',
    position: 1,
    series: '1',
    totalAmount: '6722.20',
  },
  {
    accessKey: '35260800011122233300018155001000000002100000000029',
    cancelledAt: null,
    documentId: SECOND_DOCUMENT_ID,
    issuedAt: '2026-07-31T09:00:00.000Z',
    number: '2',
    position: 2,
    series: '1',
    totalAmount: '6722.20',
  },
] as const

export const INVOICE_PREVIEW = {
  blocked: [
    {
      documentId: SECOND_DOCUMENT_ID,
      number: '2',
      reason: 'NFSE_DOCUMENT_LINKED_TO_CTE_BATCH',
      series: '1',
    },
  ],
  invoices: [
    {
      adjustments: [{ amount: '672.22', type: 'minimum_amount' }],
      baseAmount: '13444.40',
      calculatedAmount: '672.22',
      charges: [
        {
          amount: '672.22',
          baseAmount: '13444.40',
          calculationType: 'percentage_of_cargo',
          label: 'Frete peso',
          rate: '5.00',
        },
      ],
      description: 'Entregas na cidade de Ribeirão Preto de 27-07-2026 a 31-07-2026.',
      documents: [
        {
          accessKey: '35260800011122233300018155001000000001100000000018',
          documentId: DOCUMENT_ID,
          number: '1',
          series: '1',
          totalAmount: '6722.20',
        },
      ],
      issAmount: '13.44',
      // Fração, como `nfse_emission_profiles.iss_rate` (0..1) sai do Postgres — não percentual.
      issRate: '0.020000',
      listedDocuments: 1,
      omittedDocuments: 0,
      percentage: '5.00',
      profileId: PROFILE_ID,
      serviceAmount: '672.22',
      takerLegalName: TAKER_LEGAL_NAME,
      takerTaxId: TAKER_TAX_ID,
    },
  ],
} as const

export const ISSUANCE_SUMMARY = {
  attemptId: ATTEMPT_ID,
  documentIds: [DOCUMENT_ID, SECOND_DOCUMENT_ID],
  invoiceId: INVOICE_ID,
  replayed: false,
  requestedAt: '2026-08-11T12:00:00.000Z',
  status: 'requested',
} as const

export const CANCELLATION_SUMMARY = {
  attemptId: ATTEMPT_ID,
  invoiceId: INVOICE_ID,
  releasedDocumentIds: [DOCUMENT_ID, SECOND_DOCUMENT_ID],
  replayed: false,
  requestedAt: '2026-08-11T14:00:00.000Z',
  status: 'cancellation_requested',
} as const

export const DOCUMENT_DOWNLOAD = {
  expiresAt: '2026-08-11T12:15:00.000Z',
  url: 'https://storage.example.test/nfse/synthetic-object?signature=synthetic',
} as const

export const SELECTION_BODY = {
  documentIds: [DOCUMENT_ID, SECOND_DOCUMENT_ID],
  profileId: PROFILE_ID,
} as const

export const CANCELLATION_REASON = 'Serviço não prestado no período informado'

/** `2` é "serviço não prestado" no vocabulário da prefeitura. O `motivo` é código, não texto. */
export const CANCELLATION_MOTIVE = '2'

/** A opção que a rota de emissão serve: três campos, nenhum parâmetro fiscal. */
export const EMISSION_PROFILE_OPTION = {
  descriptionTemplate: 'Transporte rodoviário de cargas referente às notas {{notas}}.',
  id: PROFILE_ID,
  name: 'Transporte municipal',
} as const

export async function loadFutureModule<TModule>(modulePath: string): Promise<TModule> {
  return (await import(modulePath)) as TModule
}
