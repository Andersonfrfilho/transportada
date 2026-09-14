/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

const REPOSITORY_ROOT = new URL('../../../../', import.meta.url)
const SERVICE_DIRECTORY = new URL('deploy/restore-test/', REPOSITORY_ROOT)
const SCRIPT_PATH = new URL('restore-test.sh', SERVICE_DIRECTORY)
const DOCKERFILE_PATH = new URL('Dockerfile', SERVICE_DIRECTORY)
const BACKUP_DOCKERFILE_PATH = new URL('deploy/backup/Dockerfile', REPOSITORY_ROOT)
const RAILWAY_PROJECT_PATH = new URL('.railway/railway.ts', REPOSITORY_ROOT)
const RETIRED_WORKFLOW_PATH = new URL('.github/workflows/restore-test.yml', REPOSITORY_ROOT)

/** Dia 5 de cada mês, 04:00 BRT — a cadência que o workflow do GitHub tinha. */
const CRON_SCHEDULE = '0 7 5 * *'
/** Os mesmos parâmetros do `deploy/backup/backup.sh`: decifrar com outros é não decifrar. */
const DECIPHER_ARGUMENTS = '-aes-256-cbc -pbkdf2 -iter 100000'
/** Qualquer uma destas no ambiente do serviço é um caminho até banco de verdade. */
const REAL_DATABASE_VARIABLES = [
  'DATABASE_URL',
  'APP_DATABASE_URL',
  'KEYCLOAK_DATABASE_URL',
  'STAGING_DATABASE_URL',
] as const

async function readScript(): Promise<string> {
  return Bun.file(SCRIPT_PATH).text()
}

function positionOf(script: string, needle: string): number {
  const index = script.indexOf(needle)
  if (index < 0) {
    throw new Error(`Trecho ausente no restore-test.sh: ${needle}`)
  }
  return index
}

function sliceFunction(script: string, name: string): string {
  const start = positionOf(script, `${name}() {`)
  const end = script.indexOf('\n}\n', start)
  return script.slice(start, end < 0 ? undefined : end)
}

function fromLineOf(dockerfile: string): string {
  return dockerfile.split('\n').find((line) => line.startsWith('FROM ')) ?? ''
}

async function readServiceDeclaration(): Promise<string> {
  const project = await Bun.file(RAILWAY_PROJECT_PATH).text()
  const start = positionOf(project, "service('restore-test', {")
  return project.slice(start, project.indexOf('\n  })', start))
}

async function readResourceLists(): Promise<Readonly<{ production: string; staging: string }>> {
  const project = await Bun.file(RAILWAY_PROJECT_PATH).text()
  return {
    production: project.match(/\?\s*\[\.\.\.shared,[^\]]*\]/)?.[0] ?? '',
    staging: project.match(/:\s*\[\.\.\.shared,[^\]]*\]/)?.[0] ?? '',
  }
}

