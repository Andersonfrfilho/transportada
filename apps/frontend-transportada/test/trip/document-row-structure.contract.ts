/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 181 RF1/RF4/RF5 (CA04/CA05). `.stopDocumentRow` era um `display: flex; flex-wrap: wrap`
 * sem segundo eixo (`proposta-ux.md` item 1): dinheiro, pessoas e data viravam `span` soltos na
 * mesma esteira do endereço, e o número da nota não tinha âncora tipográfica (`.stopLabel` da
 * parada tem `font-weight: 600`; `.stopDocumentLabel` não tinha nenhum). Este contrato prova que a
 * nota virou cabeçalho + faixa de selos + grade rotulada — variação B aprovada.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import tripLocale from '@/modules/trip/locales/trip.locale.json'

const ROW = new URL('../../src/modules/trip/components/TripStopList.component.tsx', import.meta.url)
const STYLESHEET = new URL('../../src/modules/trip/styles/trip.module.css', import.meta.url)

function ruleBodyOf(stylesheet: string, className: string): string {
  const match = new RegExp(`\\.${className}\\s*\\{([^}]*)\\}`, 'u').exec(stylesheet)
  return match?.[1] ?? ''
}

describe('o número da nota ganha âncora tipográfica (spec 181 RF5/CA05)', () => {
  it('o rótulo da nota pesa como o rótulo do endereço da parada', () => {
    const stylesheet = readFileSync(STYLESHEET, 'utf8')

    expect(ruleBodyOf(stylesheet, 'stopLabel')).toContain('font-weight: 600')
    expect(ruleBodyOf(stylesheet, 'stopDocumentLabel')).toContain('font-weight: 600')
  })
})

describe('a fileira da nota vira cabeçalho, selos e grade — não mais um flex-wrap só (spec 181 RF1)', () => {
  const source = readFileSync(ROW, 'utf8')
  const stylesheet = readFileSync(STYLESHEET, 'utf8')

  it('a linha da nota deixou de ser um flex-wrap sem segundo eixo', () => {
    const rowBody = ruleBodyOf(stylesheet, 'stopDocumentRow')

    expect(rowBody).not.toContain('flex-wrap')
    expect(rowBody).toContain('display: grid')
  })

  /** RF1: cabeçalho (número + selos) separado da grade rotulada de dados. */
  it('cabeçalho e grade rotulada existem como blocos próprios', () => {
    expect(source).toContain('styles.stopDocumentHead')
    expect(source).toContain('styles.stopDocumentBadgeRow')
    expect(source).toContain('styles.stopDocumentGrid')

    /** T202: a grade responde ao espaço disponível, não a um breakpoint fixo. */
    expect(ruleBodyOf(stylesheet, 'stopDocumentGrid')).toContain('repeat(auto-fit, minmax(')
  })

  /** RF10/CA09: a caixa de seleção tem coluna própria, de largura fixa — âncora de varredura. */
  it('a caixa de seleção da nota tem coluna de largura fixa', () => {
    expect(source).toContain('styles.stopDocumentCheckboxColumn')

    const columnBody = ruleBodyOf(stylesheet, 'stopDocumentCheckboxColumn')
    expect(columnBody).toContain('width: var(--control-height-compact)')
  })
})

describe('dinheiro e pessoas em blocos com rótulo próprio (spec 181 RF4/CA04)', () => {
  const source = readFileSync(ROW, 'utf8')

  it('o bloco de dinheiro tem rótulo próprio e reúne mercadoria, frete e data', () => {
    const inicio = source.indexOf('stops.moneyGroupLabel')
    expect(inicio).toBeGreaterThan(-1)

    const bloco = source.slice(inicio, source.indexOf('stops.peopleGroupLabel'))
    expect(bloco).toContain('document.nfeTotalValue')
    expect(bloco).toContain('document.freightAmount')
    expect(bloco).toContain('document.nfeIssuedAt')
  })

  it('o bloco de pessoas tem rótulo próprio e mostra quem recebe', () => {
    const inicio = source.indexOf('stops.peopleGroupLabel')
    expect(inicio).toBeGreaterThan(-1)

    const bloco = source.slice(inicio, inicio + 400)
    expect(bloco).toContain('contact.recipient')
  })

  it('os dois rótulos de bloco existem no dicionário, em pt-BR', () => {
    expect(tripLocale.stops.moneyGroupLabel).toBeString()
    expect(tripLocale.stops.peopleGroupLabel).toBeString()
  })
})
