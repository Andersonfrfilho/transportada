/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 181 RF10/RF11/RF12 (CA09/CA10/CA11). A seleção em massa **já funciona**
 * (`TripDocumentSelectionController`, devolução em lote com a nota que falha permanecendo
 * marcada) — o defeito nunca foi o mecanismo, foi achá-lo: a caixa da nota se perdia no meio do
 * texto corrido, e a barra só aparecia depois da primeira marcação sem nenhuma pista visual antes
 * disso. Este contrato prova a âncora (RF10), a barra dizendo quantas e o que fazer (RF11), e que
 * a marcação por parada continua marcando com estado indeterminado (RF12) — sem reescrever nada do
 * mecanismo em si.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

const ROW = new URL('../../src/modules/trip/components/TripStopList.component.tsx', import.meta.url)
const DETAIL = new URL(
  '../../src/modules/trip/components/TripDetail.component.tsx',
  import.meta.url,
)
const STYLESHEET = new URL('../../src/modules/trip/styles/trip.module.css', import.meta.url)

describe('a caixa de seleção da nota tem lugar fixo e previsível (spec 181 RF10/CA09)', () => {
  const source = readFileSync(ROW, 'utf8')
  const stylesheet = readFileSync(STYLESHEET, 'utf8')

  it('a caixa vem sempre antes do número e dos selos, dentro de uma coluna de largura fixa', () => {
    const cabecalho = source.indexOf('styles.stopDocumentHead')
    const coluna = source.indexOf('styles.stopDocumentCheckboxColumn', cabecalho)
    const numero = source.indexOf('styles.stopDocumentLabel', cabecalho)
    const selos = source.indexOf('styles.stopDocumentBadgeRow', cabecalho)

    expect(coluna).toBeGreaterThan(cabecalho)
    expect(coluna).toBeLessThan(numero)
    expect(numero).toBeLessThan(selos)
  })

  it('a coluna da caixa tem largura fixa — é a âncora que alinha nota a nota', () => {
    const match = /\.stopDocumentCheckboxColumn\s*\{([^}]*)\}/u.exec(stylesheet)
    expect(match?.[1] ?? '').toContain('width: var(--control-height-compact)')
  })
})

describe('a marcação por parada segue marcando com estado indeterminado (spec 181 RF12/CA11)', () => {
  it('a caixa da parada usa allSelected/someSelected calculados sobre as notas dela', () => {
    const source = readFileSync(ROW, 'utf8')

    expect(source).toContain('const allSelected =')
    expect(source).toContain('const someSelected =')
    expect(source).toContain('indeterminate={someSelected && !allSelected}')
    expect(source).toContain('onChange={(checked) => selection.toggleMany(documentIds, checked)}')
  })
})

describe('a barra de seleção diz quantas notas e o que fazer com elas (spec 181 RF11/CA10)', () => {
  const source = readFileSync(DETAIL, 'utf8')

  /**
   * ⚠️ **O recurso já funciona** — devolução em lote, CT-e em lote, NFS-e em lote — esta prova é
   * de achabilidade: a contagem (`selectionBar`) e as ações possíveis (`TripStateActions`) nascem
   * juntas, lado a lado, assim que a primeira nota é marcada.
   */
  it('a contagem e as ações em massa aparecem juntas, assim que há seleção', () => {
    const barra = source.indexOf('styles.selectionBar')
    const acoes = source.indexOf('<TripStateActions', barra)

    expect(barra).toBeGreaterThan(-1)
    expect(acoes).toBeGreaterThan(barra)
    expect(source.slice(barra, acoes)).toContain("t('stops.selectionCount'")
  })
})
