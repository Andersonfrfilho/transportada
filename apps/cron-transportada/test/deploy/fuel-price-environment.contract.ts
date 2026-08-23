/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { parseCronEnvironment } from '../../src/config/environment.schema.js'
import { FUEL_PRICE_PULL_JOB } from '../../src/fuel-price-pull/domain/fuel-price-pull.constant.js'

const REPOSITORY_ROOT = new URL('../../../../', import.meta.url)
const ENV_EXAMPLE_PATH = new URL('.env.example', REPOSITORY_ROOT)
const RAILWAY_DOC_PATH = new URL('docs/spec/railway.md', REPOSITORY_ROOT)
const CRON_SOURCE_ROOT = new URL('apps/cron-transportada/src/', REPOSITORY_ROOT)

const DECLARATION_PATTERN = /^([A-Z][A-Z0-9_]*)=(.*)$/
const ANEEL_HOST = 'dadosabertos.aneel.gov.br'

function stripSurroundingQuotes(value: string): string {
  const first = value.at(0)
  if (first !== "'" && first !== '"') return value
  if (value.length < 2 || !value.endsWith(first)) return value
  return value.slice(1, -1)
}

function readDeclarations(content: string): Record<string, string> {
  const declarations: Record<string, string> = {}

  for (const line of content.split('\n')) {
    const matched = DECLARATION_PATTERN.exec(line)
    if (matched === null) continue
    declarations[matched[1] as string] = stripSurroundingQuotes(matched[2] as string)
  }

  return declarations
}

async function readEnvExample(): Promise<Record<string, string>> {
  return readDeclarations(await Bun.file(ENV_EXAMPLE_PATH).text())
}

describe('contrato do ambiente do cron de combustível', () => {
  /**
   * Litro e kWh são coletados pelo mesmo job, e as quatro variáveis são exigidas no boot dele. Uma
   * delas de fora do `.env.example` é a que ninguém provisiona: `make bootstrap` monta um `.env`
   * que não sobe o job, e no painel a falta só aparece no primeiro ciclo — sábado, uma vez por
   * semana.
   */
  test('o `.env.example` sobe o job de combustível sem nada a acrescentar', async () => {
    const declarations = await readEnvExample()

    expect(
      parseCronEnvironment({ ...declarations, CRON_JOB: FUEL_PRICE_PULL_JOB }).fuelPricePull,
    ).toEqual({
      aneelBaseUrl: declarations.ANEEL_BASE_URL as string,
      aneelTimeoutMilliseconds: Number(declarations.ANEEL_TIMEOUT_MS),
      anpBaseUrl: declarations.ANP_BASE_URL as string,
      anpTimeoutMilliseconds: Number(declarations.ANP_TIMEOUT_MS),
    })
  })

  test('as duas esperas são declaradas, e não ficam por conta do padrão do schema', async () => {
    const declarations = await readEnvExample()

    expect(Number.isInteger(Number(declarations.ANEEL_TIMEOUT_MS))).toBe(true)
    expect(Number.isInteger(Number(declarations.ANP_TIMEOUT_MS))).toBe(true)
  })

  /**
   * O destino externo é declarado onde a app o busca: o cliente do datastore não conhece host
   * nenhum — ele recebe a base pela variável. Host escrito no código sobreviveria à variável
   * apagada no painel e transformaria configuração faltando em coleta silenciosa contra a ANEEL.
   */
  test('o destino da tarifa vem da variável, e o código não guarda host nenhum', async () => {
    expect(new URL((await readEnvExample()).ANEEL_BASE_URL as string).host).toBe(ANEEL_HOST)

    const sources = new Bun.Glob('**/*.ts').scan({ cwd: CRON_SOURCE_ROOT.pathname })
    for await (const source of sources) {
      const content = await Bun.file(new URL(source, CRON_SOURCE_ROOT)).text()
      expect(`${source}: ${content.includes(ANEEL_HOST)}`).toBe(`${source}: false`)
    }
  })

  /**
   * `cron-fuel` sobe nos dois ambientes, e nenhum script do repositório escreve variável no painel
   * da Railway. Variável não documentada é variável provisionada em um ambiente só — e o schema
   * exige as duas agências, então o deploy sem elas nem chega a rodar um ciclo.
   */
  test('o painel dos dois ambientes tem as duas agências documentadas', async () => {
    const document = await Bun.file(RAILWAY_DOC_PATH).text()

    expect(document).toContain('`cron-fuel`')
    for (const key of ['ANEEL_BASE_URL', 'ANEEL_TIMEOUT_MS', 'ANP_BASE_URL', 'ANP_TIMEOUT_MS']) {
      expect(`${key}: ${document.includes(key)}`).toBe(`${key}: true`)
    }
  })
})
