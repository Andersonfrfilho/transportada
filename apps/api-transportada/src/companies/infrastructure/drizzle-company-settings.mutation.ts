/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, eq } from 'drizzle-orm'

import { companyFiscalProfiles } from '../../database/database.schema.js'
import type {
  CompanyBillingDefaultsInput,
  CompanyMdfeDefaultsInput,
  CompanySettingsInput,
  CompanySettingsResult,
} from '../application/company-settings.port.js'
import { CompanySettingsVersionConflictError } from '../domain/company-settings.error.js'
import { createCompanySettingsResult } from './drizzle-company-settings.mapper.js'
import { persistTargetSequence } from './drizzle-company-settings-sequence.persistence.js'
import {
  acquireCompanySettingsLock,
  mapCompanySettingsPersistenceError,
} from './drizzle-company-settings.support.js'
import type { CompanySettingsTransaction } from './drizzle-company-settings.types.js'

type SaveSettingsInput = {
  readonly companyId: string
  readonly settings: CompanySettingsInput
}

function toMdfeColumns(mdfe: CompanyMdfeDefaultsInput): {
  readonly mdfeInsurancePolicy: string
  readonly mdfeInsuranceResponsibility: CompanyMdfeDefaultsInput['insuranceResponsibility']
  readonly mdfeInsurerName: string
  readonly mdfeInsurerTaxId: string
  readonly mdfePaymentBankBranch: string
  readonly mdfePaymentBankCode: string
  readonly mdfePaymentPixKey: string
} {
  return {
    mdfeInsurancePolicy: mdfe.insurancePolicy,
    mdfeInsuranceResponsibility: mdfe.insuranceResponsibility,
    mdfeInsurerName: mdfe.insurerName,
    mdfeInsurerTaxId: mdfe.insurerTaxId,
    mdfePaymentBankBranch: mdfe.bankBranch,
    mdfePaymentBankCode: mdfe.bankCode,
    mdfePaymentPixKey: mdfe.pixKey,
  }
}

function toBillingColumns(billing: CompanyBillingDefaultsInput): {
  readonly billingBankAccount: string
  readonly billingBankBranch: string
  readonly billingBankCode: string
  readonly billingBankName: string
  readonly billingObservations: string
  readonly billingPixKey: string
} {
  return {
    billingBankAccount: billing.bankAccount,
    billingBankBranch: billing.bankBranch,
    billingBankCode: billing.bankCode,
    billingBankName: billing.bankName,
    billingObservations: billing.observations,
    billingPixKey: billing.pixKey,
  }
}

export async function saveCompanySettings(
  transaction: CompanySettingsTransaction,
  input: SaveSettingsInput,
): Promise<CompanySettingsResult> {
  await acquireCompanySettingsLock(transaction, input.companyId)
  try {
    const currentVersion = await findCurrentProfileVersion(transaction, input.companyId)
    if (currentVersion === null) {
      if (input.settings.expectedVersion !== null) {
        throw new CompanySettingsVersionConflictError()
      }
      return await createSettings(transaction, input)
    }
    if (
      input.settings.expectedVersion === null ||
      input.settings.expectedVersion !== currentVersion
    ) {
      throw new CompanySettingsVersionConflictError()
    }
    return await updateSettings(transaction, input, currentVersion)
  } catch (error) {
    throw mapCompanySettingsPersistenceError(error)
  }
}

async function findCurrentProfileVersion(
  transaction: CompanySettingsTransaction,
  companyId: string,
): Promise<bigint | null> {
  const [profile] = await transaction
    .select({ version: companyFiscalProfiles.version })
    .from(companyFiscalProfiles)
    .where(eq(companyFiscalProfiles.companyId, companyId))
    .limit(1)
    .for('update')
  return profile?.version ?? null
}

async function createSettings(
  transaction: CompanySettingsTransaction,
  input: SaveSettingsInput,
): Promise<CompanySettingsResult> {
  const [profile] = await transaction
    .insert(companyFiscalProfiles)
    .values({
      companyId: input.companyId,
      environment: input.settings.cte.environment,
      ...input.settings.profile,
      ...toMdfeColumns(input.settings.mdfe),
      ...toBillingColumns(input.settings.billing),
      activationChannel: input.settings.activation.channel,
      cteRetryBackoffSeconds: [...input.settings.cteRetry.backoffSeconds],
      cteRetryMaxAttempts: input.settings.cteRetry.maxAttempts,
    })
    .returning({ version: companyFiscalProfiles.version })
  if (profile === undefined) {
    throw new Error('Company fiscal settings could not be persisted')
  }
  const sequenceVersion = await persistTargetSequence(transaction, input.companyId, input.settings)
  return createCompanySettingsResult(input.settings, profile.version, sequenceVersion)
}

async function updateSettings(
  transaction: CompanySettingsTransaction,
  input: SaveSettingsInput,
  currentVersion: bigint,
): Promise<CompanySettingsResult> {
  const sequenceVersion = await persistTargetSequence(transaction, input.companyId, input.settings)
  const profileVersion = await updateProfile(transaction, input, currentVersion)
  return createCompanySettingsResult(input.settings, profileVersion, sequenceVersion)
}

async function updateProfile(
  transaction: CompanySettingsTransaction,
  input: SaveSettingsInput,
  currentVersion: bigint,
): Promise<bigint> {
  const [profile] = await transaction
    .update(companyFiscalProfiles)
    .set({
      environment: input.settings.cte.environment,
      updatedAt: new Date(),
      version: currentVersion + 1n,
      ...input.settings.profile,
      ...toMdfeColumns(input.settings.mdfe),
      ...toBillingColumns(input.settings.billing),
      activationChannel: input.settings.activation.channel,
      cteRetryBackoffSeconds: [...input.settings.cteRetry.backoffSeconds],
      cteRetryMaxAttempts: input.settings.cteRetry.maxAttempts,
    })
    .where(
      and(
        eq(companyFiscalProfiles.companyId, input.companyId),
        eq(companyFiscalProfiles.version, currentVersion),
      ),
    )
    .returning({ version: companyFiscalProfiles.version })
  if (profile === undefined) {
    throw new CompanySettingsVersionConflictError()
  }
  return profile.version
}
