/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * Spec 233: as quatro notas do acordeão em três paradas, com a conta fechando — Σ frete = 2310,00,
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

/** O raio mora só na resposta por viagem (`/delivery-proofs`); a rota por nota não o traz. */
export const NOTE_ACCORDION_PROOF_RADIUS_METERS = 300

export function noteAccordionProofs(imageOrigin: string, documentIndex: number) {
  const axes = PROOF_AXES[documentIndex]
  if (axes === undefined) return []
  return [
    {
      ...axes,
      canhotoReviewAt: '2026-08-10T15:00:00.000Z',
      canhotoReviewByName: 'Helena Prado',
      canhotoReviewOrigin: 'manual',
      capturedAt: shiftMinutes(
        noteAt(documentIndex).deliveredAt ?? '',
        documentIndex === 2 ? 4 : 0,
      ),
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

function shiftMinutes(isoMoment: string, minutes: number): string {
  return new Date(Date.parse(isoMoment) + minutes * 60_000).toISOString()
}

/** Duas notas trazem itens; a 000125 e a 000126 não, para o aviso de "sem itens" aparecer onde é verdade. */
export function noteAccordionProducts(documentIndex: number) {
  if (documentIndex > 1) return []
  return [
    {
      code: 'CX-001',
      commercialUnit: 'CX',
      description: 'Biscoito recheado 140 g',
      ordinal: 1,
      quantity: '40.0000',
      totalValue: '2400.0000',
      unitValue: '60.0000',
    },
    {
      code: 'CX-002',
      commercialUnit: 'CX',
      description: 'Suco de uva integral 1 L',
      ordinal: 2,
      quantity: '24.0000',
      totalValue: '1800.0000',
      unitValue: '75.0000',
    },
  ]
}

/**
 * Spec 233 T5.3: os eventos de uma nota (`GET /trips/:id/timeline?documentId=`), do mais recente ao mais
 * antigo. Os horários saem da baixa da própria nota — a lista e o comprovante contam o mesmo minuto —, e
 * a nota ainda não entregue só tem a saída, a chegada e a correção do endereço.
 */
export function noteAccordionTimelineItems(documentId: string) {
  const index = NOTE_ACCORDION_DOCUMENT_IDS.findIndex((id) => id === documentId)
  const note = noteAt(Math.max(index, 0))
  const deliveredAt = note.deliveredAt ?? '2026-08-10T15:00:00.000Z'
  const base = {
    actorName: 'Marina Alves',
    channel: 'driver_app',
    closeReason: null,
    document: { id: documentId, number: note.number, series: '1' },
    fromStatus: null,
    location: null,
    locationState: null,
    occurrence: null,
    onBehalfOfDriverName: null,
    recordedAt: null,
    returnReason: null,
    stop: { id: NOTE_ACCORDION_STOP_IDS[note.stopIndex], sequence: note.stopIndex + 1 },
    toStatus: null,
  } as const

  const beforeDelivery = [
    {
      ...base,
      actorName: 'Contratante Exemplo',
      addressChange: { displacementMeters: 45, origin: 'contractor' },
      channel: 'backoffice',
      document: null,
      id: `${documentId}-address-corrected`,
      kind: 'stop.address_corrected',
      location: {
        accuracyMeters: null,
        capturedAt: shiftMinutes(deliveredAt, -50),
        distanceMeters: null,
        latitude: -23.5507,
        longitude: -46.6335,
      },
      occurredAt: shiftMinutes(deliveredAt, -50),
    },
    {
      ...base,
      id: `${documentId}-arrived`,
      kind: 'stop.arrived',
      occurredAt: shiftMinutes(deliveredAt, -60),
    },
    {
      ...base,
      id: `${documentId}-departed`,
      kind: 'stop.departed',
      occurredAt: shiftMinutes(deliveredAt, -100),
    },
  ]
  if (note.deliveredAt === null) return beforeDelivery

  return [
    {
      ...base,
      id: `${documentId}-canhoto-photo`,
      kind: 'document.canhoto_photo',
      location: {
        accuracyMeters: 8,
        capturedAt: shiftMinutes(deliveredAt, 2),
        distanceMeters: 120,
        latitude: -23.5505,
        longitude: -46.6333,
      },
      locationState: 'captured',
      occurredAt: shiftMinutes(deliveredAt, 2),
    },
    {
      ...base,
      id: `${documentId}-delivered`,
      kind: 'document.delivered',
      occurredAt: deliveredAt,
    },
    ...beforeDelivery,
  ]
}
