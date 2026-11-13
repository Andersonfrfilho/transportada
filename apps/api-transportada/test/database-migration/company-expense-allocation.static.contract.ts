/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T4.3 (ADR-0116 §1 e §2): o grupo de custo da categoria e o critério de rateio entram aditivos. O rollback
 * recusa rodar com configuração personalizada.
 */
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import {
  COMPANY_EXPENSE_ALLOCATABLE_GROUPS,
  COMPANY_EXPENSE_ALLOCATION_CRITERIA,
  COMPANY_EXPENSE_COST_GROUPS,
  COMPANY_EXPENSE_DEFAULT_CRITERION,
} from '../../src/database/company-expense.schema.js'
import { DEFAULT_ALLOCATION_SETTINGS } from '../../src/expenses/domain/expense-allocation.policy.js'
import { listMigrationDirectories, migrationsDirectory } from './support.js'

const MIGRATION_SUFFIX = '_company_expense_allocation'

async function readMigration(file: string): Promise<string> {
  const directory = (await listMigrationDirectories()).find((name) =>
    name.endsWith(MIGRATION_SUFFIX),
  )
  if (directory === undefined) throw new Error('company_expense_allocation migration is required')
  return Bun.file(join(migrationsDirectory.pathname, directory, file)).text()
}

function withoutComments(sqlText: string): string {
  return sqlText.replaceAll(/^--.*$/gmu, '')
}

const SEED_GROUPS: ReadonlyArray<readonly [string, string]> = [
  ['Aluguel', 'administrative'],
  ['Folha', 'administrative'],
  ['Impostos', 'administrative'],
  ['Outros', 'administrative'],
  ['Seguro', 'vehicle_fixed'],
  ['Manutenção', 'per_km'],
  ['Combustível', 'per_km'],
  ['Pagamento de motorista/agregado', 'in_trip'],
]

describe('o rateio das contas entra aditivo (spec 325 T4.3)', () => {
  test('coluna com padrão e tabela nova, sem DROP nem tabela existente alterada além da categoria', async () => {
    const text = withoutComments(await readMigration('migration.sql'))
    expect(text).toContain('CREATE TABLE "company_expense_allocation_settings"')
    expect(text).toContain(
      'ALTER TABLE "company_expense_categories" ADD COLUMN "cost_group" varchar(16) DEFAULT \'administrative\' NOT NULL',
    )
    expect(text).toContain('UNIQUE("company_id","cost_group")')
    expect(text).not.toMatch(/\bDROP\b/u)
    expect(text).not.toMatch(/\bDELETE FROM\b/u)
    const altered = new Set(
      [...text.matchAll(/ALTER TABLE "([^"]+)"/gu)].map((match) => match[1] ?? ''),
    )
    expect([...altered].toSorted()).toEqual([
      'company_expense_allocation_settings',
      'company_expense_categories',
    ])
  })

  test('as listas fechadas da migration são as do schema', async () => {
    const text = withoutComments(await readMigration('migration.sql'))
    const list = (values: readonly string[]): string => values.map((v) => `'${v}'`).join(', ')
    expect(text).toContain(`"cost_group" in (${list(COMPANY_EXPENSE_COST_GROUPS)})`)
    expect(text).toContain(`"cost_group" in (${list(COMPANY_EXPENSE_ALLOCATABLE_GROUPS)})`)
    expect(text).toContain(`"criterion" in (${list(COMPANY_EXPENSE_ALLOCATION_CRITERIA)})`)
    // in_trip nunca é rateado: fica de fora dos grupos da configuração.
    expect(COMPANY_EXPENSE_ALLOCATABLE_GROUPS).not.toContain('in_trip' as never)
  })

  test('a semente classifica as oito categorias (RF10) e grava o padrão (RF11)', async () => {
    const text = withoutComments(await readMigration('migration.sql'))
    for (const [name, group] of SEED_GROUPS) expect(text).toContain(`('${name}', '${group}')`)
    for (const [group, criterion] of Object.entries(COMPANY_EXPENSE_DEFAULT_CRITERION))
      expect(text).toContain(`('${group}', '${criterion}')`)
    expect(text).toContain(
      'ON CONFLICT ON CONSTRAINT "company_expense_allocation_settings_company_group_unique" DO NOTHING',
    )
  })

  test('o padrão do schema e o da política de rateio são o mesmo', () => {
    expect(COMPANY_EXPENSE_DEFAULT_CRITERION).toEqual(DEFAULT_ALLOCATION_SETTINGS)
  })

  test('o rollback é manual, recusa configuração personalizada e limpa o diário', async () => {
    const text = await readMigration('rollback.sql')
    expect(text).toContain('Manual rollback only')
    expect(text).toContain('refusing to drop')
    expect(text).toContain('DROP TABLE "company_expense_allocation_settings"')
    expect(text).toContain('DROP COLUMN "cost_group"')
    expect(text).toContain("'20261113215631_company_expense_allocation'")
  })
})
