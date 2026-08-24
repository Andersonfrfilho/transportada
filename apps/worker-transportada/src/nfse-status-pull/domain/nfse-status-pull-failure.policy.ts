/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A ponte entre dois vocabulários que não coincidem: sete causas de adiamento aqui dentro, quatro
 * palavras no `JOB_FAILURE_OUTCOMES` do catálogo. Sem esta tradução a causa morre na linha de log e
 * três dos quatro códigos do catálogo nunca seriam alcançados — o operador leria `unexpected_error`
 * para um segredo ilegível e para a prefeitura fora do ar, que pedem coisas diferentes dele.
 */
import type { JobOutcome } from '../../shared/job-catalog.constant.js'
import type { NfseStatusFailureCause } from './nfse-reconciliation-outcome.policy.js'

/**
 * Em ordem de precedência: quando o ciclo adia por mais de uma causa, o ciclo fecha pela primeira
 * desta lista. Do mais acionável ao mais transitório — configuração e segredo dependem de alguém,
 * a prefeitura fora do ar passa sozinha.
 */
export const NFSE_STATUS_PULL_FAILURE_OUTCOMES = [
  'credential_missing',
  'malformed_response',
  'document_unavailable',
  'provider_unreachable',
] as const satisfies readonly JobOutcome[]

export type NfseStatusPullFailureOutcome = (typeof NFSE_STATUS_PULL_FAILURE_OUTCOMES)[number]

const OUTCOME_BY_CAUSE: Readonly<Record<NfseStatusFailureCause, NfseStatusPullFailureOutcome>> = {
  credential_unreadable: 'credential_missing',
  malformed_response: 'malformed_response',
  not_found: 'document_unavailable',
  /** Sem `NFSE_PROVIDER_BASE_URL` não há a quem perguntar, e é isso que o operador precisa ler. */
  provider_not_configured: 'provider_unreachable',
  timeout: 'provider_unreachable',
  transport_failure: 'provider_unreachable',
  unexpected_status: 'provider_unreachable',
}

export function toNfseStatusPullFailureOutcome(
  cause: NfseStatusFailureCause,
): NfseStatusPullFailureOutcome {
  return OUTCOME_BY_CAUSE[cause]
}
