/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, desc, eq } from 'drizzle-orm'

import {
  companyFiscalProfiles,
  digitalCertificates,
  fiscalSequences,
} from '../../database/cte-issuance-execution.schema.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export type CteIssuanceExecutionPrerequisites = {
  readonly certificate: {
    readonly id: string
    readonly secretEnvelope: unknown
  } | null
  readonly companyId: string
  readonly profile: {
    readonly city: string
    readonly cityIbgeCode: string
    readonly cnpj: string
    readonly district: string
    readonly environment: 'homologation' | 'production'
    readonly legalName: string
    readonly number: string
    readonly postalCode: string
    readonly rntrc: string
    readonly state: string
    readonly stateRegistration: string
    readonly street: string
    readonly taxRegime: '1' | '2' | '3'
  } | null
  readonly sequence: {
    readonly nextNumber: bigint
    readonly series: bigint
    readonly version: bigint
  } | null
}

export class DrizzleCteIssuanceExecutionInputRepository {
  readonly #database: Database

  constructor(database: Database) {
    this.#database = database
  }

  async findByCompanyId(input: {
    readonly companyId: string
  }): Promise<CteIssuanceExecutionPrerequisites> {
    const [profile] = await this.#database
      .select({
        city: companyFiscalProfiles.city,
        cityIbgeCode: companyFiscalProfiles.cityIbgeCode,
        cnpj: companyFiscalProfiles.cnpj,
        district: companyFiscalProfiles.district,
        environment: companyFiscalProfiles.environment,
        legalName: companyFiscalProfiles.legalName,
        number: companyFiscalProfiles.number,
        postalCode: companyFiscalProfiles.postalCode,
        rntrc: companyFiscalProfiles.rntrc,
        state: companyFiscalProfiles.state,
        stateRegistration: companyFiscalProfiles.stateRegistration,
        street: companyFiscalProfiles.street,
        taxRegime: companyFiscalProfiles.taxRegime,
      })
      .from(companyFiscalProfiles)
      .where(eq(companyFiscalProfiles.companyId, input.companyId))
      .limit(1)

    const [certificate] = await this.#database
      .select({
        id: digitalCertificates.id,
        secretEnvelope: digitalCertificates.secretEnvelope,
      })
      .from(digitalCertificates)
      .where(
        and(
          eq(digitalCertificates.companyId, input.companyId),
          eq(digitalCertificates.purpose, 'cte'),
          eq(digitalCertificates.status, 'active'),
        ),
      )
      .orderBy(desc(digitalCertificates.createdAt), desc(digitalCertificates.version))
      .limit(1)

    const [sequence] = await this.#database
      .select({
        nextNumber: fiscalSequences.nextNumber,
        series: fiscalSequences.series,
        version: fiscalSequences.version,
      })
      .from(fiscalSequences)
      .where(
        and(
          eq(fiscalSequences.companyId, input.companyId),
          eq(fiscalSequences.model, 'cte'),
          eq(fiscalSequences.environment, profile?.environment ?? 'homologation'),
        ),
      )
      .orderBy(desc(fiscalSequences.updatedAt), desc(fiscalSequences.id))
      .limit(1)

    return {
      certificate:
        certificate === undefined
          ? null
          : {
              id: certificate.id,
              secretEnvelope: certificate.secretEnvelope,
            },
      companyId: input.companyId,
      profile:
        profile === undefined
          ? null
          : {
              city: profile.city,
              cityIbgeCode: profile.cityIbgeCode,
              cnpj: profile.cnpj,
              district: profile.district,
              environment: profile.environment as 'homologation' | 'production',
              legalName: profile.legalName,
              number: profile.number,
              postalCode: profile.postalCode,
              rntrc: profile.rntrc,
              state: profile.state,
              stateRegistration: profile.stateRegistration,
              street: profile.street,
              taxRegime: profile.taxRegime as '1' | '2' | '3',
            },
      sequence: sequence ?? null,
    }
  }
}
