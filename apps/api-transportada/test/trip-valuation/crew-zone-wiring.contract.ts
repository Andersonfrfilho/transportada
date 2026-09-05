/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

const source = readFileSync(
  new URL('../../src/trips/infrastructure/trip-valuation.query.ts', import.meta.url),
  'utf8',
)

/**
 * Spec 086 T5. Estas afirmações são por **texto de fonte** de propósito: a consulta fala com o
 * Postgres, e o defeito que ela tinha — ficar com a primeira linha que trouxesse valor — compilava,
 * passava em todo teste de caminho feliz e só aparecia em produção, num número plausível.
 */
/**
 * Recorta o corpo de um método até o começo do próximo. Parar no primeiro `\n  }` é o que não
 * funciona: um `for` ou um `if` no meio fecha antes, e o contrato passaria a afirmar sobre meia
 * consulta — verde por recortar cedo demais, que é a pior forma de verde.
 */
function methodBody(name: string): string {
  const from = source.indexOf(name)
  const rest = source.slice(from + name.length)
  const next = rest.indexOf('\n  private ')

  return next === -1 ? rest : rest.slice(0, next)
}

describe('crew zone wiring (spec 086 T5)', () => {
  /**
   * ⚠️ O bloco que decidia. Ele ficava com a primeira linha de cobertura que tivesse preço, então o
   * valor do agregado saía da ordem que o Postgres devolveu — 1.086,12 ou 1.508,51 na mesma viagem.
   */
  test('the query no longer keeps the first row that carries a value', () => {
    expect(source).not.toInclude('current.routeAmount === null && row.routeAmount !== null')
  })

  /** A decisão mora na política pura, que é onde o teste consegue afirmar a ordem das paradas. */
  test('both crew paths ask the policy which zone pays', () => {
    expect(source).toInclude('resolveTripDriverZone')
    expect(source).toInclude('private async resolveCrew')
  })

  /**
   * A prévia e a viagem **não podem** decidir por caminhos diferentes: divergir faria a tela
   * prometer um preço na montagem e a viagem cobrar outro depois de criada.
   */
  test('the preview and the trip share one resolution, never two', () => {
    for (const method of ['private async readCrew(', 'private async readPreviewCrew(']) {
      expect(methodBody(method), `${method} does not delegate`).toInclude('this.resolveCrew(')
    }
  })

  /** Sem `sequence` não há "mais distante": é a ordem da parada que decide, nunca a da linha. */
  test('the trip path carries the stop sequence into the decision', () => {
    expect(source).toInclude('tripStops.sequence')
    expect(source).toInclude('sequenceByDocument')
  })

  /**
   * O endereço é o **físico** (spec 073), não o do destinatário cru: a linha divisória diz que quem
   * decide *lugar* segue o desvio manual, depois `<entrega>`, depois o cadastro — e zona é lugar.
   */
  test('the zone reads the physical destination, not the raw recipient', () => {
    expect(source).toInclude('listStopAddresses')
  })

  /** §15 do code-standart: nada de uma ida ao banco por motorista ou por parada. */
  test('no query per driver and no query per stop', () => {
    const method = methodBody('private async resolveCrew')

    expect(method).not.toInclude('for (const driver')
    expect(method).toInclude('Promise.all')
  })
})

describe('crew zone tenant safety (spec 086 T5)', () => {
  /**
   * O catálogo de zonas e a cobertura do motorista são tabelas novas neste caminho. Um degrau sem
   * tenant é como a tabela de preços de uma transportadora precifica a viagem de outra.
   */
  test('every join added by the zone lookup carries the company', () => {
    const joins = source.split('.innerJoin(').slice(1)

    expect(joins.length).toBeGreaterThan(0)
    for (const join of joins) {
      expect(join.slice(0, join.indexOf('),'))).toInclude('companyId')
    }
  })

  test('each zone query filters by the company in its own where', () => {
    for (const method of [
      'private async readZoneCatalog',
      'private async readDriverCoverage',
      'private async readRatesByRegion',
      'private async readTripStopSequences',
    ]) {
      const body = methodBody(method)

      expect(body.slice(body.indexOf('.where(')), `${method} has no company filter`).toInclude(
        'companyId',
      )
    }
  })
})
