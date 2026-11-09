/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import type {
  NfeXmlAllowedDomainPort,
  NfeXmlAllowedDomainView,
} from '../application/manage-nfe-xml-allowed-domains.use-case.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

type Row = {
  contractor_id: string | null
  contractor_name: string | null
  created_at: Date | string
  domain: string
  id: string
  status: 'active' | 'inactive'
}

const SELECT = sql`
  select d.id, d.domain, d.status, d.contractor_id, d.created_at, c.display_name as contractor_name
  from nfe_xml_allowed_email_domains d
  left join contractors c on c.id = d.contractor_id and c.company_id = d.company_id
`

function toView(row: Row): NfeXmlAllowedDomainView {
  return {
    contractorId: row.contractor_id,
    contractorName: row.contractor_name,
    createdAt: new Date(row.created_at).toISOString(),
    domain: row.domain,
    id: row.id,
    status: row.status,
  }
}

export function createDrizzleNfeXmlAllowedDomainRepository(
  database: Database,
): NfeXmlAllowedDomainPort {
  return {
    async list({ companyId }) {
      const rows = (await database.execute(
        sql`${SELECT} where d.company_id = ${companyId}::uuid order by d.domain`,
      )) as unknown as Row[]
      return rows.map(toView)
    },

    async release({ companyId, contractorId, domain }) {
      const owned = (await database.execute(
        sql`select 1 as ok from contractors where id = ${contractorId}::uuid and company_id = ${companyId}::uuid`,
      )) as unknown as unknown[]
      if (owned.length === 0) return undefined
      // Domínio que já existe é reativado e passa a pertencer ao contratante escolhido.
      const saved = (await database.execute(sql`
        insert into nfe_xml_allowed_email_domains (company_id, domain, contractor_id, status)
        values (${companyId}::uuid, ${domain}, ${contractorId}::uuid, 'active')
        on conflict (company_id, domain) do update set status = 'active', contractor_id = excluded.contractor_id
        returning id
      `)) as unknown as { id: string }[]
      const id = saved[0]?.id
      if (id === undefined) return undefined
      const rows = (await database.execute(
        sql`${SELECT} where d.id = ${id}::uuid and d.company_id = ${companyId}::uuid`,
      )) as unknown as Row[]
      return rows[0] === undefined ? undefined : toView(rows[0])
    },

    async setStatus({ companyId, id, status }) {
      const updated = (await database.execute(sql`
        update nfe_xml_allowed_email_domains set status = ${status}
        where id = ${id}::uuid and company_id = ${companyId}::uuid returning id
      `)) as unknown as { id: string }[]
      if (updated[0] === undefined) return undefined
      const rows = (await database.execute(
        sql`${SELECT} where d.id = ${id}::uuid and d.company_id = ${companyId}::uuid`,
      )) as unknown as Row[]
      return rows[0] === undefined ? undefined : toView(rows[0])
    },
  }
}
