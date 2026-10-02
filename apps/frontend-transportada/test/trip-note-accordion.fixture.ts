/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * Spec 227: as quatro notas do acordeão em três paradas, com a conta fechando — Σ frete = 2310,00,
 * Σ (gasto + imposto) = 1217,20 e Σ lucro = 1092,80. Print com conta que não fecha é pior que nenhum.
 * Mora fora de `trip-smoke.helper.ts` porque é só dado: o helper registra as rotas.
 */
const TRIP_ID = '00000000-0000-4000-8000-000000000601'
const NFE_DOCUMENT_ID = '00000000-0000-4000-8000-000000000606'

export const NOTE_ACCORDION_STOP_IDS = [
  '00000000-0000-4000-8000-000000000651',
  '00000000-0000-4000-8000-000000000652',
  '00000000-0000-4000-8000-000000000653',
] as const
export const NOTE_ACCORDION_DOCUMENT_IDS = [
  '00000000-0000-4000-8000-000000000661',
  '00000000-0000-4000-8000-000000000662',
  '00000000-0000-4000-8000-000000000663',
  '00000000-0000-4000-8000-000000000664',
] as const

type NoteFixture = Readonly<{
  contactName: string
  cost: string
  deliveredAt: null | string
  freight: string
  margin: string
  marginPercentage: string
  number: string
  proofPending: boolean
  stopIndex: 0 | 1 | 2
  tax: string
  taxId: string
  volumeCount: null | number
}>

const NOTES: readonly NoteFixture[] = [
  {
    contactName: 'Mercado Central',
    cost: '180.0000',
    deliveredAt: '2026-08-10T10:12:00.000Z',
    freight: '850.0000',
    margin: '568.0000',
    marginPercentage: '66.8235',
    number: '000123',
    proofPending: false,
    stopIndex: 0,
    tax: '102.0000',
    taxId: '12345678000190',
    volumeCount: 31,
  },
  {
    contactName: 'Distribuidora Sul',
    cost: '180.0000',
    deliveredAt: '2026-08-10T13:40:00.000Z',
    freight: '620.0000',
    margin: '365.6000',
    marginPercentage: '58.9677',
    number: '000124',
    proofPending: false,
    stopIndex: 1,
    tax: '74.4000',
    taxId: '98765432000110',
    volumeCount: 12,
  },
  {
    contactName: 'Armazém Oeste',
    cost: '300.0000',
    deliveredAt: '2026-08-10T14:05:00.000Z',
    freight: '300.0000',
    margin: '-36.0000',
    marginPercentage: '-12.0000',
    number: '000125',
    proofPending: false,
    stopIndex: 1,
    tax: '36.0000',
    taxId: '11222333000181',
    volumeCount: null,
  },
  {
    contactName: 'Comércio Rio',
    cost: '280.0000',
    deliveredAt: null,
    freight: '540.0000',
    margin: '195.2000',
    marginPercentage: '36.1481',
    number: '000126',
    proofPending: true,
    stopIndex: 2,
    tax: '64.8000',
    taxId: '44555666000147',
    volumeCount: 4,
  },
]

function noteAt(index: number): NoteFixture {
  const note = NOTES[index]
  if (note === undefined) throw new Error('NOTE_ACCORDION_FIXTURE_OUT_OF_RANGE')
  return note
}

export const NOTE_ACCORDION_DOCUMENTS = NOTES.map(
  (note, index) =>
    ({
      createdAt: '2026-07-28T12:05:00.000Z',
      contact: {
        contractorName: 'Contratante Sintético LTDA',
        name: note.contactName,
        phone: '16999990005',
        taxId: note.taxId,
      },
      cteAuthorized: true,
      deliveredAt: note.deliveredAt,
      destinationOrigin: null,
      fiscalStatus: 'authorized',
      freightAmount: note.freight,
      freightCalculationId: null,
      freightRuleName: 'Tabela padrão',
      freightSource: 'estimated',
      id: NOTE_ACCORDION_DOCUMENT_IDS[index] ?? '',
      loadedAt: '2026-08-10T07:00:00.000Z',
      nfeDocumentId: NFE_DOCUMENT_ID,
      nfeIssuedAt: '2026-08-10T06:30:00.000Z',
      nfeNumber: note.number,
      nfeSeries: '1',
      nfeTotalValue: '4200.0000',
      proofPending: note.proofPending,
      releasedAt: null,
      returnedAt: null,
      returnReason: null,
      separatedAt: null,
      separationStatus: note.deliveredAt === null ? ('loaded' as const) : ('delivered' as const),
      stopId: NOTE_ACCORDION_STOP_IDS[note.stopIndex],
      tripId: TRIP_ID,
      updatedAt: '2026-07-28T12:05:00.000Z',
      volumeCount: note.volumeCount,
    }) as const,
)

const STOP_LABELS = [
  'São Paulo — Centro de Distribuição',
  'Campinas — Distrito Industrial',
  'Ribeirão Preto — Zona Sul',
] as const

