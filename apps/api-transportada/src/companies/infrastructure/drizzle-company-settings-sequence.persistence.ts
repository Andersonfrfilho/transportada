/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, desc, eq } from 'drizzle-orm'

import { fiscalSequences } from '../../database/database.schema.js'
import type { CompanySettingsInput } from '../application/company-settings.port.js'
import {
  CompanySettingsVersionConflictError,
  FiscalSequenceLockedError,
} from '../domain/company-settings.error.js'
import type { CompanySettingsTransaction } from './drizzle-company-settings.types.js'

type SequenceState = {
  readonly id: string
  readonly lastReservedNumber: bigint | null
  readonly nextNumber: bigint
  readonly series: bigint
  readonly version: bigint
}

export async function persistTargetSequence(
  transaction: CompanySettingsTransaction,
  companyId: string,
  settings: CompanySettingsInput,
): Promise<bigint> {
  const current = await findTargetSequence(transaction, companyId, settings)
  const changed =
    current !== null &&
    (current.series !== settings.cte.series || current.nextNumber !== settings.cte.nextNumber)
  if (current?.lastReservedNumber !== null && changed) {
    throw new FiscalSequenceLockedError()
  }
  if (current === null) return await insertSequence(transaction, companyId, settings)
  if (!changed) return current.version
  return await updateSequence(transaction, companyId, settings, current)
}

async function findTargetSequence(
  transaction: CompanySettingsTransaction,
  companyId: string,
  settings: CompanySettingsInput,
): Promise<SequenceState | null> {
  const [sequence] = await transaction
    .select({
      id: fiscalSequences.id,
      lastReservedNumber: fiscalSequences.lastReservedNumber,
      nextNumber: fiscalSequences.nextNumber,
      series: fiscalSequences.series,
      version: fiscalSequences.version,
    })
    .from(fiscalSequences)
    .where(
      and(
        eq(fiscalSequences.companyId, companyId),
        eq(fiscalSequences.environment, settings.cte.environment),
        eq(fiscalSequences.model, 'cte'),
      ),
    )
    .orderBy(desc(fiscalSequences.updatedAt), desc(fiscalSequences.id))
    .limit(1)
    .for('update')
  return sequence ?? null
}

async function insertSequence(
  transaction: CompanySettingsTransaction,
  companyId: string,
  settings: CompanySettingsInput,
): Promise<bigint> {
  const [sequence] = await transaction
    .insert(fiscalSequences)
    .values({
      companyId,
      environment: settings.cte.environment,
      model: 'cte',
      nextNumber: settings.cte.nextNumber,
      series: settings.cte.series,
    })
    .returning({ version: fiscalSequences.version })
  if (sequence === undefined) {
    throw new Error('Company fiscal sequence could not be persisted')
  }
  return sequence.version
}

async function updateSequence(
  transaction: CompanySettingsTransaction,
  companyId: string,
  settings: CompanySettingsInput,
  current: SequenceState,
): Promise<bigint> {
  const [sequence] = await transaction
    .update(fiscalSequences)
    .set({
      nextNumber: settings.cte.nextNumber,
      series: settings.cte.series,
      updatedAt: new Date(),
      version: current.version + 1n,
    })
    .where(
      and(
        eq(fiscalSequences.companyId, companyId),
        eq(fiscalSequences.id, current.id),
        eq(fiscalSequences.version, current.version),
      ),
    )
    .returning({ version: fiscalSequences.version })
  if (sequence === undefined) {
    throw new CompanySettingsVersionConflictError()
  }
  return sequence.version
}
