import { describe, expect, test } from 'bun:test'

import {
  decisionLabel,
  isDecidable,
  stageLabel,
  toOccurrenceView,
} from '../../src/modules/occurrences/shared/occurrenceStatus.service'
import type { Occurrence } from '../../src/modules/shared/portal.types'

function occurrence(overrides: Partial<Occurrence> = {}): Occurrence {
  return {
    attachments: [],
    caseStatus: 'awaiting_contractor',
    conversationRef: null,
    conversationUnreadCount: 0,
    decidedAt: null,
    decisionKind: null,
    occurrenceId: '11111111-1111-1111-1111-111111111111',
    occurrenceTypeName: 'Avaria',
    openedAt: '2026-09-20T09:00:00.000Z',
    stage: 'delivery',
    ...overrides,
  }
}

describe('o vocabulário do portal para a tratativa (spec 164 T25)', () => {
  /** Só `awaiting_contractor` pede decisão — as outras duas fases (RF13) são leitura. */
  test('traduz o estado da tratativa para o selo da tela', () => {
    expect(toOccurrenceView(occurrence()).label).toBe('Aguardando sua decisão')
    expect(toOccurrenceView(occurrence({ caseStatus: 'decided' })).label).toBe('Decisão registrada')
    expect(toOccurrenceView(occurrence({ caseStatus: 'closed' })).label).toBe('Encerrada')
  })

  test('só oferece o formulário de decisão em awaiting_contractor', () => {
    expect(isDecidable(occurrence())).toBe(true)
    expect(isDecidable(occurrence({ caseStatus: 'decided' }))).toBe(false)
    expect(isDecidable(occurrence({ caseStatus: 'closed' }))).toBe(false)
  })

  test('nomeia as três opções de decisão (RF14/RF35)', () => {
    expect(decisionLabel('redelivery_authorized')).toBe('Autorizar reentrega')
    expect(decisionLabel('goods_paid')).toBe('Pagar os produtos')
    expect(decisionLabel('other')).toBe('Outra solução')
  })

  test('traduz a fase da ocorrência e devolve o valor cru se desconhecida', () => {
    expect(stageLabel('separation')).toBe('No galpão')
    expect(stageLabel('delivery')).toBe('Na entrega')
    expect(stageLabel('unknown-stage')).toBe('unknown-stage')
  })
})
