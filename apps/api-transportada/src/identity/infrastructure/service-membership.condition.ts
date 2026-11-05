/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'

import { SERVICE_COMPANY_ROLES, userCompanyMemberships } from '../../database/identity.schema.js'

/**
 * ADR-0047, emenda 2026-11-05: a membership sintética de um serviço (papel `automation` ou
 * `cnh-picture-service`) fica fora de toda escrita em lote de papel, grupo e permissão — como o id de
 * outra empresa, ela some do lote em vez de virar erro.
 */
export function membershipHasNoServiceRole(): SQL<boolean> {
  return sql<boolean>`not exists (select 1 from membership_roles where membership_roles.membership_id = ${userCompanyMemberships.id} and membership_roles.role in (${sql.join(
    SERVICE_COMPANY_ROLES.map((role) => sql`${role}`),
    sql`, `,
  )}))`
}
