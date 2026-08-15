/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { is } from 'drizzle-orm'
import { getTableConfig, PgDialect, PgTable } from 'drizzle-orm/pg-core'

import * as databaseSchema from '../../src/database/database.schema.js'

const dialect = new PgDialect()

const CNPJ_PATTERN = '^[A-Z0-9]{12}[0-9]{2}$'
const CNPJ_ROOT_PATTERN = '^[A-Z0-9]{8}$'
const ACCESS_KEY_PATTERN = '^[0-9]{6}[A-Z0-9]{12}[0-9]{26}$'
const CPF_PATTERN = '^[0-9]{11}$'

const NUMERIC_ONLY_CNPJ = '[0-9]{14}'
const NUMERIC_ONLY_ACCESS_KEY = '[0-9]{44}'

interface SchemaCheck {
  table: string
  name: string
  sql: string
}

const readSchemaChecks = (): readonly SchemaCheck[] => {
  const tables = Object.values(databaseSchema).filter((value) => is(value, PgTable))

  return tables.flatMap((table) => {
    const config = getTableConfig(table as Parameters<typeof getTableConfig>[0])

    return config.checks.map((constraint) => ({
      table: config.name,
      name: constraint.name,
      sql: dialect.sqlToQuery(constraint.value).sql,
    }))
  })
}

const requireCheck = (checks: readonly SchemaCheck[], name: string): string => {
  const found = checks.find((check) => check.name === name)

  if (found === undefined) {
    throw new Error(`CHECK ausente no schema: ${name}`)
  }

  return found.sql
}

/** Colunas que guardam CNPJ e nada mais. */
const CNPJ_CHECK_NAMES = [
  'company_fiscal_profiles_cnpj_check',
  'digital_certificates_validated_cnpj_check',
  'nfse_provider_credentials_tax_id_check',
  'fleet_drivers_linked_tax_id_check',
] as const

/** Colunas que guardam CPF **ou** CNPJ: o ramo de onze fica intacto, só o de catorze abre. */
const CPF_OR_CNPJ_CHECK_NAMES = [
  'company_fiscal_profiles_mdfe_insurer_tax_id_check',
  'fleet_vehicles_owner_tax_id_check',
  'nfse_service_invoices_taker_tax_id_check',
  'mdfe_manifests_contractor_tax_id_check',
] as const

const ACCESS_KEY_CHECK_NAMES = [
  'nfe_documents_access_key_check',
  'nfe_events_access_key_check',
  'nfe_import_items_access_key_check',
  'cte_fiscal_documents_access_key_check',
  'billing_invoice_items_cte_access_key_check',
  'mdfe_fiscal_documents_access_key_check',
  'mdfe_manifest_items_access_key_check',
] as const

/**
 * O CPF não mudou: são onze dígitos, e continuam sendo. Esta lista existe para que afrouxar um
 * deles por engano — de arrasto, junto com os de CNPJ — falhe aqui em vez de passar calado.
 */
const CPF_ONLY_CHECK_NAMES = [
  'fleet_drivers_tax_id_check',
  'fleet_drivers_license_number_check',
  'trip_drivers_tax_id_check',
  'mdfe_manifest_drivers_tax_id_check',
] as const

describe('CNPJ alfanumérico no banco', () => {
  test('os CHECK que guardam CNPJ aceitam letra nas doze primeiras posições', () => {
    const checks = readSchemaChecks()

    for (const name of CNPJ_CHECK_NAMES) {
      expect(requireCheck(checks, name)).toContain(CNPJ_PATTERN)
    }
  })

  test('quem aceita CPF ou CNPJ abre só o ramo de catorze', () => {
    const checks = readSchemaChecks()

    for (const name of CPF_OR_CNPJ_CHECK_NAMES) {
      const sql = requireCheck(checks, name)

      expect(sql).toContain(CPF_PATTERN)
      expect(sql).toContain(CNPJ_PATTERN)
    }
  })

  /**
   * O matcher de perfil casa por raiz de oito ou por CNPJ inteiro. A raiz é o prefixo do documento,
   * então ela alfanumeriza junto — deixar o ramo de oito numérico faria o matcher parar de casar
   * exatamente as empresas novas.
   */
  test('o matcher de perfil abre a raiz de oito junto com o documento inteiro', () => {
    const sql = requireCheck(readSchemaChecks(), 'cte_emission_profile_matchers_tax_id_check')

    expect(sql).toContain(CNPJ_ROOT_PATTERN)
    expect(sql).toContain(CNPJ_PATTERN)
  })

  /**
   * O documento do cliente da fatura sempre aceitou de onze a catorze dígitos. A migration é
   * aditiva: o intervalo numérico fica onde está, e o ramo alfanumérico entra ao lado — apertá-lo
   * agora rejeitaria linha já gravada.
   */
  test('o documento do cliente da fatura ganha o ramo alfanumérico sem perder o numérico', () => {
    const sql = requireCheck(readSchemaChecks(), 'billing_invoices_customer_document_check')

    expect(sql).toContain('^[0-9]{11,14}$')
    expect(sql).toContain(CNPJ_PATTERN)
  })

  test('a chave de acesso abre exatamente as doze posições do CNPJ do emitente', () => {
    const checks = readSchemaChecks()

    for (const name of ACCESS_KEY_CHECK_NAMES) {
      expect(requireCheck(checks, name)).toContain(ACCESS_KEY_PATTERN)
    }
  })

  test('o CPF continua com onze dígitos e sem letra nenhuma', () => {
    const checks = readSchemaChecks()

    for (const name of CPF_ONLY_CHECK_NAMES) {
      const sql = requireCheck(checks, name)

      expect(sql).toContain(CPF_PATTERN)
      expect(sql).not.toContain('A-Z')
    }
  })

  /**
   * A rede que pega o que a lista acima não conhece: tabela nova, coluna nova, CHECK esquecido numa
   * migration futura. `[0-9]{14}` e `[0-9]{44}` só existem neste schema para CNPJ e para chave de
   * acesso — nenhum outro campo tem esses comprimentos.
   */
  test('nenhum CHECK do schema descreve mais CNPJ ou chave como só dígito', () => {
    const offenders = readSchemaChecks()
      .filter(
        (check) =>
          check.sql.includes(NUMERIC_ONLY_CNPJ) || check.sql.includes(NUMERIC_ONLY_ACCESS_KEY),
      )
      .map((check) => `${check.table}.${check.name}`)

    expect(offenders).toEqual([])
  })
})