export const NOTE_ACCORDION_STOPS = NOTE_ACCORDION_STOP_IDS.map((id, index) => ({
  addressKey: `note-accordion-${index + 1}`,
  arrivedAt: index < 2 ? '2026-08-10T10:00:00.000Z' : null,
  completedAt: index < 2 ? '2026-08-10T14:10:00.000Z' : null,
  deliveryWindowEnd: null,
  deliveryWindowStart: null,
  documents: NOTE_ACCORDION_DOCUMENTS.filter((document) => document.stopId === id),
  hasOpenOccurrence: false,
  id,
  label: STOP_LABELS[index] ?? '',
  sequence: index + 1,
}))

function parcel(kind: string, amount: string) {
  return { amount, basis: null, detail: null, gap: null, kind, source: 'estimated' }
}

/** Σ parcelas = 1217,20 = 940,00 de gasto + 277,20 de imposto. */
export function noteAccordionValuation() {
  return {
    costParcels: [
      parcel('icms', '221.7600'),
      parcel('pis_cofins', '55.4400'),
      parcel('fuel', '400.0000'),
      parcel('toll', '120.0000'),
      parcel('driver', '320.0000'),
      parcel('other_per_kilometer', '100.0000'),
    ],
    hasGaps: false,
    marginPercentage: '47.3074',
    revenueLines: NOTES.map((note, index) => ({
      amount: note.freight,
      costAmount: note.cost,
      costBasis: 'leg',
      freightRuleId: null,
      freightRuleName: null,
      gap: null,
      legCostAmount: String(Number.parseFloat(note.cost) - 40) + '.0000',
      marginAmount: note.margin,
      marginPercentage: note.marginPercentage,
      nfeDocumentId: NFE_DOCUMENT_ID,
      percentage: null,
      source: 'estimated',
      taxAmount: note.tax,
      timeBasis: 'complete',
      tripDocumentId: NOTE_ACCORDION_DOCUMENT_IDS[index],
      tripShareCostAmount: '40.0000',
    })),
    revenueSource: 'estimated',
    totalCost: '1217.2000',
    totalMargin: '1092.8000',
    totalRevenue: '2310.0000',
  }
}

/** Os dois eixos do selo: o canhoto da 000125 espera conferência e a baixa foi longe do ponto. */
const PROOF_AXES = [
  { canhotoReview: 'approved', punctuality: 'on_time' },
  { canhotoReview: 'approved', punctuality: 'on_time' },
  { canhotoReview: 'pending', punctuality: 'away' },
] as const

export function noteAccordionProofs(imageOrigin: string, documentIndex: number) {
  const axes = PROOF_AXES[documentIndex]
  if (axes === undefined) return []
  return [
    {
      ...axes,
      canhotoReviewAt: '2026-08-10T15:00:00.000Z',
      canhotoReviewByName: 'Helena Prado',
      canhotoReviewOrigin: 'manual',
      capturedAt: noteAt(documentIndex).deliveredAt ?? '',
      createdAt: '2026-08-10T14:00:00.000Z',
      distanceMeters: axes.punctuality === 'away' ? 1480 : 42,
      downloadUrl: `${imageOrigin}/canhoto-${documentIndex}.png`,
      expiresAt: '2026-08-10T18:42:00.000Z',
      id: `00000000-0000-4000-8000-00000000067${documentIndex}`,
      kind: 'photo',
      receivedBy: 'employee',
      receiverName: 'Marcos Tavares',
      thumbnailUrl: `${imageOrigin}/canhoto-${documentIndex}-thumb.png`,
    },
  ]
}

function occurrence(input: Readonly<{ id: string; note: string; typeName: string }>) {
  return {
    createdAt: '2026-08-10T13:55:00.000Z',
    id: input.id,
    note: input.note,
    occurrenceTypeId: '00000000-0000-4000-8000-000000000690',
    productCode: '',
    stage: 'delivery',
    typeName: input.typeName,
  }
}

/** A nota **não entregue** também devolve ocorrência — é o caso que a Fase 3 corrigiu. */
export const NOTE_ACCORDION_OCCURRENCES: readonly (readonly Record<string, unknown>[])[] = [
  [],
  [
    occurrence({
      id: '00000000-0000-4000-8000-000000000691',
      note: 'Caixa 3 chegou com amassado na lateral e o cliente aceitou com ressalva no canhoto.',
      typeName: 'Avaria',
    }),
  ],
  [],
  [
    occurrence({
      id: '00000000-0000-4000-8000-000000000692',
      note: 'Portaria fechada na primeira tentativa; motorista aguarda liberação.',
      typeName: 'Cliente ausente',
    }),
    occurrence({
      id: '00000000-0000-4000-8000-000000000693',
      note: 'Cliente pediu reagendamento para a manhã seguinte.',
      typeName: 'Reagendamento',
    }),
  ],
]
