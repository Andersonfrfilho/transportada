/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { NfeFiscalEnvironment } from '../../database/nfe.schema.js'
import { JOB_MINIMUM_INTERVAL_SECONDS } from '../../shared/job-catalog.constant.js'

import { DISTRIBUTION_PULL_JOB } from './distribution-pull.constant.js'

const MILLISECONDS_PER_MINUTE = 60_000

const SECONDS_PER_MINUTE = 60

/**
 * A cadência sai do catálogo, não de configuração: o envelope de `job-run.v1` carrega **referência**
 * — execução, rotina e origem —, e nada de período. Derivar aqui é o que impede a rotina de inventar
 * um número e a chave de idempotência de discordar da batida que a produziu.
 */
export const DISTRIBUTION_CADENCE_MINUTES =
  JOB_MINIMUM_INTERVAL_SECONDS[DISTRIBUTION_PULL_JOB] / SECONDS_PER_MINUTE

type DeriveDistributionIdempotencyKeyParams = {
  readonly cadenceMinutes: number
  readonly companyId: string
  readonly cycleInstant: Date
  readonly environment: NfeFiscalEnvironment
}

/**
 * A chave é o balde da cadência, não o instante: duas entregas da mesma janela caem na mesma chave e
 * a segunda é recusada pela unique de `nfe_imports` — importação repetida não vira nota repetida.
 * O ambiente entra na chave porque homologação e produção têm cursor próprio, e misturá-los seria
 * pular NSU de um lado achando que o outro já leu.
 */
export function deriveDistributionIdempotencyKey({
  cadenceMinutes,
  companyId,
  cycleInstant,
  environment,
}: DeriveDistributionIdempotencyKeyParams): string {
  const bucketMs = cadenceMinutes * MILLISECONDS_PER_MINUTE
  const bucketStart = Math.floor(cycleInstant.getTime() / bucketMs) * bucketMs
  return `${DISTRIBUTION_PULL_JOB}:${environment}:${companyId}:${bucketStart}`
}
