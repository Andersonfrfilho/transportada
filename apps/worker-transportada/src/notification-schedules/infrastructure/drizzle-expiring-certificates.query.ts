/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, lte } from 'drizzle-orm'

import { digitalCertificates } from '../../database/cte-issuance-execution.schema.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

const ACTIVE_CERTIFICATE_STATUS = 'active'

export type ExpiringCertificate = {
  readonly companyId: string
  readonly createdByUserId: string
  readonly expiresAt: Date
  readonly id: string
}

/**
 * Certificado **ativo** que vence até `until`, inclusive o que já venceu. O trocado ou aposentado
 * (`retired`) não entra: o novo já está valendo. Aviso de vencido sai uma vez só, por causa da
 * chave de deduplicação, então manter o vencido na consulta não repete nada.
 */
export function createExpiringCertificatesQuery(database: Database) {
  return async function selectExpiringCertificates(input: {
    readonly until: Date
  }): Promise<readonly ExpiringCertificate[]> {
    return await database
      .select({
        companyId: digitalCertificates.companyId,
        createdByUserId: digitalCertificates.createdByUserId,
        expiresAt: digitalCertificates.expiresAt,
        id: digitalCertificates.id,
      })
      .from(digitalCertificates)
      .where(
        and(
          eq(digitalCertificates.status, ACTIVE_CERTIFICATE_STATUS),
          lte(digitalCertificates.expiresAt, input.until),
        ),
      )
  }
}
