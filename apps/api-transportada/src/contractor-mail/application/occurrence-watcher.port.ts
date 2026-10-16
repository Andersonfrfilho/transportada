/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { OccurrenceWatcherStatus } from '../domain/occurrence-watcher.constant.js'
import type { OccurrenceWatcherCandidate } from '../domain/occurrence-watcher.policy.js'

export type OccurrenceWatcherScope =
  | Readonly<{ companyId: string; kind: 'company' }>
  | Readonly<{ companyId: string; contractorId: string; kind: 'contractor' }>

export type OccurrenceWatcherRow = Readonly<{ status: OccurrenceWatcherStatus; userId: string }>

/** Membro ativo da empresa. `address` só existe quando o canal do perfil é e-mail. */
export type OccurrenceWatcherUser = Readonly<{
  address: string | undefined
  canResolve: boolean
  name: string
  userId: string
}>

export type OccurrenceWatcherWriteContext = Readonly<{
  actorUserId: string
  correlationId: string
  scope: OccurrenceWatcherScope
  userId: string
}>

export type OccurrenceWatcherRepositoryPort = {
  /** Cria a linha `active`; `false` se o usuário já está na lista. Recusa lista cheia. */
  addWatcher(context: OccurrenceWatcherWriteContext): Promise<boolean>
  /** Só membros ativos; `userIds` ausente traz a empresa inteira. Sem N+1. */
  findWatcherUsers(params: {
    readonly companyId: string
    readonly userIds?: readonly string[]
  }): Promise<readonly OccurrenceWatcherUser[]>
  /** As duas listas já com o endereço resolvido, para o envio. */
  loadEffectiveCandidates(params: {
    readonly companyId: string
    readonly contractorId: string
  }): Promise<{
    readonly company: readonly OccurrenceWatcherCandidate[]
    readonly contractor: readonly OccurrenceWatcherCandidate[]
  }>
  listWatcherRows(scope: OccurrenceWatcherScope): Promise<readonly OccurrenceWatcherRow[]>
  /** `OccurrenceWatcherNotFoundError` se a linha não existe. */
  removeWatcher(context: OccurrenceWatcherWriteContext): Promise<void>
  /** No-op (sem auditoria) se já está no estado; recusa ativar acima do teto de ativos. */
  setWatcherStatus(
    context: OccurrenceWatcherWriteContext & { readonly status: OccurrenceWatcherStatus },
  ): Promise<void>
}
