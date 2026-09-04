/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import { TRIP_DOCUMENT_READINESS_REASONS } from '../../src/modules/trip/shared/trip.types'
import { readinessReasonIcon } from '../../src/modules/trip/shared/readinessIcon.service'

const PANEL = new URL(
  '../../src/modules/trip/components/TripFiscalReadinessPanel.component.tsx',
  import.meta.url,
)

/**
 * Spec 079 T018. O ícone acelera a varredura de uma lista de pendências: o olho acha o símbolo
 * antes de ler a frase (`web.md` §9). Aqui ele acompanha o rótulo, nunca o substitui.
 */
describe('estado do CT-e na prontidão fiscal (spec 079 T018)', () => {
  /**
   * ⚠️ Razão nova sem ícone é o defeito que este teste existe para pegar: o catálogo cresce, a
   * lista continua renderizando, e uma linha aparece sem símbolo enquanto as vizinhas o têm.
   * `Record` completo faria o `tsc` cobrar, mas só se ninguém escrever `as`.
   */
  it('toda razão do catálogo tem ícone', () => {
    for (const reason of TRIP_DOCUMENT_READINESS_REASONS) {
      expect(readinessReasonIcon(reason)).toBeString()
    }
  })

  /** Recusa e cancelamento não são a mesma coisa que "ainda não saiu": símbolos diferentes. */
  it('distingue o que falhou do que está a caminho', () => {
    expect(readinessReasonIcon('cte_rejected')).not.toBe(readinessReasonIcon('cte_in_progress'))
    expect(readinessReasonIcon('no_cte')).not.toBe(readinessReasonIcon('cte_rejected'))
  })

  /** O ícone vem do primitivo do design system — `<svg>` cru é proibido fora de `components/ui/`. */
  it('usa o primitivo de ícone, e não desenha svg', () => {
    const source = readFileSync(PANEL, 'utf8')

    expect(source).toInclude('<Icon')
    expect(source).not.toInclude('<svg')
  })

  /**
   * O ícone acompanha o texto e é decorativo — e o `aria-hidden` vive **no primitivo**, não em cada
   * consumidor (`test/design-system/icon.contract.ts` é quem o guarda). Afirmá-lo aqui pediria o
   * atributo no lugar errado, e um painel que o escrevesse à mão estaria duplicando a regra.
   *
   * O que este painel deve garantir é o negativo: nenhum ícone dele carrega rótulo próprio, que
   * faria o leitor de tela anunciar a razão duas vezes.
   */
  it('não dá rótulo próprio ao ícone decorativo', () => {
    const source = readFileSync(PANEL, 'utf8')
    const inicio = source.indexOf('readinessReasonIcon(entry.reason)')
    const trecho = source.slice(source.lastIndexOf('<Icon', inicio), inicio + 60)

    expect(trecho).not.toInclude('aria-label')
    expect(trecho).not.toInclude('title=')
  })
})
