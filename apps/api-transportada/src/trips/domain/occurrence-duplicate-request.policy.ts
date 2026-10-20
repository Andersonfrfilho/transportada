/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 276 T4: o mesmo tipo de ocorrência registrado de novo na mesma nota. A escolha é do tipo
 * (`duplicate_request_policy`); a ocorrência cancelada nunca conta, e o servidor cobra em todo canal (app, WhatsApp,
 * galpão, escritório).
 */
import type {
  ContractorReplyStatus,
  DuplicateRequestPolicy,
} from '../../shared/occurrence-contractor-reply.constant.js'

/** O pedido à contratante que já terminou: entregue ao motorista, tratado pelo operador ou cancelado. */
const SETTLED_REPLY_STATUSES: ReadonlySet<ContractorReplyStatus> = new Set([
  'cancelled',
  'delivered',
  'handled',
])

export type DuplicateRequestCandidate = {
  readonly id: string
  /** Último evento do andamento (266): `reopened` e nenhum evento são `open`. */
  readonly resolutionState: 'open' | 'resolved'
  /** `null` é ocorrência sem retorno aberto, inclusive a que ainda espera o aviso automático sair. */
  readonly replyStatus: ContractorReplyStatus | null
}

export function blocksDuplicateRequest(
  policy: DuplicateRequestPolicy,
  candidate: DuplicateRequestCandidate,
): boolean {
  if (policy === 'allow' || candidate.resolutionState === 'resolved') return false
  if (policy === 'until_resolved') return true
  return candidate.replyStatus === null || !SETTLED_REPLY_STATUSES.has(candidate.replyStatus)
}

/** A primeira (mais recente) que bloqueia, ou `null`. */
export function findBlockingDuplicateRequest(
  policy: DuplicateRequestPolicy,
  candidates: readonly DuplicateRequestCandidate[],
): DuplicateRequestCandidate | null {
  return candidates.find((candidate) => blocksDuplicateRequest(policy, candidate)) ?? null
}
