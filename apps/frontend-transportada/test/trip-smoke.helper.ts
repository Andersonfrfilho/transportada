/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { TripDetailContract } from './trip/trip.fixture'
import { VEHICLE_DETAIL } from './fleet/fleet.fixture'
import { getApiBaseUrl } from './smoke-api-url.helper'
import {
  NOTE_ACCORDION_DOCUMENT_IDS,
  NOTE_ACCORDION_DOCUMENTS,
  NOTE_ACCORDION_OCCURRENCES,
  NOTE_ACCORDION_STOPS,
  NOTE_ACCORDION_PROOF_RADIUS_METERS,
  noteAccordionProducts,
  noteAccordionProofs,
  noteAccordionTimelineItems,
  noteAccordionValuation,
} from './trip-note-accordion.fixture'
import {
  DELIVERY_DEADLINE_DOCUMENTS,
  DELIVERY_DEADLINE_STOPS,
} from './trip-delivery-deadline.fixture'
import { type Page, type Route } from '@playwright/test'

const CORS_HEADERS = {
  'access-control-allow-headers': 'Authorization, Content-Type, Idempotency-Key',
  'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
}
const SMOKE_AUTH_ME_STORAGE_KEY = 'transportada.smoke-auth-me'

export const TRIP_ID = '00000000-0000-4000-8000-000000000601'
const VEHICLE_ID = '00000000-0000-4000-8000-000000000602'
const DRIVER_ID = '00000000-0000-4000-8000-000000000603'
export const PENDING_DOCUMENT_ID = '00000000-0000-4000-8000-000000000604'
export const AUTHORIZED_DOCUMENT_ID = '00000000-0000-4000-8000-000000000605'
const NFE_DOCUMENT_ID = '00000000-0000-4000-8000-000000000606'

/**
 * Spec 181 T502: a parada e as notas que provam o card redesenhado — carregada com as três ações
 * de campo, devolvida com motivo, e a nota que carrega tratativa de ocorrência aberta e "sem perfil
 * de emissão" ao mesmo tempo (os dois eixos de selo que a T502 ainda não tinha dublê para mostrar).
 */
export const STOP_CARD_STOP_ID = '00000000-0000-4000-8000-000000000608'
export const STOP_CARD_LOADED_DOCUMENT_ID = '00000000-0000-4000-8000-000000000609'
export const STOP_CARD_RETURNED_DOCUMENT_ID = '00000000-0000-4000-8000-00000000060a'
export const STOP_CARD_OCCURRENCE_DOCUMENT_ID = '00000000-0000-4000-8000-00000000060b'
/** T502: a parada **concluída** e a nota de destinatário longo — os dois elementos que vazavam. */
export const STOP_CARD_DONE_STOP_ID = '00000000-0000-4000-8000-00000000061a'
export const STOP_CARD_LONG_RECIPIENT_DOCUMENT_ID = '00000000-0000-4000-8000-00000000061b'

/**
 * Spec 185 T7.1: o modo "leva todas" — duas notas "separadas" prontas para carregar (uma que o
 * mock de `.../load` despacha sozinha, outra que ele recusa) e uma "pending" com
 * `leavesBehindOnDispatch` para o diálogo de despacho contar a que fica para trás.
 */
export const DISPATCH_FLOW_STOP_ID = '00000000-0000-4000-8000-00000000061c'
export const DISPATCH_UNSCHEDULED_STOP_ID = '00000000-0000-4000-8000-00000000061d'
export const DISPATCH_LOAD_DISPATCHED_DOCUMENT_ID = '00000000-0000-4000-8000-00000000061e'
export const DISPATCH_LOAD_BLOCKED_DOCUMENT_ID = '00000000-0000-4000-8000-00000000061f'
export const DISPATCH_LEFT_BEHIND_DOCUMENT_ID = '00000000-0000-4000-8000-000000000621'
/** T7.1: a viagem já despachada — sem "Despachar" no cabeçalho, com "Iniciar rota" liberado. */
export const DISPATCHED_STOP_ID = '00000000-0000-4000-8000-000000000622'
export const DISPATCHED_DOCUMENT_ID = '00000000-0000-4000-8000-000000000623'

/**
 * Spec 220 T7.19: a nota **entregue**. Nenhum modo anterior tem uma — a carregada cai em
 * `not-delivered` e a devolvida em `returned` (`resolveDeliveryProofView`), e os dois estados
 * desenham uma frase no lugar do painel, sem foto, sem leitura e sem conferência.
 */
export const PROOF_STOP_ID = '00000000-0000-4000-8000-000000000624'
export const PROOF_DELIVERED_DOCUMENT_ID = '00000000-0000-4000-8000-000000000625'

const BASE_TRIP = {
  companyId: '00000000-0000-4000-8000-000000000001',
  driverNames: [],
  createdAt: '2026-07-28T12:00:00.000Z',
  id: TRIP_ID,
  requiresMdfe: null,
  requiresMdfeReason: null,
  // ADR-0043 substituiu `open|closed` pelos oito estados operacionais; `open` virou `draft`
  status: 'draft',
  updatedAt: '2026-07-28T12:00:00.000Z',
  vehicleId: VEHICLE_ID,
} as const

type DocumentsMode =
  | 'all-authorized'
  | 'delivered-proof'
  | 'delivery-deadline'
  | 'document-cost'
  | 'document-cost-open'
  | 'dispatch-flow'
  | 'dispatched'
  | 'has-pending'
  | 'measured-bed'
  | 'note-accordion'
  | 'stop-card-states'

function measuredBox(
  input: Readonly<{ label: string; layer: number; stopSequence: number; xM: number; zM: number }>,
) {
  return {
    depthM: 1.2,
    heightM: 1.1,
    isFragile: false,
    label: input.label,
    layer: input.layer,
    reasons: [],
    source: 'measured',
    stopSequence: input.stopSequence,
    widthM: 1,
    xM: input.xM,
    yM: 0,
    zM: input.zM,
  } as const
}

/**
 * O baú medido, com duas paradas. Só uma delas tem todas as caixas medidas — é o caso real (6 de 663
 * medidas), e é ele que a tela precisa saber distinguir. A planta em escala da 088 saiu em
 * `453e0b1e`: o que desenha a carga hoje é o `placement`, na vista em perspectiva por camada.
 */
const MEASURED_CARGO_LAYOUT = {
  bedHeightM: '2.300',
  bedLengthM: '7.400',
  bedSource: 'measured',
  bedWidthM: '2.470',
  freeDepthM: '3.400',
  loadingAccess: 'rear',
  pendingMeasurements: [
    {
      boxCount: 12,
      documentNumber: '4521',
      estimateSource: 'median',
      label: 'Caixa de azulejo',
      productCode: 'AZ-30',
      sequence: 2,
      stopLabel: 'Campinas',
    },
  ],
  freeRows: 5,
  occupancyKnown: true,
  orderIsBinding: true,
  overflowDepthM: '0.000',
  overflowM3: '0.000000',
  /**
   * Spec 095: a planta em escala saiu e o desenho que ficou é o isométrico, que só nasce do arranjo
   * camada por camada. Sem `placement` o painel volta `null` e o smoke não desenharia nada.
   */
  placement: {
    layers: [
      {
        boxes: [
          measuredBox({ label: 'Campinas', layer: 0, stopSequence: 2, xM: 0, zM: 0 }),
          measuredBox({ label: 'Barrinha', layer: 0, stopSequence: 1, xM: 3.4, zM: 0 }),
        ],
        heightM: 1.1,
        index: 0,
      },
      {
        boxes: [measuredBox({ label: 'Campinas', layer: 1, stopSequence: 2, xM: 0, zM: 1.1 })],
        heightM: 1.1,
        index: 1,
      },
    ],
    source: 'measured',
    splitNotes: [],
    unplaced: [],
  },
  /**
   * ⚠️ `clientName` e `noteNumbers` são obrigatórios desde `453e0b1e`: a ficha da parada diz quem
   * recebe e quais notas, e o detalhe não valida `cargoLayout` — sem eles a tela cai inteira.
   */
  rows: [
    {
      clientName: 'Cliente Campinas',
      label: 'Campinas',
      loadOrder: 1,
      noteNumbers: ['22'],
      sequence: 2,
      sideReachable: false,
    },
    {
      clientName: 'Cliente Campinas',
      label: 'Campinas',
      loadOrder: 1,
      noteNumbers: ['22'],
      sequence: 2,
      sideReachable: false,
    },
    {
      clientName: 'Cliente Barrinha',
      label: 'Barrinha',
      loadOrder: 2,
      noteNumbers: ['11'],
      sequence: 1,
      sideReachable: false,
    },
  ],
  slices: [
    {
      boxesToMeasure: 0,
      depthM: '1.400',
      distanceFromDoorM: '3.400',
      label: 'Barrinha',
      layers: { boxCount: 40, boxesPerLayer: 17, layers: 3 },
      loadOrder: 2,
      sequence: 1,
      share: '0.2000',
      volumeM3: '8.400000',
    },
    {
      boxesToMeasure: 12,
      depthM: '2.600',
      distanceFromDoorM: '4.800',
      label: 'Campinas',
      layers: null,
      loadOrder: 1,
      sequence: 2,
      share: '0.3700',
      volumeM3: '15.600000',
    },
  ],
  stopsWithoutVolume: [],
} as const

