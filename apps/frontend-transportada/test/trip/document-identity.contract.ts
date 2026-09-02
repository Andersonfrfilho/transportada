/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import { tripDocumentLabel } from '../../src/modules/trip/shared/tripDocument.service'

const ROW = new URL('../../src/modules/trip/components/TripStopList.component.tsx', import.meta.url)
const READINESS = new URL(
  '../../src/modules/trip/components/TripFiscalReadinessPanel.component.tsx',
  import.meta.url,
)

const UUID = '00000000-0000-4000-8000-000000000a17'

const NOTA = {
  freightCalculationId: null,
  id: UUID,
  nfeDocumentId: '00000000-0000-4000-8000-0000000000b1',
  nfeNumber: '883658',
  nfeSeries: '1',
}

/**
 * Spec 079 T017 / CA1. É a mesma família do rótulo da parada, que imprimia rua sem número:
 * identificador interno na tela é sempre defeito, nunca economia. Ninguém no galpão procura uma
 * nota por UUID — a etiqueta na caixa traz número e série.
 */
describe('a nota se identifica pelo número, não pelo UUID (spec 079 T017)', () => {
  it('imprime número e série quando a nota os tem', () => {
    expect(tripDocumentLabel(NOTA)).toBe('883658/1')
  })

  /**
   * ⚠️ A queda continua existindo, e continua sendo UUID — nota vinculada antes de a API servir o
   * número, ou vínculo que é só cálculo de frete. Mas ela é **queda**, não o caminho normal: um
   * rótulo que sempre cai no identificador é o defeito que esta task conserta.
   */
  it('cai no identificador apenas quando não há número', () => {
    expect(tripDocumentLabel({ ...NOTA, nfeNumber: null, nfeSeries: null })).toBe(
      NOTA.nfeDocumentId,
    )
    expect(
      tripDocumentLabel({ ...NOTA, nfeDocumentId: null, nfeNumber: null, nfeSeries: null }),
    ).toBe(UUID)
  })

  /** Série vazia é o caso do emitente que não a usa: o número sozinho ainda identifica a nota. */
  it('não imprime barra solta quando a série é vazia', () => {
    expect(tripDocumentLabel({ ...NOTA, nfeSeries: '' })).toBe('883658')
  })

  /** Valor e data ao lado do número: é assim que o operador confere a nota certa sem abrir outra tela. */
  it('a linha da nota mostra valor e data', () => {
    const source = readFileSync(ROW, 'utf8')

    expect(source).toInclude('document.nfeTotalValue')
    expect(source).toInclude('document.nfeIssuedAt')
  })

  /** A prontidão fiscal nomeia a nota do mesmo jeito — duas grafias seriam duas notas na leitura. */
  it('a prontidão fiscal usa o mesmo rótulo', () => {
    expect(readFileSync(READINESS, 'utf8')).toInclude('tripDocumentLabel')
  })
})
