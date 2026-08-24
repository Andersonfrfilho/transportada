/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { NfeFiscalEnvironment } from '../../database/nfe.schema.js'
import type { DistributionEligibilityCandidate } from '../domain/distribution-eligibility.policy.js'

/**
 * O ambiente fiscal é **da empresa**, lido de `company_fiscal_profiles` — não há ambiente global no
 * worker, e não pode haver: o consumidor de distribuição já chama a SEFAZ com o ambiente do perfil, e
 * um segundo ambiente na seleção faria a rotina ler o `next_allowed_at` do cursor errado, que é
 * caminho direto para o `cStat 656`.
 */
export type DistributionCandidate = DistributionEligibilityCandidate & {
  readonly companyId: string
  readonly environment: NfeFiscalEnvironment
}

export type DistributionCandidateSourcePort = {
  listCandidates(): Promise<readonly DistributionCandidate[]>
}
