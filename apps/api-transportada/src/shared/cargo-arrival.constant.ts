/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 Fase 2 (ADR-0094 §1): os valores do eixo do recebimento. Mora em `shared/` porque o
 * schema do banco (CHECKs) e o domínio leem a mesma lista — sem puxar `cargo-receiving/` para o
 * fechamento de imports do pre-deploy.
 */

/** A nota na chegada: esperada, conferida na doca, separada por rota × cidade. */
export const CARGO_ARRIVAL_DOCUMENT_STATE = {
  expected: 'expected',
  received: 'received',
  separated: 'separated',
} as const
export type CargoArrivalDocumentState =
  (typeof CARGO_ARRIVAL_DOCUMENT_STATE)[keyof typeof CARGO_ARRIVAL_DOCUMENT_STATE]
export const CARGO_ARRIVAL_DOCUMENT_STATES = Object.values(CARGO_ARRIVAL_DOCUMENT_STATE)

export const CARGO_ARRIVAL_STATUS = { open: 'open', closed: 'closed' } as const
export type CargoArrivalStatus = (typeof CARGO_ARRIVAL_STATUS)[keyof typeof CARGO_ARRIVAL_STATUS]
export const CARGO_ARRIVAL_STATUSES = Object.values(CARGO_ARRIVAL_STATUS)

export const CARGO_ARRIVAL_EVENT_KIND = {
  arrivalClosed: 'arrival_closed',
  arrivalRegistered: 'arrival_registered',
  documentAdded: 'document_added',
  documentReceived: 'document_received',
  documentSeparated: 'document_separated',
  routeAssigned: 'route_assigned',
} as const
export type CargoArrivalEventKind =
  (typeof CARGO_ARRIVAL_EVENT_KIND)[keyof typeof CARGO_ARRIVAL_EVENT_KIND]
export const CARGO_ARRIVAL_EVENT_KINDS = Object.values(CARGO_ARRIVAL_EVENT_KIND)

/** Os eventos que são da chegada inteira; os demais pertencem a uma nota dela. */
export const CARGO_ARRIVAL_WIDE_EVENT_KINDS = [
  CARGO_ARRIVAL_EVENT_KIND.arrivalRegistered,
  CARGO_ARRIVAL_EVENT_KIND.arrivalClosed,
] as const

/**
 * ADR-0067/0068 §3: o canal de quem registrou. Hoje só a tela (painel e PWA do separador), que não
 * age em nome de motorista nenhum; canal novo entra no CHECK de forma aditiva.
 */
export const CARGO_ARRIVAL_CHANNEL = { backoffice: 'backoffice' } as const
export type CargoArrivalChannel = (typeof CARGO_ARRIVAL_CHANNEL)[keyof typeof CARGO_ARRIVAL_CHANNEL]
export const CARGO_ARRIVAL_CHANNELS = Object.values(CARGO_ARRIVAL_CHANNEL)

/** Ler a chegada e escrever nela (ADR-0094 §6): o separador tem as duas. */
export const CARGO_ARRIVAL_READ_PERMISSION = 'fleet.read'
export const CARGO_ARRIVAL_WRITE_PERMISSION = 'trip.manage'

export const CARGO_ARRIVAL_LIMITS = {
  documentsPerRequest: 300,
  /** A folga do relógio de quem digita a hora: além disso a chegada está no futuro. */
  futureToleranceMs: 2 * 60_000,
  referenceMaxLength: 120,
  routeNameMaxLength: 40,
} as const
