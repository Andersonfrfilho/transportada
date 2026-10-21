/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import trip from '../../src/modules/trip/locales/trip.locale.json'
import { TRIP_OCCURRENCE_STAGE } from '../../src/modules/trip/shared/occurrence.constant'

const CONSTANT = new URL('../../src/modules/trip/shared/occurrence.constant.ts', import.meta.url)
const PRODUCT_SELECT = new URL(
  '../../src/modules/trip/components/OccurrenceProductSelect.component.tsx',
  import.meta.url,
)
const PANEL = new URL(
  '../../src/modules/trip/components/TripOccurrences.component.tsx',
  import.meta.url,
)

/**
 * Spec 079. ⚠️ **Os tipos deixaram de ser cópia por valor em 2026-09-03**: eles são cadastro da
 * empresa e vêm do servidor. Uma lista fixa aqui voltaria a divergir do que cada transportadora
 * cadastrou — e agora não haveria nem como saber, porque não existe mais lista canônica na API.
 */
describe('os tipos de ocorrência vêm do cadastro (spec 079)', () => {
  const source = readFileSync(CONSTANT, 'utf8')

  it('não há lista de tipos no bundle', () => {
    expect(source).not.toInclude('recusa_total')
    expect(source).not.toInclude('item_faltante')
  })

  /**
   * O **grupo** continua fixo, e isso não é inconsistência: ele decide **quem registra** — galpão é
   * `trip.manage`, rua é `trip.report` —, e isso é regra do produto, não escolha de quem cadastra.
   */
  it('o grupo continua sendo do produto', () => {
    expect(Object.values(TRIP_OCCURRENCE_STAGE).toSorted()).toEqual(['delivery', 'separation'])
  })

  /**
   * Spec 270 (ADR-0107): quem decide o que a tela do galpão oferece é o servidor, **por nota** —
   * `GET /trips/:id/documents/:documentId/occurrence-types` entrega só os tipos ativos do momento
   * `separation` que valem para a contratante da nota. A tela não filtra por etapa nem por escopo: duas
   * regras (uma no servidor, outra aqui) divergiriam no dia em que o escopo mudasse de forma.
   */
  it('a tela não filtra tipo por etapa: oferece o que o servidor entregou para a nota', () => {
    const panel = readFileSync(PANEL, 'utf8')

    expect(panel).not.toInclude('TRIP_OCCURRENCE_STAGE.separation')
    expect(panel).not.toInclude('type.active &&')
    expect(panel).toInclude('areTypesLoading')
  })

  /** O item é opcional, e "a nota inteira" é o padrão — recusa total não tem item a apontar. */
  it('a nota inteira é a primeira escolha do item', () => {
    const panel = readFileSync(PRODUCT_SELECT, 'utf8')
    const opcoes = panel.slice(panel.indexOf("t('occurrence.wholeDocument')"))

    expect(opcoes.indexOf('occurrence.wholeDocument')).toBeLessThan(opcoes.indexOf('products.map'))
    expect(trip.occurrence.wholeDocument.toLowerCase()).toInclude('nota inteira')
  })

  /** Spec 269 T1.3: o painel parou de ler o e-mail que o registro devolvia; o envio é pelo diálogo da conversa. */
  it('não mostra mais o e-mail pronto do registro', () => {
    const panel = readFileSync(PANEL, 'utf8')

    expect(panel).not.toInclude('email.subject')
    expect(panel).not.toInclude('occurrence.emailReady')
  })
})