const MEASURED_OCCUPANCY = {
  capacityDimensions: { heightM: '2.300', lengthM: '7.400', widthM: '2.470' },
  capacityM3: '42.039000',
  capacitySource: 'measured',
  documentsWithoutVolume: 0,
  loadedM3: '24.000000',
  occupancyRatio: '0.5709',
  /**
   * ⚠️ `estimated` e não `partial`: o `TripDetailContract` deste smoke restata as origens e ficou
   * na lista de antes da 085 G006. Não é o que esta spec veio consertar, e a origem não muda o que
   * o teste abaixo mede — a carga desenhada e a página que não estoura.
   */
  source: 'estimated',
} as const

function tripDocument(input: Readonly<{ cteAuthorized: boolean; id: string }>) {
  return {
    createdAt: '2026-07-28T12:05:00.000Z',
    cteAuthorized: input.cteAuthorized,
    deliveredAt: null,
    destinationOrigin: null,
    fiscalStatus: input.cteAuthorized ? 'authorized' : 'unsigned',
    freightCalculationId: null,
    id: input.id,
    // ADR-0043 §1: o eixo da nota, do qual o estado da viagem é derivado
    loadedAt: null,
    nfeDocumentId: NFE_DOCUMENT_ID,
    releasedAt: null,
    returnedAt: null,
    returnReason: null,
    separatedAt: null,
    separationStatus: 'pending',
    stopId: null,
    tripId: TRIP_ID,
    updatedAt: '2026-07-28T12:05:00.000Z',
  } as const
}

/**
 * Spec 181 T502: a nota "carregada" simples — sem devolução, sem ocorrência, sem detalhe extra —
 * mas com as três ações de campo liberadas (`registerStopCardAllowedActionsMock` abaixo), que é o
 * caso feliz do card redesenhado ("Marcar entregue" / "Devolver" / "Ocorrência").
 */
const STOP_CARD_LOADED_DOCUMENT = {
  ...tripDocument({ cteAuthorized: true, id: STOP_CARD_LOADED_DOCUMENT_ID }),
  freightAmount: '850.0000',
  freightSource: 'measured',
  nfeIssuedAt: '2026-08-10T09:00:00.000Z',
  nfeNumber: '901',
  nfeSeries: '1',
  nfeTotalValue: '4200.0000',
  separationStatus: 'loaded',
  stopId: STOP_CARD_STOP_ID,
} as const

/**
 * Spec 181 RF3/CA03: devolvida com motivo — o selo compõe "Devolvida · Ausente" a partir de
 * `separationStatus` + `returnReason`, sem repetir o motivo numa frase à parte.
 */
const STOP_CARD_RETURNED_DOCUMENT = {
  ...tripDocument({ cteAuthorized: true, id: STOP_CARD_RETURNED_DOCUMENT_ID }),
  nfeNumber: '902',
  nfeSeries: '1',
  returnedAt: '2026-08-10T15:00:00.000Z',
  returnReason: 'recipient_absent',
  separationStatus: 'returned',
  stopId: STOP_CARD_STOP_ID,
} as const

/**
 * Spec 181 RF2/CA02 + prontidão `no_profile`: os outros dois eixos de selo na mesma nota, com
 * contato e regra de frete para a expansão "Detalhes da nota" (T304) aparecer, e mercadoria para o
 * grupo "Carga" da linha.
 */
const STOP_CARD_OCCURRENCE_DOCUMENT = {
  ...tripDocument({ cteAuthorized: false, id: STOP_CARD_OCCURRENCE_DOCUMENT_ID }),
  contact: {
    contractorName: 'Contratante Sintético LTDA',
    name: 'Cliente Sintético',
    phone: '16999990002',
    taxId: '12345678000199',
  },
  freightRuleName: 'Tabela padrão',
  nfeNumber: '903',
  nfeSeries: '1',
  nfeTotalValue: '1800.0000',
  openOccurrenceCase: true,
  stopId: STOP_CARD_STOP_ID,
} as const

/**
 * T502: o destinatário de nome longo. A revisão de design encontrou "Recebe: <razão social>" saindo
 * pela borda direita do card sem reticências nem quebra — sem uma razão social de verdade na
 * fixture, o print mostrava um nome curto e o vazamento não aparecia na foto.
 */
const STOP_CARD_LONG_RECIPIENT_DOCUMENT = {
  ...tripDocument({ cteAuthorized: true, id: STOP_CARD_LONG_RECIPIENT_DOCUMENT_ID }),
  contact: {
    contractorName: 'DISTRIBUIDORA CENTRO OESTE DE MEDICAMENTOS LTDA',
    name: 'ALMEIDA COMERCIO DE PRODUTOS DE FARMACIA E PERFUMARIA LTDA',
    phone: '16999990003',
    taxId: '12345678000190',
  },
  freightAmount: '90.5600',
  freightSource: 'estimated',
  nfeIssuedAt: '2026-08-10T09:12:00.000Z',
  nfeNumber: '904',
  nfeSeries: '1',
  nfeTotalValue: '754.6300',
  returnedAt: '2026-08-10T17:31:00.000Z',
  returnReason: 'recipient_absent',
  separationStatus: 'returned',
  stopId: STOP_CARD_DONE_STOP_ID,
} as const

/**
 * T502: a parada **concluída**. Ela existe pelo cabeçalho, não pela nota: parada visitada ganha o
 * selo de execução e o botão "Registrar ocorrência" ao lado, e era essa combinação que espremia o
 * botão até o rótulo quebrar dentro da própria caixa. Parada só de galpão nunca fotografa o defeito.
 */
const STOP_CARD_DONE_STOP = {
  addressKey: 'stop-card-done',
  arrivedAt: '2026-08-10T17:05:00.000Z',
  completedAt: '2026-08-10T17:31:00.000Z',
  deliveryWindowEnd: null,
  deliveryWindowStart: null,
  documents: [STOP_CARD_LONG_RECIPIENT_DOCUMENT],
  hasOpenOccurrence: false,
  id: STOP_CARD_DONE_STOP_ID,
  label: 'AVENIDA 21, 610, BARRETOS, SP',
  sequence: 2,
} as const

/** Spec 181 T502: uma parada só, com as três notas acima — a mesma lista entra em `documents` (nível
 * da viagem) e aqui aninhada (ADR-0043 §3), nunca uma cópia divergente. */
const STOP_CARD_STOP = {
  addressKey: 'stop-card-states',
  arrivedAt: null,
  completedAt: null,
  deliveryWindowEnd: null,
  deliveryWindowStart: null,
  documents: [
    STOP_CARD_LOADED_DOCUMENT,
    STOP_CARD_RETURNED_DOCUMENT,
    STOP_CARD_OCCURRENCE_DOCUMENT,
  ],
  hasOpenOccurrence: true,
  id: STOP_CARD_STOP_ID,
  label: 'Barracão Sintético',
  sequence: 1,
} as const

/**
 * Spec 185 T7.1: as duas notas "separadas" do diálogo "leva todas" — uma que o mock de
 * `.../load` despacha sozinha, outra que ele recusa (`TRIP_HAS_UNSCHEDULED_STOPS`) — e a
 * "pending" que fica para trás. Ordem no array é o que os testes usam para clicar em "Carregar"
 * (`nth(0)`/`nth(1)`), já que as três não têm nada no texto que as distinga.
 */
const DISPATCH_LOAD_DISPATCHED_DOCUMENT = {
  ...tripDocument({ cteAuthorized: true, id: DISPATCH_LOAD_DISPATCHED_DOCUMENT_ID }),
  separatedAt: '2026-08-11T09:00:00.000Z',
  separationStatus: 'separated',
  stopId: DISPATCH_FLOW_STOP_ID,
} as const

