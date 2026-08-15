/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, desc, eq } from 'drizzle-orm'

import { digitalCertificates } from '../../database/cte-issuance-execution.schema.js'
import { companyFiscalProfiles } from '../../database/nfe.schema.js'
import { normalizeTaxId } from '../../shared/tax-id.service.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

const DISTRIBUTION_MODEL = 'nfe-distribuicao' as const
const CERTIFICATE_PURPOSE = 'cte' as const
const CERTIFICATE_STATUS_ACTIVE = 'active' as const

type NfeDistributionEnvironment = 'homologation' | 'production'

type NfeDistributionRuntimeConfig = {
  readonly certificadoBase64: string
  readonly certificadoSenha: string
  readonly cnpj: string
  readonly environment: NfeDistributionEnvironment
  readonly model: typeof DISTRIBUTION_MODEL
  readonly uf: string
}

type DigitalCertificateSecretPort = {
  decrypt(input: {
    readonly certificateId: string
    readonly companyId: string
    readonly envelope: unknown
    readonly purpose: 'cte'
  }): Promise<{ readonly certificateBase64: string; readonly password: string }>
}

type DrizzleNfeDistributionProfileRepositoryDependencies = {
  readonly secretService: DigitalCertificateSecretPort
}

export class DrizzleNfeDistributionProfileRepository {
  readonly #database: Database
  readonly #secretService: DigitalCertificateSecretPort

  constructor(
    database: Database,
    dependencies: DrizzleNfeDistributionProfileRepositoryDependencies,
  ) {
    this.#database = database
    this.#secretService = dependencies.secretService
  }

  async loadConfig(input: { readonly companyId: string }): Promise<NfeDistributionRuntimeConfig> {
    const [profile] = await this.#database
      .select({
        cnpj: companyFiscalProfiles.cnpj,
        environment: companyFiscalProfiles.environment,
        state: companyFiscalProfiles.state,
      })
      .from(companyFiscalProfiles)
      .where(eq(companyFiscalProfiles.companyId, input.companyId))
      .limit(1)
    if (profile === undefined) {
      throw new Error('NFE_DISTRIBUTION_PROFILE_MISSING')
    }

    const [certificate] = await this.#database
      .select({
        id: digitalCertificates.id,
        secretEnvelope: digitalCertificates.secretEnvelope,
        validatedCnpj: digitalCertificates.validatedCnpj,
      })
      .from(digitalCertificates)
      .where(
        and(
          eq(digitalCertificates.companyId, input.companyId),
          eq(digitalCertificates.purpose, CERTIFICATE_PURPOSE),
          eq(digitalCertificates.status, CERTIFICATE_STATUS_ACTIVE),
        ),
      )
      .orderBy(desc(digitalCertificates.createdAt), desc(digitalCertificates.version))
      .limit(1)
    if (certificate === undefined || certificate.secretEnvelope === null) {
      throw new Error('NFE_DISTRIBUTION_CERTIFICATE_MISSING')
    }
    // Certificado e perfil vêm de tabelas diferentes: com letra na base do CNPJ, comparar cru faz
    // caixa ou pontuação divergente parecer certificado de outra empresa
    if (normalizeTaxId(certificate.validatedCnpj) !== normalizeTaxId(profile.cnpj)) {
      throw new Error('NFE_DISTRIBUTION_CERTIFICATE_CNPJ_MISMATCH')
    }

    const secret = await this.#secretService.decrypt({
      certificateId: certificate.id,
      companyId: input.companyId,
      envelope: certificate.secretEnvelope,
      purpose: CERTIFICATE_PURPOSE,
    })

    return {
      certificadoBase64: secret.certificateBase64,
      certificadoSenha: secret.password,
      cnpj: profile.cnpj,
      environment: profile.environment,
      model: DISTRIBUTION_MODEL,
      uf: profile.state,
    }
  }
}