describe('contrato do serviço restore-test', () => {
  /**
   * O dump decifrado tem dado pessoal e fiscal de terceiros. Num runner hospedado ele atravessaria
   * infraestrutura que não é nossa — a mesma razão que pôs o `staging-refresh` dentro do Railway.
   */
  test('o teste de restore não roda mais num runner do GitHub', async () => {
    expect(await Bun.file(RETIRED_WORKFLOW_PATH).exists()).toBe(false)
  })

  /** Cliente mais velho que o servidor recusa o dump; imagem que muda sem aviso não prova nada. */
  test('a imagem é a mesma do backup, pinada por digest', async () => {
    const dockerfile = await Bun.file(DOCKERFILE_PATH).text()
    const backupDockerfile = await Bun.file(BACKUP_DOCKERFILE_PATH).text()

    expect(fromLineOf(dockerfile)).toMatch(/^FROM postgres:18-alpine@sha256:[0-9a-f]{64}$/)
    expect(fromLineOf(dockerfile)).toBe(fromLineOf(backupDockerfile))
    expect(dockerfile).toContain('COPY deploy/restore-test/restore-test.sh')
    expect(dockerfile).toContain('USER postgres')
  })

  test('o script morre no primeiro erro, com o trap valendo dentro das funções', async () => {
    const script = await readScript()

    expect(script).toContain('set -Eeuo pipefail')
    expect(script).toContain("trap 'report_failure $LINENO' ERR")
    expect(script).not.toContain('set -x')
  })

  /**
   * O serviço só existe em production e só lê a cópia de production. Rodando em qualquer outro
   * ambiente ele empurraria o monitor de production com o resultado de outra coisa.
   */
  test('a guarda de ambiente vem antes de qualquer download', async () => {
    const script = await readScript()
    const guard = sliceFunction(script, 'refuse_non_production_environment')

    expect(guard).toContain('RAILWAY_ENVIRONMENT_NAME')
    expect(guard).toContain('production')
    expect(guard).toContain('return 1')
    expect(positionOf(script, '\n  refuse_non_production_environment')).toBeLessThan(
      positionOf(script, '\n  download_cycle'),
    )
  })

  /**
   * O alvo é o Postgres que o próprio script sobe. Uma URL de banco real no ambiente do serviço é o
   * primeiro passo para a edição de amanhã transformar um teste de leitura num restore por cima de
   * banco vivo — então a presença dela, sozinha, já é falha.
   */
  test('recusa rodar com credencial de banco real no ambiente', async () => {
    const script = await readScript()
    const guard = sliceFunction(script, 'refuse_real_database_credentials')

    for (const name of REAL_DATABASE_VARIABLES) {
      expect(script.slice(0, positionOf(script, 'CURRENT_STEP=boot'))).toContain(name)
    }
    expect(guard).toContain('return 1')
    expect(positionOf(script, '\n  refuse_real_database_credentials')).toBeLessThan(
      positionOf(script, '\n  download_cycle'),
    )
  })

  test('o Postgres efêmero nasce no contêiner e não abre porta nenhuma', async () => {
    const script = await readScript()
    const startup = sliceFunction(script, 'start_ephemeral_postgres')

    expect(startup).toContain('initdb')
    expect(startup).toContain('pg_ctl')
    expect(startup).toContain("listen_addresses=''")
    expect(script).not.toMatch(/postgres(ql)?:\/\//)
  })

  test('o ciclo vem da última linha do manifesto do ambiente, e tem os dois bancos', async () => {
    const script = await readScript()

    expect(script).toContain('db-backups/${BACKUP_ENVIRONMENT}/manifest.jsonl')
    expect(script).toContain('tail -n 1')
    expect(script).toMatch(/-eq 2\b/)
    expect(script).not.toContain('list-type=2')
  })

  test('confere o sha256 e decifra com os mesmos parâmetros com que o backup cifrou', async () => {
    const script = await readScript()

    expect(script).toContain('sha256sum -c')
    expect(script).toContain(`openssl enc -d ${DECIPHER_ARGUMENTS}`)
    expect(script).toContain('-pass env:BACKUP_ENCRYPTION_KEY')
    expect(positionOf(script, 'sha256sum -c')).toBeLessThan(positionOf(script, 'openssl enc -d'))
  })

  /**
   * Sem `--exit-on-error` o `pg_restore` segue depois do primeiro erro e sai com "errors ignored on
   * restore" — o banco restaurado pela metade ainda passaria na contagem de tabelas.
   */
  test('restaura parando no primeiro erro, sem dono e sem privilégio', async () => {
    const restore = sliceFunction(await readScript(), 'restore_database')

    expect(restore).toMatch(/pg_restore\b[^\n]*--exit-on-error/)
    expect(restore).toContain('--no-owner')
    expect(restore).toContain('--no-privileges')
  })

  /** Restaurar prova que o arquivo abre; comparar com o manifesto prova que ele é o banco. */
  test('compara com o manifesto e roda consultas de sanidade nos dois bancos', async () => {
    const script = await readScript()

    for (const field of ['sha256', 'tableCount', 'lastMigration']) {
      expect(script).toContain(`.${field}`)
    }
    expect(script).toContain('[app]=companies')
    expect(script).toContain('[keycloak]=realm')
  })

  /**
   * O erro do `pg_restore` cita a linha do COPY que falhou — com o conteúdo dela. Ecoado, o dado de
   * terceiro que o serviço existe para não expor iria parar no log da plataforma.
   */
  test('o dump decifrado nunca chega ao log, e o disco é limpo na saída', async () => {
    const script = await readScript()
    const restore = sliceFunction(script, 'restore_database')
    const cleanup = sliceFunction(script, 'discard_workspace')

    expect(restore).toMatch(/pg_restore[\s\S]*2>"\$\{WORK_DIRECTORY\}/)
    expect(restore).toContain('rm -f "$plain"')
    expect(cleanup).toContain('pg_ctl')
    expect(cleanup).toContain('rm -rf "$WORK_DIRECTORY"')
    expect(script).toContain('trap discard_workspace EXIT')
  })

  test('nenhum segredo literal, e a URL do heartbeat fica fora do log', async () => {
    const script = await readScript()

    for (const name of [
      'BACKUP_ENCRYPTION_KEY',
      'BACKUP_S3_SECRET_ACCESS_KEY',
      'RESTORE_HEARTBEAT_TOKEN',
    ]) {
      expect(`${name}=${new RegExp(`^\\s*(readonly\\s+)?${name}=`, 'm').test(script)}`) //
        .toBe(`${name}=false`)
    }
    expect(script).not.toMatch(/\blog\s+[^\n]*\$\{?RESTORE_HEARTBEAT_(URL|TOKEN)/)
  })

  /**
   * Ao contrário do backup, aqui a falta de heartbeat é falha declarada: restore que não avisa
   * ninguém não vale como teste. Por isso as duas variáveis são obrigatórias desde o boot.
   */
  test('o heartbeat é obrigatório, e é um POST autenticado que insiste na borda', async () => {
    const script = await readScript()
    const required = script.slice(
      positionOf(script, 'REQUIRED_VARIABLES=('),
      positionOf(script, 'CURRENT_STEP=boot'),
    )
    const push = sliceFunction(script, 'push_heartbeat')

    expect(required).toContain('RESTORE_HEARTBEAT_URL')
    expect(required).toContain('RESTORE_HEARTBEAT_TOKEN')
    expect(push).toContain('--request POST')
    expect(push).toContain('Authorization: Bearer')
    expect(push).toContain('RESTORE_HEARTBEAT_TOKEN')
    expect(push).toContain('--fail')
    expect(push).toContain('--retry')
  })

  /** Heartbeat verde no caminho de falha é o alerta que nunca dispara. */
  test('success=true só depois do ciclo inteiro; a falha avisa na hora com success=false', async () => {
    const script = await readScript()
    const failure = sliceFunction(script, 'report_failure')

    expect(script.match(/^\s*push_heartbeat true$/gm)?.length).toBe(1)
    expect(positionOf(script, 'push_heartbeat true')).toBeGreaterThan(
      positionOf(script, 'log info restore_test_completed'),
    )
    expect(failure).toContain('push_heartbeat false')
    expect(failure).not.toContain('push_heartbeat true')
    // O ciclo já está vermelho: o push recusado vira aviso, não troca a causa da falha.
    expect(failure).toMatch(/push_heartbeat false \|\|/)
  })

  /** Serviço novo não pode optar por `railway.json` — ele nasce no `.railway/railway.ts`. */
  test('é one-shot mensal declarado no railway.ts, sem railway.json', async () => {
    const declaration = await readServiceDeclaration()

    expect(await Bun.file(new URL('railway.json', SERVICE_DIRECTORY)).exists()).toBe(false)
    expect(declaration).toContain("dockerfilePath: 'deploy/restore-test/Dockerfile'")
    expect(declaration).toContain("watchPatterns: ['deploy/restore-test/**']")
    expect(declaration).toContain(`cronSchedule: '${CRON_SCHEDULE}'`)
    expect(declaration).toContain("restartPolicyType: 'NEVER'")
    expect(declaration).not.toContain('healthcheckPath')
  })

  test('as variáveis são preserve(), e nenhuma aponta para banco real', async () => {
    const declaration = await readServiceDeclaration()
    const variables = [...declaration.matchAll(/^\s+([A-Z][A-Z0-9_]*):\s*(.+),$/gm)]

    expect(variables.length).toBeGreaterThan(0)
    for (const [, name = '', value = ''] of variables) {
      expect(`${name}: ${value}`).toBe(`${name}: preserve()`)
    }
    for (const name of REAL_DATABASE_VARIABLES) {
      expect(declaration).not.toContain(name)
    }
  })

  test('existe em production e não em staging', async () => {
    const { production, staging } = await readResourceLists()

    expect(production).toMatch(/\brestoreTest\b/)
    expect(staging).not.toMatch(/\brestoreTest\b/)
  })
})
