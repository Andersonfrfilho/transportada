/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O relatório junta nove tabelas, e cada degrau tem de carregar o tenant: uma junção por id solto
 * é o caminho pelo qual a nota de uma empresa aparece no relatório de outra. O contrato lê a fonte.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

const QUERY_SOURCE = readFileSync(
  new URL('../../src/trips/infrastructure/trip-report.query.ts', import.meta.url),
  'utf8',
)
const REPOSITORY_SOURCE = readFileSync(
  new URL('../../src/trips/infrastructure/drizzle-trip-report.repository.ts', import.meta.url),
  'utf8',
)

function countJoins(source: string): { readonly scoped: number; readonly total: number } {
  return {
    scoped:
      source.match(/\.(?:inner|left)Join\(\s*\w+,\s*and\(\s*eq\(\w+\.companyId,/gu)?.length ?? 0,
    total: source.match(/\.(?:inner|left)Join\(/gu)?.length ?? 0,
  }
}

describe('tenant safety do relatorio de viagens', () => {
  test('cada juncao da consulta carrega o companyId', () => {
    const { scoped, total } = countJoins(QUERY_SOURCE)
    expect(total).toBeGreaterThan(0)
    expect(scoped).toBe(total)
  })

  test('cada juncao da contagem de notas sem viagem carrega o companyId', () => {
    const { scoped, total } = countJoins(REPOSITORY_SOURCE)
    expect(total).toBeGreaterThan(0)
    expect(scoped).toBe(total)
  })

  test('o endereco lateral e escopado pela empresa do destinatario', () => {
    expect(QUERY_SOURCE).toContain('eq(nfeAddresses.companyId, reportRecipient.companyId)')
    expect(QUERY_SOURCE).toContain('eq(nfeAddresses.participantId, reportRecipient.id)')
  })

  test('o contratante casa por empresa e CNPJ do emitente, nunca so pelo CNPJ', () => {
    expect(QUERY_SOURCE).toContain('eq(contractors.companyId, reportEmitter.companyId)')
    expect(QUERY_SOURCE).toContain('eq(contractors.taxId, reportEmitter.taxId)')
  })

  test('toda consulta ancora a empresa do contexto no where', () => {
    expect(QUERY_SOURCE).toContain('eq(tripDocuments.companyId, companyId)')
    expect(REPOSITORY_SOURCE).toContain('eq(tripDocuments.companyId, params.companyId)')
    expect(REPOSITORY_SOURCE).toContain('eq(nfeDocuments.companyId, params.companyId)')
  })

  test('o relatorio nao seleciona telefone nem documento de pessoa', () => {
    expect(REPOSITORY_SOURCE).not.toMatch(/phone|stateRegistration/iu)
    expect(QUERY_SOURCE).not.toMatch(/\bphone\b/iu)
  })
})
