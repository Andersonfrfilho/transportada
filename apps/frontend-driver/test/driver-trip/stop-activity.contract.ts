/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import {
  isStopArrivalRecorded,
  resolveDocumentActivityStatus,
  stopHasOccurrenceMarker,
} from '@/modules/driver-trip/shared/documentActivity.service'
import type { EventQueueItemView } from '@/modules/driver-trip/shared/eventQueueView.service'
import { isStopOpen, toggleStopOverride } from '@/modules/driver-trip/shared/stopExpansion.service'

const NOW = '2026-09-25T14:32:00.000Z'

/**
 * Pedido do usuário (25/09): "registrei uma ocorrência e nada aconteceu? fico confuso, fica
 * misturado tudo" — cada parada expansível, a atual aberta e destacada, e o retorno de cada ação à
 * vista.
 */
describe('parada expansível: a atual abre sozinha (pedido do usuário 25/09)', () => {
  it('a atual abre sem nenhuma sobrescrita', () => {
    expect(isStopOpen({ currentStopId: 'stop-1', overrides: new Map(), stopId: 'stop-1' })).toBe(
      true,
    )
  })

  it('as demais ficam fechadas por padrão — inclusive uma concluída', () => {
    expect(isStopOpen({ currentStopId: 'stop-1', overrides: new Map(), stopId: 'stop-2' })).toBe(
      false,
    )
    /** Concluída não é a atual (`findCurrentStop` nunca a devolve) — mesmo caminho, fechada. */
    expect(
      isStopOpen({ currentStopId: 'stop-2', overrides: new Map(), stopId: 'stop-0-done' }),
    ).toBe(false)
  })

  it('o toque alterna: fechar a atual, abrir uma fechada', () => {
    const closedCurrent = toggleStopOverride({
      currentStopId: 'stop-1',
      overrides: new Map(),
      stopId: 'stop-1',
    })
    expect(
      isStopOpen({ currentStopId: 'stop-1', overrides: closedCurrent, stopId: 'stop-1' }),
    ).toBe(false)

    const openedOther = toggleStopOverride({
      currentStopId: 'stop-1',
      overrides: closedCurrent,
      stopId: 'stop-2',
    })
    expect(isStopOpen({ currentStopId: 'stop-1', overrides: openedOther, stopId: 'stop-2' })).toBe(
      true,
    )
    /** A sobrescrita da parada 1 continua valendo — o toque na 2 não mexeu nela. */
    expect(isStopOpen({ currentStopId: 'stop-1', overrides: openedOther, stopId: 'stop-1' })).toBe(
      false,
    )
  })

  it('sem sobrescrita, a próxima atual abre sozinha quando a de agora se resolve', () => {
    const overrides = toggleStopOverride({
      currentStopId: 'stop-1',
      overrides: new Map(),
      stopId: 'stop-1',
    })
    /** A parada 1 fechou por escolha do motorista; a 2 vira a atual e nunca foi tocada. */
    expect(isStopOpen({ currentStopId: 'stop-2', overrides, stopId: 'stop-2' })).toBe(true)
  })
})

function queueItem(overrides: Partial<EventQueueItemView> = {}): EventQueueItemView {
  return {
    attachmentCount: 0,
    idempotencyKey: 'key-1',
    kind: 'deliver',
    queuedAt: NOW,
    status: { state: 'queued' },
    ...overrides,
  }
}

describe('retorno visível depois de entregar, devolver ou registrar ocorrência', () => {
  it('sem chave (recarregou no meio), a linha não aparece', () => {
    expect(
      resolveDocumentActivityStatus({
        key: undefined,
        kind: 'deliver',
        queueView: [],
        sentReportKeys: new Set(),
      }),
    ).toBeUndefined()
  })

  it('entrega: na fila enquanto o item está na fila, mesmo depois de falhar', () => {
    expect(
      resolveDocumentActivityStatus({
        key: 'key-1',
        kind: 'deliver',
        queueView: [queueItem({ status: { attempts: 2, state: 'failed' } })],
        sentReportKeys: new Set(),
      }),
    ).toBe('queued')
  })

  it('devolução: enviada só quando a drenagem viu o servidor aceitar esta chave', () => {
    expect(
      resolveDocumentActivityStatus({
        key: 'key-1',
        kind: 'return',
        queueView: [],
        sentReportKeys: new Set(['key-1']),
      }),
    ).toBe('sent')
  })

  it('devolução: fora da fila sem aceite nenhum não vira nada', () => {
    expect(
      resolveDocumentActivityStatus({
        key: 'key-1',
        kind: 'return',
        queueView: [],
        sentReportKeys: new Set(),
      }),
    ).toBeUndefined()
  })

  it('ocorrência da parada ("Deu problema"): recusada pelo servidor fica à vista', () => {
    expect(
      resolveDocumentActivityStatus({
        key: 'key-1',
        kind: 'occurrence',
        queueView: [
          queueItem({ kind: 'occurrence', status: { cause: '422 X', state: 'rejected' } }),
        ],
        sentReportKeys: new Set(),
      }),
    ).toBe('rejected')
  })

  it('cada tipo só acha o item do próprio tipo — chave repetida entre tipos não cola', () => {
    expect(
      resolveDocumentActivityStatus({
        key: 'key-1',
        kind: 'return',
        queueView: [queueItem({ kind: 'deliver' })],
        sentReportKeys: new Set(),
      }),
    ).toBeUndefined()
  })
})

