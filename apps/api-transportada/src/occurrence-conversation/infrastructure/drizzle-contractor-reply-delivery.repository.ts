/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248 T4.6: a unidade de trabalho da entrega do boleto ao motorista. Toda leitura leva `company_id`.
 */
import { and, eq } from 'drizzle-orm'

import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { occurrenceContractorReplies } from '../../database/database.schema.js'
import { findTripOccurrenceFeedItem } from '../../trips/infrastructure/trip-occurrence-feed.query.js'
import type { ContractorReplyDeliveryUnitOfWorkPort } from '../application/deliver-contractor-reply-to-driver.use-case.js'
import { describeOccurrenceLabel } from '../domain/occurrence-label.policy.js'
import { deliverContractorReplyToDriver } from './contractor-reply-driver-delivery.support.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export function createDrizzleContractorReplyDeliveryUnitOfWork(
  database: Database,
): ContractorReplyDeliveryUnitOfWorkPort {
  return {
    execute: (operation) =>
      database.transaction((transaction) =>
        operation({
          deliver: (params) => deliverContractorReplyToDriver(transaction, params),
          async findOccurrenceLabel({ companyId, occurrenceId }) {
            const item = await findTripOccurrenceFeedItem(transaction, { companyId, occurrenceId })
            return item === null ? null : describeOccurrenceLabel(item)
          },
          async findReplyId({ companyId, occurrenceId }) {
            const [reply] = await transaction
              .select({ id: occurrenceContractorReplies.id })
              .from(occurrenceContractorReplies)
              .where(
                and(
                  eq(occurrenceContractorReplies.companyId, companyId),
                  eq(occurrenceContractorReplies.occurrenceId, occurrenceId),
                ),
              )
              .limit(1)
            return reply?.id ?? null
          },
        }),
      ),
  }
}
