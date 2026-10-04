/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 Fase 4a (ADR-0094 §3, §4 e §7): os valores da prévia de carga. Mora em `shared/` porque o
 * schema do banco (CHECKs) e o domínio leem a mesma lista; o worker tem cópia por valor, cobrada por
 * contrato de paridade.
 */

export const CARGO_PREVIEW_SOURCE = { upload: 'upload' } as const
export type CargoPreviewSource = (typeof CARGO_PREVIEW_SOURCE)[keyof typeof CARGO_PREVIEW_SOURCE]
export const CARGO_PREVIEW_SOURCES = Object.values(CARGO_PREVIEW_SOURCE)

export const CARGO_PREVIEW_STATUS = {
  failed: 'failed',
  processing: 'processing',
  queued: 'queued',
  ready: 'ready',
} as const
export type CargoPreviewStatus = (typeof CARGO_PREVIEW_STATUS)[keyof typeof CARGO_PREVIEW_STATUS]
export const CARGO_PREVIEW_STATUSES = Object.values(CARGO_PREVIEW_STATUS)

/** O veredito por linha (RF5a) mais `invalid`, a linha que o leitor recusou. */
export const CARGO_PREVIEW_ITEM_STATE = {
  ambiguous: 'ambiguous',
  awaitingXml: 'awaiting_xml',
  invalid: 'invalid',
  matched: 'matched',
  suggested: 'suggested',
} as const
export type CargoPreviewItemState =
  (typeof CARGO_PREVIEW_ITEM_STATE)[keyof typeof CARGO_PREVIEW_ITEM_STATE]
export const CARGO_PREVIEW_ITEM_STATES = Object.values(CARGO_PREVIEW_ITEM_STATE)

/** Quem decidiu o item por último: o vínculo automático ou o operador (que a máquina nunca desfaz). */
export const CARGO_PREVIEW_DECIDED_BY = { system: 'system', user: 'user' } as const
export type CargoPreviewDecidedBy =
  (typeof CARGO_PREVIEW_DECIDED_BY)[keyof typeof CARGO_PREVIEW_DECIDED_BY]
export const CARGO_PREVIEW_DECIDERS = Object.values(CARGO_PREVIEW_DECIDED_BY)

export const CARGO_PREVIEW_ROUTE_LOAD_ORIGIN = {
  totals: 'totals',
  user: 'user',
  votes: 'votes',
} as const
export type CargoPreviewRouteLoadOrigin =
  (typeof CARGO_PREVIEW_ROUTE_LOAD_ORIGIN)[keyof typeof CARGO_PREVIEW_ROUTE_LOAD_ORIGIN]
export const CARGO_PREVIEW_ROUTE_LOAD_ORIGINS = Object.values(CARGO_PREVIEW_ROUTE_LOAD_ORIGIN)

export const CARGO_PREVIEW_EVENT_KIND = {
  arrivalProposed: 'arrival_proposed',
  failed: 'failed',
  itemAmbiguous: 'item_ambiguous',
  itemConfirmed: 'item_confirmed',
  itemLinkedManually: 'item_linked_manually',
  itemMatched: 'item_matched',
  itemSuggested: 'item_suggested',
  itemUnlinked: 'item_unlinked',
  parsed: 'parsed',
  uploaded: 'uploaded',
} as const
export type CargoPreviewEventKind =
  (typeof CARGO_PREVIEW_EVENT_KIND)[keyof typeof CARGO_PREVIEW_EVENT_KIND]
export const CARGO_PREVIEW_EVENT_KINDS = Object.values(CARGO_PREVIEW_EVENT_KIND)

/** Os eventos da prévia inteira; os demais pertencem a um item. */
export const CARGO_PREVIEW_WIDE_EVENT_KINDS = [
  CARGO_PREVIEW_EVENT_KIND.uploaded,
  CARGO_PREVIEW_EVENT_KIND.parsed,
  CARGO_PREVIEW_EVENT_KIND.failed,
  CARGO_PREVIEW_EVENT_KIND.arrivalProposed,
] as const

/** O painel age por `backoffice`; o vínculo automático por `worker`, sempre sem ator humano. */
export const CARGO_PREVIEW_CHANNEL = { backoffice: 'backoffice', worker: 'worker' } as const
export type CargoPreviewChannel = (typeof CARGO_PREVIEW_CHANNEL)[keyof typeof CARGO_PREVIEW_CHANNEL]
export const CARGO_PREVIEW_CHANNELS = Object.values(CARGO_PREVIEW_CHANNEL)

/**
 * Os códigos da prévia que falhou: os do leitor (`CARGO_PREVIEW_ERROR_CODES`, ADR-0094 §7) e os três
 * do worker. Um contrato cobra que a lista do leitor esteja inteira aqui.
 */
export const CARGO_PREVIEW_FAILURE_CODES = [
  'PREVIEW_CELL_TOO_LONG',
  'PREVIEW_COLUMN_DUPLICATED',
  'PREVIEW_COLUMN_NOT_FOUND',
  'PREVIEW_FILE_CORRUPTED',
  'PREVIEW_FILE_MISSING',
  'PREVIEW_FILE_TOO_LARGE',
  'PREVIEW_NOT_A_WORKBOOK',
  'PREVIEW_NOT_ENABLED',
  'PREVIEW_PARSE_TIMEOUT',
  'PREVIEW_SHEET_NOT_FOUND',
  'PREVIEW_TOO_MANY_ENTRIES',
  'PREVIEW_TOO_MANY_ROWS',
  'PREVIEW_TOO_MANY_STRINGS',
  'PREVIEW_ZIP_BOMB',
  'PREVIEW_ZIP_ENTRY_UNSAFE',
] as const
export type CargoPreviewFailureCode = (typeof CARGO_PREVIEW_FAILURE_CODES)[number]

export const CARGO_PREVIEW_OUTBOX_EVENT = {
  process: 'cargo-preview.process',
  reevaluate: 'cargo-preview.reevaluate',
} as const
export type CargoPreviewOutboxEvent =
  (typeof CARGO_PREVIEW_OUTBOX_EVENT)[keyof typeof CARGO_PREVIEW_OUTBOX_EVENT]
export const CARGO_PREVIEW_OUTBOX_EVENTS = Object.values(CARGO_PREVIEW_OUTBOX_EVENT)

/**
 * A trava do vínculo de um contratante: o worker (leitura e reavaliação) e as ações do operador a
 * tomam antes de ler as notas livres, para uma nota nunca ir a dois grupos. É advisory, e não a linha
 * do contratante, porque a importação de NF-e regrava `contractors` e não pode esperar o vínculo.
 */
export const CARGO_PREVIEW_MATCH_LOCK_PREFIX = 'cargo-preview-match'

export const CARGO_PREVIEW_LIMITS = {
  fileNameMaxLength: 180,
  itemsPageMax: 100,
  listPageMax: 100,
} as const
