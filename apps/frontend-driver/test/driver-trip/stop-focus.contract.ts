/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { afterEach, describe, expect, it } from 'bun:test'

import {
  PHOTO_FOCUS_TARGET,
  focusFinishButton,
  NEXT_STEP_FOCUS_DELAY_MS,
  armNextStepFocus,
  consumeNextStepFocus,
  focusFirstRequiredPhoto,
  focusNextProofStep,
  resolveScrollBehavior,
  revealPanel,
  revealStopStart,
} from '@/modules/driver-trip/shared/stopFocus.service'

const root = resolve(import.meta.dir, '../../src/modules/driver-trip')
const globals = globalThis as unknown as Record<string, unknown>
const saved = { document: globals.document, window: globals.window }

afterEach(() => {
  globals.document = saved.document
  globals.window = saved.window
})

class FakeInput {}
globals.HTMLInputElement ??= FakeInput
globals.HTMLTextAreaElement ??= class {}
globals.HTMLSelectElement ??= class {}

function stubWindow(reduced: boolean): void {
  globals.window = { matchMedia: () => ({ matches: reduced }) }
}

type Calls = string[]

function fakeButton(calls: Calls, disabled = false) {
  return {
    addEventListener: () => undefined,
    dataset: {} as Record<string, string>,
    disabled,
    focus: (options: unknown) => calls.push(`focus ${JSON.stringify(options)}`),
    scrollIntoView: (options: unknown) => calls.push(`scroll ${JSON.stringify(options)}`),
  }
}

