/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, eq, isNull } from 'drizzle-orm'
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { fleetDriverAttachments } from '../../database/aggregate-attachment.schema.js'
import type { AttachmentWriteBackPort } from '../application/extract-attachment-fields.port.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export function createDrizzleFleetDriverAttachmentWriteBackRepository(
  database: Database,
): AttachmentWriteBackPort {
  return {
    /**
     * `extracted_at` fecha a leitura mesmo quando nada foi reconhecido. `decision is null` no `where`:
     * leitura que chega **depois** de o operador decidir não pode devolver o dado pessoal que a
     * decisão acabou de descartar (e o CHECK da tabela recusaria a escrita de qualquer jeito).
     */
    async saveExtractedFields({ attachmentId, companyId, extractedFields }) {
      await database
        .update(fleetDriverAttachments)
        .set({ extractedAt: new Date(), extractedFields })
        .where(
          and(
            eq(fleetDriverAttachments.companyId, companyId),
            eq(fleetDriverAttachments.id, attachmentId),
            isNull(fleetDriverAttachments.decision),
          ),
        )
    },
  }
}
