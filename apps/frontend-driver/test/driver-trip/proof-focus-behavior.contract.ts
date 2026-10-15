/* Copyright (c) 2026 Ada Technology. MIT License. */
import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test'

import {
  armNextStepFocus,
  armStopAdvanceFocus,
  consumeAutoConclude,
  consumeNextStepFocus,
  consumeStopAdvanceFocus,
  focusFirstRequiredProof,
  focusNextPhotoAfter,
  focusNextProofStep,
  markFocusTarget,
  revealStopStart,
} from '@/modules/driver-trip/shared/stopFocus.service'

/**
 * Comportamento do foco no fluxo do comprovante (pedido do usuário, 15/10): sem DOM de verdade, com
 * elementos de mentira que registram o que a tela faria — foco, rolagem, anel e a ordem dos alvos.
 */
const globals = globalThis as unknown as Record<string, unknown>
const FOLLOWING = 4
const saved = { document: globals.document, node: globals.Node, window: globals.window }

class FakeInput {}
globals.HTMLInputElement ??= FakeInput
globals.HTMLTextAreaElement ??= class {}
globals.HTMLSelectElement ??= class {}

type Log = string[]

function fakeField(log: Log, name: string, options: { disabled?: boolean } = {}) {
  const listeners: Array<() => void> = []
  return {
    addEventListener: (_type: string, listener: () => void) => listeners.push(listener),
    blur: () => listeners.forEach((listener) => listener()),
    dataset: {} as Record<string, string>,
    disabled: options.disabled === true,
    focus: () => log.push(`focus ${name}`),
    name,
    scrollIntoView: (scroll: { behavior: string; block: string }) =>
      log.push(`scroll ${name} ${scroll.behavior}/${scroll.block}`),
  }
}

/** `position` é a ordem no documento: quem tem número maior vem depois. */
function fakeSection(position: number, card: unknown) {
  return {
    closest: () => card,
    compareDocumentPosition: (other: { position: number }) =>
      other.position > position ? FOLLOWING : 0,
    position,
  }
}

function fakeActions(options: { finish: unknown; pending: unknown }): HTMLElement {
  return {
    closest: () => ({ querySelector: () => options.pending }),
    querySelector: () => options.finish,
  } as unknown as HTMLElement
}

beforeEach(() => {
  globals.window = { matchMedia: () => ({ matches: false }) }
  globals.document = { activeElement: null }
  globals.Node = { DOCUMENT_POSITION_FOLLOWING: FOLLOWING }
})

afterEach(() => {
  globals.document = saved.document
  globals.window = saved.window
  globals.Node = saved.node
})

describe('depois da foto ou da assinatura: o próximo obrigatório, senão o botão de concluir', () => {
  it('o obrigatório pendente da mesma nota vem antes do botão de concluir', () => {
    const log: Log = []
    focusNextProofStep(
      fakeActions({ finish: fakeField(log, 'concluir'), pending: fakeField(log, 'nome') }),
    )
    expect(log).toEqual(['focus nome', 'scroll nome smooth/nearest'])
  })

  it('sem obrigatório pendente, o foco vai ao botão de concluir', () => {
    const log: Log = []
    focusNextProofStep(fakeActions({ finish: fakeField(log, 'concluir'), pending: null }))
    expect(log).toEqual(['focus concluir', 'scroll concluir smooth/nearest'])
  })

  it('o botão de concluir ainda bloqueado não recebe o foco', () => {
    const log: Log = []
    focusNextProofStep(
      fakeActions({ finish: fakeField(log, 'concluir', { disabled: true }), pending: null }),
    )
    expect(log).toEqual([])
  })

  it('quem está digitando num campo não perde o cursor', () => {
    const log: Log = []
    globals.document = { activeElement: new (globals.HTMLInputElement as new () => object)() }
    focusNextProofStep(
      fakeActions({ finish: fakeField(log, 'concluir'), pending: fakeField(log, 'nome') }),
    )
    expect(log).toEqual([])
  })

  it('o aparelho que pediu menos movimento recebe a rolagem sem animação', () => {
    globals.window = { matchMedia: () => ({ matches: true }) }
    const log: Log = []
    focusNextProofStep(fakeActions({ finish: fakeField(log, 'concluir'), pending: null }))
    expect(log).toEqual(['focus concluir', 'scroll concluir auto/nearest'])
  })
})

describe('anel de foco: aparece depois de um toque e some quando o foco sai', () => {
  it('o foco levado por código marca o campo e a marca sai no blur', () => {
    const finish = fakeField([], 'concluir')
    focusNextProofStep(fakeActions({ finish, pending: null }))
    expect(finish.dataset.guidedFocus).toBe('')
    finish.blur()
    expect(finish.dataset.guidedFocus).toBeUndefined()
  })
})