const DISPATCH_LOAD_BLOCKED_DOCUMENT = {
  ...tripDocument({ cteAuthorized: true, id: DISPATCH_LOAD_BLOCKED_DOCUMENT_ID }),
  separatedAt: '2026-08-11T09:00:00.000Z',
  separationStatus: 'separated',
  stopId: DISPATCH_FLOW_STOP_ID,
} as const

const DISPATCH_LEFT_BEHIND_DOCUMENT = {
  ...tripDocument({ cteAuthorized: true, id: DISPATCH_LEFT_BEHIND_DOCUMENT_ID }),
  leavesBehindOnDispatch: true,
  stopId: DISPATCH_FLOW_STOP_ID,
} as const

const DISPATCH_FLOW_STOP = {
  addressKey: 'dispatch-flow',
  arrivedAt: null,
  completedAt: null,
  deliveryWindowEnd: null,
  deliveryWindowStart: null,
  documents: [
    DISPATCH_LOAD_DISPATCHED_DOCUMENT,
    DISPATCH_LOAD_BLOCKED_DOCUMENT,
    DISPATCH_LEFT_BEHIND_DOCUMENT,
  ],
  hasOpenOccurrence: false,
  id: DISPATCH_FLOW_STOP_ID,
  label: 'Galpao Central',
  sequence: 1,
} as const

/** A parada que a resposta de bloqueio cita em `details.stopIds` — ainda sem agendamento. */
const DISPATCH_UNSCHEDULED_STOP = {
  addressKey: 'dispatch-unscheduled',
  arrivedAt: null,
  completedAt: null,
  deliveryWindowEnd: null,
  deliveryWindowStart: null,
  documents: [],
  hasOpenOccurrence: false,
  id: DISPATCH_UNSCHEDULED_STOP_ID,
  label: 'Cliente Via Norte',
  sequence: 2,
} as const

/** A viagem já despachada: nota carregada, sem nada a separar/carregar. */
const DISPATCHED_DOCUMENT = {
  ...tripDocument({ cteAuthorized: true, id: DISPATCHED_DOCUMENT_ID }),
  loadedAt: '2026-08-11T10:00:00.000Z',
  separationStatus: 'loaded',
  stopId: DISPATCHED_STOP_ID,
} as const

const DISPATCHED_STOP = {
  addressKey: 'dispatched-flow',
  arrivedAt: null,
  completedAt: null,
  deliveryWindowEnd: null,
  deliveryWindowStart: null,
  documents: [DISPATCHED_DOCUMENT],
  hasOpenOccurrence: false,
  id: DISPATCHED_STOP_ID,
  label: 'Cliente Alfa',
  sequence: 1,
} as const

/**
 * Spec 220 T7.19: a nota entregue que abre o painel do comprovante. O destinatário longo veio junto
 * de propósito — o painel abre **dentro** do card da nota, e é essa largura já espremida que a
 * revisão de design mede.
 */
const PROOF_DELIVERED_DOCUMENT = {
  ...tripDocument({ cteAuthorized: true, id: PROOF_DELIVERED_DOCUMENT_ID }),
  contact: {
    contractorName: 'DISTRIBUIDORA CENTRO OESTE DE MEDICAMENTOS LTDA',
    name: 'ALMEIDA COMERCIO DE PRODUTOS DE FARMACIA E PERFUMARIA LTDA',
    phone: '16999990004',
    taxId: '12345678000190',
  },
  deliveredAt: '2026-08-10T16:42:00.000Z',
  freightAmount: '90.5600',
  freightSource: 'estimated',
  loadedAt: '2026-08-10T08:00:00.000Z',
  nfeIssuedAt: '2026-08-10T07:30:00.000Z',
  nfeNumber: '904',
  nfeSeries: '1',
  nfeTotalValue: '754.6300',
  separationStatus: 'delivered',
  stopId: PROOF_STOP_ID,
} as const

const PROOF_STOP = {
  addressKey: 'delivered-proof',
  arrivedAt: '2026-08-10T16:20:00.000Z',
  completedAt: '2026-08-10T16:42:00.000Z',
  deliveryWindowEnd: null,
  deliveryWindowStart: null,
  documents: [PROOF_DELIVERED_DOCUMENT],
  hasOpenOccurrence: false,
  id: PROOF_STOP_ID,
  label: 'AVENIDA 21, 610, BARRETOS, SP',
  sequence: 1,
} as const

/**
 * Spec 232 (T4.3): três paradas e cinco notas, com a conta **fechando** — Σ (gasto + imposto) =
 * `totalCost`, Σ frete = `totalRevenue` e Σ lucro = `totalMargin` da avaliação. Print com conta que
 * não fecha é pior que print nenhum. Uma nota em prejuízo com tempo completo (D3), outra em prejuízo
 * com tempo incompleto (D5) e uma parcial (D4) cobrem os estados que a linha da nota sabe dizer.
 *
 * Retorno e avulso somam 400,00 e se repartem igualmente (80,00 por nota); o trecho 1 (500,00) leva
 * as cinco notas, o 2 (360,00) leva D3·D4·D5, o 3 (300,00) leva D4·D5.
 */
export const DOCUMENT_COST_STOP_IDS = [
  '00000000-0000-4000-8000-000000000631',
  '00000000-0000-4000-8000-000000000632',
  '00000000-0000-4000-8000-000000000633',
] as const
export const DOCUMENT_COST_DOCUMENT_IDS = [
  '00000000-0000-4000-8000-000000000641',
  '00000000-0000-4000-8000-000000000642',
  '00000000-0000-4000-8000-000000000643',
  '00000000-0000-4000-8000-000000000644',
  '00000000-0000-4000-8000-000000000645',
] as const

type DocumentCostFixture = Readonly<{
  cost: string
  freight: string
  leg: string
  margin: string
  marginPercentage: string
  number: string
  recipient: string
  share: string
  stopIndex: 0 | 1 | 2
  tax: string
  timeBasis: 'complete' | 'incomplete' | 'partial'
}>

const DOCUMENT_COST_FIXTURES: readonly DocumentCostFixture[] = [
  {
    cost: '180.0000',
    freight: '850.0000',
    leg: '100.0000',
    margin: '568.0000',
    marginPercentage: '66.8235',
    number: '1101',
    recipient: 'Mercado Alfa Ltda',
    share: '80.0000',
    stopIndex: 0,
    tax: '102.0000',
    timeBasis: 'complete',
  },
  {
    cost: '180.0000',
    freight: '620.0000',
    leg: '100.0000',
    margin: '365.6000',
    marginPercentage: '58.9677',
    number: '1102',
    recipient: 'Mercado Alfa Ltda',
    share: '80.0000',
    stopIndex: 0,
    tax: '74.4000',
    timeBasis: 'complete',
  },
  {
    cost: '300.0000',
    freight: '300.0000',
    leg: '220.0000',
    margin: '-36.0000',
    marginPercentage: '-12.0000',
    number: '1103',
    recipient: 'Distribuidora Beta Ltda',
    share: '80.0000',
    stopIndex: 1,
    tax: '36.0000',
    timeBasis: 'complete',
  },
  {
    cost: '450.0000',
    freight: '540.0000',
    leg: '370.0000',
    margin: '25.2000',
    marginPercentage: '4.6667',
    number: '1104',
    recipient: 'Atacado Gama Ltda',
    share: '80.0000',
    stopIndex: 2,
    tax: '64.8000',
    timeBasis: 'partial',
  },
  {
    cost: '450.0000',
    freight: '190.0000',
    leg: '370.0000',
    margin: '-282.8000',
    marginPercentage: '-148.8421',
    number: '1105',
    recipient: 'Atacado Gama Ltda',
    share: '80.0000',
    stopIndex: 2,
    tax: '22.8000',
    timeBasis: 'incomplete',
  },
]

const DOCUMENT_COST_STOP_LABELS = [
  'Campinas — Centro de Distribuição',
  'Ribeirão Preto — Loja Beta',
  'Barretos — Atacado Gama',
] as const