describe('foco e rolagem ao fim de cada ação (pedido do usuário, 14/10)', () => {
  it('a rolagem só é suave quando o aparelho não pediu para reduzir animações', () => {
    stubWindow(false)
    expect(resolveScrollBehavior()).toBe('smooth')
    stubWindow(true)
    expect(resolveScrollBehavior()).toBe('auto')
  })

  it('a foto entrou: o foco vai ao botão do fim, sem arrastar a tela, e ele fica à vista', () => {
    stubWindow(false)
    globals.document = { activeElement: null }
    const calls: Calls = []
    const button = fakeButton(calls)
    focusFinishButton({ querySelector: () => button } as unknown as HTMLElement)
    expect(calls).toEqual([
      'focus {"focusVisible":true,"preventScroll":true}',
      'scroll {"behavior":"smooth","block":"nearest"}',
    ])
  })

  it('depois do "Cheguei", o foco vai à foto obrigatória, com rolagem curta e sem roubar o cursor', () => {
    stubWindow(false)
    globals.document = { activeElement: null }
    const calls: Calls = []
    let selector = ''
    const card = {
      querySelector: (value: string) => {
        selector = value
        return fakeButton(calls)
      },
    } as unknown as Element
    focusFirstRequiredPhoto(card)
    expect(selector).toBe(`[data-focus-target="${PHOTO_FOCUS_TARGET}"]`)
    expect(calls).toEqual([
      'focus {"focusVisible":true,"preventScroll":true}',
      'scroll {"behavior":"smooth","block":"nearest"}',
    ])

    const typing: Calls = []
    globals.document = { activeElement: new (globals.HTMLInputElement as new () => object)() }
    focusFirstRequiredPhoto({ querySelector: () => fakeButton(typing) } as unknown as Element)
    expect(typing).toEqual([])
    focusFirstRequiredPhoto(null)
  })

  it('depois da foto, o foco espera 1 s e vai ao próximo obrigatório ou, sem ele, ao botão de concluir', () => {
    expect(NEXT_STEP_FOCUS_DELAY_MS).toBe(1000)
    stubWindow(false)
    globals.document = { activeElement: null }
    const required: Calls = []
    const finish: Calls = []
    const actions = (pending: boolean) =>
      ({
        closest: () => ({ querySelector: () => (pending ? fakeButton(required) : null) }),
        querySelector: () => fakeButton(finish),
      }) as unknown as HTMLElement
    focusNextProofStep(actions(true))
    expect(required).toHaveLength(2)
    expect(finish).toEqual([])
    focusNextProofStep(actions(false))
    expect(finish).toHaveLength(2)
    focusNextProofStep(null)
  })

  it('o toque em "Confirmar entrega" arma o foco uma vez só para a tela seguinte', () => {
    expect(consumeNextStepFocus()).toBe(false)
    armNextStepFocus()
    expect(consumeNextStepFocus()).toBe(true)
    expect(consumeNextStepFocus()).toBe(false)
  })

  it('botão ainda bloqueado ou inexistente não recebe foco', () => {
    stubWindow(false)
    globals.document = { activeElement: null }
    const calls: Calls = []
    focusFinishButton({ querySelector: () => fakeButton(calls, true) } as unknown as HTMLElement)
    focusFinishButton({ querySelector: () => null } as unknown as HTMLElement)
    focusFinishButton(null)
    expect(calls).toEqual([])
  })

  it('quem está digitando num campo não perde o cursor', () => {
    stubWindow(false)
    globals.document = { activeElement: new (globals.HTMLInputElement as new () => object)() }
    const calls: Calls = []
    focusFinishButton({ querySelector: () => fakeButton(calls) } as unknown as HTMLElement)
    expect(calls).toEqual([])
  })

  it('concluir ou devolver leva o topo do cartão da parada à vista e o foco ao cabeçalho', () => {
    stubWindow(true)
    const calls: Calls = []
    const header = {
      addEventListener: () => undefined,
      dataset: {} as Record<string, string>,
      focus: (options: unknown) => calls.push(`header ${JSON.stringify(options)}`),
    }
    const card = {
      querySelector: () => header,
      scrollIntoView: (options: unknown) => calls.push(`card ${JSON.stringify(options)}`),
    }
    revealStopStart({ closest: () => card } as unknown as Element)
    revealStopStart({ closest: () => null } as unknown as Element)
    revealStopStart(null)
    expect(calls).toEqual([
      'card {"behavior":"auto","block":"start"}',
      'header {"focusVisible":true,"preventScroll":true}',
    ])
  })

  it('o cartão está ligado: marcas no DOM, foco após a foto, Concluir, Devolver e parada nova atual', () => {
    const card = readFileSync(`${root}/components/DriverStopCard.component.tsx`, 'utf8')
    expect(card).toContain('data-stop-card=""')
    expect(card).toContain('data-stop-header=""')
    // foto aceita → foco no fim do formulário
    expect(card).toMatch(/setFocusFinishNextRender\(true\)/u)
    // Concluir e Devolver NÃO rolam nem focam sozinhos (staging 15/10: "quebrou a tela"); só a última nota
    // confirmada leva o foco, 1 s depois, ao começo da próxima parada (pedido do usuário, 15/10)
    expect(card.match(/revealStopStart\(/gu)).toHaveLength(1)
    expect(card).toMatch(/consumeStopAdvanceFocus\(\)\)\s*return undefined/u)
    // a parada que vira atual (e só depois da montagem) só pisca o destaque
    expect(card).toMatch(
      /!isCurrent \|\| wasCurrentRef\.current[\s\S]{0,200}setJustArrived\(true\)/u,
    )
    // os dois formulários (antes e depois da entrega) expõem a faixa de ações
    expect(card.match(/ref=\{capture\.finishActionsRef\}/gu)?.length).toBe(2)
  })

  it('o aviso do Concluir bloqueado e o formulário "Não entreguei" recebem o foco e ficam à vista', () => {
    stubWindow(false)
    const calls: Calls = []
    revealPanel({
      focus: (options: unknown) => calls.push(`focus ${JSON.stringify(options)}`),
      scrollIntoView: (options: unknown) => calls.push(`scroll ${JSON.stringify(options)}`),
    } as unknown as HTMLElement)
    revealPanel(null)
    expect(calls).toEqual([
      'focus {"preventScroll":true}',
      'scroll {"behavior":"smooth","block":"nearest"}',
    ])
    const card = readFileSync(`${root}/components/DriverStopCard.component.tsx`, 'utf8')
    expect(card).toMatch(/setBlockedAttempts\(/u)
    expect(card).toMatch(/ref=\{blockedRef\} role="alert" tabIndex=\{-1\}/u)
    const form = readFileSync(`${root}/components/DriverNotDeliveredForm.component.tsx`, 'utf8')
    expect(form).toMatch(/revealPanel\(panelRef\.current\)/u)
    expect(form).toMatch(/ref=\{panelRef\} tabIndex=\{-1\}/u)
  })

  it('o foco da parada e do painel de ocorrência não salta sobre a rolagem suave', () => {
    const page = readFileSync(`${root}/pages/DriverTripWorkspace.page.tsx`, 'utf8')
    expect(page).toContain("behavior: resolveScrollBehavior(), block: 'center'")
    expect(page).toContain('element.focus({ preventScroll: true })')
    const form = readFileSync(
      `${root}/components/DriverOccurrenceRegistrationForm.component.tsx`,
      'utf8',
    )
    expect(form).toContain('panelRef.current?.focus({ preventScroll: true })')
  })

  it('o anel de foco aparece com fade curto e some com movimento reduzido', () => {
    const css = readFileSync(resolve(root, '../../styles/index.css'), 'utf8')
    expect(css).toMatch(/outline: 2px solid transparent;/u)
    expect(css).toMatch(/:focus-visible \{\s*outline-color: var\(--color-copper\);/u)
    const motion = css.slice(
      css.indexOf('@media (prefers-reduced-motion: no-preference) {\n  :is('),
    )
    expect(motion).toContain('transition: outline-color 160ms ease;')
    expect(css).toContain('outline-color 160ms ease,')
  })
})
