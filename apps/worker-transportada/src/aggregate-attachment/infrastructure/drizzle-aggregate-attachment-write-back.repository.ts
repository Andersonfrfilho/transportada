/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, eq } from 'drizzle-orm'
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { aggregateApplicationAttachments } from '../../database/aggregate-attachment.schema.js'
import type { AttachmentWriteBackPort } from '../application/extract-attachment-fields.port.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export function createDrizzleAggregateAttachmentWriteBackRepository(
  database: Database,
): AttachmentWriteBackPort {
  return {
    /** `company_id` no `where` mesmo com o id sendo único: o filtro por tenant é por construção. */
    async saveExtractedFields({ attachmentId, companyId, extractedFields }) {
      await database
        .update(aggregateApplicationAttachments)
        .set({ extractedFields, updatedAt: new Date() })
        .where(
          and(
            eq(aggregateApplicationAttachments.companyId, companyId),
            eq(aggregateApplicationAttachments.id, attachmentId),
          ),
        )
    },
  }
}