describe('depois do "Concluir" ou da última nota: o foco segue para a frente', () => {
  it('vai ao primeiro obrigatório que vem DEPOIS da nota concluída, nunca a um anterior', () => {
    const log: Log = []
    const before = Object.assign(fakeField(log, 'nota 1'), { position: 1 })
    const after = Object.assign(fakeField(log, 'nota 3'), { position: 9 })
    const later = Object.assign(fakeField(log, 'nota 4'), { position: 12 })
    const card = { querySelectorAll: () => [before, after, later] }
    focusNextPhotoAfter(fakeSection(5, card) as unknown as Element)
    expect(log).toEqual(['focus nota 3', 'scroll nota 3 smooth/nearest'])
  })

  it('sem nota seguinte com obrigatório, nada recebe o foco', () => {
    const log: Log = []
    const before = Object.assign(fakeField(log, 'nota 1'), { position: 1 })
    const card = { querySelectorAll: () => [before] }
    focusNextPhotoAfter(fakeSection(5, card) as unknown as Element)
    focusNextPhotoAfter(null)
    focusNextPhotoAfter(fakeSection(5, null) as unknown as Element)
    expect(log).toEqual([])
  })

  it('o começo da próxima parada recebe o foco com o anel e a rolagem até ela', () => {
    const log: Log = []
    const header = fakeField(log, 'cabeçalho')
    const card = {
      querySelector: () => header,
      scrollIntoView: (scroll: { behavior: string; block: string }) =>
        log.push(`scroll cartão ${scroll.behavior}/${scroll.block}`),
    }
    revealStopStart({ closest: () => card } as unknown as Element)
    expect(log).toEqual(['scroll cartão smooth/start', 'focus cabeçalho'])
    expect(header.dataset.guidedFocus).toBe('')
  })
})

describe('depois do "Cheguei": o primeiro comprovante obrigatório da parada', () => {
  it('foca o primeiro alvo, seja foto, assinatura, nome ou documento', () => {
    const log: Log = []
    focusFirstRequiredProof({
      querySelector: () => fakeField(log, 'primeiro'),
    } as unknown as Element)
    expect(log).toEqual(['focus primeiro', 'scroll primeiro smooth/nearest'])
  })

  it('parada sem obrigatório não recebe foco', () => {
    const log: Log = []
    focusFirstRequiredProof({ querySelector: () => null } as unknown as Element)
    focusFirstRequiredProof(null)
    expect(log).toEqual([])
  })
})

describe('campo obrigatório vazio é alvo; preenchido, deixa de ser', () => {
  it('liga e desliga a marca conforme o campo', () => {
    const field = fakeField([], 'nome') as unknown as HTMLElement
    markFocusTarget(field, 'proof-receiver-name')
    expect(field.dataset.focusTarget).toBe('proof-receiver-name')
    markFocusTarget(field, undefined)
    expect(field.dataset.focusTarget).toBeUndefined()
    markFocusTarget(undefined, 'x')
    markFocusTarget(null, 'x')
  })
})

describe('os avisos do toque em "Confirmar entrega" valem uma vez e por pouco tempo', () => {
  function drain(): void {
    consumeNextStepFocus()
    consumeStopAdvanceFocus()
    consumeAutoConclude()
  }

  it('cada aviso é consumido uma única vez', () => {
    drain()
    armNextStepFocus()
    expect(consumeNextStepFocus()).toBe(true)
    expect(consumeNextStepFocus()).toBe(false)
    expect(consumeStopAdvanceFocus()).toBe(true)
    expect(consumeStopAdvanceFocus()).toBe(false)
    expect(consumeAutoConclude()).toBe(true)
    expect(consumeAutoConclude()).toBe(false)
  })

  it('o aviso de 15 s atrás já não vale (o toque ficou para trás)', () => {
    drain()
    const now = spyOn(Date, 'now')
    now.mockReturnValue(1_000)
    armNextStepFocus()
    armStopAdvanceFocus()
    now.mockReturnValue(16_000)
    expect(consumeNextStepFocus()).toBe(false)
    expect(consumeStopAdvanceFocus()).toBe(false)
    expect(consumeAutoConclude()).toBe(false)
    now.mockRestore()
  })

  it('o "Concluir" arma só o avanço de parada, não a conclusão automática', () => {
    drain()
    armStopAdvanceFocus()
    expect(consumeAutoConclude()).toBe(false)
    expect(consumeStopAdvanceFocus()).toBe(true)
  })
})
