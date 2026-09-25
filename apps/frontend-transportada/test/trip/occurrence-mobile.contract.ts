/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 183 T801 (P11): a ocorrência cabe no celular.
 *
 * - A lista é cartão na base (celular) e vira tabela a partir de `40rem` — a quebra "tablet" da casa.
 *   A spec diz 768 px; o design system só tem 40/64/80rem (`docs/frontend/responsive.md`), e o
 *   contrato responsivo recusa 48rem. Divergência registrada na evidência da T801.
 * - O detalhe, abaixo de `40rem`, vira abas Resumo, Contratante e Motorista; acima, a página inteira.
 * - No celular a conversa rola dentro da própria caixa e a de envio fica logo abaixo (a presa no
 *   rodapé cobria 359 de 800 px), e todo botão das telas da ocorrência tem ao menos
 *   `--touch-target` sob ponteiro grosso (toque).
 */
import { readFile } from 'node:fs/promises'

import { describe, expect, test } from 'bun:test'

import {
  OCCURRENCE_DETAIL_PHONE_TABS,
  occurrenceDetailSectionsFor,
} from '@/modules/trip/shared/tripOccurrenceDetail.service'

const read = (path: string) => readFile(new URL(`../../src/${path}`, import.meta.url), 'utf8')

function block(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`)
  if (start === -1) return ''
  return css.slice(start, css.indexOf('}', start) + 1)
}

describe('a lista no celular (spec 183 T801)', () => {
  test('cartão na base, tabela a partir de 40rem', async () => {
    const css = await read('modules/trip/styles/trip.module.css')
    const tablet = css.slice(css.indexOf('/* Spec 183 T801'))

    expect(block(css, '.occurrenceCards')).toContain('display: grid')
    expect(block(css, '.occurrenceTableFrame')).toContain('display: none')
    expect(tablet).toMatch(
      /@media \(min-width: 40rem\) \{[\s\S]*\.occurrenceCards \{\s*display: none/u,
    )
    expect(tablet).toMatch(/\.occurrenceTableFrame \{\s*display: block/u)
  })

  test('o cartão mostra contratante, valor, endereço e motorista, e é um link para o detalhe', async () => {
    const component = await read('modules/trip/components/TripOccurrenceTable.component.tsx')
    const card = component.slice(component.indexOf('function OccurrenceCard('))

    for (const field of [
      'cells.contractorName',
      'cells.totalValue',
      'cells.destination',
      'item.driverName',
    ]) {
      expect(card).toContain(field)
    }
    expect(card).toMatch(/href=\{buildTripOccurrenceRoute\(item\.id\)\}/u)
  })

  test('o cartão tem ao menos o alvo de toque', async () => {
    const css = await read('modules/trip/styles/trip.module.css')

    expect(block(css, '.occurrenceCard')).toContain('min-height: var(--touch-target)')
  })
})

describe('o detalhe no celular (spec 183 T801)', () => {
  test('três abas: Resumo, Contratante e Motorista', () => {
    expect(OCCURRENCE_DETAIL_PHONE_TABS).toEqual(['summary', 'contractor', 'driver'])
  })

  test('cada aba leva só as seções dela; sem aba (tela larga), a página inteira', () => {
    expect(occurrenceDetailSectionsFor('summary')).toEqual([
      'summary',
      'document',
      'case',
      'timeline',
    ])
    expect(occurrenceDetailSectionsFor('contractor')).toEqual(['contractorConversation'])
    expect(occurrenceDetailSectionsFor('driver')).toEqual(['driverContact', 'driverConversation'])
    expect(occurrenceDetailSectionsFor(null)).toEqual([
      'summary',
      'document',
      'driverContact',
      'case',
      'conversations',
      'timeline',
    ])
  })

  test('no celular quem rola é a conversa, e a caixa de envio fica logo abaixo, sem cobrir', async () => {
    const css = await read(
      'modules/occurrence-conversation/styles/occurrenceConversation.module.css',
    )
    const mobile = css.slice(css.indexOf('/* Spec 183 T801'))

    expect(block(mobile, '.thread')).toContain('max-height: min(32rem, 55dvh)')
    expect(block(mobile, '.composer')).toContain('position: static')
    expect(css).not.toMatch(/\.composer \{[^}]*position: sticky/u)
  })

  test('sob toque, os botões pequenos da conversa e do detalhe crescem até o alvo de toque', async () => {
    for (const path of [
      'modules/occurrence-conversation/styles/occurrenceConversation.module.css',
      'modules/trip/styles/trip.module.css',
    ]) {
      const css = await read(path)
      const coarse = css.slice(css.indexOf('@media (pointer: coarse)'))
      expect({ path, coarse: coarse.includes('min-height: var(--touch-target)') }).toEqual({
        coarse: true,
        path,
      })
    }
  })
})