function documentCostDocument(index: number) {
  const fixture = DOCUMENT_COST_FIXTURES[index]
  if (fixture === undefined) throw new Error('DOCUMENT_COST_FIXTURE_OUT_OF_RANGE')

  return {
    ...tripDocument({ cteAuthorized: true, id: DOCUMENT_COST_DOCUMENT_IDS[index] ?? '' }),
    contact: {
      contractorName: 'Contratante Sintético LTDA',
      name: fixture.recipient,
      phone: '16999990005',
      taxId: '12345678000199',
    },
    freightAmount: fixture.freight,
    freightSource: 'estimated',
    nfeIssuedAt: '2026-08-10T09:00:00.000Z',
    nfeNumber: fixture.number,
    nfeSeries: '1',
    nfeTotalValue: '4200.0000',
    separationStatus: 'loaded',
    stopId: DOCUMENT_COST_STOP_IDS[fixture.stopIndex],
  } as const
}

const DOCUMENT_COST_DOCUMENTS = DOCUMENT_COST_FIXTURES.map((_, index) =>
  documentCostDocument(index),
)

const DOCUMENT_COST_STOPS = DOCUMENT_COST_STOP_IDS.map((id, index) => ({
  addressKey: `document-cost-${index + 1}`,
  arrivedAt: null,
  completedAt: null,
  deliveryWindowEnd: null,
  deliveryWindowStart: null,
  documents: DOCUMENT_COST_DOCUMENTS.filter((document) => document.stopId === id),
  hasOpenOccurrence: false,
  id,
  label: DOCUMENT_COST_STOP_LABELS[index] ?? '',
  sequence: index + 1,
}))

function isDocumentCostMode(mode: DocumentsMode): boolean {
  return mode === 'document-cost' || mode === 'document-cost-open'
}

function documentCostRevenueLine(index: number, isUnavailable: boolean) {
  const fixture = DOCUMENT_COST_FIXTURES[index]
  if (fixture === undefined) throw new Error('DOCUMENT_COST_FIXTURE_OUT_OF_RANGE')
  const costFigures = isUnavailable
    ? {
        costAmount: null,
        costBasis: 'unavailable',
        legCostAmount: null,
        marginAmount: null,
        marginPercentage: null,
        taxAmount: fixture.tax,
        timeBasis: 'incomplete',
        tripShareCostAmount: null,
      }
    : {
        costAmount: fixture.cost,
        costBasis: 'leg',
        legCostAmount: fixture.leg,
        marginAmount: fixture.margin,
        marginPercentage: fixture.marginPercentage,
        taxAmount: fixture.tax,
        timeBasis: fixture.timeBasis,
        tripShareCostAmount: fixture.share,
      }

  return {
    amount: fixture.freight,
    freightRuleId: null,
    freightRuleName: null,
    gap: isUnavailable ? 'NO_PLANNED_DISTANCE' : null,
    nfeDocumentId: NFE_DOCUMENT_ID,
    percentage: null,
    source: 'estimated',
    tripDocumentId: DOCUMENT_COST_DOCUMENT_IDS[index],
    ...costFigures,
  }
}

function documentCostParcel(kind: string, amount: string, isUnavailable: boolean) {
  const isTax = kind === 'icms' || kind === 'pis_cofins'
  const isMissing = isUnavailable && !isTax

  return {
    amount: isMissing ? '0.0000' : amount,
    basis: null,
    detail: null,
    gap: isMissing ? 'NO_PLANNED_DISTANCE' : null,
    kind,
    source: isMissing ? 'missing' : 'estimated',
  }
}

/**
 * Σ das parcelas = 1860,00 = 1560,00 de gasto + 300,00 de imposto (o `totalCost` já o inclui). Sem
 * roteiro calculado só o imposto — exato por nota — existe, e as parcelas por quilômetro saem
 * `missing` com a lacuna ao lado, como a API responde.
 */
function documentCostValuation(isUnavailable: boolean) {
  return {
    costParcels: [
      documentCostParcel('icms', '240.0000', isUnavailable),
      documentCostParcel('pis_cofins', '60.0000', isUnavailable),
      documentCostParcel('fuel', '640.0000', isUnavailable),
      documentCostParcel('toll', '160.0000', isUnavailable),
      documentCostParcel('driver', '560.0000', isUnavailable),
      documentCostParcel('other_per_kilometer', '200.0000', isUnavailable),
    ],
    hasGaps: isUnavailable,
    marginPercentage: isUnavailable ? '88.0000' : '25.6000',
    revenueLines: DOCUMENT_COST_FIXTURES.map((_, index) =>
      documentCostRevenueLine(index, isUnavailable),
    ),
    revenueSource: 'estimated',
    totalCost: isUnavailable ? '300.0000' : '1860.0000',
    totalMargin: isUnavailable ? '2200.0000' : '640.0000',
    totalRevenue: '2500.0000',
  }
}

/**
 * O congelado difere do previsto nos dois sentidos: receita +140,00 (mais frete medido no CT-e),
 * custo +156,80 (combustível e diária acima do previsto) e resultado −16,80.
 */
const DOCUMENT_COST_FROZEN_RESULT = {
  costTotal: '1700.0000',
  frozenAt: '2026-08-12T18:00:00.000Z',
  isComplete: true,
  marginRate: '23.6061',
  netAmount: '623.2000',
  parcels: [
    { amount: '253.4400', kind: 'icms', nature: 'tax', note: '', source: 'measured' },
    { amount: '63.3600', kind: 'pis_cofins', nature: 'tax', note: '', source: 'measured' },
    { amount: '702.0000', kind: 'fuel', nature: 'cost', note: '', source: 'measured' },
    { amount: '160.0000', kind: 'toll', nature: 'cost', note: '', source: 'measured' },
    { amount: '640.0000', kind: 'driver', nature: 'cost', note: '', source: 'estimated' },
    {
      amount: '198.0000',
      kind: 'other_per_kilometer',
      nature: 'cost',
      note: '',
      source: 'estimated',
    },
  ],
  recalculationReason: '',
  revenueAmount: '2640.0000',
  revenueDocumentCount: 5,
  revenueExpectedCount: 5,
  taxTotal: '316.8000',
  version: 1,
} as const

/**
 * ⚠️ **Anotado de propósito.** O guard do detalhe usa `hasExactKeys`: campo do corpo ausente aqui
 * reprova a validação inteira em tempo de execução, o detalhe não carrega, e a tela fica sem botão
 * nenhum — o smoke quebra em quatro casos e nenhum contrato de unidade acusa. Sem o tipo, só o
 * Playwright acha (spec 075).
 */
function tripDetail(mode: DocumentsMode): TripDetailContract {
  const documents =
    mode === 'has-pending'
      ? [
          tripDocument({ cteAuthorized: true, id: AUTHORIZED_DOCUMENT_ID }),
          tripDocument({ cteAuthorized: false, id: PENDING_DOCUMENT_ID }),
        ]
      : isDocumentCostMode(mode)
        ? DOCUMENT_COST_DOCUMENTS
        : mode === 'note-accordion'
          ? NOTE_ACCORDION_DOCUMENTS
          : mode === 'delivery-deadline'
            ? DELIVERY_DEADLINE_DOCUMENTS
            : mode === 'delivered-proof'
              ? [PROOF_DELIVERED_DOCUMENT]
              : mode === 'stop-card-states'
                ? [
                    STOP_CARD_LOADED_DOCUMENT,
                    STOP_CARD_RETURNED_DOCUMENT,
                    STOP_CARD_OCCURRENCE_DOCUMENT,
                    STOP_CARD_LONG_RECIPIENT_DOCUMENT,
                  ]
                : mode === 'dispatch-flow'
                  ? [
                      DISPATCH_LOAD_DISPATCHED_DOCUMENT,
                      DISPATCH_LOAD_BLOCKED_DOCUMENT,
                      DISPATCH_LEFT_BEHIND_DOCUMENT,
                    ]
                  : mode === 'dispatched'
                    ? [DISPATCHED_DOCUMENT]
                    : [tripDocument({ cteAuthorized: true, id: AUTHORIZED_DOCUMENT_ID })]

  return {
    ...BASE_TRIP,
    /**
     * Spec 185 T7.1: "leva todas" só oferece "Despachar" em `loading`/`route_planned`/`separating`
     * (`canDispatch`, `TripHeaderActions.component.tsx`); `dispatched` é o print do cabeçalho sem
     * "Conferir carga" e com a fase "Despachada" alcançada.
     */
    status:
      mode === 'dispatch-flow'
        ? 'loading'
        : mode === 'dispatched'
          ? 'dispatched'
          : mode === 'document-cost'
            ? 'completed'
            : mode === 'note-accordion' || mode === 'delivery-deadline'
              ? 'in_transit'
              : BASE_TRIP.status,
    amounts: null,
    /** Spec 156 T8d: `null` nos três — a viagem do smoke nunca foi encerrada à mão. */
    closeReason: null,
    closedAt: null,
    closedByName: null,
    capacityUnknownReason: null,
    capacityUnknownVehicleId: null,
    documents,
    /** Spec 107 D3: os dois andam em par — hora sem carimbo é previsão sem idade. */
    estimatedArrivalFrozenAt: null,
    estimatedFinishAt: null,
    drivers: [
      { driverId: DRIVER_ID, driverName: 'Jose da Silva', driverTaxId: '12345678901', position: 1 },
    ],
    /**
     * Spec 075: o guard do detalhe usa `hasExactKeys` — campo do corpo ausente aqui reprova a
     * validação inteira, o detalhe não carrega e a tela fica sem botão nenhum. `null` é o estado
     * legítimo: veículo sem capacidade conhecida não mostra ocupação.
     */
    ...(mode === 'measured-bed'
      ? { cargoLayout: MEASURED_CARGO_LAYOUT, occupancy: MEASURED_OCCUPANCY }
      : { cargoLayout: null, occupancy: null }),
    cargoWeight: null,
    trailer: null,
    // ADR-0043 §3: a viagem tem paradas. Vazia é estado legítimo — nota ainda não reconciliada.
    stops: isDocumentCostMode(mode)
      ? DOCUMENT_COST_STOPS
      : mode === 'note-accordion'
        ? NOTE_ACCORDION_STOPS
        : mode === 'delivery-deadline'
          ? DELIVERY_DEADLINE_STOPS
          : mode === 'delivered-proof'
            ? [PROOF_STOP]
            : mode === 'stop-card-states'
              ? [STOP_CARD_STOP, STOP_CARD_DONE_STOP]
              : mode === 'dispatch-flow'
                ? [DISPATCH_FLOW_STOP, DISPATCH_UNSCHEDULED_STOP]
                : mode === 'dispatched'
                  ? [DISPATCHED_STOP]
                  : [],
  }
}

