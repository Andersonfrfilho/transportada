/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const DEPLOY_SCRIPT = new URL('../../../../.github/scripts/railway-deploy.sh', import.meta.url)

const DEPLOYMENT_ID = '11111111-2222-4333-8444-555555555555'
const OTHER_DEPLOYMENT_ID = '99999999-8888-4777-8666-555555555555'

/** A CLI anuncia o deployment criado nesta linha, e é dela que o script tira o identificador. */
function buildLogsLine(deploymentId: string): string {
  return `  Build Logs: https://railway.com/project/project-stub/service/service-stub?id=${deploymentId}&`
}

/**
 * A CLI de verdade só é chamada com três subcomandos aqui. Responder por variável de ambiente
 * deixa cada teste escolher o cenário sem tocar no script.
 */
const RAILWAY_STUB = `#!/usr/bin/env bash
case "$1" in
  environment) echo '{"environments":[{"id":"env-stub","name":"staging"}]}' ;;
  up) printf '%s\\n' "$STUB_UP_OUTPUT"; exit "$STUB_UP_EXIT" ;;
  deployment) printf '%s\\n' "$STUB_DEPLOYMENTS" ;;
  logs) ;;
  *) echo "stub: comando inesperado: $*" >&2; exit 127 ;;
esac
`

type StubDeployment = {
  readonly id: string
  readonly status: string
}

type RunDeployParams = {
  readonly deployments: readonly StubDeployment[]
  readonly upExitCode: number
  readonly upOutput: string
}

type RunDeployResult = {
  readonly exitCode: number
  readonly output: string
}

/**
 * `HOME` é descartável de propósito: o script grava `~/.railway/config.json`, e rodar o teste não
 * pode desfazer o vínculo de projeto de quem estiver com a CLI logada na máquina.
 */
async function runDeploy({
  deployments,
  upExitCode,
  upOutput,
}: RunDeployParams): Promise<RunDeployResult> {
  const home = await mkdtemp(join(tmpdir(), 'railway-deploy-'))
  const binaryDirectory = join(home, 'bin')
  await mkdir(binaryDirectory)
  const stubPath = join(binaryDirectory, 'railway')
  await writeFile(stubPath, RAILWAY_STUB)
  await chmod(stubPath, 0o755)

  const spawned = Bun.spawn({
    cmd: ['bash', Bun.fileURLToPath(DEPLOY_SCRIPT), 'deploy', 'api'],
    cwd: home,
    env: {
      HOME: home,
      PATH: `${binaryDirectory}:${Bun.env.PATH ?? ''}`,
      POLL_INTERVAL_SECONDS: '0',
      PWD: home,
      RAILWAY_PROJECT_ID: 'project-stub',
      STUB_DEPLOYMENTS: JSON.stringify(deployments),
      STUB_UP_EXIT: String(upExitCode),
      STUB_UP_OUTPUT: upOutput,
      TARGET_ENVIRONMENT: 'staging',
    },
    stderr: 'pipe',
    stdout: 'pipe',
  })

  const [exitCode, stdout, stderr] = await Promise.all([
    spawned.exited,
    new Response(spawned.stdout).text(),
    new Response(spawned.stderr).text(),
  ])
  await rm(home, { force: true, recursive: true })

  return { exitCode, output: `${stdout}${stderr}` }
}

describe('contrato do deploy na Railway', () => {
  /**
   * `railway up --ci` sai 1 quando perde o streaming do log da build, com o deployment já criado e
   * correndo. Sob `set -e` isso matava o passo inteiro: em 10/08/2026 a API subiu SUCCESS na Railway
   * e o pipeline pulou `assert-migrations`, worker, cron e frontend — meio deploy, verde nenhum.
   */
  test('log de build perdido não derruba um deploy que a Railway aceitou', async () => {
    const result = await runDeploy({
      deployments: [{ id: DEPLOYMENT_ID, status: 'SUCCESS' }],
      upExitCode: 1,
      upOutput: `${buildLogsLine(DEPLOYMENT_ID)}\nFailed to stream build logs: Failed to retrieve build log`,
    })

    expect(result.output).toContain('deploy concluído')
    expect(result.exitCode).toBe(0)
  })

  /** Sem deployment criado não há o que esperar: engolir a saída aqui seria inventar um deploy. */
  test('railway up que não criou deployment continua sendo falha', async () => {
    const result = await runDeploy({
      deployments: [{ id: OTHER_DEPLOYMENT_ID, status: 'SUCCESS' }],
      upExitCode: 1,
      upOutput: 'Project not found',
    })

    expect(result.exitCode).not.toBe(0)
  })

  /**
   * Esperar pelo "mais recente" aprova o deployment de outra pessoa: dois pushes seguidos, ou um
   * redeploy manual pelo painel, e o pipeline dá verde para uma build que não é a dele.
   */
  test('o pipeline espera o deployment que ele criou, não o mais recente', async () => {
    const result = await runDeploy({
      deployments: [
        { id: OTHER_DEPLOYMENT_ID, status: 'SUCCESS' },
        { id: DEPLOYMENT_ID, status: 'FAILED' },
      ],
      upExitCode: 0,
      upOutput: buildLogsLine(DEPLOYMENT_ID),
    })

    expect(result.exitCode).not.toBe(0)
  })
})
