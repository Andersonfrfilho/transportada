/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 Fase 4a (ADR-0094 §3, §4 e §7): os valores da prévia de carga. Mora em `shared/` porque o
 * schema do banco (CHECKs) e o domínio leem a mesma lista; o worker tem cópia por valor, cobrada por
 * contrato de paridade.
 */

export const CARGO_PREVIEW_SOURCE = { email: 'email', upload: 'upload' } as const

/**
 * Spec 237 T4.7a: a prévia por e-mail guarda `email:<sha256 do id da mensagem>` em `idempotency_key`. O
 * upload nunca usa o prefixo — uma chave de cliente igual colidiria com a de uma mensagem. O arquivo do worker
 * é cópia por valor deste, cobrada por contrato de paridade.
 */
export const CARGO_PREVIEW_EMAIL_IDEMPOTENCY_PREFIX = 'email:'
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
 * Os códigos da prévia que falhou: os do leitor (`CARGO_PREVIEW_ERROR_CODES`, ADR-0094 §7) e os do
 * worker — sem perfil, arquivo sumido ou trocado, número que não cabe na coluna, a leitura que
 * esgotou a fila ou que foi interrompida no meio, e o vínculo que passou do prazo. Um contrato cobra
 * que a lista do leitor esteja inteira aqui.
 */
export const CARGO_PREVIEW_FAILURE_CODES = [
  'PREVIEW_CELL_TOO_LONG',
  'PREVIEW_COLUMN_DUPLICATED',
  'PREVIEW_COLUMN_NOT_FOUND',
  'PREVIEW_FILE_CORRUPTED',
  'PREVIEW_FILE_MISSING',
  'PREVIEW_FILE_TOO_LARGE',
  'PREVIEW_MATCH_TIMEOUT',
  'PREVIEW_NOT_A_WORKBOOK',
  'PREVIEW_NOT_ENABLED',
  'PREVIEW_PARSE_TIMEOUT',
  'PREVIEW_PROCESSING_ABANDONED',
  'PREVIEW_PROCESSING_INTERRUPTED',
  'PREVIEW_SHEET_NOT_FOUND',
  'PREVIEW_TOO_MANY_CELLS',
  'PREVIEW_TOO_MANY_ENTRIES',
  'PREVIEW_TOO_MANY_ROWS',
  'PREVIEW_TOO_MANY_STRINGS',
  'PREVIEW_VALUE_OUT_OF_RANGE',
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

export const CARGO_PREVIEW_LIMITS = { fileNameMaxLength: 180 } as const

/**
 * Spec 237 T4.6 (ADR-0094 §10): o que o ramo de e-mail encaminhado fez com cada mensagem. A recusa
 * guarda só um código estável — nunca endereço, nome, assunto, corpo ou cabeçalho.
 */
export const CARGO_PREVIEW_EMAIL_OUTCOME = { accepted: 'accepted', rejected: 'rejected' } as const
export type CargoPreviewEmailOutcome =
  (typeof CARGO_PREVIEW_EMAIL_OUTCOME)[keyof typeof CARGO_PREVIEW_EMAIL_OUTCOME]
export const CARGO_PREVIEW_EMAIL_OUTCOMES = Object.values(CARGO_PREVIEW_EMAIL_OUTCOME)

export const CARGO_PREVIEW_EMAIL_REJECTION_CODES = [
  'ATTACHMENT_AMBIGUOUS',
  'ATTACHMENT_MISSING',
  'ATTACHMENT_NOT_A_WORKBOOK',
  'ATTACHMENT_TOO_LARGE',
  'FORWARDER_DKIM_NOT_ALIGNED',
  'FORWARDER_DKIM_UNVERIFIABLE',
  'FORWARDER_FROM_MISMATCH',
  'FORWARDER_NOT_ALLOWED',
  'MIME_UNREADABLE',
  'ORIGINAL_SENDER_AMBIGUOUS',
  'ORIGINAL_SENDER_MISSING',
  'ORIGINAL_SENDER_NOT_ALLOWED',
  'PREVIEW_NOT_ENABLED',
  'RATE_LIMITED',
  'RAW_EMAIL_TOO_LARGE',
  'TOO_MANY_OPEN_PREVIEWS',
] as const
export type CargoPreviewEmailRejectionCode = (typeof CARGO_PREVIEW_EMAIL_REJECTION_CODES)[number]

/** O DKIM do encaminhador, como o trilho da 143 o grava; o do contratante se perde no encaminhamento. */
export const CARGO_PREVIEW_EMAIL_DKIM_RESULTS = [
  'aligned',
  'not_aligned',
  'unverifiable',
  'absent',
] as const
export type CargoPreviewEmailDkimResult = (typeof CARGO_PREVIEW_EMAIL_DKIM_RESULTS)[number]

/** O remetente original é lido do cabeçalho de quem encaminha: informação, nunca autenticação. */
export const CARGO_PREVIEW_ORIGINAL_SENDER_VERIFICATION = { unverified: 'unverified' } as const
export const CARGO_PREVIEW_ORIGINAL_SENDER_VERIFICATIONS = Object.values(
  CARGO_PREVIEW_ORIGINAL_SENDER_VERIFICATION,
)
