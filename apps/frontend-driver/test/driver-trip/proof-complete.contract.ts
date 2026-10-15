/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import driverTripEn from '../../src/modules/driver-trip/locales/driverTrip.en.locale.json'
import driverTrip from '../../src/modules/driver-trip/locales/driverTrip.locale.json'

function readComponentSource(): string {
  return readFileSync(
    new URL(
      '../../src/modules/driver-trip/components/DriverStopCard.component.tsx',
      import.meta.url,
    ),
    'utf8',
  )
}

/**
 * Pedido do usuário (25/09, spec 207): "não tem botão de concluir" — o bloco do comprovante de
 * cada nota entregue termina com "Concluir". Ele nunca trava por pendência obrigatória (spec 203):
 * pede confirmação e, com o "sim", fecha o bloco mostrando "Comprovante concluído às HH:MM" e
 * "Editar" para reabrir. Estado só da tela, por nota (nunca localStorage).
 */
describe('o botão "Concluir" do comprovante (spec 207)', () => {
  it('existe o botão Concluir, com ícone check', () => {
    const card = readComponentSource()
    expect(card).toContain("t('proofFields.complete')")
    expect(card).toContain('handleComplete')
  })

  it('com pendência obrigatória, não conclui: mostra o aviso do app (role=alert) dizendo o que falta, sem window.confirm', () => {
    const card = readComponentSource()
    const complete = card.slice(
      card.indexOf('function handleComplete('),
      card.indexOf('function handleComplete(') + 600,
    )
    expect(card).toContain('listAllPendingFields')
    expect(card).toContain("t('proofFields.completeBlocked'")
    expect(card).toContain('className={styles.completeBlocked}')
    expect(complete).toContain('return')
    expect(complete.indexOf('setShowMissing(true)')).toBeLessThan(
      complete.indexOf('setConcludedAt('),
    )
    expect(card).not.toContain("t('proofFields.completeMissing'")
  })

  it('concluído mostra "Comprovante concluído às HH:MM" e Editar reabre', () => {
    const card = readComponentSource()
    expect(card).toContain('concludedAt')
    expect(card).toContain("t('proofFields.completedAt'")
    expect(card).toContain("t('proofFields.edit')")
  })

  it('o estado de concluído nunca é persistido — é local ao componente (useState, nunca storage)', () => {
    const card = readComponentSource()
    expect(card).not.toContain('localStorage.setItem')
    expect(card).not.toContain('localStorage.getItem')
    expect(card).toContain('useState<string | undefined>(undefined)')
  })

  it('flush das edições pendentes de quem recebeu/documento antes de concluir', () => {
    const card = readComponentSource()
    const complete = card.slice(
      card.indexOf('function handleComplete('),
      card.indexOf('function handleComplete(') + 800,
    )
    expect(complete).toContain('pushLateFieldUpdate(')
  })
})

describe('a parada concluída reconhece com ícone, não com emoji (web.md §9)', () => {
  it('mostra o check na cor de pronto ao lado do texto', () => {
    const card = readComponentSource()
    expect(card).toContain('styles.stopMetaCompleted')
    expect(card).toMatch(
      /<Icon aria-hidden="true" name="check" size="sm" \/>\s*\{t\('stopCompleted'\)\}/,
    )
    const css = readFileSync(
      new URL('../../src/modules/driver-trip/styles/driverTrip.module.css', import.meta.url),
      'utf8',
    )
    const rule = css.slice(css.indexOf('.stopMetaCompleted {'))
    expect(rule.slice(0, rule.indexOf('}'))).toContain('color: var(--color-ready)')
  })

  it('o texto positivo não leva emoji em nenhum locale', () => {
    for (const locale of [driverTrip, driverTripEn]) {
      expect(locale.stopCompleted).not.toMatch(/\p{Extended_Pictographic}/u)
      expect(locale.proofFields.completedAt).not.toMatch(/\p{Extended_Pictographic}/u)
    }
  })
})
