/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 144 T012 — o que o nó que pergunta e o roteador de respostas leem igual: o `context` da
 * sessão, a chave opaca do emitente resolvida em memória e o critério montado a partir dela.
 */
import type {
  DocumentSelectionCriterion,
  DocumentSelectionRepositoryPort,
  SelectableEmitter,
} from './document-selection.port.js'
import type { PreviewDocumentSelection } from './preview-document-selection.use-case.js'
import { buildEmitterKey, type SelectionState } from '../domain/document-selection.policy.js'
import {
  ISSUANCE_DUE_DAYS_OPTIONS,
  ISSUANCE_FLOW_CONTEXT_KEY as KEY,
  ISSUANCE_TRIP_WINDOW_DAYS,
} from '../domain/whatsapp-issuance-flow.constant.js'

const DAY_MS = 86_400_000

export type IssuanceFlowActionDependencies = Readonly<{
  clock: () => Date
  listIssueDateEmitters: DocumentSelectionRepositoryPort['listIssueDateEmitters']
  listPendingEmitters: DocumentSelectionRepositoryPort['listPendingEmitters']
  listPendingSeries: DocumentSelectionRepositoryPort['listPendingSeries']
  listRecentTrips: DocumentSelectionRepositoryPort['listRecentTrips']
  previewSelection: PreviewDocumentSelection
}>

/** Toda chave do ramo, apagada: recomeçar a seleção nunca herda parâmetro da anterior. */
export function clearSelectionContext(): Record<string, undefined> {
  return Object.fromEntries(Object.values(KEY).map((key) => [key, undefined]))
}

export function readContextString(
  context: Readonly<Record<string, unknown>>,
  key: string,
): string | undefined {
  const value = context[key]
  return typeof value === 'string' ? value : undefined
}

export function readDueDays(context: Readonly<Record<string, unknown>>): number | undefined {
  const value = context[KEY.dueDays]
  return ISSUANCE_DUE_DAYS_OPTIONS.find((days) => days === value)
}

export function tripWindowStart(deps: Pick<IssuanceFlowActionDependencies, 'clock'>): Date {
  return new Date(deps.clock().getTime() - ISSUANCE_TRIP_WINDOW_DAYS * DAY_MS)
}

/** Faixa e remetente escolhem entre quem tem nota pendente; a data, entre quem emitiu no período. */
export async function listEmittersFor(
  deps: IssuanceFlowActionDependencies,
  companyId: string,
  state: SelectionState,
): Promise<readonly SelectableEmitter[]> {
  if (state.criterion !== 'issue_date') return deps.listPendingEmitters({ companyId })
  if (state.startDate === undefined || state.endDate === undefined) return []
  return deps.listIssueDateEmitters({
    companyId,
    endDate: state.endDate,
    startDate: state.startDate,
  })
}

/** A chave do `context` vira documento só aqui, relendo a lista: chave forjada não acha ninguém. */
export async function resolveEmitterTaxId(
  deps: IssuanceFlowActionDependencies,
  companyId: string,
  state: SelectionState,
): Promise<string | undefined> {
  if (state.emitterKey === undefined) return undefined
  const emitters = await listEmittersFor(deps, companyId, state)
  return emitters.find((emitter) => buildEmitterKey(emitter.taxId) === state.emitterKey)?.taxId
}

export function buildSelectionCriterion(
  state: SelectionState,
  emitterTaxId: string | undefined,
): DocumentSelectionCriterion | undefined {
  switch (state.criterion) {
    case 'trip':
      return state.tripId === undefined ? undefined : { kind: 'trip', tripId: state.tripId }
    case 'number_range':
      if (emitterTaxId === undefined || state.series === undefined) return undefined
      if (state.firstNumber === undefined || state.lastNumber === undefined) return undefined
      return {
        emitterTaxId,
        firstNumber: state.firstNumber,
        kind: 'number_range',
        lastNumber: state.lastNumber,
        series: state.series,
      }
    case 'issue_date':
      if (emitterTaxId === undefined) return undefined
      if (state.startDate === undefined || state.endDate === undefined) return undefined
      return {
        emitterTaxId,
        endDate: state.endDate,
        kind: 'issue_date',
        startDate: state.startDate,
      }
    case 'sender':
      return emitterTaxId === undefined ? undefined : { emitterTaxId, kind: 'sender' }
    case undefined:
      return undefined
  }
}
