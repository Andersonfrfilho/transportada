/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { DISTRIBUTION_PULL_JOB } from '../../src/nfe-distribution-pull/domain/distribution-pull.constant.js'
import {
  NFSE_PENDING_RECHECK_MINUTES,
  NFSE_STATUS_PULL_JOB,
} from '../../src/nfse-status-pull/domain/nfse-status-pull.constant.js'

const REPOSITORY_ROOT = new URL('../../../../', import.meta.url)
const DEPLOY_WORKFLOW_PATH = new URL('.github/workflows/deploy.yml', REPOSITORY_ROOT)
const RAILWAY_DOC_PATH = new URL('docs/spec/railway.md', REPOSITORY_ROOT)

const CRON_DOCKERFILE = 'apps/cron-transportada/Dockerfile'
const NFSE_CONFIG_PATH = 'deploy/cron-nfse/railway.json'

/** Os dois serviços de cron; o que os separa é a variável `CRON_JOB`, não o build. */
const CRON_SERVICES = [
  { config: 'deploy/cron/railway.json', job: DISTRIBUTION_PULL_JOB, service: 'cron' },
  { config: NFSE_CONFIG_PATH, job: NFSE_STATUS_PULL_JOB, service: 'cron-nfse' },
] as const

type RailwayConfig = {
  readonly build?: { readonly dockerfilePath?: string }
  readonly deploy?: { readonly cronSchedule?: string; readonly restartPolicyType?: string }
}

async function readConfig(path: string): Promise<RailwayConfig> {
  return Bun.file(new URL(path, REPOSITORY_ROOT)).json()
}

/** Tique de minutos, a única forma que o repositório usa; qualquer outra é recusada aqui. */
function tickMinutesOf(schedule: string): number {
  const matched = /^\*\/(\d+) \* \* \* \*$/.exec(schedule)
  if (matched === null) {
    throw new Error(`cronSchedule "${schedule}" não é um tique de minutos`)
  }
  return Number(matched[1])
}

describe('contrato dos serviços de cron', () => {
  /**
   * Um Dockerfile, um binário, dois serviços: quem decide o job é `CRON_JOB`, definida no painel.
   * Serviço de cron sem o job documentado é serviço que ninguém sabe configurar — e configurar
   * errado não falha em lugar nenhum, apenas roda o outro job de novo.
   */
  test('cada serviço de cron declara o job que roda', async () => {
    const document = await Bun.file(RAILWAY_DOC_PATH).text()

    for (const { config, job, service } of CRON_SERVICES) {
      expect(document).toContain(`\`${service}\``)
      expect(document).toContain(`\`${config}\``)
      expect(document).toContain(`\`${job}\``)
    }
  })

  test('os dois serviços de cron partem do mesmo Dockerfile e não reiniciam sozinhos', async () => {
    for (const { config } of CRON_SERVICES) {
      const railway = await readConfig(config)

      expect(railway.build?.dockerfilePath).toBe(CRON_DOCKERFILE)
      expect(railway.deploy?.restartPolicyType).toBe('NEVER')
      expect(railway.deploy?.cronSchedule).toBeString()
    }
  })

  /**
   * A reconciliação só reconsulta uma nota a cada `NFSE_PENDING_RECHECK_MINUTES`. Tique mais largo
   * que essa janela transforma o intervalo em promessa vazia: a nota fica elegível e ninguém passa
   * para pegá-la, e a autorização da prefeitura espera o tique inteiro para virar XML arquivado.
   */
  test('o tique da reconciliação de NFS-e não é mais largo que a janela de reconsulta', async () => {
    const railway = await readConfig(NFSE_CONFIG_PATH)

    expect(tickMinutesOf(railway.deploy?.cronSchedule ?? '')).toBeLessThanOrEqual(
      NFSE_PENDING_RECHECK_MINUTES,
    )
  })

  /**
   * O cron lê tabelas que a migration da API cria, e só a API roda migration. Deployar o cron antes
   * dela é subir um processo que vai ao banco procurar coluna que ainda não existe.
   *
   * Isso já foi ordem de passo dentro de um job só. Desde que o deploy virou três frentes, quem
   * segura é o `needs` do job da matriz — e é ele que este contrato lê. Ordem de texto no arquivo
   * não diz mais nada: os cinco serviços da matriz rodam ao mesmo tempo, em runners diferentes.
   */
  test('os dois crons sobem depois da API', async () => {
    const workflow = await Bun.file(DEPLOY_WORKFLOW_PATH).text()
    const matrix = (/^\s+service: \[([a-z, -]+)\]$/m.exec(workflow)?.[1] ?? '')
      .split(',')
      .map((service) => service.trim())
    const needs = /^  deploy-services:$\s+needs: \[([^\]]+)\]/m.exec(workflow)?.[1] ?? ''

    for (const { service } of CRON_SERVICES) {
      expect(matrix).toContain(service)
    }
    expect(needs).toContain('deploy-api')
    expect(workflow).toContain('railway-deploy.sh deploy api')
  })
})
