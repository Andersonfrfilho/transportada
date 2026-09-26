/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

function readSource(path: string): string {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
}

/**
 * Pedido do usuário (25/09): abrir o recorte ou a assinatura rola a tela até o elemento e foca
 * nele — sem isso, quem toca "Anexar"/"Colher assinatura" e não vê nada acontecer (o painel nasce
 * fora da dobra) conclui que o botão não funcionou. `useRevealedPanel` (cópia por valor, reduzida,
 * do painel) já resolve isto: rola e foca no montar.
 */
describe('abrir o recorte ou a assinatura rola e foca (spec 207)', () => {
  it('ProofCrop usa useRevealedPanel e o canvas é focável (tabIndex=-1 + aria-label)', () => {
    const source = readSource('src/modules/driver-trip/components/ProofCrop.component.tsx')
    expect(source).toContain(
      "import { useRevealedPanel } from '@/modules/shared/useRevealedPanel.hook'",
    )
    expect(source).toContain('useRevealedPanel<')
    expect(source).toContain('panelRef')
    expect(source).toContain('tabIndex={-1}')
    expect(source).toContain("aria-label={t('crop.previewLabel')}")
  })

  it('SignaturePad usa useRevealedPanel e o canvas é focável (tabIndex=-1 + aria-label)', () => {
    const source = readSource('src/modules/driver-trip/components/SignaturePad.component.tsx')
    expect(source).toContain(
      "import { useRevealedPanel } from '@/modules/shared/useRevealedPanel.hook'",
    )
    expect(source).toContain('useRevealedPanel<')
    expect(source).toContain('panelRef')
    expect(source).toContain('tabIndex={-1}')
    expect(source).toContain("aria-label={t('signature.canvasLabel')}")
  })

  it('a cópia do hook diverge de propósito: seletor com [tabindex] e scroll ao centro', () => {
    const source = readSource('src/modules/shared/useRevealedPanel.hook.ts')
    expect(source).toContain('[tabindex]')
    expect(source).toContain("block: 'center'")
  })
})