describe('marcador de ocorrência no cabeçalho da parada', () => {
  it('sem nenhuma ocorrência, sem marcador', () => {
    expect(
      stopHasOccurrenceMarker({
        documentIds: ['doc-1', 'doc-2'],
        documentOccurrenceIds: new Set(),
        stopOccurrenceKey: undefined,
      }),
    ).toBe(false)
  })

  it('"Deu problema" na parada acende o marcador, mesmo sem nenhuma nota com ocorrência', () => {
    expect(
      stopHasOccurrenceMarker({
        documentIds: ['doc-1'],
        documentOccurrenceIds: new Set(),
        stopOccurrenceKey: 'stop-key',
      }),
    ).toBe(true)
  })

  it('ocorrência numa nota da parada acende o marcador, mesmo sem "Deu problema"', () => {
    expect(
      stopHasOccurrenceMarker({
        documentIds: ['doc-1', 'doc-2'],
        documentOccurrenceIds: new Set(['doc-2']),
        stopOccurrenceKey: undefined,
      }),
    ).toBe(true)
  })

  it('ocorrência de nota de OUTRA parada não acende o marcador desta', () => {
    expect(
      stopHasOccurrenceMarker({
        documentIds: ['doc-1'],
        documentOccurrenceIds: new Set(['doc-9']),
        stopOccurrenceKey: undefined,
      }),
    ).toBe(false)
  })
})

/**
 * Pedido do usuário (25/09): "Cheguei" libera a entrega. Chegada é `arrivedAt` do snapshot OU um
 * "Cheguei" já na fila offline desta MESMA parada — nunca de outra.
 */
describe('chegada da parada libera as ações das notas (pedido do usuário 25/09)', () => {
  it('sem `arrivedAt` e sem "Cheguei" na fila: chegada não registrada', () => {
    expect(
      isStopArrivalRecorded({ arrivedAt: null, queueView: [], stopId: 'stop-1' }),
    ).toBe(false)
  })

  it('`arrivedAt` do snapshot já confirma, mesmo sem nada na fila', () => {
    expect(
      isStopArrivalRecorded({ arrivedAt: NOW, queueView: [], stopId: 'stop-1' }),
    ).toBe(true)
  })

  it('"Cheguei" na fila desta parada libera na hora, sem esperar o servidor', () => {
    expect(
      isStopArrivalRecorded({
        arrivedAt: null,
        queueView: [queueItem({ kind: 'arrive', stopId: 'stop-1' })],
        stopId: 'stop-1',
      }),
    ).toBe(true)
  })

  it('"Cheguei" de OUTRA parada não libera esta', () => {
    expect(
      isStopArrivalRecorded({
        arrivedAt: null,
        queueView: [queueItem({ kind: 'arrive', stopId: 'stop-9' })],
        stopId: 'stop-1',
      }),
    ).toBe(false)
  })

  it('outro tipo de evento na fila (deliver) não conta como chegada', () => {
    expect(
      isStopArrivalRecorded({
        arrivedAt: null,
        queueView: [queueItem({ kind: 'deliver' })],
        stopId: 'stop-1',
      }),
    ).toBe(false)
  })

  /**
   * Achado do usuário (25/09) no preview: depois de recarregar, a parada ATUAL já com chegada
   * precisa abrir sozinha. `isStopOpen` (o acordeão) e o bloqueio por "Cheguei" (`DocumentRow`)
   * são independentes — nada em `isStopOpen` olha `arrivedAt`, então a chegada nunca deveria
   * fechar a parada atual. Medido ao vivo depois de um recarregamento real: `aria-expanded="true"`.
   */
  it('parada atual com chegada registrada abre sozinha, sem sobrescrita nenhuma', () => {
    expect(isStopArrivalRecorded({ arrivedAt: NOW, queueView: [], stopId: 'stop-1' })).toBe(true)
    expect(
      isStopOpen({ currentStopId: 'stop-1', overrides: new Map(), stopId: 'stop-1' }),
    ).toBe(true)
  })
})
