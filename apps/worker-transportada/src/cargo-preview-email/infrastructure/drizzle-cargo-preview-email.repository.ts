/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.6: o banco do ramo de e-mail. Toda leitura leva `company_id` na MESMA condição do hash
 * ou da mensagem — o token de uma empresa nunca abre o perfil de outra.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, count, eq, gte, inArray } from 'drizzle-orm'

import { cargoPreviewEmailIntakes } from '../../database/cargo-preview-email-intake.schema.js'
import { contractorReceivingProfiles } from '../../database/cargo-preview-trail.schema.js'
import type {
  CargoPreviewEmailRepositoryPort,
  PreviewProfileRecord,
  RejectionRecord,
} from '../application/cargo-preview-email.types.js'
import {
  CARGO_PREVIEW_EMAIL_OUTCOME,
  CARGO_PREVIEW_ORIGINAL_SENDER_VERIFICATION,
} from '../../shared/cargo-preview.constant.js'
import { createPreviewFromEmail } from './cargo-preview-email-create.writer.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export /** Exportado para o contrato de tenant: empresa e hash na mesma condição. */
const buildCargoPreviewEmailProfileFilters = (input: {
  readonly companyId: string
  readonly tokenHashes: readonly string[]
}) => [
  eq(contractorReceivingProfiles.companyId, input.companyId),
  inArray(contractorReceivingProfiles.previewInboundTokenHash, [...input.tokenHashes]),
]

export function createDrizzleCargoPreviewEmailRepository(
  database: Database,
): CargoPreviewEmailRepositoryPort {
  return {
    async countRecentIntakes({ companyId, contractorId, since }) {
      const [row] = await database
        .select({ total: count() })
        .from(cargoPreviewEmailIntakes)
        .where(
          and(
            eq(cargoPreviewEmailIntakes.companyId, companyId),
            eq(cargoPreviewEmailIntakes.contractorId, contractorId),
            gte(cargoPreviewEmailIntakes.receivedAt, since),
          ),
        )
      return row?.total ?? 0
    },

    createPreview: (record) => createPreviewFromEmail(database, record),

    async findProfilesByTokenHashes(input) {
      if (input.tokenHashes.length === 0) return []
      const rows = await database
        .select({
          contractorId: contractorReceivingProfiles.contractorId,
          forwarderAllowlist: contractorReceivingProfiles.previewForwarderAllowlist,
          isEnabled: contractorReceivingProfiles.isEnabled,
          previewColumnMap: contractorReceivingProfiles.previewColumnMap,
          previewEnabled: contractorReceivingProfiles.previewEnabled,
          senderAllowlist: contractorReceivingProfiles.previewSenderAllowlist,
        })
        .from(contractorReceivingProfiles)
        .where(and(...buildCargoPreviewEmailProfileFilters(input)))
      return rows.map(
        (row): PreviewProfileRecord => ({
          contractorId: row.contractorId,
          forwarderAllowlist: row.forwarderAllowlist,
          isPreviewReady: row.isEnabled && row.previewEnabled && row.previewColumnMap !== null,
          senderAllowlist: row.senderAllowlist,
        }),
      )
    },

    async hasIntake({ companyId, providerEmailId }) {
      const [row] = await database
        .select({ id: cargoPreviewEmailIntakes.id })
        .from(cargoPreviewEmailIntakes)
        .where(
          and(
            eq(cargoPreviewEmailIntakes.companyId, companyId),
            eq(cargoPreviewEmailIntakes.providerEmailId, providerEmailId),
          ),
        )
        .limit(1)
      return row !== undefined
    },

    async recordRejection(record: RejectionRecord) {
      await database
        .insert(cargoPreviewEmailIntakes)
        .values({
          companyId: record.companyId,
          contractorId: record.contractorId,
          forwarderDkimResult: record.dkimResult ?? null,
          originalSenderVerification: record.isOriginalSenderRead
            ? CARGO_PREVIEW_ORIGINAL_SENDER_VERIFICATION.unverified
            : null,
          outcome: CARGO_PREVIEW_EMAIL_OUTCOME.rejected,
          providerEmailId: record.providerEmailId,
          reasonCode: record.reason,
          receivedAt: record.receivedAt,
        })
        .onConflictDoNothing({
          target: [cargoPreviewEmailIntakes.companyId, cargoPreviewEmailIntakes.providerEmailId],
        })
    },
  }
}
