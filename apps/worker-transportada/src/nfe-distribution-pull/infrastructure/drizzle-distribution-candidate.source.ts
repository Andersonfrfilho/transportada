/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Monta os fatos de um ciclo numa consulta: cada empresa, o ambiente fiscal dela, o opt-in, o vínculo
 * sintético da automação, o certificado ativo e o cursor de espera anti-656. Quem **decide** é a
 * política pura — este adaptador não julga, só reúne.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq } from 'drizzle-orm'

import { companyDistributionSettings } from '../../database/company-distribution-settings.schema.js'
import { digitalCertificates } from '../../database/cte-issuance-execution.schema.js'
import { companies, userCompanyMemberships } from '../../database/identity.schema.js'
import {
  companyFiscalProfiles,
  nfeDistributionCursors,
  type NfeFiscalEnvironment,
} from '../../database/nfe.schema.js'
import { safeLogInfo, safeLogWarn } from '../../logging/safe-logger.service.js'
import { NFE_DISTRIBUTION_CERTIFICATE_PURPOSE } from '../../shared/nfe-distribution.constant.js'
import type { WorkerLogger } from '../../shared/worker.types.js'
import type {
  DistributionCandidate,
  DistributionCandidateSourcePort,
} from '../application/select-eligible-companies.port.js'
import { SYSTEM_DISTRIBUTION_ACTOR_USER_ID } from '../domain/system-distribution-actor.constant.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

const ACTIVE_MEMBERSHIP_STATUS = 'active' as const
const ACTIVE_CERTIFICATE_STATUS = 'active' as const

type CandidateRow = {
  readonly certificateExpiresAt: Date | null
  readonly certificateStatus: 'active' | 'retired' | null
  readonly certificateValidFrom: Date | null
  readonly companyId: string
  readonly companyStatus: 'active' | 'disabled'
  readonly environment: NfeFiscalEnvironment | null
  readonly membershipUserId: string | null
  readonly nextAllowedAt: Date | null
  readonly scheduledDistributionEnabled: boolean | null
}

type CreateDrizzleDistributionCandidateSourceDependencies = {
  readonly database: Database
  readonly logger: WorkerLogger
}

export function createDrizzleDistributionCandidateSource(
  dependencies: CreateDrizzleDistributionCandidateSourceDependencies,
): DistributionCandidateSourcePort {
  return {
    async listCandidates(): Promise<readonly DistributionCandidate[]> {
      const rows = await selectCandidateRows(dependencies.database)
      const candidates: DistributionCandidate[] = []

      for (const row of rows) {
        // Sem perfil fiscal não há ambiente, e sem ambiente não há cursor de espera para consultar —
        // a empresa fica de fora. Não é razão de inelegibilidade: o vocabulário das sete é contrato
        // do painel, e inventar a oitava aqui faria o cartão contar uma história que a API não conta.
        if (row.environment === null) {
          safeLogWarn({
            logger: dependencies.logger,
            message: 'nfe_distribution_pull_company_without_fiscal_profile',
            metadata: { companyId: row.companyId },
          })
          continue
        }

        candidates.push(toDistributionCandidate({ environment: row.environment, row }))
      }

      safeLogInfo({
        logger: dependencies.logger,
        message: 'nfe_distribution_pull_candidates_evaluated',
        metadata: { candidateCount: candidates.length, evaluatedCount: rows.length },
      })

      return candidates
    },
  }
}

async function selectCandidateRows(database: Database): Promise<readonly CandidateRow[]> {
  return database
    .select({
      certificateExpiresAt: digitalCertificates.expiresAt,
      certificateStatus: digitalCertificates.status,
      certificateValidFrom: digitalCertificates.validFrom,
      companyId: companies.id,
      companyStatus: companies.status,
      environment: companyFiscalProfiles.environment,
      // O vínculo sintético é sondado pelo `user_id`: a cópia da tabela no worker não tem `id`, e
      // presença é tudo o que a política pergunta.
      membershipUserId: userCompanyMemberships.userId,
      nextAllowedAt: nfeDistributionCursors.nextAllowedAt,
      scheduledDistributionEnabled: companyDistributionSettings.scheduledDistributionEnabled,
    })
    .from(companies)
    .leftJoin(companyFiscalProfiles, eq(companyFiscalProfiles.companyId, companies.id))
    .leftJoin(companyDistributionSettings, eq(companyDistributionSettings.companyId, companies.id))
    .leftJoin(
      userCompanyMemberships,
      and(
        eq(userCompanyMemberships.companyId, companies.id),
        eq(userCompanyMemberships.userId, SYSTEM_DISTRIBUTION_ACTOR_USER_ID),
        eq(userCompanyMemberships.status, ACTIVE_MEMBERSHIP_STATUS),
      ),
    )
    .leftJoin(
      digitalCertificates,
      and(
        eq(digitalCertificates.companyId, companies.id),
        eq(digitalCertificates.purpose, NFE_DISTRIBUTION_CERTIFICATE_PURPOSE),
        eq(digitalCertificates.status, ACTIVE_CERTIFICATE_STATUS),
      ),
    )
    .leftJoin(
      nfeDistributionCursors,
      and(
        eq(nfeDistributionCursors.companyId, companies.id),
        // O cursor é por ambiente, e o ambiente é o do perfil da empresa: ler o de outro ambiente
        // devolveria a espera errada, que é caminho direto para o `cStat 656`.
        eq(nfeDistributionCursors.environment, companyFiscalProfiles.environment),
      ),
    )
}

type ToDistributionCandidateParams = {
  readonly environment: NfeFiscalEnvironment
  readonly row: CandidateRow
}

export function toDistributionCandidate({
  environment,
  row,
}: ToDistributionCandidateParams): DistributionCandidate {
  return {
    certificate:
      row.certificateStatus !== null &&
      row.certificateValidFrom !== null &&
      row.certificateExpiresAt !== null
        ? {
            expiresAt: row.certificateExpiresAt,
            status: row.certificateStatus,
            validFrom: row.certificateValidFrom,
          }
        : undefined,
    companyId: row.companyId,
    companyStatus: row.companyStatus,
    environment,
    hasSyntheticMembership: row.membershipUserId !== null,
    nextAllowedAt: row.nextAllowedAt ?? undefined,
    scheduledDistributionEnabled: row.scheduledDistributionEnabled ?? false,
  }
}
