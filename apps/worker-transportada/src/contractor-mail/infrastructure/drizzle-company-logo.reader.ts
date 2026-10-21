/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export type CompanyLogoRecord = {
  readonly contentBase64: string
  readonly mimeType: 'image/jpeg' | 'image/png'
}

/** Spec 272 (ADR-0110 §9): o logo da empresa da mensagem, lido de `company_logos` (a API grava; o worker só lê). */
export type CompanyLogoReader = {
  find(input: { readonly companyId: string }): Promise<CompanyLogoRecord | undefined>
}

export function createDrizzleCompanyLogoReader(database: Database): CompanyLogoReader {
  return {
    async find({ companyId }) {
      const rows = (await database.execute(
        sql`select content_base64, mime_type from company_logos
            where company_id = ${companyId}::uuid
            limit 1`,
      )) as unknown as readonly { content_base64: string; mime_type: string }[]
      const row = rows[0]
      if (row === undefined) return undefined
      if (row.mime_type !== 'image/jpeg' && row.mime_type !== 'image/png') return undefined
      return { contentBase64: row.content_base64, mimeType: row.mime_type }
    },
  }
}
