/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 T1.3: toda instrução dos repositórios do calendário de dias úteis carrega a empresa do
 * contexto. É a conferência no fonte (a prova com dois tenants reais está em
 * `test/integration/business-calendar-tenant-safety.integration.ts`): uma consulta nova sem `companyId`
 * reprova aqui antes de chegar ao Postgres.
 */
import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'

const INFRASTRUCTURE = new URL('../../src/business-calendar/infrastructure/', import.meta.url)
const STATEMENT_PATTERN = /\.(from|update|delete|insert)\(/g
const STATEMENT_WINDOW = 700
const SUPPORT_ONLY = [
  'business-calendar-audit.support.ts',
  'business-calendar-database.types.ts',
  'business-calendar-lock.support.ts',
  'business-calendar-persistence.support.ts',
  'business-calendar-rule.mapper.ts',
  // Spec 252: o contador do mês é da instalação (cache global, sem `company_id`); a fronteira dele é o
  // contrato `holiday-import-global-isolation`, e a prova com duas empresas é a integração do status.
  'holiday-import-usage.query.ts',
]

function repositorySources(): readonly { readonly name: string; readonly text: string }[] {
  return readdirSync(INFRASTRUCTURE)
    .filter((name) => name.endsWith('.ts') && !SUPPORT_ONLY.includes(name))
    .map((name) => ({ name, text: readFileSync(new URL(name, INFRASTRUCTURE), 'utf8') }))
}

describe('as consultas do calendário filtram pela empresa (spec 238 T1.3)', () => {
  test('há repositórios a conferir', () => {
    const names = repositorySources().map((source) => source.name)

    expect(names).toContain('drizzle-business-calendar.repository.ts')
    expect(names).toContain('business-calendar-rules.query.ts')
    expect(names).toContain('drizzle-municipal-holiday-rule.repository.ts')
    expect(names).toContain('drizzle-municipal-holiday.repository.ts')
    expect(names).toContain('drizzle-state-holiday.repository.ts')
    expect(names).toContain('drizzle-business-calendar-settings.repository.ts')
  })

  test('cada from, update, delete e insert tem companyId logo adiante', () => {
    const offenders: string[] = []
    for (const { name, text } of repositorySources()) {
      for (const match of text.matchAll(STATEMENT_PATTERN)) {
        const window = text.slice(match.index, match.index + STATEMENT_WINDOW)
        if (!window.includes('companyId')) {
          const line = text.slice(0, match.index).split('\n').length
          offenders.push(`${name}:${line}`)
        }
      }
    }

    expect(offenders).toEqual([])
  })

  test('o calendário que a política lê nunca inclui a data gerada por regra', () => {
    const source = readFileSync(new URL('business-calendar-rules.query.ts', INFRASTRUCTURE), 'utf8')

    expect(source).toContain('isNull(municipalHolidays.sourceRuleId)')
  })

  test('cada consulta do calendário tem teto: o excesso vira TOO_MANY_RULES na política', () => {
    const source = readFileSync(new URL('business-calendar-rules.query.ts', INFRASTRUCTURE), 'utf8')

    expect(source.match(/\.limit\(BUSINESS_CALENDAR_MAX_RULES \+ 1\)/g)).toHaveLength(3)
  })
})
