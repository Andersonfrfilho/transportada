/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import { readValueBelowLabel } from '@/modules/document-intake/shared/labelGeometry.service'
import type { PdfTextFragment } from '@/modules/document-intake/shared/pdfTextLayer.service'

function fragment(text: string, x: number, y: number): PdfTextFragment {
  return { height: 8, text, x, y }
}

describe('o casamento de rótulo e valor por geometria', () => {
  /** É o caso que mata a leitura em ordem: `PLACA` é seguido de `EXERCÍCIO`, não do valor da placa. */
  it('lê o valor da coluna do rótulo, não o rótulo seguinte na ordem de leitura', () => {
    const fragments = [
      fragment('PLACA', 60, 700),
      fragment('EXERCÍCIO', 200, 700),
      fragment('GCQ8E47', 62, 686),
      fragment('2026', 202, 686),
    ]

    expect(readValueBelowLabel(fragments, 'PLACA')).toBe('GCQ8E47')
    expect(readValueBelowLabel(fragments, 'EXERCÍCIO')).toBe('2026')
  })

  it('ignora o acento e o caixa do rótulo impresso', () => {
    const fragments = [fragment('CÓDIGO RENAVAM', 60, 700), fragment('00123456789', 61, 690)]

    expect(readValueBelowLabel(fragments, 'CODIGO RENAVAM')).toBe('00123456789')
  })

  it('não casa valor distante demais na vertical', () => {
    const fragments = [fragment('PLACA', 60, 700), fragment('GCQ8E47', 60, 670)]

    expect(readValueBelowLabel(fragments, 'PLACA')).toBeUndefined()
  })

  it('não casa valor de outra coluna', () => {
    const fragments = [fragment('PLACA', 60, 700), fragment('GCQ8E47', 80, 686)]

    expect(readValueBelowLabel(fragments, 'PLACA')).toBeUndefined()
  })

  it('o mais próximo vence quando a coluna tem duas linhas', () => {
    const fragments = [
      fragment('NOME', 60, 700),
      fragment('MARIA DE SOUSA', 61, 690),
      fragment('CPF / CNPJ', 61, 678),
    ]

    expect(readValueBelowLabel(fragments, 'NOME')).toBe('MARIA DE SOUSA')
  })

  it('devolve indefinido quando o rótulo não existe na página', () => {
    expect(readValueBelowLabel([fragment('PLACA', 60, 700)], 'CHASSI')).toBeUndefined()
  })
})
