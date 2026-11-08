/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { desc, eq } from 'drizzle-orm'

import { nfeXmlReceipts } from '../../database/database.schema.js'
import type { NfeXmlReceiptReadPort } from '../application/list-nfe-xml-receipts.use-case.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export function createDrizzleNfeXmlReceiptReadRepository(
  database: Database,
): NfeXmlReceiptReadPort {
  return {
    async listRecent({ companyId, limit }) {
      const rows = await database
        .select()
        .from(nfeXmlReceipts)
        .where(eq(nfeXmlReceipts.companyId, companyId))
        .orderBy(desc(nfeXmlReceipts.createdAt), desc(nfeXmlReceipts.id))
        .limit(limit)
      return rows.map((row) => ({
        channel: row.channel,
        createdAt: row.createdAt.toISOString(),
        filesCount: row.filesCount,
        id: row.id,
        importId: row.importId,
        lastErrorCode: row.lastErrorCode,
        rejectReason: row.rejectReason,
        sender: row.sender,
        status: row.status,
      }))
    },
  }
}
