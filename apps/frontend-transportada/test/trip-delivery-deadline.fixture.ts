/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * Spec 236 T2.2: sete notas em três paradas, com o prazo de entrega nos cinco estados, um atraso de zero dia útil
 * ("Vencida", sem número) e uma nota sem prazo (`null`). Só dado fictício. Mora fora de `trip-smoke.helper.ts`
 * porque é só dado: o helper registra as rotas.
 */
const TRIP_ID = '00000000-0000-4000-8000-000000000601'
const NFE_DOCUMENT_ID = '00000000-0000-4000-8000-000000000606'

export const DELIVERY_DEADLINE_STOP_IDS = [
  '00000000-0000-4000-8000-000000000751',
  '00000000-0000-4000-8000-000000000752',
  '00000000-0000-4000-8000-000000000753',
] as const

const DUE_ON = '2026-10-15'

type DeadlineNote = Readonly<{
  contactName: string
  deadline: Record<string, unknown> | null
  deliveredAt: null | string
  number: string
  stopIndex: 0 | 1 | 2
}>

const NOTES: readonly DeadlineNote[] = [
  {
    contactName: 'Mercado São Jorge Fictício',
    deadline: { businessDaysLate: 1, dueOn: DUE_ON, state: 'overdue' },
    deliveredAt: null,
    number: '000201',
    stopIndex: 0,
  },
  {
    contactName: 'Padaria Boa Massa Fictícia',
    deadline: { dueOn: DUE_ON, state: 'due_today' },
    deliveredAt: null,
    number: '000202',
    stopIndex: 0,
  },
  {
    contactName: 'Farmácia Central Fictícia',
    deadline: { businessDaysRemaining: 2, dueOn: DUE_ON, state: 'on_time' },
    deliveredAt: null,
    number: '000203',
    stopIndex: 1,
  },
  {
    contactName: 'Armazém Três Irmãos Fictício',
    deadline: { deliveredOn: DUE_ON, dueOn: DUE_ON, state: 'delivered_on_time' },
    deliveredAt: '2026-10-15T14:05:00.000Z',
    number: '000204',
    stopIndex: 1,
  },
  {
    contactName: 'Casa de Carnes Planalto Fictícia',
    deadline: {
      businessDaysLate: 2,
      deliveredOn: '2026-10-19',
      dueOn: DUE_ON,
      state: 'delivered_late',
    },
    deliveredAt: '2026-10-19T10:30:00.000Z',
    number: '000205',
    stopIndex: 2,
  },
  {
    contactName: 'Loja de Tintas Aurora Fictícia',
    deadline: { businessDaysLate: 0, dueOn: DUE_ON, state: 'overdue' },
    deliveredAt: null,
    number: '000206',
    stopIndex: 2,
  },
  {
    contactName: 'Distribuidora Vale Verde Fictícia',
    deadline: null,
    deliveredAt: null,
    number: '000207',
    stopIndex: 2,
  },
]

export const DELIVERY_DEADLINE_DOCUMENT_IDS = NOTES.map(
  (_, index) => `00000000-0000-4000-8000-00000000076${String(index + 1)}`,
)

export const DELIVERY_DEADLINE_DOCUMENTS = NOTES.map(
  (note, index) =>
    ({
      contact: {
        contractorName: 'Contratante Sintético LTDA',
        name: note.contactName,
        phone: '16999990005',
        taxId: '12345678000190',
      },
      createdAt: '2026-10-07T12:05:00.000Z',
      cteAuthorized: true,
      deliveredAt: note.deliveredAt,
      deliveryDeadline: note.deadline,
      destinationOrigin: null,
      fiscalStatus: 'authorized',
      freightAmount: '620.0000',
      freightCalculationId: null,
      freightRuleName: 'Tabela padrão',
      freightSource: 'estimated',
      id: DELIVERY_DEADLINE_DOCUMENT_IDS[index] ?? '',
      loadedAt: '2026-10-12T07:00:00.000Z',
      nfeDocumentId: NFE_DOCUMENT_ID,
      nfeIssuedAt: '2026-10-09T06:30:00.000Z',
      nfeNumber: note.number,
      nfeSeries: '1',
      nfeTotalValue: '4200.0000',
      proofPending: false,
      releasedAt: null,
      returnedAt: null,
      returnReason: null,
      separatedAt: null,
      separationStatus: note.deliveredAt === null ? ('loaded' as const) : ('delivered' as const),
      stopId: DELIVERY_DEADLINE_STOP_IDS[note.stopIndex],
      tripId: TRIP_ID,
      updatedAt: '2026-10-07T12:05:00.000Z',
      volumeCount: 12,
    }) as const,
)

const STOP_LABELS = [
  'São Paulo — Centro de Distribuição',
  'Campinas — Distrito Industrial',
  'Ribeirão Preto — Zona Sul',
] as const

export const DELIVERY_DEADLINE_STOPS = DELIVERY_DEADLINE_STOP_IDS.map((id, index) => ({
  addressKey: `delivery-deadline-${index + 1}`,
  arrivedAt: null,
  completedAt: null,
  deliveryWindowEnd: null,
  deliveryWindowStart: null,
  documents: DELIVERY_DEADLINE_DOCUMENTS.filter((document) => document.stopId === id),
  hasOpenOccurrence: false,
  id,
  label: STOP_LABELS[index] ?? '',
  sequence: index + 1,
}))

/**
 * Spec 252 T5.3: as mesmas três paradas, com o aviso de feriado em duas delas (a primeira não tem). Campinas: feriado
 * municipal importado; Ribeirão Preto: feriado nacional e um local cadastrado no mesmo dia. Só dado fictício.
 */
export const HOLIDAY_WARNING_STOPS = DELIVERY_DEADLINE_STOPS.map((stop, index) => {
  if (index === 1) {
    return {
      ...stop,
      holidayWarnings: [
        {
          cityIbgeCode: 3509502,
          cityName: 'Campinas',
          date: '2026-10-19',
          reasons: [{ name: 'Aniversário da cidade', origin: 'imported', scope: 'municipal' }],
        },
      ],
    }
  }
  if (index === 2) {
    return {
      ...stop,
      holidayWarnings: [
        {
          cityIbgeCode: 3543402,
          cityName: 'Ribeirão Preto',
          date: '2026-11-02',
          reasons: [
            { name: 'all_souls_day', origin: 'code', scope: 'national' },
            { name: 'Feriado local', origin: 'typed', scope: 'municipal' },
          ],
        },
      ],
    }
  }
  return stop
})
