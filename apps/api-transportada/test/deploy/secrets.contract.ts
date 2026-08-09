/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

const REPOSITORY_ROOT = new URL('../../../../', import.meta.url)
const RUNBOOK_PATH = new URL('docs/ops/backup-emergencia.md', REPOSITORY_ROOT)

/** Chave canônica de 32 bytes em base64 — a forma exata que a keyring e o HMAC têm. */
const CANONICAL_KEY_PATTERN = /[A-Za-z0-9+/]{43}=/
/** `{"production-v1": "..."}` — a keyring inteira, ainda que a chave viesse truncada. */
const KEYRING_PATTERN = /"(?:production|staging)-v\d+"\s*:\s*"/

/**
 * Um item de Chaveiro por campo. Nome de conta é o nome da variável, com uma exceção: os dois
 * Postgres de production usam a mesma `POSTGRES_PASSWORD`, e no cofre precisam de sufixo para não
 * colidirem num item só.
 */
const KEYCHAIN_ACCOUNTS = [
  'ENCRYPTION_KEYRING_JSON',
  'ENCRYPTION_ACTIVE_KEY_ID',
  'IDEMPOTENCY_HMAC_KEY',
  'RABBITMQ_DEFAULT_PASS',
  'KC_BOOTSTRAP_ADMIN_PASSWORD',
  'KEYCLOAK_ADMIN_CLIENT_SECRET',
  'POSTGRES_PASSWORD_APP',
  'POSTGRES_PASSWORD_KEYCLOAK',
] as const

async function readRunbook(): Promise<string> {
  return Bun.file(RUNBOOK_PATH).text()
}

function locationLine(content: string): string {
  const matched = /^\*\*Local da cópia de production:\*\*(.*)$/m.exec(content)
  if (matched === null) {
    throw new Error('O runbook não declara onde vive a cópia da keyring de production')
  }
  return (matched[1] ?? '').trim()
}

describe('contrato dos segredos de production', () => {
  /**
   * Perder a keyring não tem recuperação: o certificado A1 de cada empresa vira envelope
   * indecifrável (ADR-0004). O que separa "temos backup" de "achamos que temos" é alguém conseguir
   * dizer, sem procurar, onde a cópia está.
   */
  test('o runbook diz onde vive a cópia da keyring de production', async () => {
    const declared = locationLine(await readRunbook())

    expect(declared).not.toBeEmpty()
    expect(declared).not.toMatch(/preencher|pendente|TODO|a definir/i)
  })

  /**
   * E diz o local, jamais o valor. Documento é versionado, e keyring commitada é keyring pública —
   * segredo que apareceu em repositório é segredo queimado (regra de segurança §4).
   */
  test('o runbook não carrega o valor de segredo nenhum', async () => {
    const content = await readRunbook()

    expect(content).not.toMatch(CANONICAL_KEY_PATTERN)
    expect(content).not.toMatch(KEYRING_PATTERN)
  })

  /**
   * O cofre só serve se a emergência souber o que procurar nele. Campo que existe no Railway e não
   * está nomeado aqui é campo que ninguém repõe — descobre-se com o ambiente no chão.
   */
  test('o runbook nomeia cada item do Chaveiro que a reposição precisa', async () => {
    const content = await readRunbook()

    for (const account of KEYCHAIN_ACCOUNTS) {
      expect(content).toContain(`\`${account}\``)
    }
  })
})
