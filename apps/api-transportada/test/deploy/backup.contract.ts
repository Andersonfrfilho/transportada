/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

const REPOSITORY_ROOT = new URL('../../../../', import.meta.url)
const BACKUP_DIRECTORY = new URL('deploy/backup/', REPOSITORY_ROOT)
const DOCKERFILE_PATH = new URL('Dockerfile', BACKUP_DIRECTORY)
const SCRIPT_PATH = new URL('backup.sh', BACKUP_DIRECTORY)
const RAILWAY_PATH = new URL('railway.json', BACKUP_DIRECTORY)

/** 03:00 BRT. Espelha a cadência decidida na D5 da spec. */
const CRON_SCHEDULE = '0 6 * * *'

async function readScript(): Promise<string> {
  return Bun.file(SCRIPT_PATH).text()
}

function positionOf(script: string, needle: string): number {
  const index = script.indexOf(needle)
  if (index < 0) {
    throw new Error(`Trecho ausente no backup.sh: ${needle}`)
  }
  return index
}

describe('contrato do serviço backup', () => {
  /**
   * Restaurar só o banco da aplicação devolve o dado e deixa todo mundo sem conseguir entrar:
   * o vínculo entre identidade externa e membership mora no realm do Keycloak.
   */
  test('os dois bancos entram no ciclo, não só o da aplicação', async () => {
    const script = await readScript()

    expect(script).toContain('APP_DATABASE_URL')
    expect(script).toContain('KEYCLOAK_DATABASE_URL')
    expect(script.match(/^\s*backup_database\s/gm)?.length).toBe(2)
  })

  test('o dump é custom, sem dono, e é validado antes de qualquer upload', async () => {
    const script = await readScript()

    expect(script).toContain('--format=custom')
    expect(script).toContain('--no-owner')
    expect(positionOf(script, 'pg_restore --list')).toBeLessThan(positionOf(script, 'put_object'))
  })

  /** Dump de production em disco é vazamento esperando acontecer. */
  test('cifra com AES-256-CBC PBKDF2 e apaga o dump em claro', async () => {
    const script = await readScript()

    expect(script).toContain('openssl enc -aes-256-cbc -pbkdf2 -iter 100000 -salt')
    expect(script).toContain('-pass env:BACKUP_ENCRYPTION_KEY')
    expect(positionOf(script, 'rm -f "$dump_path"')).toBeGreaterThan(
      positionOf(script, 'openssl enc'),
    )
  })

  test('o cifrado sobe com o seu sha256, e o dump em claro nunca sobe', async () => {
    const script = await readScript()
    const uploads = [...script.matchAll(/put_object\s+"([^"]+)"/g)].map(([, source = '']) => source)

    expect(uploads.length).toBeGreaterThanOrEqual(3)
    expect(uploads.some((source) => source.endsWith('.enc'))).toBe(true)
    expect(uploads.some((source) => source.endsWith('.enc.sha256'))).toBe(true)
    for (const source of uploads) {
      expect(`${source}:${/\.dump$/.test(source)}`).toBe(`${source}:false`)
    }
  })

  /** Sem manifesto, "restaurou" quer dizer só "não deu erro". */
  test('o manifesto carrega o que o teste de restore compara', async () => {
    const script = await readScript()

    expect(script).toContain('manifest.jsonl')
    for (const field of ['"sizeBytes"', '"sha256"', '"tableCount"', '"lastMigration"']) {
      expect(script).toContain(field)
    }
  })

  /**
   * O bucket de ops serve os dois ambientes. Sem o ambiente no caminho, staging e production
   * dividem `db-backups/daily/` e a mesma `manifest.jsonl` — e o teste mensal, que restaura a
   * última linha do manifesto, restauraria staging jurando que provou production.
   */
  test('cada ambiente escreve no seu prefixo, e no seu manifesto', async () => {
    const script = await readScript()

    const required = script.slice(
      positionOf(script, 'REQUIRED_VARIABLES=('),
      positionOf(script, 'CURRENT_STEP=boot'),
    )

    expect(required).toContain('BACKUP_ENVIRONMENT')
    expect(script).toMatch(/OBJECT_PREFIX="\$\{OBJECT_ROOT\}\/\$\{BACKUP_ENVIRONMENT\}"/)
    expect(script).toMatch(/MANIFEST_KEY="\$\{OBJECT_PREFIX\}\/manifest\.jsonl"/)
    expect(positionOf(script, 'OBJECT_PREFIX="${OBJECT_ROOT}')).toBeGreaterThan(
      positionOf(script, 'require_variables\n'),
    )
  })

  test('domingo é semanal, e cada prefixo tem a sua janela de retenção', async () => {
    const script = await readScript()

    expect(script).toContain('daily')
    expect(script).toContain('weekly')
    expect(script).toContain('BACKUP_RETENTION_DAILY_DAYS:-30')
    expect(script).toContain('BACKUP_RETENTION_WEEKLY_DAYS:-90')
  })

  /**
   * Cron que falha em silêncio é backup que não existe e ninguém sabe — mas heartbeat que
   * dispara no caminho de falha é pior: apaga o alerta e afirma que o ciclo correu.
   */
  test('o heartbeat só é pingado depois do ciclo inteiro dar certo', async () => {
    const script = await readScript()
    const heartbeatCalls = script.match(/^\s*push_heartbeat$/gm) ?? []

    expect(heartbeatCalls.length).toBe(1)
    expect(positionOf(script, 'push_heartbeat\n')).toBeGreaterThan(
      positionOf(script, 'backup_cycle_completed'),
    )
    expect(script.slice(positionOf(script, 'backup_cycle_failed'))).not.toContain('push_heartbeat')
  })

  /**
   * Sem `-e` um `pg_dump` quebrado seguiria o roteiro até pingar o heartbeat de sucesso; sem `-E`
   * o trap de ERR não é herdado pelas funções e a falha não escreve o `step` que o runbook lê.
   */
  test('o script morre no primeiro erro, com o trap valendo dentro das funções', async () => {
    const script = await readScript()

    expect(script).toContain('set -Eeuo pipefail')
    expect(script).toContain("trap 'report_failure $LINENO' ERR")
    expect(script).not.toContain('set -x')
  })

  test('nenhuma credencial literal: tudo vem do ambiente', async () => {
    const script = await readScript()
    const secretNames = [
      'BACKUP_ENCRYPTION_KEY',
      'BACKUP_S3_ACCESS_KEY_ID',
      'BACKUP_S3_SECRET_ACCESS_KEY',
      'APP_DATABASE_URL',
      'KEYCLOAK_DATABASE_URL',
    ]

    for (const name of secretNames) {
      expect(`${name}=${new RegExp(`^\\s*(readonly\\s+)?${name}=`, 'm').test(script)}`) //
        .toBe(`${name}=false`)
    }
  })

  /** A URL do banco carrega a senha: ecoá-la queima o segredo no log do deploy. */
  test('a URL do banco nunca chega ao log', async () => {
    const script = await readScript()

    expect(script).not.toMatch(/log[a-z_]*\s+[^\n]*\$\{?(APP|KEYCLOAK)_DATABASE_URL/)
  })

  test('a imagem é o servidor de production, pinada por digest', async () => {
    const dockerfile = await Bun.file(DOCKERFILE_PATH).text()
    const fromLine = dockerfile.split('\n').find((line) => line.startsWith('FROM '))

    expect(fromLine).toContain('postgres:18-alpine')
    expect(fromLine).toContain('@sha256:')
    expect(fromLine).not.toContain(':latest')
  })

  test('é one-shot agendado, e uma falha não vira loop de tentativa', async () => {
    const railway = (await Bun.file(RAILWAY_PATH).json()) as Readonly<{
      build: Readonly<Record<string, unknown>>
      deploy: Readonly<Record<string, unknown>>
    }>

    expect(railway.build).toMatchObject({
      builder: 'DOCKERFILE',
      dockerfilePath: 'deploy/backup/Dockerfile',
    })
    expect(railway.deploy).toMatchObject({
      cronSchedule: CRON_SCHEDULE,
      restartPolicyType: 'NEVER',
    })
    expect(railway.deploy.healthcheckPath).toBeUndefined()
  })
})
