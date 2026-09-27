/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

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

  it('confirma antes de concluir com pendência obrigatória — nunca trava, e a foto não é descartada', () => {
    const card = readComponentSource()
    expect(card).toContain('listAllPendingFields')
    expect(card).toContain("t('proofFields.completeMissing'")
    expect(card).toContain('window.confirm(')
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