type MockPermissions = readonly string[]

type MockState = {
  failures: string[]
  manifestCreations: number
  /** Spec 065 D4c: o que a tela mandou na dispensa — o motivo é a metade que importa. */
  mdfeRequirements: { reason: null | string; requiresMdfe: boolean | null }[]
}

/**
 * Requisição **abortada** não é chamada que falhou: é a que o navegador descartou porque a página
 * mudou embaixo dela. O cabeçalho busca a foto assim que a sessão resolve, e o login navega logo
 * depois — a corrida é normal e não tem consequência nenhuma em produção.
 *
 * O que esta asserção existe para pegar continua pego: rota sem mock escapa para a API real, que não
 * sobe no smoke, e isso vira `ERR_FAILED`/`ERR_CONNECTION_REFUSED`. O `abort` deliberado do smoke do
 * motorista usa `internetdisconnected`, que também não passa por aqui.
 */
function isDiscardedByNavigation(errorText: string | undefined): boolean {
  return errorText === 'net::ERR_ABORTED'
}

async function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: 'application/json',
    headers: { ...CORS_HEADERS, 'access-control-allow-origin': '*' },
    status,
  })
}

async function fulfillOptions(route: Route): Promise<void> {
  await route.fulfill({
    headers: { ...CORS_HEADERS, 'access-control-allow-origin': '*' },
    status: 204,
  })
}

/**
 * O cabeçalho busca a foto da pessoa em toda página — o claim `picture` do token aponta para esta
 * mesma rota autenticada, e `<img src>` não manda o `Authorization`. Sem este mock a requisição
 * escapa para a API real, que não sobe no smoke, e o `requestfailed` entra em `failures()`.
 *
 * 404 é a resposta certa para quem não tem foto: o cliente a trata como ausência, e a tela desenha
 * as iniciais.
 */
async function registerUserPictureMock(page: Page): Promise<void> {
  await page.route('**/company-users/*/picture', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ headers: CORS_HEADERS, status: 204 })
      return
    }
    await route.fulfill({ headers: CORS_HEADERS, status: 404 })
  })
}

async function registerIdentityMock(
  input: Readonly<{ page: Page; permissions: MockPermissions }>,
): Promise<void> {
  await input.page.addInitScript(
    ({ permissions, storageKey }) => {
      window.sessionStorage.setItem(
        storageKey,
        JSON.stringify({
          data: {
            company: { id: '00000000-0000-4000-8000-000000000001' },
            identity: { userId: '00000000-0000-4000-8000-000000000002' },
            permissions,
            roles: ['viewer'],
          },
        }),
      )
    },
    { permissions: input.permissions, storageKey: SMOKE_AUTH_ME_STORAGE_KEY },
  )
  await input.page.route('**/auth/me', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillOptions(route)
      return
    }
    await fulfillJson(route, {
      data: {
        company: { id: '00000000-0000-4000-8000-000000000001' },
        identity: { userId: '00000000-0000-4000-8000-000000000002' },
        permissions: input.permissions,
        roles: ['viewer'],
      },
    })
  })
}

async function registerEmptyListMock(
  input: Readonly<{ page: Page; pattern: RegExp }>,
): Promise<void> {
  await input.page.route(input.pattern, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillOptions(route)
      return
    }
    await fulfillJson(route, { data: [], page: { nextCursor: null } })
  })
}

/**
 * Spec 148 T7: o painel de carga abre a fila de revisão da viagem. A rota real devolve só
 * `{ data: [...] }`, sem `page` — fila vazia não pede `swap-suggestions`.
 */
async function registerEmptyReviewQueueMock(page: Page): Promise<void> {
  await page.route(/\/trip-document-reviews(?:\?.*)?$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillOptions(route)
      return
    }
    await fulfillJson(route, { data: [] })
  })
}

/**
 * Spec 059: o detalhe da viagem consulta a prontidão ao abrir. Sem este mock a requisição escapa
 * para a API real, que não sobe no smoke — e o `requestfailed` entra em `failures()`.
 */
function fiscalReadiness(mode: DocumentsMode) {
  const authorized = {
    cteAccessKey: '35260700000000000000570010000000011000000017',
    cteFiscalDocumentId: '00000000-0000-4000-8000-000000000607',
    expectedDocument: 'cte',
    nfeDocumentId: NFE_DOCUMENT_ID,
    reason: 'ok',
    rejectionCode: null,
    rejectionMessage: null,
    tripDocumentId: AUTHORIZED_DOCUMENT_ID,
  } as const
  const pending = {
    cteAccessKey: null,
    cteFiscalDocumentId: null,
    expectedDocument: 'cte',
    nfeDocumentId: NFE_DOCUMENT_ID,
    reason: 'no_cte',
    rejectionCode: null,
    rejectionMessage: null,
    tripDocumentId: PENDING_DOCUMENT_ID,
  } as const
  /** Spec 181 T502: o eixo "sem perfil de emissão" do card da nota — reason `no_profile`. */
  const noProfile = {
    cteAccessKey: null,
    cteFiscalDocumentId: null,
    expectedDocument: 'no_profile',
    nfeDocumentId: NFE_DOCUMENT_ID,
    reason: 'no_profile',
    rejectionCode: null,
    rejectionMessage: null,
    tripDocumentId: STOP_CARD_OCCURRENCE_DOCUMENT_ID,
  } as const

  if (mode === 'stop-card-states') {
    return {
      documents: [noProfile],
      manifestableCount: 0,
      nfseCount: 0,
      readyCount: 0,
      state: 'incomplete',
      totalCount: 1,
    } as const
  }

  const documents = mode === 'has-pending' ? [authorized, pending] : [authorized]

  return {
    documents,
    manifestableCount: documents.length,
    nfseCount: 0,
    readyCount: 1,
    state: mode === 'has-pending' ? 'incomplete' : 'ready',
    totalCount: documents.length,
  } as const
}

