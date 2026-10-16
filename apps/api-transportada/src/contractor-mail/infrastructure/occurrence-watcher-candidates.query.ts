/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 267: as duas listas de responsáveis com o endereço de cada um resolvido em lote, para o envio e a prévia.
 * Roda no banco ou dentro da transação do envio.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq } from 'drizzle-orm'

import {
  companyOccurrenceWatchers,
  contractorOccurrenceWatchers,
} from '../../database/database.schema.js'
import type {
  OccurrenceWatcherRow,
  OccurrenceWatcherScope,
} from '../application/occurrence-watcher.port.js'
import type { OccurrenceWatcherCandidate } from '../domain/occurrence-watcher.policy.js'
import { findOccurrenceWatcherUsers } from './occurrence-watcher-directory.query.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]

export async function readOccurrenceWatcherRows(
  executor: Database | Transaction,
  scope: OccurrenceWatcherScope,
): Promise<readonly OccurrenceWatcherRow[]> {
  if (scope.kind === 'company') {
    return executor
      .select({
        status: companyOccurrenceWatchers.status,
        userId: companyOccurrenceWatchers.userId,
      })
      .from(companyOccurrenceWatchers)
      .where(eq(companyOccurrenceWatchers.companyId, scope.companyId))
  }
  return executor
    .select({
      status: contractorOccurrenceWatchers.status,
      userId: contractorOccurrenceWatchers.userId,
    })
    .from(contractorOccurrenceWatchers)
    .where(
      and(
        eq(contractorOccurrenceWatchers.companyId, scope.companyId),
        eq(contractorOccurrenceWatchers.contractorId, scope.contractorId),
      ),
    )
}

export async function loadEffectiveWatcherCandidates(
  executor: Database | Transaction,
  params: { readonly companyId: string; readonly contractorId: string },
): Promise<{
  readonly company: readonly OccurrenceWatcherCandidate[]
  readonly contractor: readonly OccurrenceWatcherCandidate[]
}> {
  const [companyRows, contractorRows] = await Promise.all([
    readOccurrenceWatcherRows(executor, { companyId: params.companyId, kind: 'company' }),
    readOccurrenceWatcherRows(executor, { ...params, kind: 'contractor' }),
  ])
  const userIds = [...new Set([...companyRows, ...contractorRows].map((row) => row.userId))]
  const users = new Map(
    (await findOccurrenceWatcherUsers(executor, { companyId: params.companyId, userIds })).map(
      (user) => [user.userId, user],
    ),
  )
  const toCandidate = (row: OccurrenceWatcherRow): OccurrenceWatcherCandidate => {
    const user = users.get(row.userId)
    return {
      address: user?.canResolve === true ? user.address : undefined,
      name: user?.name ?? '',
      status: row.status,
      userId: row.userId,
    }
  }
  return { company: companyRows.map(toCandidate), contractor: contractorRows.map(toCandidate) }
}
