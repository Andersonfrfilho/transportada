/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 286 (RF6): lê o modelo do e-mail de correção de endereço no módulo de notificação (`notification.templates`).
 * O módulo é só o depósito: vale a versão **ativa mais alta** de `(empresa, chave, e-mail, pt-BR)`.
 *
 * ⚠️ SQL parametrizado, não o `templates` exportado do pacote: o pacote traz a própria instância do drizzle-orm,
 * e uma tabela dele dentro de uma consulta nossa não compõe (mesma razão da 271).
 */
import { sql } from 'drizzle-orm'

import { NOTIFICATION_SCHEMA } from '../../database/notification-migration.service.js'
import type { TripQueryable } from '../../trips/infrastructure/trip-queryable.type.js'
import type { AddressCorrectionMailTemplate } from '../application/address-correction-mail.port.js'
import {
  ADDRESS_CORRECTION_MAIL_TEMPLATE_CHANNEL,
  ADDRESS_CORRECTION_MAIL_TEMPLATE_KEY,
  ADDRESS_CORRECTION_MAIL_TEMPLATE_LOCALE,
} from '../domain/address-correction-mail-template.constant.js'

type TemplateRow = {
  readonly body: string
  readonly key: string
  readonly subject: null | string
  readonly version: number | string
}

export async function findActiveAddressCorrectionMailTemplate(
  queryable: TripQueryable,
  params: { readonly companyId: string },
): Promise<AddressCorrectionMailTemplate | undefined> {
  const rows = await queryable.execute<TemplateRow>(sql`
    select t.key, t.version, t.subject, t.body
    from ${sql.identifier(NOTIFICATION_SCHEMA)}.templates as t
    where t.company_id = ${params.companyId}::uuid
      and t.key = ${ADDRESS_CORRECTION_MAIL_TEMPLATE_KEY}
      and t.channel = ${ADDRESS_CORRECTION_MAIL_TEMPLATE_CHANNEL}
      and t.locale = ${ADDRESS_CORRECTION_MAIL_TEMPLATE_LOCALE}
      and t.active
    order by t.version desc
    limit 1`)
  const [row] = rows
  if (row === undefined) return undefined
  return {
    body: row.body,
    key: row.key,
    subject: row.subject ?? '',
    version: Number(row.version),
  }
}
