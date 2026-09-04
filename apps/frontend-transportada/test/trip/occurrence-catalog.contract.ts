/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import trip from '../../src/modules/trip/locales/trip.locale.json'
import { TRIP_OCCURRENCE_STAGE } from '../../src/modules/trip/shared/occurrence.constant'

const CONSTANT = new URL('../../src/modules/trip/shared/occurrence.constant.ts', import.meta.url)
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
   * ⚠️ A tela do escritório oferece **só os de galpão, e só os ativos**. Tipo de rua é
   * `trip.report` e mora na árvore do motorista; oferecê-lo aqui daria um botão que sempre responde
   * 403. Tipo aposentado sai da escolha, mas o já registrado com ele continua legível.
   */
  it('a tela oferece só tipo de galpão ativo', () => {
    const panel = readFileSync(PANEL, 'utf8')

    expect(panel).toInclude('type.active && type.stage === TRIP_OCCURRENCE_STAGE.separation')
  })

  /** O item é opcional, e "a nota inteira" é o padrão — recusa total não tem item a apontar. */
  it('a nota inteira é a primeira escolha do item', () => {
    const panel = readFileSync(PANEL, 'utf8')
    const opcoes = panel.slice(panel.indexOf("t('occurrence.product')"))

    expect(opcoes.indexOf('occurrence.wholeDocument')).toBeLessThan(opcoes.indexOf('products.map'))
    expect(trip.occurrence.wholeDocument.toLowerCase()).toInclude('nota inteira')
  })

  /**
   * ⚠️ **O e-mail volta pronto para conferir e enviar, não enviado.** O destinatário é externo, e
   * mandar em nome da transportadora é decisão que ainda não foi tomada. O que isto resolve é o
   * retrabalho de escrever à mão — que é onde o número da nota entra trocado.
   */
  it('mostra o e-mail pronto sem enviá-lo', () => {
    const panel = readFileSync(PANEL, 'utf8')

    expect(panel).toInclude('email.subject')
    expect(panel).toInclude('email.body')
    expect(panel).not.toInclude('sendEmail')
    expect(trip.occurrence.emailReady.toLowerCase()).toInclude('confira antes de mandar')
  })

  /** Tipo sem modelo não mostra caixa vazia: assunto vazio é tipo que não gera e-mail. */
  it('não desenha o bloco quando não há e-mail', () => {
    expect(readFileSync(PANEL, 'utf8')).toInclude('email === null ? null :')
  })
})
