/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'

import {
  CTE_RETRY_BACKOFF_STEPS_LIMIT,
  CTE_RETRY_MAX_ATTEMPTS_LIMIT,
  createCteRetryPolicy,
} from '../../cte-issuance/domain/cte-retry.policy.js'
import { companyFiscalProfiles, fiscalSequences } from '../../database/database.schema.js'
import type {
  CompanySettingsInput,
  CompanySettingsResult,
} from '../application/company-settings.port.js'
import type { CompanySettingsQueryable } from './drizzle-company-settings.types.js'

const persistedResponseSchema = z
  .object({
    billing: z
      .object({
        bankAccount: z.string(),
        bankBranch: z.string(),
        bankCode: z.string(),
        bankName: z.string(),
        observations: z.string(),
        pixKey: z.string(),
      })
      .strict(),
    cte: z
      .object({
        environment: z.enum(['homologation', 'production']),
        nextNumber: z.string().regex(/^[1-9][0-9]*$/),
        series: z.string().regex(/^[1-9][0-9]*$/),
        version: z.string().regex(/^[1-9][0-9]*$/),
      })
      .strict(),
    cteRetry: z
      .object({
        backoffSeconds: z.array(z.number().int().min(1)).min(1).max(CTE_RETRY_BACKOFF_STEPS_LIMIT),
        maxAttempts: z.number().int().min(1).max(CTE_RETRY_MAX_ATTEMPTS_LIMIT),
      })
      .strict(),
    mdfe: z
      .object({
        bankBranch: z.string(),
        bankCode: z.string(),
        insurancePolicy: z.string(),
        insuranceResponsibility: z.enum(['', '1', '2']),
        insurerName: z.string(),
        insurerTaxId: z.string(),
        pixKey: z.string(),
      })
      .strict(),
    profile: z
      .object({
        city: z.string(),
        cityIbgeCode: z.string(),
        cnpj: z.string(),
        complement: z.string(),
        district: z.string(),
        email: z.string(),
        legalName: z.string(),
        municipalRegistration: z.string(),
        number: z.string(),
        phone: z.string(),
        postalCode: z.string(),
        rntrc: z.string(),
        state: z.string(),
        stateRegistration: z.string(),
        street: z.string(),
        taxRegime: z.enum(['1', '2', '3']),
        tradeName: z.string(),
        version: z.string().regex(/^[1-9][0-9]*$/),
      })
      .strict(),
  })
  .strict()

const settingsSelection = {
  billing: {
    bankAccount: companyFiscalProfiles.billingBankAccount,
    bankBranch: companyFiscalProfiles.billingBankBranch,
    bankCode: companyFiscalProfiles.billingBankCode,
    bankName: companyFiscalProfiles.billingBankName,
    observations: companyFiscalProfiles.billingObservations,
    pixKey: companyFiscalProfiles.billingPixKey,
  },
  cte: {
    environment: fiscalSequences.environment,
    nextNumber: fiscalSequences.nextNumber,
    series: fiscalSequences.series,
    version: fiscalSequences.version,
  },
  cteRetry: {
    backoffSeconds: companyFiscalProfiles.cteRetryBackoffSeconds,
    maxAttempts: companyFiscalProfiles.cteRetryMaxAttempts,
  },
  mdfe: {
    bankBranch: companyFiscalProfiles.mdfePaymentBankBranch,
    bankCode: companyFiscalProfiles.mdfePaymentBankCode,
    insurancePolicy: companyFiscalProfiles.mdfeInsurancePolicy,
    insuranceResponsibility: companyFiscalProfiles.mdfeInsuranceResponsibility,
    insurerName: companyFiscalProfiles.mdfeInsurerName,
    insurerTaxId: companyFiscalProfiles.mdfeInsurerTaxId,
    pixKey: companyFiscalProfiles.mdfePaymentPixKey,
  },
  profile: {
    city: companyFiscalProfiles.city,
    cityIbgeCode: companyFiscalProfiles.cityIbgeCode,
    cnpj: companyFiscalProfiles.cnpj,
    complement: companyFiscalProfiles.complement,
    district: companyFiscalProfiles.district,
    email: companyFiscalProfiles.email,
    legalName: companyFiscalProfiles.legalName,
    municipalRegistration: companyFiscalProfiles.municipalRegistration,
    number: companyFiscalProfiles.number,
    phone: companyFiscalProfiles.phone,
    postalCode: companyFiscalProfiles.postalCode,
    rntrc: companyFiscalProfiles.rntrc,
    state: companyFiscalProfiles.state,
    stateRegistration: companyFiscalProfiles.stateRegistration,
    street: companyFiscalProfiles.street,
    taxRegime: companyFiscalProfiles.taxRegime,
    tradeName: companyFiscalProfiles.tradeName,
    version: companyFiscalProfiles.version,
  },
} as const

export async function findCompanySettings(
  database: CompanySettingsQueryable,
  companyId: string,
): Promise<CompanySettingsResult | null> {
  const [settings] = await database
    .select(settingsSelection)
    .from(companyFiscalProfiles)
    .leftJoin(
      fiscalSequences,
      and(
        eq(fiscalSequences.companyId, companyFiscalProfiles.companyId),
        eq(fiscalSequences.environment, companyFiscalProfiles.environment),
        eq(fiscalSequences.model, 'cte'),
      ),
    )
    .where(eq(companyFiscalProfiles.companyId, companyId))
    .orderBy(desc(fiscalSequences.updatedAt), desc(fiscalSequences.id))
    .limit(1)
  if (settings === undefined) return null
  const cte = settings.cte
  if (cte === null) {
    throw new Error('Company fiscal settings are inconsistent')
  }
  return {
    billing: settings.billing,
    cte,
    cteRetry: createCteRetryPolicy(settings.cteRetry),
    mdfe: settings.mdfe,
    profile: settings.profile,
  }
}

export function createCompanySettingsResult(
  settings: CompanySettingsInput,
  profileVersion: bigint,
  sequenceVersion: bigint,
): CompanySettingsResult {
  return {
    billing: settings.billing,
    cte: { ...settings.cte, version: sequenceVersion },
    cteRetry: settings.cteRetry,
    mdfe: settings.mdfe,
    profile: { ...settings.profile, version: profileVersion },
  }
}

export function serializeCompanySettingsResponse(
  response: CompanySettingsResult,
): z.input<typeof persistedResponseSchema> {
  return {
    billing: { ...response.billing },
    cte: {
      environment: response.cte.environment,
      nextNumber: response.cte.nextNumber.toString(),
      series: response.cte.series.toString(),
      version: response.cte.version.toString(),
    },
    cteRetry: {
      backoffSeconds: [...response.cteRetry.backoffSeconds],
      maxAttempts: response.cteRetry.maxAttempts,
    },
    mdfe: { ...response.mdfe },
    profile: {
      ...response.profile,
      version: response.profile.version.toString(),
    },
  }
}

export function deserializeCompanySettingsResponse(response: unknown): CompanySettingsResult {
  const parsed = persistedResponseSchema.parse(response)
  return {
    billing: parsed.billing,
    cte: {
      environment: parsed.cte.environment,
      nextNumber: BigInt(parsed.cte.nextNumber),
      series: BigInt(parsed.cte.series),
      version: BigInt(parsed.cte.version),
    },
    cteRetry: parsed.cteRetry,
    mdfe: parsed.mdfe,
    profile: {
      ...parsed.profile,
      version: BigInt(parsed.profile.version),
    },
  }
}
