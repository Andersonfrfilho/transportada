/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 267: as listas de responsáveis por ocorrências (empresa e contratante), por item. A contratante é resolvida
 * por `getContractor` antes de qualquer consulta (BOLA: de outra empresa é 404). O endereço real nunca sai daqui.
 */
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import { maskEmailAddress } from '../../shared/email-address-mask.policy.js'
import type { OccurrenceWatcherStatus } from '../domain/occurrence-watcher.constant.js'
import { OccurrenceWatcherNotEligibleError } from '../domain/occurrence-watcher.error.js'
import type {
  OccurrenceWatcherRepositoryPort,
  OccurrenceWatcherScope,
  OccurrenceWatcherUser,
} from './occurrence-watcher.port.js'

export type OccurrenceWatcherItem = Readonly<{
  eligible: boolean
  maskedEmail: string | null
  name: string
  status: OccurrenceWatcherStatus
  userId: string
}>

export type OccurrenceWatcherCandidate = Readonly<{
  maskedEmail: string | null
  name: string
  userId: string
}>

export type OccurrenceWatcherList = Readonly<{
  effectiveSource?: 'company' | 'contractor'
  watchers: readonly OccurrenceWatcherItem[]
}>

type GetContractorPort = {
  readonly execute: (input: {
    readonly context: CompanyContext
    readonly id: string
  }) => Promise<unknown>
}

type ScopedInput = Readonly<{ context: CompanyContext; contractorId?: string }>
type WriteInput = ScopedInput & Readonly<{ correlationId: string; userId: string }>

export type OccurrenceWatchersUseCase = {
  add(input: WriteInput): Promise<{ created: boolean; item: OccurrenceWatcherItem }>
  list(input: ScopedInput): Promise<OccurrenceWatcherList>
  listCandidates(input: {
    readonly context: CompanyContext
  }): Promise<readonly OccurrenceWatcherCandidate[]>
  remove(input: WriteInput): Promise<void>
  setStatus(
    input: WriteInput & { readonly status: OccurrenceWatcherStatus },
  ): Promise<OccurrenceWatcherItem>
}

function isEligible(user: OccurrenceWatcherUser | undefined): user is OccurrenceWatcherUser {
  return user !== undefined && user.canResolve && user.address !== undefined && user.address !== ''
}

function toItem(
  userId: string,
  status: OccurrenceWatcherStatus,
  user: OccurrenceWatcherUser | undefined,
): OccurrenceWatcherItem {
  return {
    eligible: isEligible(user),
    maskedEmail: user?.address === undefined ? null : maskEmailAddress(user.address),
    name: user?.name ?? '',
    status,
    userId,
  }
}

export function createOccurrenceWatchersUseCase(dependencies: {
  readonly getContractor: GetContractorPort
  readonly repository: OccurrenceWatcherRepositoryPort
}): OccurrenceWatchersUseCase {
  const { getContractor, repository } = dependencies

  async function resolveScope({
    context,
    contractorId,
  }: ScopedInput): Promise<OccurrenceWatcherScope> {
    if (contractorId === undefined) return { companyId: context.companyId, kind: 'company' }
    await getContractor.execute({ context, id: contractorId })
    return { companyId: context.companyId, contractorId, kind: 'contractor' }
  }

  async function readItem(
    context: CompanyContext,
    scope: OccurrenceWatcherScope,
    userId: string,
  ): Promise<OccurrenceWatcherItem> {
    const [rows, users] = await Promise.all([
      repository.listWatcherRows(scope),
      repository.findWatcherUsers({ companyId: context.companyId, userIds: [userId] }),
    ])
    const row = rows.find((candidate) => candidate.userId === userId)
    return toItem(userId, row?.status ?? 'active', users[0])
  }

  async function assertEligible(context: CompanyContext, userId: string): Promise<void> {
    const [user] = await repository.findWatcherUsers({
      companyId: context.companyId,
      userIds: [userId],
    })
    if (!isEligible(user)) throw new OccurrenceWatcherNotEligibleError()
  }

  function writeContext(input: WriteInput, scope: OccurrenceWatcherScope) {
    return {
      actorUserId: input.context.userId,
      correlationId: input.correlationId,
      scope,
      userId: input.userId,
    }
  }

  return {
    async list(input) {
      const scope = await resolveScope(input)
      const rows = await repository.listWatcherRows(scope)
      const users = new Map(
        (
          await repository.findWatcherUsers({
            companyId: input.context.companyId,
            userIds: rows.map((row) => row.userId),
          })
        ).map((user) => [user.userId, user]),
      )
      const watchers = rows
        .map((row) => toItem(row.userId, row.status, users.get(row.userId)))
        .sort((left, right) => left.name.localeCompare(right.name))
      if (scope.kind === 'company') return { watchers }
      return {
        effectiveSource: rows.some((row) => row.status === 'active') ? 'contractor' : 'company',
        watchers,
      }
    },

    async listCandidates({ context }) {
      const users = await repository.findWatcherUsers({ companyId: context.companyId })
      return users
        .filter(isEligible)
        .map((user) => ({
          maskedEmail: user.address === undefined ? null : maskEmailAddress(user.address),
          name: user.name,
          userId: user.userId,
        }))
        .sort((left, right) => left.name.localeCompare(right.name))
    },

    async add(input) {
      const scope = await resolveScope(input)
      await assertEligible(input.context, input.userId)
      const created = await repository.addWatcher(writeContext(input, scope))
      return { created, item: await readItem(input.context, scope, input.userId) }
    },

    async setStatus(input) {
      const scope = await resolveScope(input)
      if (input.status === 'active') await assertEligible(input.context, input.userId)
      await repository.setWatcherStatus({ ...writeContext(input, scope), status: input.status })
      return readItem(input.context, scope, input.userId)
    },

    async remove(input) {
      const scope = await resolveScope(input)
      await repository.removeWatcher(writeContext(input, scope))
    },
  }
}
