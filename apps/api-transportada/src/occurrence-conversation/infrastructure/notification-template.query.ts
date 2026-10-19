/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 271 (ADR-0108, D1): lê os modelos de e-mail do módulo de notificação (`notification.templates`). O módulo
 * é só o depósito: a identidade é `(empresa, chave, canal, idioma, versão)` e vale a versão **ativa mais alta**.
 *
 * ⚠️ SQL parametrizado, não o `templates` exportado do pacote: o pacote traz a própria instância do drizzle-orm,
 * e uma tabela dele dentro de uma consulta nossa não compõe. O worker lê pela mesma forma.
 */
import { STANDARD_EMAIL_TEMPLATE_KEY } from '@adatechnology/notification-contracts'
import { sql } from 'drizzle-orm'

import { NOTIFICATION_SCHEMA } from '../../database/notification-migration.service.js'
import type { TripQueryable } from '../../trips/infrastructure/trip-queryable.type.js'
import {
  OCCURRENCE_CONTRACTOR_MAIL_CHANNEL,
  OCCURRENCE_CONTRACTOR_MAIL_LOCALE,
} from '../domain/occurrence-contractor-mail.constant.js'

export type ActiveContractorTemplate = {
  readonly body: string
  readonly key: string
  readonly subject: string
  readonly version: number
}

type TemplateRow = {
  readonly body: string
  readonly key: string
  readonly subject: null | string
  readonly version: number
}

/**
 * A versão ativa mais alta de cada chave pedida, e-mail `pt-BR`, **da empresa** — uma consulta para N chaves.
 * Chave sem versão ativa (ou de outra empresa) não aparece no mapa.
 */
function toActiveTemplate(row: TemplateRow): ActiveContractorTemplate {
  return { body: row.body, key: row.key, subject: row.subject ?? '', version: Number(row.version) }
}

export async function readActiveContractorTemplates(
  queryable: TripQueryable,
  params: { readonly companyId: string; readonly keys: readonly string[] },
): Promise<ReadonlyMap<string, ActiveContractorTemplate>> {
  const keys = [...new Set(params.keys)]
  if (keys.length === 0) return new Map()
  const rows = await queryable.execute<TemplateRow>(sql`
    select distinct on (t.key) t.key, t.version, t.subject, t.body
    from ${sql.identifier(NOTIFICATION_SCHEMA)}.templates as t
    where t.company_id = ${params.companyId}::uuid
      and t.key in (${sql.join(
        keys.map((key) => sql`${key}`),
        sql`, `,
      )})
      and t.channel = ${OCCURRENCE_CONTRACTOR_MAIL_CHANNEL}
      and t.locale = ${OCCURRENCE_CONTRACTOR_MAIL_LOCALE}
      and t.active
    order by t.key, t.version desc`)
  return new Map(rows.map((row) => [row.key, toActiveTemplate(row)]))
}

/**
 * Os modelos da lista do editor: e-mail `pt-BR` ativos da empresa — a versão ativa mais alta de cada chave —, por chave.
 * Só o modelo padrão (`notification.standard-email`, spec 274) fica de fora: ele tem tela própria. As outras chaves do
 * sistema voltam à lista como antes, e a política as marca `usable: false` / `system_key`.
 */
export async function listActiveContractorTemplates(
  queryable: TripQueryable,
  params: { readonly companyId: string },
): Promise<readonly ActiveContractorTemplate[]> {
  const rows = await queryable.execute<TemplateRow>(sql`
    select distinct on (t.key) t.key, t.version, t.subject, t.body
    from ${sql.identifier(NOTIFICATION_SCHEMA)}.templates as t
    where t.company_id = ${params.companyId}::uuid
      and t.channel = ${OCCURRENCE_CONTRACTOR_MAIL_CHANNEL}
      and t.locale = ${OCCURRENCE_CONTRACTOR_MAIL_LOCALE}
      and t.active
      and t.key <> ${STANDARD_EMAIL_TEMPLATE_KEY}
    order by t.key, t.version desc`)
  return rows.map(toActiveTemplate)
}

export async function findActiveContractorTemplate(
  queryable: TripQueryable,
  params: { readonly companyId: string; readonly key: string },
): Promise<ActiveContractorTemplate | null> {
  const templates = await readActiveContractorTemplates(queryable, {
    companyId: params.companyId,
    keys: [params.key],
  })
  return templates.get(params.key) ?? null
}
