/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Reúne os fatos que a policy de elegibilidade consome. Tudo por `leftJoin`:
 * ausência de opt-in, de membership, de certificado ou de cursor é resposta
 * válida — é justamente o que a tela precisa nomear.
 *
 * Os joins espelham `drizzle-distribution-candidate.source.ts` do cron. Filtro
 * divergente aqui faria a tela explicar uma decisão que o cron não tomou.
 */
import { and, desc, eq } from 'drizzle-orm'

import {
  companies,
  companyDistributionSettings,
  companyFiscalProfiles,
  digitalCertificates,
  nfeDistributionCursors,
  nfeImports,
  userCompanyMemberships,
} from '../../database/database.schema.js'
import { SYSTEM_DISTRIBUTION_ACTOR_USER_ID } from '../../identity/domain/system-distribution-actor.constant.js'
import type {
  ScheduledDistributionImportFacts,
  ScheduledDistributionStatusFacts,
  ScheduledDistributionStatusPort,
} from '../application/scheduled-distribution-status.port.js'
import type { CompanySettingsDatabase } from './drizzle-company-settings.types.js'

/** O cron pede à SEFAZ com este job; qualquer outro import é de gente. */
const DISTRIBUTION_AUTOMATION_JOB = 'nfe.distribution.pull'
const ACTIVE_STATUS = 'active'

export class DrizzleScheduledDistributionStatusRepository
  implements ScheduledDistributionStatusPort
{
  public constructor(private readonly database: CompanySettingsDatabase) {}

  public async loadStatusFacts(input: {
    readonly companyId: string
  }): Promise<ScheduledDistributionStatusFacts> {
    const [facts, lastAutomationImport] = await Promise.all([
      this.loadEligibilityFacts(input.companyId),
      this.loadLastAutomationImport(input.companyId),
    ])
    return { ...facts, lastAutomationImport }
  }

  private async loadEligibilityFacts(
    companyId: string,
  ): Promise<Omit<ScheduledDistributionStatusFacts, 'lastAutomationImport'>> {
    const [row] = await this.database
      .select({
        certificateExpiresAt: digitalCertificates.expiresAt,
        certificateStatus: digitalCertificates.status,
        certificateValidFrom: digitalCertificates.validFrom,
        companyStatus: companies.status,
        membershipId: userCompanyMemberships.id,
        nextAllowedAt: nfeDistributionCursors.nextAllowedAt,
        scheduledDistributionEnabled: companyDistributionSettings.scheduledDistributionEnabled,
      })
      .from(companies)
      .leftJoin(
        companyDistributionSettings,
        eq(companyDistributionSettings.companyId, companies.id),
      )
      .leftJoin(
        userCompanyMemberships,
        and(
          eq(userCompanyMemberships.companyId, companies.id),
          eq(userCompanyMemberships.userId, SYSTEM_DISTRIBUTION_ACTOR_USER_ID),
          eq(userCompanyMemberships.status, ACTIVE_STATUS),
        ),
      )
      .leftJoin(
        digitalCertificates,
        and(
          eq(digitalCertificates.companyId, companies.id),
          eq(digitalCertificates.status, ACTIVE_STATUS),
        ),
      )
      .leftJoin(companyFiscalProfiles, eq(companyFiscalProfiles.companyId, companies.id))
      .leftJoin(
        nfeDistributionCursors,
        and(
          eq(nfeDistributionCursors.companyId, companies.id),
          eq(nfeDistributionCursors.environment, companyFiscalProfiles.environment),
        ),
      )
      .where(eq(companies.id, companyId))
      .limit(1)

    if (row === undefined) {
      return {
        certificate: undefined,
        companyStatus: 'disabled',
        hasSyntheticMembership: false,
        nextAllowedAt: undefined,
        scheduledDistributionEnabled: false,
      }
    }

    return {
      certificate:
        row.certificateStatus === null ||
        row.certificateExpiresAt === null ||
        row.certificateValidFrom === null
          ? undefined
          : {
              expiresAt: row.certificateExpiresAt,
              status: row.certificateStatus,
              validFrom: row.certificateValidFrom,
            },
      companyStatus: row.companyStatus,
      hasSyntheticMembership: row.membershipId !== null,
      nextAllowedAt: row.nextAllowedAt ?? undefined,
      scheduledDistributionEnabled: row.scheduledDistributionEnabled ?? false,
    }
  }

  private async loadLastAutomationImport(
    companyId: string,
  ): Promise<ScheduledDistributionImportFacts | undefined> {
    const [row] = await this.database
      .select({
        createdAt: nfeImports.createdAt,
        receivedCount: nfeImports.receivedCount,
        status: nfeImports.status,
        updatedAt: nfeImports.updatedAt,
      })
      .from(nfeImports)
      .where(
        and(
          eq(nfeImports.companyId, companyId),
          eq(nfeImports.triggeredBy, 'automation'),
          eq(nfeImports.automationJob, DISTRIBUTION_AUTOMATION_JOB),
        ),
      )
      .orderBy(desc(nfeImports.createdAt))
      .limit(1)

    if (row === undefined) return undefined
    return {
      finishedAt: isTerminal(row.status) ? row.updatedAt : undefined,
      receivedCount: Number(row.receivedCount),
      startedAt: row.createdAt,
      status: row.status,
    }
  }
}

function isTerminal(status: string): boolean {
  return status === 'completed' || status === 'failed'
}
