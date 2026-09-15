/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 150 T402: o modelo de e-mail é dado da empresa. Estas asserções fixam a âncora de tenant no
 * schema (FK para `companies`, único `(company_id, id)` para a FK composta da mensagem) e nas
 * consultas do repositório (`company_id` na mesma condição do id, nunca conferência à parte).
 */
import { and } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, test } from 'bun:test'

import {
  contractorMailMessages,
  contractorMailTemplates,
} from '../../src/database/database.schema.js'
import { foreignKeys, uniqueColumnsByName } from '../fiscal-schema/support.js'
import {
  buildContractorMailTemplateFilters,
  buildContractorMailTemplateListFilters,
} from '../../src/contractor-mail/infrastructure/drizzle-contractor-mail-template.repository.js'

const dialect = new PgDialect()

describe('contractor mail template tenant safety (spec 150 T402)', () => {
  test('anchors the template to a company and exposes (company_id, id) for composite keys', () => {
    expect(foreignKeys(contractorMailTemplates)).toContainEqual({
      columns: ['company_id'],
      foreignColumns: ['id'],
      foreignTable: 'companies',
      name: 'contractor_mail_templates_company_id_companies_id_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
    expect(uniqueColumnsByName(contractorMailTemplates)).toMatchObject({
      contractor_mail_templates_company_id_id_unique: ['company_id', 'id'],
    })
  })

  /** A mensagem só aponta para modelo da própria empresa: FK composta, nunca pelo id sozinho. */
  test('the message reaches its template through the tenant', () => {
    expect(foreignKeys(contractorMailMessages)).toContainEqual({
      columns: ['company_id', 'template_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'contractor_mail_templates',
      name: 'contractor_mail_messages_template_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
  })

  test('the template lookup filters by company id and template id together', () => {
    const companyId = '00000000-0000-4000-8000-000000000a01'
    const templateId = '00000000-0000-4000-8000-000000000a02'

    const query = dialect.sqlToQuery(
      and(...buildContractorMailTemplateFilters({ companyId, templateId }))!,
    )

    expect(query.sql).toContain('"contractor_mail_templates"."company_id" = $')
    expect(query.sql).toContain('"contractor_mail_templates"."id" = $')
    expect(query.params).toEqual([companyId, templateId])
  })

  test('the template listing always filters by company id, with or without mail type', () => {
    const companyId = '00000000-0000-4000-8000-000000000a03'

    const all = dialect.sqlToQuery(and(...buildContractorMailTemplateListFilters({ companyId }))!)
    expect(all.sql).toContain('"contractor_mail_templates"."company_id" = $')
    expect(all.params).toEqual([companyId])

    const byType = dialect.sqlToQuery(
      and(
        ...buildContractorMailTemplateListFilters({ companyId, mailType: 'address_correction' }),
      )!,
    )
    expect(byType.sql).toContain('"contractor_mail_templates"."company_id" = $')
    expect(byType.sql).toContain('"contractor_mail_templates"."mail_type" = $')
    expect(byType.params).toEqual([companyId, 'address_correction'])
  })
})
