/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 285: a automação do fluxo semanal de um contratante (a Spani, hoje). Tudo o que o fluxo precisa
 * saber mora aqui, como configuração — nenhum nome ou CNPJ de contratante vai para o código: interruptor
 * de ligar/desligar, prazo da fatura, tipo de XML que segue no email, tamanho das partes, destinatários e a
 * cidade da NFS-e. Nasce desligada: ligar é decisão explícita de quem administra.
 *
 * ⚠️ `updated_by_user_id` fica sem chave estrangeira de propósito, como nas outras configurações: é rastro
 * de quem decidiu, e apagar o usuário não pode apagar o rastro nem travar a linha.
 */
import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  foreignKey,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

import { companies } from './identity.schema.js'

export const CONTRACTOR_AUTOMATION_XML_KINDS = ['cte'] as const
export type ContractorAutomationXmlKind = (typeof CONTRACTOR_AUTOMATION_XML_KINDS)[number]

export const contractorAutomations = pgTable(
  'contractor_automations',
  {
    id: uuid().primaryKey().defaultRandom(),
    companyId: uuid('company_id').notNull(),
    name: text().notNull(),
    enabled: boolean().notNull().default(false),
    /** Prazo do vencimento da fatura, em dias corridos a partir da geração. */
    billingDueDays: integer('billing_due_days').notNull().default(15),
    /** Só os XMLs desse tipo seguem no email. Hoje só CT-e emitido. */
    xmlKind: text('xml_kind').$type<ContractorAutomationXmlKind>().notNull().default('cte'),
    /** Quantos XMLs por email; o email avisa "parte N de M". */
    partSize: integer('part_size').notNull().default(100),
    /** Quem recebe o envio, em minúsculas e sem repetição. */
    recipients: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** Cidade cuja NFS-e acompanha o envio (nome como vem na nota). Nulo = sem NFS-e. */
    nfseCity: text('nfse_city'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    updatedByUserId: uuid('updated_by_user_id'),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'contractor_automations_company_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('contractor_automations_company_name_unique').on(table.companyId, table.name),
    check('contractor_automations_name_check', sql`length(btrim(${table.name})) between 1 and 120`),
    check(
      'contractor_automations_billing_due_days_check',
      sql`${table.billingDueDays} between 1 and 120`,
    ),
    check('contractor_automations_xml_kind_check', sql`${table.xmlKind} in ('cte')`),
    check('contractor_automations_part_size_check', sql`${table.partSize} between 1 and 100`),
    check('contractor_automations_recipients_check', sql`cardinality(${table.recipients}) <= 50`),
  ],
)
