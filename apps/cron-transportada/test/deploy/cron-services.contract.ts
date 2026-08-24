/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { JOB_TICK_INTERVAL_SECONDS } from '../../src/shared/job-catalog.constant.js'

const REPOSITORY_ROOT = new URL('../../../../', import.meta.url)
const DEPLOY_WORKFLOW_PATH = new URL('.github/workflows/deploy.yml', REPOSITORY_ROOT)
const RAILWAY_DOC_PATH = new URL('docs/spec/railway.md', REPOSITORY_ROOT)

const CRON_DOCKERFILE = 'apps/cron-transportada/Dockerfile'
const CRON_CONFIG_PATH = 'deploy/cron/railway.json'
const SECONDS_PER_MINUTE = 60

/** Os quatro serviços separados por `CRON_JOB`; nenhum deles pode voltar sem que este contrato caia. */
const RETIRED_SERVICES = ['cron-nfse', 'cron-notifications', 'cron-fuel'] as const

type RailwayConfig = {
  readonly build?: { readonly dockerfilePath?: string }
  readonly deploy?: { readonly cronSchedule?: string; readonly restartPolicyType?: string }
}

async function readCronConfig(): Promise<RailwayConfig> {
  return Bun.file(new URL(CRON_CONFIG_PATH, REPOSITORY_ROOT)).json()
}

/** Tique de minutos, a única forma que o repositório usa; qualquer outra é recusada aqui. */
function tickMinutesOf(schedule: string): number {
  const matched = /^\*\/(\d+) \* \* \* \*$/.exec(schedule)
  if (matched === null) {
    throw new Error(`cronSchedule "${schedule}" não é um tique de minutos`)
  }
  return Number(matched[1])
}

describe('contrato do serviço de cron', () => {
  test('o serviço parte do Dockerfile do cron e não reinicia sozinho', async () => {
    const railway = await readCronConfig()

    expect(railway.build?.dockerfilePath).toBe(CRON_DOCKERFILE)
    expect(railway.deploy?.restartPolicyType).toBe('NEVER')
  })

  /**
   * O `cronSchedule` é o **piso** de granularidade de toda rotina, e o catálogo o declara em
   * segundos: nada em `job_schedules` pode correr mais fino que a batida, porque nada é olhado mais
   * de perto que ela. Tique mais largo que o piso transforma o menor intervalo do painel em promessa
   * vazia — a rotina fica vencida e ninguém passa para pegá-la.
   */
  test('o tique da batida é o piso de intervalo do catálogo', async () => {
    const railway = await readCronConfig()

    expect(tickMinutesOf(railway.deploy?.cronSchedule ?? '')).toBe(
      JOB_TICK_INTERVAL_SECONDS / SECONDS_PER_MINUTE,
    )
  })

  /**
   * A cadência de cada rotina mora em `job_schedules`, editável pelo painel do produto. Um serviço
   * por rotina devolveria a decisão ao painel do provedor de hospedagem, onde o operador do cliente
   * não entra — e onde trocar o tique de uma publicava as quatro, mesmo Dockerfile e mesma imagem.
   */
  test('os quatro serviços separados por job não voltam', async () => {
    const workflow = await Bun.file(DEPLOY_WORKFLOW_PATH).text()
    const matrix = (/^\s+service: \[([a-z, -]+)\]$/m.exec(workflow)?.[1] ?? '')
      .split(',')
      .map((service) => service.trim())

    expect(matrix).toEqual(['worker', 'cron'])
    for (const service of RETIRED_SERVICES) {
      expect(`${service}: ${matrix.includes(service)}`).toBe(`${service}: false`)
      expect(`${service}: ${await pathExists(`deploy/${service}/railway.json`)}`).toBe(
        `${service}: false`,
      )
    }
  })

  test('o serviço e a configuração dele estão documentados', async () => {
    const document = await Bun.file(RAILWAY_DOC_PATH).text()

    expect(document).toContain('`cron`')
    expect(document).toContain(`\`${CRON_CONFIG_PATH}\``)
  })

  /**
   * O cron lê tabelas que a migration da API cria, e só a API roda migration. Deployar o cron antes
   * dela é subir um processo que vai ao banco procurar coluna que ainda não existe. Quem segura é o
   * `needs` do job da matriz — ordem de texto no arquivo não diz nada, os serviços da matriz rodam
   * ao mesmo tempo, em runners diferentes.
   */
  test('o cron sobe depois da API', async () => {
    const workflow = await Bun.file(DEPLOY_WORKFLOW_PATH).text()
    const needs = /^ {2}deploy-services:$\s+needs: \[([^\]]+)\]/m.exec(workflow)?.[1] ?? ''

    expect(needs).toContain('deploy-api')
    expect(workflow).toContain('railway-deploy.sh deploy api')
  })
})

async function pathExists(path: string): Promise<boolean> {
  return Bun.file(new URL(path, REPOSITORY_ROOT)).exists()
}
