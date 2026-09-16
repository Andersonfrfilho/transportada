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
 * Spec 143 T4. Estas afirmações são por **texto de fonte** de propósito: a consulta fala com o
 * Postgres, e o defeito que ela tinha antes da T4 — resolver zona por motorista e devolver
 * `driverAmount: null` para todo mundo — compilava, passava em todo teste de caminho feliz e só
 * apareceria em produção como diária errada para todo motorista.
 */
function methodBody(name: string): string {
  const from = source.indexOf(name)
  const rest = source.slice(from + name.length)
  const next = rest.indexOf('\n  private ')

  return next === -1 ? rest : rest.slice(0, next)
}

describe('crew wiring is one join, not a policy call per driver (spec 143 T4)', () => {
  /** A zona saiu da conta: quem paga é o valor do motorista, o da empresa ou o padrão (T3). */
  test('the query no longer resolves a zone to price the crew', () => {
    expect(source).not.toInclude('resolveTripDriverZone')
    expect(source).not.toInclude('private async resolveCrew')
  })

  /**
   * A prévia e a viagem **não podem** ler o valor do motorista por caminhos diferentes: divergir
   * faria a tela prometer uma diária na montagem e a viagem cobrar outra depois de criada.
   */
  test('both crew paths read the driver own amount from fleet_drivers, raw', () => {
    for (const method of ['private async readCrew(', 'private async readPreviewCrew(']) {
      const body = methodBody(method)

      expect(body, `${method} does not select the raw amount`).toInclude(
        'fleetDrivers.dailyAllowanceAmount',
      )
      expect(body, `${method} still calls the deleted resolver`).not.toInclude('this.resolveCrew(')
    }
  })

  /** §15 do code-standart: nada de uma ida ao banco por motorista. */
  test('no query per driver in either crew path', () => {
    for (const method of ['private async readCrew(', 'private async readPreviewCrew(']) {
      expect(methodBody(method)).not.toInclude('for (const driver')
    }
  })

  /**
   * Spec 143 D2: dois valores gerais na mesma empresa é estado impossível — a consulta só pode ler
   * a configuração da empresa **uma vez por contexto**, nunca uma vez por motorista. Duas leituras
   * no arquivo inteiro (uma por `readContext`, uma por `readPreviewContext`) prova isso; nenhuma
   * delas pode estar dentro do corpo de `readCrew`/`readPreviewCrew`.
   */
  test('the company amount is read once per context, never per crew member', () => {
    const callSites = source.match(/this\.readCompanyDailyAllowanceAmount\(/g) ?? []
    expect(callSites.length).toBe(2)

    for (const method of ['private async readCrew(', 'private async readPreviewCrew(']) {
      expect(methodBody(method)).not.toInclude('readCompanyDailyAllowanceAmount')
    }
  })
})

describe('crew wiring tenant safety (spec 143 T4)', () => {
  test('every join in the crew paths carries the company', () => {
    for (const method of ['private async readCrew(', 'private async readPreviewCrew(']) {
      const joins = methodBody(method).split('.innerJoin(').slice(1)

      for (const join of joins) {
        expect(join.slice(0, join.indexOf('),'))).toInclude('companyId')
      }
    }
  })

  test('each new method filters by the company in its own where', () => {
    for (const method of [
      'private async readCompanyDailyAllowanceAmount',
      'private async readAllowanceDays',
      'private async readCrew(',
      'private async readPreviewCrew(',
    ]) {
      const body = methodBody(method)

      expect(body.slice(body.indexOf('.where(')), `${method} has no company filter`).toInclude(
        'companyId',
      )
    }
  })
})
