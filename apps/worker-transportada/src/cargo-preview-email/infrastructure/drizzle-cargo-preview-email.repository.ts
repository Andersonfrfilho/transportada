/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.6: o banco do ramo de e-mail. Toda leitura leva `company_id` na MESMA condição do hash
 * ou da mensagem — o token de uma empresa nunca abre o perfil de outra.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, gte, inArray, sql } from 'drizzle-orm'

import { cargoPreviewEmailIntakes } from '../../database/cargo-preview-email-intake.schema.js'
import { contractorReceivingProfiles } from '../../database/cargo-preview-trail.schema.js'
import type {
  CargoPreviewEmailRepositoryPort,
  PreviewProfileRecord,
  RateLimitedRecord,
  RejectionRecord,
} from '../application/cargo-preview-email.types.js'
import { DKIM_ALIGNMENT_RESULT } from '../../contractor-mail/domain/dkim-alignment.policy.js'
import {
  CARGO_PREVIEW_EMAIL_OUTCOME,
  CARGO_PREVIEW_ORIGINAL_SENDER_VERIFICATION,
} from '../../shared/cargo-preview.constant.js'
import {
  PREVIEW_EMAIL_REJECTION,
  PREVIEW_EMAIL_UNPROVEN_REJECTIONS,
} from '../domain/cargo-preview-email.constant.js'
import { createPreviewFromEmail } from './cargo-preview-email-create.writer.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

const RATE_LIMIT_LOCK_PREFIX = 'cargo-preview-email-rate-limited'

/** Exportado para o contrato de tenant: empresa e hash na mesma condição. */
export const buildCargoPreviewEmailProfileFilters = (input: {
  readonly companyId: string
  readonly tokenHashes: readonly string[]
}) => [
  eq(contractorReceivingProfiles.companyId, input.companyId),
  inArray(contractorReceivingProfiles.previewInboundTokenHash, [...input.tokenHashes]),
]

/** O corte da janela é o relógio do banco: a data do e-mail é do remetente, e o remetente não escolhe a janela. */
const windowStart = (windowSeconds: number) => sql`now() - make_interval(secs => ${windowSeconds})`

export function createDrizzleCargoPreviewEmailRepository(
  database: Database,
): CargoPreviewEmailRepositoryPort {
  return {
    async countRecentIntakes({ companyId, contractorId, windowSeconds }) {
      const result = cargoPreviewEmailIntakes.forwarderDkimResult
      const reason = cargoPreviewEmailIntakes.reasonCode
      const unproven = sql.join(
        PREVIEW_EMAIL_UNPROVEN_REJECTIONS.map((code) => sql`${code}`),
        sql`, `,
      )
      const isAuthenticated = sql`${result} = ${DKIM_ALIGNMENT_RESULT.ALIGNED} and (${reason} is null or ${reason} not in (${unproven}))`
      const isUnauthenticated = sql`(${result} is distinct from ${DKIM_ALIGNMENT_RESULT.ALIGNED} or ${reason} in (${unproven})) and ${reason} is distinct from ${PREVIEW_EMAIL_REJECTION.rateLimited}`
      const [row] = await database
        .select({
          authenticated: sql<number>`count(*) filter (where ${isAuthenticated})`.mapWith(Number),
          unauthenticated: sql<number>`count(*) filter (where ${isUnauthenticated})`.mapWith(
            Number,
          ),
        })
        .from(cargoPreviewEmailIntakes)
        .where(
          and(
            eq(cargoPreviewEmailIntakes.companyId, companyId),
            eq(cargoPreviewEmailIntakes.contractorId, contractorId),
            gte(cargoPreviewEmailIntakes.recordedAt, windowStart(windowSeconds)),
          ),
        )
      return { authenticated: row?.authenticated ?? 0, unauthenticated: row?.unauthenticated ?? 0 }
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

    async recordRateLimited(record: RateLimitedRecord) {
      await database.transaction(async (transaction) => {
        const lockKey = `${RATE_LIMIT_LOCK_PREFIX}:${record.companyId}:${record.contractorId}`
        await transaction.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`,
        )
        const [marker] = await transaction
          .select({ id: cargoPreviewEmailIntakes.id })
          .from(cargoPreviewEmailIntakes)
          .where(
            and(
              eq(cargoPreviewEmailIntakes.companyId, record.companyId),
              eq(cargoPreviewEmailIntakes.contractorId, record.contractorId),
              eq(cargoPreviewEmailIntakes.reasonCode, PREVIEW_EMAIL_REJECTION.rateLimited),
              gte(cargoPreviewEmailIntakes.recordedAt, windowStart(record.windowSeconds)),
            ),
          )
          .limit(1)
        if (marker !== undefined) return
        await transaction
          .insert(cargoPreviewEmailIntakes)
          .values({
            companyId: record.companyId,
            contractorId: record.contractorId,
            outcome: CARGO_PREVIEW_EMAIL_OUTCOME.rejected,
            providerEmailId: record.providerEmailId,
            reasonCode: PREVIEW_EMAIL_REJECTION.rateLimited,
            receivedAt: record.receivedAt,
          })
          .onConflictDoNothing({
            target: [cargoPreviewEmailIntakes.companyId, cargoPreviewEmailIntakes.providerEmailId],
          })
      })
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