async function registerTripMocks(
  input: Readonly<{ mode: DocumentsMode; page: Page; state: MockState }>,
): Promise<void> {
  await input.page.route(/\/trips\/[^/]+\/mdfe-requirement$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillOptions(route)
      return
    }
    const body = route.request().postDataJSON() as {
      reason: null | string
      requiresMdfe: boolean | null
    }
    input.state.mdfeRequirements.push(body)
    await fulfillJson(route, {
      data: {
        effectiveRequiresMdfe: body.requiresMdfe ?? true,
        manifestableCount: 1,
        reason: body.reason,
        requiresMdfe: body.requiresMdfe,
      },
    })
  })
  await input.page.route(/\/trips(?:\?.*)?$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillOptions(route)
      return
    }
    await fulfillJson(route, { data: [BASE_TRIP], page: { nextCursor: null } })
  })
  /**
   * O seletor de notas do detalhe da viagem. Ele não é exercitado por nenhum destes smokes, mas a
   * tela o consulta ao abrir — e o smoke afirma **zero falha de rede**, então a consulta solta
   * reprova a tela inteira por uma requisição que o teste nem usa.
   *
   * ⚠️ Ela ficou invisível enquanto o botão "Ver" estava com o rótulo errado: os testes paravam na
   * lista e nunca chegavam ao detalhe. Local ela também passa despercebida, porque a API de
   * desenvolvimento costuma estar no ar e responde de verdade — quem a pegou foi a CI, que não tem
   * API nenhuma atrás do mock.
   */
  await input.page.route(/\/nfe-documents(?:\?.*)?$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillOptions(route)
      return
    }
    await fulfillJson(route, { data: [], page: { nextCursor: null } })
  })
  /** O filtro de contratante do relatório consulta o diretório ao abrir a lista; o smoke reprova qualquer falha de rede. */
  await input.page.route(/\/contractors(?:\?.*)?$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillOptions(route)
      return
    }
    await fulfillJson(route, { data: [], page: { nextCursor: null } })
  })
  /** O painel de filtros do relatório consulta as opções de cidade, UF e emitente ao abrir; o smoke reprova qualquer falha de rede. */
  await input.page.route(/\/trip-document-report\/facets(?:\?.*)?$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillOptions(route)
      return
    }
    await fulfillJson(route, {
      data: {
        cities: { emitter: [], recipient: [] },
        emitters: [],
        states: { emitter: [], recipient: [] },
      },
    })
  })
  /**
   * Spec 079: a linha da estrada. Ela precisa vir mockada **antes** do detalhe, senão o padrão
   * `/trips/{id}` a engoliria — e o smoke afirma zero falha de rede, então uma consulta solta
   * reprova a tela inteira por causa do mapa.
   *
   * `unavailable` de propósito: é o estado que a instalação sem OSRM tem, e é o que exercita o
   * traço tracejado com a legenda de linha reta.
   */
  await input.page.route(/\/trips\/[^/]+\/route-geometry$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillOptions(route)
      return
    }
    await fulfillJson(route, { data: { points: [], source: 'unavailable' } })
  })
  /**
   * Spec 156 D10: o detalhe pergunta à API quais ações a viagem aceita. Mockado **antes** do detalhe,
   * como a estrada, senão o padrão `/trips/{id}` o engoliria; sem ele o pedido escapa para a API
   * real, que não sobe no smoke, e o `requestfailed` reprova seis telas de viagem de uma vez.
   * Listas vazias: o smoke mede layout, e nenhum botão de ação da viagem entra nas asserções.
   *
   * Spec 181 T502: `stop-card-states` é a exceção — a nota "carregada" só prova o caso feliz do
   * card ("Marcar entregue"/"Devolver"/"Ocorrência") se a capacidade vier liberada daqui.
   */
  await input.page.route(/\/trips\/[^/]+\/allowed-actions$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillOptions(route)
      return
    }
    const isStopCard = input.mode === 'stop-card-states'
    const documents = isStopCard
      ? {
          [STOP_CARD_LOADED_DOCUMENT_ID]: ['fieldDelivery', 'fieldOccurrence', 'fieldReturn'],
          [STOP_CARD_LONG_RECIPIENT_DOCUMENT_ID]: ['fieldOccurrence', 'fieldProof'],
        }
      : {}
    /** T502: sem a capacidade da parada o botão "Registrar ocorrência" do cabeçalho nem existe. */
    const stops = isStopCard
      ? {
          [STOP_CARD_DONE_STOP_ID]: ['occurrence'],
          [STOP_CARD_STOP_ID]: ['arrive', 'occurrence'],
        }
      : {}
    /** T7.1: "Iniciar rota" (`canOfferTripFieldAction`) exige a capacidade vinda daqui também. */
    const trip = input.mode === 'dispatched' ? ['startRoute'] : []
    await fulfillJson(route, { data: { documents, stops, trip } })
  })
  /**
   * O catálogo de tipos de ocorrência é consultado pelo detalhe da viagem. Sem este dublê o pedido
   * escapa para a API real, que não sobe no smoke, e o `requestfailed` derruba três testes que nada
   * têm a ver com ocorrência — foi o que aconteceu quando a tela passou a consultá-lo.
   */
  await input.page.route(/\/company-settings\/occurrence-types$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillOptions(route)
      return
    }
    await fulfillJson(route, { data: [] })
  })
  /**
   * Spec 169: a conta da viagem lê as espécies ativas de despesa e de receita assim que abre. Sem
   * este dublê os dois pedidos escapam para a API real e o `requestfailed` derruba oito smokes que
   * nada têm a ver com lançamento — exatamente o que o catálogo de ocorrências já tinha causado.
   */
  await input.page.route(/\/company-settings\/entry-kinds\/active(?:\?.*)?$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillOptions(route)
      return
    }
    await fulfillJson(route, { data: [] })
  })
  // Spec 158: o detalhe da viagem sempre lê a linha do tempo; smoke que precisa de itens registra
  // `mockTripTimelineApi` por cima (o mais recente vence no Playwright).
  await input.page.route(/\/trips\/[^/]+\/timeline(?:\?.*)?$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillOptions(route)
      return
    }
    const documentId = new URL(route.request().url()).searchParams.get('documentId')
    // Spec 233 T5.3: a nota aberta pede os eventos dela (`?documentId=`); só o smoke do acordeão os tem.
    await fulfillJson(route, {
      data: {
        items:
          input.mode === 'note-accordion' && documentId !== null
            ? noteAccordionTimelineItems(documentId)
            : [],
        nextCursor: null,
      },
    })
  })
  await input.page.route(/\/trips\/occurrence-types\/field$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillOptions(route)
      return
    }
    await fulfillJson(route, { data: [] })
  })
  await input.page.route(/\/view-preferences(?:\?.*)?$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillOptions(route)
      return
    }
    await fulfillJson(route, { data: null })
  })
  await input.page.route(/\/trips\/[^/]+\/fiscal-readiness$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillOptions(route)
      return
    }
    await fulfillJson(route, { data: fiscalReadiness(input.mode) })
  })
  /**
   * Spec 185 T7.1: "Carregar" (`transitionTripDocument`, `action: 'load'`) tenta fechar a viagem
   * sozinha — o mock decide o desfecho pelo id da nota, para os prints do aviso "Viagem
   * despachada." e da frase de bloqueio virem do mesmo modo (`dispatch-flow`), sem estado
   * mutável: a nota "dispatched" despacha, qualquer outra recusa com `TRIP_HAS_UNSCHEDULED_STOPS`.
   */
  await input.page.route(/\/trips\/[^/]+\/documents\/[^/]+\/load$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillOptions(route)
      return
    }
    const documentId = new URL(route.request().url()).pathname.split('/').at(-2) ?? ''
    const autoDispatch =
      documentId === DISPATCH_LOAD_DISPATCHED_DOCUMENT_ID
        ? ({ outcome: 'dispatched' } as const)
        : ({
            code: 'TRIP_HAS_UNSCHEDULED_STOPS',
            details: { stopIds: [DISPATCH_UNSCHEDULED_STOP_ID] },
            outcome: 'blocked',
          } as const)
    await fulfillJson(route, {
      data: {
        autoDispatch,
        document: {
          createdAt: '2026-08-11T09:00:00.000Z',
          deliveredAt: null,
          destinationOrigin: null,
          freightCalculationId: null,
          id: documentId,
          loadedAt: '2026-08-11T10:00:00.000Z',
          nfeDocumentId: NFE_DOCUMENT_ID,
          releasedAt: null,
          returnedAt: null,
          returnReason: null,
          separatedAt: '2026-08-11T09:00:00.000Z',
          separationStatus: 'loaded',
          stopId: DISPATCH_FLOW_STOP_ID,
          tripId: TRIP_ID,
          updatedAt: '2026-08-11T10:00:00.000Z',
        },
        tripStatus: 'loading',
      },
    })
  })
  /**
   * Spec 232: a conta da viagem. Nenhum outro modo a dubla — sem `trip.financials` o painel nem
   * pergunta —, e é ela que alimenta a linha da nota e o previsto/fechado lado a lado.
   * `document-cost-open` é a viagem aberta: roteiro sem cálculo e nada congelado (`data: null`).
   */
  await input.page.route(/\/trips\/[^/]+\/valuation$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillOptions(route)
      return
    }
    await fulfillJson(route, {
      data:
        input.mode === 'note-accordion'
          ? noteAccordionValuation()
          : documentCostValuation(input.mode === 'document-cost-open'),
    })
  })
  await input.page.route(/\/trips\/[^/]+\/financial-result$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillOptions(route)
      return
    }
    await fulfillJson(route, {
      data: input.mode === 'document-cost' ? DOCUMENT_COST_FROZEN_RESULT : null,
    })
  })
  await input.page.route(/\/trips\/[^/]+\/(?:costs|revenues)$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillOptions(route)
      return
    }
    await fulfillJson(route, { data: [] })
  })
  await input.page.route(/\/trips\/[^/]+$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillOptions(route)
      return
    }
    await fulfillJson(route, { data: tripDetail(input.mode) })
  })
  if (input.mode === 'note-accordion') await registerNoteAccordionMocks(input.page)
  if (input.mode === 'delivery-deadline') await registerDeliveryDeadlineMocks(input.page)
}

