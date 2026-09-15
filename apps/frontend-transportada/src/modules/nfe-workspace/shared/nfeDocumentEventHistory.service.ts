/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  NfeDocumentEventActor,
  NfeDocumentEventKind,
  NfeDocumentEventOrigin,
  NfeDocumentEventStatus,
} from './nfeDocumentEventClient.service'

/**
 * Spec 149 D14/D19 — códigos de `tpEvento` que o produto reconhece hoje. Código fora desta lista
 * (evento novo do MOC, ou desconhecido) mostra o código cru, nunca some da linha do tempo.
 */
const EVENT_TYPE_LABEL_KEY: Readonly<Record<string, string>> = {
  '110110': 'documents.eventHistory.eventType.correction',
  '110111': 'documents.eventHistory.eventType.cancellation',
  '110112': 'documents.eventHistory.eventType.cancellationSubstitution',
  '210200': 'documents.eventHistory.eventType.manifestConfirmation',
  '210210': 'documents.eventHistory.eventType.manifestAwareness',
  '210220': 'documents.eventHistory.eventType.manifestUnaware',
  '210240': 'documents.eventHistory.eventType.manifestNotDone',
}

export type NfeDocumentEventTypeDescription = Readonly<{
  code?: string
  key: string
}>

/** Entrada sem evento (`kind === 'statusChange'`) é mudança de situação que não veio de um evento. */
export function describeNfeEventType(
  entry: Readonly<{ eventType: string | null; kind: NfeDocumentEventKind }>,
): NfeDocumentEventTypeDescription {
  if (entry.kind === 'statusChange') return { key: 'documents.eventHistory.eventType.statusChange' }
  if (entry.eventType === null) return { key: 'documents.eventHistory.eventType.unknownEvent' }
  const key = EVENT_TYPE_LABEL_KEY[entry.eventType]
  return key === undefined
    ? { code: entry.eventType, key: 'documents.eventHistory.eventType.unknown' }
    : { key }
}

const STATUS_LABEL_KEY: Readonly<Record<NfeDocumentEventStatus, string>> = {
  authorized: 'documentStatus.authorized',
  cancelled: 'documentStatus.cancelled',
  denied: 'documentStatus.denied',
  unsigned: 'documentStatus.unsigned',
}

/** D17 — evento antigo sem snapshot grava `null`: "status anterior não registrado", nunca recalculado. */
export function describeNfeEventStatus(status: NfeDocumentEventStatus | null): string {
  return status === null ? 'documents.eventHistory.statusUnknown' : STATUS_LABEL_KEY[status]
}

export type NfeDocumentEventActorDisplay =
  | Readonly<{ kind: 'named'; name: string }>
  | Readonly<{ kind: 'removed' }>
  | Readonly<{ kind: 'system' }>

export type NfeDocumentEventActorPresentation = Readonly<{
  actor: NfeDocumentEventActorDisplay | null
  requestedBy: NfeDocumentEventActorDisplay | null
}>

/**
 * `null` é "não havia ninguém gravado" — o rótulo depende de quem pergunta (`whenNobody`): para
 * "quem fez" (manual) isso não deveria acontecer, mas cai em "removido" por segurança; para "quem
 * solicitou" (automática) é o caso comum, "Sistema (distribuição agendada)". `{ removed: true }` é
 * sinal explícito da API (D16, H13): havia um id gravado sem membership ativa na empresa — sempre
 * "usuário removido", em qualquer coluna.
 */
function displayFor(
  actor: NfeDocumentEventActor | null,
  whenNobody: 'removed' | 'system',
): NfeDocumentEventActorDisplay {
  if (actor === null) return { kind: whenNobody }
  if ('removed' in actor) return { kind: 'removed' }
  return { kind: 'named', name: actor.name }
}

/**
 * Spec 149 D14/D16 — manual só tem "quem fez"; automática só tem "quem solicitou". A API distingue
 * "não havia ninguém" (`null`) de "havia id sem membership ativa" (`{ removed: true }`), então um
 * evento automático cujo solicitante saiu da empresa mostra "usuário removido", nunca "Sistema".
 */
export function describeNfeEventActors(
  entry: Readonly<{
    actor: NfeDocumentEventActor | null
    origin: NfeDocumentEventOrigin
    requestedBy: NfeDocumentEventActor | null
  }>,
): NfeDocumentEventActorPresentation {
  if (entry.origin === 'manual') {
    return { actor: displayFor(entry.actor, 'removed'), requestedBy: null }
  }
  if (entry.origin === 'automatic') {
    return { actor: null, requestedBy: displayFor(entry.requestedBy, 'system') }
  }
  return { actor: null, requestedBy: null }
}

const ORIGIN_LABEL_KEY: Readonly<Record<NfeDocumentEventOrigin, string>> = {
  automatic: 'documents.eventHistory.origin.automatic',
  manual: 'documents.eventHistory.origin.manual',
  unknown: 'documents.eventHistory.origin.unknown',
}

export function describeNfeEventOrigin(origin: NfeDocumentEventOrigin): string {
  return ORIGIN_LABEL_KEY[origin]
}

const ACTOR_DISPLAY_LABEL_KEY: Readonly<Record<'removed' | 'system', string>> = {
  removed: 'documents.eventHistory.actorRemoved',
  system: 'documents.eventHistory.actorSystem',
}

export function actorDisplayLabelKey(display: NfeDocumentEventActorDisplay): string | null {
  return display.kind === 'named' ? null : ACTOR_DISPLAY_LABEL_KEY[display.kind]
}
