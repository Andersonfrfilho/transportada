/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 267: as duas listas de responsáveis com o endereço de cada um resolvido em lote, para o envio e a prévia.
 * Roda no banco ou dentro da transação do envio.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq } from 'drizzle-orm'

import {
  companyOccurrenceTypeWatchers,
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

/**
 * Spec 271 (D10/D11): os responsáveis escolhidos no tipo, com o `status` da linha da **empresa** — a FK composta
 * garante que toda escolha tem a linha lá; quem sai da lista da empresa sai do tipo.
 */
export async function readOccurrenceTypeWatcherRows(
  executor: Database | Transaction,
  params: { readonly companyId: string; readonly occurrenceTypeId: string },
): Promise<readonly OccurrenceWatcherRow[]> {
  return executor
    .select({
      status: companyOccurrenceWatchers.status,
      userId: companyOccurrenceTypeWatchers.userId,
    })
    .from(companyOccurrenceTypeWatchers)
    .innerJoin(
      companyOccurrenceWatchers,
      and(
        eq(companyOccurrenceWatchers.companyId, companyOccurrenceTypeWatchers.companyId),
        eq(companyOccurrenceWatchers.userId, companyOccurrenceTypeWatchers.userId),
      ),
    )
    .where(
      and(
        eq(companyOccurrenceTypeWatchers.companyId, params.companyId),
        eq(companyOccurrenceTypeWatchers.occurrenceTypeId, params.occurrenceTypeId),
      ),
    )
}

/**
 * As três listas numa ida só (empresa, contratante e, com `occurrenceTypeId`, o tipo), com os endereços em lote.
 * Spec 275: `contractorId` nulo é a nota sem contratante cadastrada — a lista dela fica vazia (tipo > empresa).
 */
export async function loadEffectiveWatcherCandidates(
  executor: Database | Transaction,
  params: {
    readonly companyId: string
    readonly contractorId: null | string
    readonly occurrenceTypeId?: null | string | undefined
  },
): Promise<{
  readonly company: readonly OccurrenceWatcherCandidate[]
  readonly contractor: readonly OccurrenceWatcherCandidate[]
  readonly type: readonly OccurrenceWatcherCandidate[]
}> {
  const [companyRows, contractorRows, typeRows] = await Promise.all([
    readOccurrenceWatcherRows(executor, { companyId: params.companyId, kind: 'company' }),
    params.contractorId === null
      ? []
      : readOccurrenceWatcherRows(executor, {
          companyId: params.companyId,
          contractorId: params.contractorId,
          kind: 'contractor',
        }),
    params.occurrenceTypeId === undefined || params.occurrenceTypeId === null
      ? []
      : readOccurrenceTypeWatcherRows(executor, {
          companyId: params.companyId,
          occurrenceTypeId: params.occurrenceTypeId,
        }),
  ])
  const userIds = [
    ...new Set([...companyRows, ...contractorRows, ...typeRows].map((row) => row.userId)),
  ]
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
  return {
    company: companyRows.map(toCandidate),
    contractor: contractorRows.map(toCandidate),
    type: typeRows.map(toCandidate),
  }
}
