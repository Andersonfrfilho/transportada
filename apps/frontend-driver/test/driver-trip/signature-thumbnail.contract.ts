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
 * Pedido do usuário (25/09): "a assinatura não gravou miniatura" — `attach()` só chamava
 * `photoPreview.showPhoto(file)` para `kind === 'photo'`, nunca para `'signature'`. A assinatura
 * colhida ficava sem miniatura, sem "Assinatura colhida" e sem "Refazer" — o único aviso era o
 * genérico de anexo. Causa: o `if (kind === 'photo')` na função `attach`.
 */
describe('a assinatura colhida mostra miniatura, texto e Refazer (correção)', () => {
  it('attach() chama showPhoto para os dois kinds — não só para "photo"', () => {
    const card = readComponentSource()
    expect(card).not.toContain("if (kind === 'photo') photoPreview.showPhoto(file)")
    expect(card).toContain('previewByKind[kind].showPhoto(file)')
  })

  it('o texto "Assinatura colhida" aparece quando o anexo é a assinatura', () => {
    const card = readComponentSource()
    expect(card).toContain("t('signature.attached')")
  })

  it('o botão de assinatura vira "Refazer"/"Substituir" depois de anexada', () => {
    const card = readComponentSource()
    expect(card).toContain("t('proofCapture.retake')")
    const signatureButton = card.slice(card.indexOf('{canSign ? ('), card.indexOf('{canSign ? (') + 400)
    expect(signatureButton).toContain('attached.signature')
  })
})
