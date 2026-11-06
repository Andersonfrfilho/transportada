/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 218 RF-C3, contrato de paridade: todo leitor da configuração do comprovante resolve as três
 * camadas (geral, contratante, destinatário). Um leitor novo que lê a exceção do destinatário sem
 * a da contratante — ou que chama `resolveProofSettingsForRecipient` sem `contractorId` — diverge
 * calado do app do motorista; este contrato o pega no código-fonte, e a integração
 * `delivery-proof-contractor-exception-parity` confere o comportamento dos leitores conhecidos.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

import { describe, expect, test } from 'bun:test'

const SOURCE_ROOT = join(import.meta.dir, '../../src')
/** Quem declara as tabelas e a regra, e o CRUD do painel — não são leitores da configuração resolvida. */
const NOT_READERS = new Set([
  'database/company-delivery-proof-settings.schema.ts',
  'database/database.schema.ts',
  'database/trip.schema.ts',
  'trips/domain/delivery-proof-settings.policy.ts',
  'trips/infrastructure/drizzle-delivery-proof-settings.repository.ts',
])
const RESOLVER_CALL = 'resolveProofSettingsForRecipient({'

function listSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return listSourceFiles(path)
    return entry.name.endsWith('.ts') ? [path] : []
  })
}

const SOURCES = listSourceFiles(SOURCE_ROOT).map((path) => ({
  path: relative(SOURCE_ROOT, path),
  text: readFileSync(path, 'utf8'),
}))

/** O objeto de argumento de cada chamada, até a chave que o fecha. */
function readResolverArguments(text: string): string[] {
  const calls: string[] = []
  let index = text.indexOf(RESOLVER_CALL)
  while (index !== -1) {
    let depth = 0
    let end = index + RESOLVER_CALL.length - 1
    for (; end < text.length; end += 1) {
      if (text[end] === '{') depth += 1
      if (text[end] === '}') depth -= 1
      if (depth === 0) break
    }
    calls.push(text.slice(index, end + 1))
    index = text.indexOf(RESOLVER_CALL, end)
  }
  return calls
}

describe('todo leitor da configuração do comprovante lê a exceção da contratante (spec 218)', () => {
  test('quem lê a exceção do destinatário também lê a da contratante', () => {
    const readers = SOURCES.filter(
      ({ path, text }) => !NOT_READERS.has(path) && /\bdeliveryProofSettingOverrides\b/u.test(text),
    )
    expect(readers.length).toBeGreaterThan(0)
    const missing = readers
      .filter(({ text }) => !text.includes('deliveryProofSettingContractorOverrides'))
      .map(({ path }) => path)
    expect(missing).toEqual([])
  })

  test('toda chamada de resolveProofSettingsForRecipient passa o contratante', () => {
    const calls = SOURCES.flatMap(({ path, text }) =>
      readResolverArguments(text).map((call) => ({ call, path })),
    )
    expect(calls.length).toBeGreaterThan(0)
    const missing = calls
      .filter(({ call }) => !/\bcontractorId\b/u.test(call))
      .map(({ path }) => path)
    expect(missing).toEqual([])
  })
})
