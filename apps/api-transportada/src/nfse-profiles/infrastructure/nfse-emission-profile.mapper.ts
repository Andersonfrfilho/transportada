/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { SecretEnvelopeV1 } from '@adatechnology/secret-envelope'

import type { nfseEmissionProfiles, nfseProviderCredentials } from '../../database/nfse.schema.js'
import type {
  NfseEmissionProfileDetail,
  NfseProviderCredentialRecord,
  NfseProviderCredentialSummary,
} from '../application/nfse-profile.port.js'

type ProfileRecord = typeof nfseEmissionProfiles.$inferSelect
type CredentialRecord = typeof nfseProviderCredentials.$inferSelect

export function mapProfile(record: ProfileRecord): NfseEmissionProfileDetail {
  return {
    chargeComponentLabel: record.chargeComponentLabel,
    cnaeCode: record.cnaeCode,
    companyId: record.companyId,
    createdAt: record.createdAt.toISOString(),
    descriptionMaxLength: record.descriptionMaxLength.toString(),
    descriptionTemplate: record.descriptionTemplate,
    freightRuleId: record.freightRuleId,
    id: record.id,
    issExigibility: record.issExigibility,
    issRate: record.issRate,
    issWithheld: record.issWithheld,
    municipalityIbgeCode: record.municipalityIbgeCode,
    municipalityName: record.municipalityName,
    municipalTaxationCode: record.municipalTaxationCode,
    name: record.name,
    nbsCode: record.nbsCode,
    observations: record.observations,
    serviceListItem: record.serviceListItem,
    status: record.status,
    taker: record.taker,
    updatedAt: record.updatedAt.toISOString(),
    version: record.version.toString(),
  }
}

/**
 * O resumo é a única projeção de credencial que sai da infraestrutura. Os dois segredos viram
 * booleanos aqui — nem o envelope nem o hash do callback atravessam a fronteira da aplicação.
 */
export function mapCredentialSummary(record: CredentialRecord): NfseProviderCredentialSummary {
  return {
    apiTokenConfigured: hasSealedSecret(record.secretEnvelope),
    callbackTokenConfigured: record.callbackTokenSha256.length > 0,
    createdAt: record.createdAt.toISOString(),
    fiscalEnvironment: record.fiscalEnvironment,
    id: record.id,
    municipalRegistration: record.municipalRegistration,
    provider: record.provider,
    status: record.status,
    taxId: record.taxId,
    updatedAt: record.updatedAt.toISOString(),
    version: record.version.toString(),
  }
}

export function mapCredentialRecord(record: CredentialRecord): NfseProviderCredentialRecord {
  return {
    callbackTokenSha256: record.callbackTokenSha256,
    id: record.id,
    secretEnvelope: record.secretEnvelope as SecretEnvelopeV1,
    version: record.version.toString(),
  }
}

function hasSealedSecret(envelope: unknown): boolean {
  return (
    typeof envelope === 'object' &&
    envelope !== null &&
    typeof (envelope as { readonly ciphertext?: unknown }).ciphertext === 'string' &&
    (envelope as { readonly ciphertext: string }).ciphertext.length > 0
  )
}
