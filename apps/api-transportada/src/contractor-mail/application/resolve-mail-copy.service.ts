/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 267 RF3/RF7: a cópia efetiva de um e-mail da contratante, dentro do teto de `To` + `Cc`. O envio manual que
 * estoura é recusado antes de gravar; o automático (sem operador para corrigir) corta a cópia até caber, e os
 * contatos da contratante sempre vão. Nenhum endereço entra em log: só contagens e a origem da lista.
 */
import { CONTRACTOR_MAIL_MAX_RECIPIENTS } from '../domain/contractor-mail.constant.js'
import { ContractorMailTooManyRecipientsError } from '../domain/occurrence-watcher.error.js'
import {
  resolveEffectiveWatchers,
  type OccurrenceWatcherCandidate,
} from '../domain/occurrence-watcher.policy.js'

/** `info` é opcional: quem só avisa (reenvio da 248) precisa apenas de `warn`. */
export type MailCopyLogger = {
  info?(event: string, fields?: Record<string, unknown>): void
  warn(event: string, fields?: Record<string, unknown>): void
}

export type MailCopyCandidates = Readonly<{
  company: readonly OccurrenceWatcherCandidate[]
  contractor: readonly OccurrenceWatcherCandidate[]
}>

export async function resolveMailCopy(params: {
  readonly automatic: boolean
  readonly companyId: string
  readonly contractorId: string
  readonly excludedUserIds: readonly string[]
  readonly loadCandidates: (query: {
    readonly companyId: string
    readonly contractorId: string
  }) => Promise<MailCopyCandidates>
  readonly logger: MailCopyLogger | undefined
  readonly recipients: readonly string[]
}): Promise<readonly string[]> {
  const candidates = await params.loadCandidates({
    companyId: params.companyId,
    contractorId: params.contractorId,
  })
  const effective = resolveEffectiveWatchers({
    companyWatchers: candidates.company,
    contractorWatchers: candidates.contractor,
    excludedUserIds: params.excludedUserIds,
    toAddresses: params.recipients,
  })
  const room = Math.max(CONTRACTOR_MAIL_MAX_RECIPIENTS - params.recipients.length, 0)
  const fits = effective.copy.length <= room
  if (!fits && !params.automatic) throw new ContractorMailTooManyRecipientsError()

  const kept = effective.copy.slice(0, room)
  if (!fits) {
    params.logger?.warn('contractor_mail.copy.truncated', {
      ccCount: kept.length,
      droppedCount: effective.copy.length - kept.length,
      toCount: params.recipients.length,
    })
  } else if (effective.source !== null) {
    params.logger?.info?.('contractor_mail.copy.resolved', {
      ccCount: kept.length,
      droppedCount: effective.droppedCount,
      source: effective.source,
    })
  }
  return kept.map((entry) => entry.address)
}