/** Spec 236: nota aberta lê comprovante, ocorrências e produtos; o prazo é o assunto, então todos vêm vazios. */
async function registerDeliveryDeadlineMocks(page: Page): Promise<void> {
  const emptyRoutes = [
    /\/trips\/[^/]+\/delivery-proofs$/,
    /\/trips\/[^/]+\/documents\/[^/]+\/(?:proof|occurrences|products)$/,
  ]
  for (const pattern of emptyRoutes) {
    await page.route(pattern, async (route) => {
      if (route.request().method() === 'OPTIONS') {
        await fulfillOptions(route)
        return
      }
      await fulfillJson(route, { data: [] })
    })
  }
}

function documentIndexFromUrl(url: string): number {
  const documentId = new URL(url).pathname.split('/').at(-2) ?? ''
  return NOTE_ACCORDION_DOCUMENT_IDS.findIndex((id) => id === documentId)
}

/**
 * Spec 233: o lote dos selos, o comprovante e as ocorrências de cada nota. Registrado **depois** das
 * rotas genéricas — no Playwright a mais recente vence. A foto sai da origem da API (a CSP só admite
 * as origens declaradas) e a própria rota do teste a atende com um SVG sintético.
 */
async function registerNoteAccordionMocks(page: Page): Promise<void> {
  const imageOrigin = `${getApiBaseUrl()}/spec-233-prints`
  await page.route(`${imageOrigin}/**`, async (route) => {
    await route.fulfill({
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="#8b8379"/></svg>',
      contentType: 'image/svg+xml',
      status: 200,
    })
  })
  await page.route(/\/trips\/[^/]+\/delivery-proofs$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillOptions(route)
      return
    }
    await fulfillJson(route, {
      data: NOTE_ACCORDION_DOCUMENT_IDS.flatMap((documentId, index) =>
        noteAccordionProofs(imageOrigin, index).map((proof) => ({
          ...proof,
          documentId,
          proofRadiusMeters: NOTE_ACCORDION_PROOF_RADIUS_METERS,
        })),
      ),
    })
  })
  await page.route(/\/trips\/[^/]+\/documents\/[^/]+\/proof$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillOptions(route)
      return
    }
    await fulfillJson(route, {
      data: noteAccordionProofs(imageOrigin, documentIndexFromUrl(route.request().url())),
    })
  })
  await page.route(/\/trips\/[^/]+\/documents\/[^/]+\/occurrences$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillOptions(route)
      return
    }
    await fulfillJson(route, {
      data: NOTE_ACCORDION_OCCURRENCES[documentIndexFromUrl(route.request().url())] ?? [],
    })
  })
  await page.route(/\/trips\/[^/]+\/documents\/[^/]+\/products$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillOptions(route)
      return
    }
    await fulfillJson(route, {
      data: noteAccordionProducts(documentIndexFromUrl(route.request().url())),
    })
  })
}

async function registerMdfeManifestMocks(
  input: Readonly<{ page: Page; state: MockState }>,
): Promise<void> {
  await registerEmptyListMock({ page: input.page, pattern: /\/mdfe-manifests(?:\?.*)?$/ })
  await input.page.route(/\/trips\/[^/]+\/mdfe-manifests$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillOptions(route)
      return
    }
    input.state.manifestCreations += 1
    await fulfillJson(route, { data: {} }, 201)
  })
}

export async function mockTripWorkspaceApi(
  input: Readonly<{ mode: DocumentsMode; page: Page; permissions: MockPermissions }>,
): Promise<
  Readonly<{
    failures: () => readonly string[]
    manifestCreations: () => number
    mdfeRequirements: () => readonly MockState['mdfeRequirements'][number][]
  }>
> {
  const state: MockState = { failures: [], manifestCreations: 0, mdfeRequirements: [] }
  input.page.on('requestfailed', (request) => {
    const errorText = request.failure()?.errorText
    if (isDiscardedByNavigation(errorText)) return
    if (new URL(request.url()).origin === 'http://localhost:53001') {
      state.failures.push(`${request.url()} ${errorText}`)
    }
  })
  await Promise.all([
    registerIdentityMock({ page: input.page, permissions: input.permissions }),
    registerUserPictureMock(input.page),
    registerTripMocks({ mode: input.mode, page: input.page, state }),
    registerMdfeManifestMocks({ page: input.page, state }),
    registerEmptyListMock({ page: input.page, pattern: /\/fleet\/vehicles(?:\?.*)?$/ }),
    registerEmptyListMock({ page: input.page, pattern: /\/fleet\/drivers(?:\?.*)?$/ }),
    registerEmptyReviewQueueMock(input.page),
  ])
  return {
    failures: () => state.failures,
    manifestCreations: () => state.manifestCreations,
    mdfeRequirements: () => state.mdfeRequirements,
  }
}

/**
 * G005 (spec 096 — cobertura de browser): a montagem de viagem ("Nova viagem") é a **única** tela
 * que desenha o bloco de pedágio e o seletor de rotas — `TripAssemblyMap.component.tsx` — e até
 * aqui o dublê nunca alimentava um par de paradas de verdade, então nada disso passava pela CI.
 *
 * O veículo e as duas notas escolhidas ficam **fora** de `mockTripWorkspaceApi`: os smokes de MDF-e
 * e CT-e não precisam de frota nem de nota disponível, e sobrecarregar o mock padrão os obrigaria a
 * lidar com um veículo que nunca usam. Quem precisa do pedágio chama este registro depois.
 */
export const TOLL_VEHICLE_ID = '00000000-0000-4000-8000-000000000701'
export const TOLL_ACCESS_KEY_ONE = '35260700000000000000570010000000011000000011'
export const TOLL_ACCESS_KEY_TWO = '35260700000000000000570010000000011000000022'

/**
 * ⚠️ **Precisão `rooftop` com latitude/longitude é o que dispensa a malha do IBGE.** Sem isto o
 * ponto do mapa dependeria de `GET .../malhas/estados`, que este smoke não sobe — a nota cairia em
 * "sem desenho" e nunca haveria duas paradas para pedir geometria.
 */
function tollScannedDocument(
  input: Readonly<{
    accessKey: string
    cityCode: string
    cityName: string
    id: string
    latitude: string
    longitude: string
    number: string
    postalCode: string
  }>,
) {
  return {
    accessKey: input.accessKey,
    cargoGrossWeight: null,
    cargoWeightSource: null,
    emitterName: 'Emitente Sintetico LTDA',
    freightAmount: null,
    freightRuleName: null,
    id: input.id,
    issuedAt: '2026-08-20T12:00:00.000Z',
    number: input.number,
    recipientAddress: 'Rua Sintetica, 100',
    recipientAddressNumber: '100',
    recipientCity: input.cityName,
    recipientCityCode: input.cityCode,
    recipientLatitude: input.latitude,
    recipientLocationPrecision: 'rooftop',
    recipientLongitude: input.longitude,
    recipientName: `Destinatario ${input.cityName}`,
    recipientPhone: null,
    recipientPostalCode: input.postalCode,
    recipientState: null,
    series: '1',
    status: 'authorized',
    totalAmount: '1000.0000',
  } as const
}

