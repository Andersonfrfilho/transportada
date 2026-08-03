/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, desc, eq } from 'drizzle-orm'

import type { CertificatePurpose } from '../../database/digital-certificate.schema.js'
import { digitalCertificates } from '../../database/database.schema.js'
import type {
  DigitalCertificateMetadata,
  DigitalCertificateResult,
  DigitalCertificateRotation,
  RotateDigitalCertificateInput,
} from '../application/digital-certificate.port.js'

export async function retireActiveDigitalCertificate(input: {
  readonly companyId: string
  readonly purpose: CertificatePurpose
  readonly transaction: DigitalCertificateTransaction
}): Promise<DigitalCertificateMetadata | null> {
  const [record] = await input.transaction
    .update(digitalCertificates)
    .set({ secretEnvelope: null, status: 'retired', updatedAt: new Date() })
    .where(
      and(
        eq(digitalCertificates.companyId, input.companyId),
        eq(digitalCertificates.purpose, input.purpose),
        eq(digitalCertificates.status, 'active'),
      ),
    )
    .returning({
      createdAt: digitalCertificates.createdAt,
      expiresAt: digitalCertificates.expiresAt,
      id: digitalCertificates.id,
      purpose: digitalCertificates.purpose,
      validFrom: digitalCertificates.validFrom,
      version: digitalCertificates.version,
    })
  return record === undefined ? null : { ...record, status: 'retired' }
}
import type { DigitalCertificateTransaction } from './drizzle-digital-certificate.types.js'

export async function replaceDigitalCertificate(input: {
  readonly certificate: RotateDigitalCertificateInput
  readonly transaction: DigitalCertificateTransaction
}): Promise<DigitalCertificateRotation> {
  const previous = await findActiveCertificate(input)
  const version = await findNextVersion(input)
  if (previous !== null) await retireActiveCertificate(input)
  const result = await insertActiveCertificate({ ...input, version })
  return { previous, result }
}

async function findActiveCertificate(input: {
  readonly certificate: RotateDigitalCertificateInput
  readonly transaction: DigitalCertificateTransaction
}): Promise<DigitalCertificateResult | null> {
  const [record] = await input.transaction
    .select({
      expiresAt: digitalCertificates.expiresAt,
      id: digitalCertificates.id,
      purpose: digitalCertificates.purpose,
      validFrom: digitalCertificates.validFrom,
      version: digitalCertificates.version,
    })
    .from(digitalCertificates)
    .where(
      and(
        eq(digitalCertificates.companyId, input.certificate.companyId),
        eq(digitalCertificates.purpose, input.certificate.purpose),
        eq(digitalCertificates.status, 'active'),
      ),
    )
    .limit(1)
  return record === undefined ? null : { ...record, status: 'active' }
}

async function findNextVersion(input: {
  readonly certificate: RotateDigitalCertificateInput
  readonly transaction: DigitalCertificateTransaction
}): Promise<bigint> {
  const [latest] = await input.transaction
    .select({ version: digitalCertificates.version })
    .from(digitalCertificates)
    .where(
      and(
        eq(digitalCertificates.companyId, input.certificate.companyId),
        eq(digitalCertificates.purpose, input.certificate.purpose),
      ),
    )
    .orderBy(desc(digitalCertificates.version))
    .limit(1)
  return (latest?.version ?? 0n) + 1n
}

async function retireActiveCertificate(input: {
  readonly certificate: RotateDigitalCertificateInput
  readonly transaction: DigitalCertificateTransaction
}): Promise<void> {
  await input.transaction
    .update(digitalCertificates)
    .set({ secretEnvelope: null, status: 'retired', updatedAt: new Date() })
    .where(
      and(
        eq(digitalCertificates.companyId, input.certificate.companyId),
        eq(digitalCertificates.purpose, input.certificate.purpose),
        eq(digitalCertificates.status, 'active'),
      ),
    )
}

async function insertActiveCertificate(input: {
  readonly certificate: RotateDigitalCertificateInput
  readonly transaction: DigitalCertificateTransaction
  readonly version: bigint
}): Promise<DigitalCertificateResult> {
  const [record] = await input.transaction
    .insert(digitalCertificates)
    .values({
      id: input.certificate.certificateId,
      companyId: input.certificate.companyId,
      createdByUserId: input.certificate.createdByUserId,
      expiresAt: input.certificate.expiresAt,
      fingerprint: input.certificate.fingerprint,
      purpose: input.certificate.purpose,
      secretEnvelope: input.certificate.secretEnvelope,
      status: 'active',
      validatedCnpj: input.certificate.validatedCnpj,
      validFrom: input.certificate.validFrom,
      version: input.version,
    })
    .returning({
      expiresAt: digitalCertificates.expiresAt,
      id: digitalCertificates.id,
      purpose: digitalCertificates.purpose,
      validFrom: digitalCertificates.validFrom,
      version: digitalCertificates.version,
    })
  if (record === undefined) throw new Error('Digital certificate could not be persisted')
  return { ...record, status: 'active' }
}
