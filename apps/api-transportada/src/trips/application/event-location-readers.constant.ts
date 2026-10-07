/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * RF12/D7 da spec 196: coordenada de evento é dado pessoal, então quem pode ler as colunas de
 * posição das cinco tabelas de evento é lista fechada — e a lista é por coluna, não só por arquivo,
 * porque o feed da 195 pode ver o estado e não pode ver o ponto. `event-location-readers.contract.ts`
 * varre `src/` e reprova referência fora daqui.
 */

export const EVENT_LOCATION_POSITION_COLUMNS = [
  'accuracyMeters',
  'capturedAt',
  'latitude',
  'locationState',
  'longitude',
] as const

export type EventLocationPositionColumn = (typeof EVENT_LOCATION_POSITION_COLUMNS)[number]

/** Identificadores do schema, não nomes de tabela: a varredura casa o texto da fonte. */
export const EVENT_LOCATION_TABLE_IDENTIFIERS = [
  'tripDeliveryProofs',
  'tripDocumentOccurrences',
  'tripStatusEvents',
  'tripStopEvents',
  'tripStopOccurrences',
] as const

export type EventLocationTableIdentifier = (typeof EVENT_LOCATION_TABLE_IDENTIFIERS)[number]

type EventLocationReader = {
  /** Caminho a partir de `src/`, com `/` — é a chave da lista. */
  readonly path: string
  readonly columns: readonly EventLocationPositionColumn[]
  readonly reason: string
}

/**
 * `capturedAt` aparece sozinho em vários leitores porque ali ele é **instante**, não ponto: é o
 * "quando o motorista estava de fato na parada", usado em `coalesce` com `recorded_at` para ordenar
 * e para medir pontualidade. Separar as duas leituras é o que permite a lista negar coordenada sem
 * negar tempo.
 */
export const EVENT_LOCATION_READERS: readonly EventLocationReader[] = [
  {
    columns: ['accuracyMeters', 'capturedAt', 'latitude', 'locationState', 'longitude'],
    path: 'trips/infrastructure/trip-timeline-stop.query.ts',
    reason: 'linha do tempo da parada — devolve o ponto do evento ao painel',
  },
  {
    columns: ['accuracyMeters', 'capturedAt', 'latitude', 'locationState', 'longitude'],
    path: 'trips/infrastructure/trip-timeline-status.query.ts',
    reason: 'linha do tempo do status (196 Fase 4)',
  },
  {
    columns: ['accuracyMeters', 'capturedAt', 'latitude', 'locationState', 'longitude'],
    path: 'trips/infrastructure/trip-timeline-document.query.ts',
    reason: 'linha do tempo do documento (196 Fase 4)',
  },
  {
    columns: ['accuracyMeters', 'capturedAt', 'latitude', 'locationState', 'longitude'],
    path: 'trips/infrastructure/trip-timeline-proof.query.ts',
    reason:
      'foto do canhoto como evento da linha do tempo (228) — o ponto da foto, sem texto de pessoa',
  },
  {
    columns: ['accuracyMeters', 'capturedAt', 'latitude', 'locationState', 'longitude'],
    path: 'trips/infrastructure/delivery-proof-read.support.ts',
    reason: 'comprovante de entrega — o ponto do comprovante e o da parada, lado a lado',
  },
  {
    columns: ['capturedAt', 'latitude', 'longitude'],
    path: 'trips/infrastructure/drizzle-delivery-proof.repository.ts',
    reason: 'comprovante de entrega — distância entre o ponto do evento e o da parada',
  },
  {
    columns: ['locationState'],
    path: 'trips/infrastructure/trip-occurrence-feed.query.ts',
    reason: 'feed de ocorrências (195) — vê o estado, nunca a coordenada',
  },
  {
    columns: ['capturedAt'],
    path: 'trips/infrastructure/drizzle-driver-field-report.repository.ts',
    reason: 'instante do relato de campo, em coalesce com recorded_at',
  },
  {
    columns: ['capturedAt'],
    path: 'trips/infrastructure/drizzle-current-driver-trip.repository.ts',
    reason: 'instante da chegada na viagem corrente do motorista',
  },
  {
    columns: ['capturedAt'],
    path: 'fleet/infrastructure/drizzle-driver-score.repository.ts',
    reason: 'instante da chegada para a pontualidade do motorista',
  },
]

/**
 * As respostas que **não** podem carregar posição nenhuma, mesmo tocando as cinco tabelas. O
 * contrato prova por estrutura, não por palavra: projeção explícita, sem `select()` cru e sem spread
 * de linha — as três coisas juntas fazem a resposta não ter como vazar o ponto.
 */
export const EVENT_LOCATION_FORBIDDEN_RESPONSES: readonly { path: string; reason: string }[] = [
  {
    path: 'contractor-portal/infrastructure/contractor-occurrence.query.ts',
    reason: 'portal da contratante — fora do tenant da transportadora',
  },
  {
    path: 'trips/infrastructure/drizzle-occurrence-case.repository.ts',
    reason: 'tratativa da ocorrência',
  },
  {
    path: 'trips/infrastructure/occurrence-case-marker.query.ts',
    reason: 'marcador da tratativa',
  },
  {
    path: 'delivery-clients/infrastructure/drizzle-occurrence-statement.repository.ts',
    reason: 'demonstrativo do cliente',
  },
  {
    path: 'trips/infrastructure/drizzle-occurrence-settlement.repository.ts',
    reason: 'acerto da ocorrência',
  },
  {
    path: 'trips/infrastructure/drizzle-occurrence-settlement-charge.repository.ts',
    reason: 'cobrança do acerto',
  },
  {
    path: 'trips/infrastructure/drizzle-redelivery-proposal.repository.ts',
    reason: 'proposta de reentrega',
  },
  {
    path: 'trips/infrastructure/drizzle-redelivery-application.repository.ts',
    reason: 'aplicação da reentrega',
  },
  {
    path: 'trips/infrastructure/drizzle-office-occurrence-batch.repository.ts',
    reason: 'lote de ocorrência do escritório',
  },
  {
    path: 'trips/infrastructure/drizzle-occurrence-attachment.repository.ts',
    reason: 'anexo da ocorrência',
  },
  {
    path: 'trips/infrastructure/dispatch-readiness.query.ts',
    reason: 'prontidão do despacho',
  },
]