const TOLL_DOCUMENT_ONE = tollScannedDocument({
  accessKey: TOLL_ACCESS_KEY_ONE,
  cityCode: '3543402',
  cityName: 'Ribeirão Preto',
  id: '00000000-0000-4000-8000-000000000711',
  latitude: '-21.1700',
  longitude: '-47.8100',
  number: '11',
  postalCode: '14010000',
})
const TOLL_DOCUMENT_TWO = tollScannedDocument({
  accessKey: TOLL_ACCESS_KEY_TWO,
  cityCode: '3526902',
  cityName: 'Limeira',
  id: '00000000-0000-4000-8000-000000000712',
  latitude: '-22.5600',
  longitude: '-47.4020',
  number: '22',
  postalCode: '13480000',
})

/**
 * Rota única, sem seletor: três praças, uma sem tarifa conhecida, eixo estimado (spec 090 D2/T7).
 * `32,80` por eixo × 2 eixos fecha em `65,60` — os números medidos que o plano da G005 pede.
 */
export const TOLL_SINGLE_ROUTE_GEOMETRY = {
  cheapestIndex: null,
  costGap: null,
  depot: null,
  fastestIndex: null,
  hasChoice: false,
  legs: [{ distanceMetres: 64000, durationSeconds: 3600 }],
  options: [],
  points: [
    { latitude: '-21.1700', longitude: '-47.8100' },
    { latitude: '-21.8000', longitude: '-47.6000' },
    { latitude: '-22.5600', longitude: '-47.4020' },
  ],
  source: 'road',
  toll: {
    axles: { count: 2, source: 'estimated' },
    catalog: { observedOn: '2026-07-01', status: 'current' },
    booths: [
      {
        chargeCar: '10.9000',
        chargePerAxle: '16.4000',
        effectiveChargePerAxle: '16.4000',
        fellBackToManual: false,
        total: '32.8000',
        latitude: '-21.5000',
        longitude: '-47.7000',
        name: 'Praça Alfa',
        operator: 'Operadora Sintetica',
        osmNodeId: 1001,
      },
      {
        chargeCar: '10.9000',
        chargePerAxle: '16.4000',
        effectiveChargePerAxle: '16.4000',
        fellBackToManual: false,
        total: '32.8000',
        latitude: '-21.9000',
        longitude: '-47.6500',
        name: 'Praça Beta',
        operator: 'Operadora Sintetica',
        osmNodeId: 1002,
      },
      {
        chargeCar: null,
        chargePerAxle: null,
        effectiveChargePerAxle: null,
        fellBackToManual: false,
        total: null,
        latitude: '-22.2000',
        longitude: '-47.5000',
        name: 'Praça Gama',
        operator: 'Operadora Sintetica',
        osmNodeId: 1003,
      },
    ],
    boothsFallenBackToManual: 0,
    boothsWithoutCharge: 1,
    chargePerAxle: '32.8000',
    /** `formatTollMultiplier` da API: o caminhão de rodagem dupla paga 2× a tarifa base (Cat 2). */
    multiplierLabel: '2',
    paymentMode: 'manual',
    tariffObservedOn: '2026-07-01',
    total: '65.6000',
  },
} as const

/**
 * Duas rotas — spec 096 T1/T2 — e a alternativa **não** anota pedágio: a linha dela precisa dizer
 * que não foi calculado, nunca "0 praças". A principal cobra com tag, e uma das três praças caiu
 * para a manual por falta de tarifa automática (spec 095 D3) — R$ 31,74 por eixo × 2 eixos = 63,48.
 */
const TOLL_MAIN_OPTION = {
  distanceMeters: 64000,
  durationSeconds: 3600,
  fuelTotal: '120.0000',
  legs: [{ distanceMetres: 64000, durationSeconds: 3600 }],
  points: [
    { latitude: '-21.1700', longitude: '-47.8100' },
    { latitude: '-21.8000', longitude: '-47.6000' },
    { latitude: '-22.5600', longitude: '-47.4020' },
  ],
  toll: {
    axles: { count: 2, source: 'declared' },
    catalog: { observedOn: '2026-07-01', status: 'current' },
    booths: [
      {
        chargeCar: '10.5800',
        chargePerAxle: '10.5800',
        effectiveChargePerAxle: '10.5800',
        fellBackToManual: false,
        total: '21.1600',
        latitude: '-21.5000',
        longitude: '-47.7000',
        name: 'Praça Alfa',
        operator: 'Operadora Sintetica',
        osmNodeId: 1001,
      },
      {
        chargeCar: '10.5800',
        chargePerAxle: '10.5800',
        effectiveChargePerAxle: '10.5800',
        fellBackToManual: false,
        total: '21.1600',
        latitude: '-21.9000',
        longitude: '-47.6500',
        name: 'Praça Beta',
        operator: 'Operadora Sintetica',
        osmNodeId: 1002,
      },
      {
        chargeCar: '10.5800',
        chargePerAxle: '10.5800',
        effectiveChargePerAxle: '10.5800',
        fellBackToManual: true,
        total: '21.1600',
        latitude: '-22.2000',
        longitude: '-47.5000',
        name: 'Praça Gama',
        operator: 'Operadora Sintetica',
        osmNodeId: 1003,
      },
    ],
    boothsFallenBackToManual: 1,
    boothsWithoutCharge: 0,
    chargePerAxle: '31.7400',
    multiplierLabel: '2',
    paymentMode: 'automatic',
    tariffObservedOn: '2026-07-01',
    total: '63.4800',
  },
  totalCost: '183.4800',
} as const

const TOLL_ALTERNATIVE_OPTION = {
  distanceMeters: 82000,
  durationSeconds: 4500,
  fuelTotal: null,
  legs: [{ distanceMetres: 82000, durationSeconds: 4500 }],
  points: [
    { latitude: '-21.1700', longitude: '-47.8100' },
    { latitude: '-22.0000', longitude: '-47.9000' },
    { latitude: '-22.5600', longitude: '-47.4020' },
  ],
  toll: null,
  totalCost: null,
} as const

export const TOLL_ROUTE_CHOICE_GEOMETRY = {
  cheapestIndex: 0,
  costGap: null,
  depot: null,
  fastestIndex: 0,
  hasChoice: true,
  legs: TOLL_MAIN_OPTION.legs,
  options: [TOLL_MAIN_OPTION, TOLL_ALTERNATIVE_OPTION],
  points: TOLL_MAIN_OPTION.points,
  source: 'road',
  toll: TOLL_MAIN_OPTION.toll,
} as const

/**
 * ⚠️ **Registrado por cima do que `mockTripWorkspaceApi` já pôs** — chame depois dele. O Playwright
 * testa o handler mais recente primeiro, então esta rota vence a frota vazia e a busca de notas
 * vazia sem precisar mexer no mock padrão dos outros smokes.
 */
export async function registerTripQuickCreateTollApi(
  input: Readonly<{ page: Page; routeGeometry: unknown }>,
): Promise<void> {
  const documentsByAccessKey = new Map([
    [TOLL_ACCESS_KEY_ONE, TOLL_DOCUMENT_ONE],
    [TOLL_ACCESS_KEY_TWO, TOLL_DOCUMENT_TWO],
  ])

  await input.page.route(/\/fleet\/vehicles(?:\?.*)?$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillOptions(route)
      return
    }
    await fulfillJson(route, {
      data: [{ ...VEHICLE_DETAIL, id: TOLL_VEHICLE_ID, plate: 'PED1A23' }],
      page: { nextCursor: null },
    })
  })

  /**
   * A mesma rota serve dois pedidos: a busca da chave (`accessKey=`) e a listagem paginada que o
   * modal carrega ao abrir. Sem chave, a resposta é lista vazia — o smoke não exercita a busca.
   */
  await input.page.route(/\/nfe-documents(?:\?.*)?$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillOptions(route)
      return
    }
    const accessKey = new URL(route.request().url()).searchParams.get('accessKey')
    const document = accessKey === null ? undefined : documentsByAccessKey.get(accessKey)
    await fulfillJson(route, {
      data: document === undefined ? [] : [document],
      page: { nextCursor: null },
    })
  })

  /**
   * `POST /route-geometry`, de raiz — nunca `/trips/:id/route-geometry`. A montagem monta a viagem
   * antes de ela existir, e por isso não tem id para consultar (`tripClient.readPointsRouteGeometry`).
   */
  await input.page.route(
    (url) => url.pathname === '/route-geometry',
    async (route) => {
      if (route.request().method() === 'OPTIONS') {
        await fulfillOptions(route)
        return
      }
      await fulfillJson(route, { data: input.routeGeometry })
    },
  )
}
