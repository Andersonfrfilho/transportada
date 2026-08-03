/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, test } from 'bun:test'

import { mapManifest } from '../../src/mdfe-manifests/infrastructure/mdfe-manifest.mapper.js'
import {
  buildManifestRejectionFilters,
  indexLastRejections,
} from '../../src/mdfe-manifests/infrastructure/mdfe-manifest-rejection.query.js'

const COMPANY_ID = '00000000-0000-4000-8000-0000000000c1'
const MANIFEST_ID = '00000000-0000-4000-8000-0000000000c2'
const OTHER_MANIFEST_ID = '00000000-0000-4000-8000-0000000000c3'

const REJECTION_MESSAGE = 'Rejeicao: Numero do MDF-e ja utilizado'

const dialect = new PgDialect()

const toSql = (filters: readonly Parameters<typeof and>[number][]) =>
  dialect.sqlToQuery(and(...filters)!)

const attempt = (input: {
  readonly attemptKind: 'cancel' | 'close' | 'issue'
  readonly lastErrorCode: string | null
  readonly lastErrorMessage: string | null
  readonly manifestId: string
  readonly updatedAt: string
}) => ({ ...input, updatedAt: new Date(input.updatedAt) })

const manifestRecord = {
  additionalInformation: '',
  cargoProduct: 'Bebidas',
  cargoProductNcm: '22021000',
  cargoType: '05',
  cargoUnit: '01',
  cargoValue: '1250.00',
  cargoWeight: '850.0000',
  contractorName: '',
  contractorTaxId: '',
  createdAt: new Date('2026-07-27T12:00:00.000Z'),
  cteCount: 1n,
  destinationState: 'SP',
  dischargePostalCode: '01310100',
  emitterType: '1',
  fiscalEnvironment: 'homologation',
  fiscalNumber: null,
  fiscalSeries: '',
  freightValue: '480.00',
  id: MANIFEST_ID,
  insuranceEndorsement: '',
  loadingPostalCode: '80010000',
  originState: 'PR',
  rntrc: '12345678',
  status: 'rejected',
  transporterType: '1',
  tripStartedAt: null,
  updatedAt: new Date('2026-07-27T12:30:00.000Z'),
  vehicleId: '00000000-0000-4000-8000-0000000000c4',
  version: 2n,
} as unknown as Parameters<typeof mapManifest>[0]['record']

describe('MDF-e manifest rejection lookup', () => {
  test('scopes the rejected attempts by company and manifest', () => {
    const query = toSql(
      buildManifestRejectionFilters({
        companyId: COMPANY_ID,
        manifestIds: [MANIFEST_ID, OTHER_MANIFEST_ID],
      }),
    )

    expect(query.sql).toContain('"mdfe_issuance_attempts"."company_id" = $')
    expect(query.sql).toContain('"mdfe_issuance_attempts"."manifest_id" in ($')
    expect(query.sql).toContain('"mdfe_issuance_attempts"."status" = $')
    expect(query.params).toEqual([COMPANY_ID, MANIFEST_ID, OTHER_MANIFEST_ID, 'rejected'])
  })

  test('keeps the most recent refusal of each manifest', () => {
    const index = indexLastRejections([
      attempt({
        attemptKind: 'issue',
        lastErrorCode: '726',
        lastErrorMessage: REJECTION_MESSAGE,
        manifestId: MANIFEST_ID,
        updatedAt: '2026-07-28T10:00:00.000Z',
      }),
      attempt({
        attemptKind: 'issue',
        lastErrorCode: '578',
        lastErrorMessage: 'Rejeicao: antiga',
        manifestId: MANIFEST_ID,
        updatedAt: '2026-07-27T10:00:00.000Z',
      }),
      attempt({
        attemptKind: 'cancel',
        lastErrorCode: '573',
        lastErrorMessage: 'Rejeicao: Duplicidade de evento',
        manifestId: OTHER_MANIFEST_ID,
        updatedAt: '2026-07-28T09:00:00.000Z',
      }),
    ])

    expect(index.get(MANIFEST_ID)).toEqual({
      attemptKind: 'issue',
      code: '726',
      message: REJECTION_MESSAGE,
      occurredAt: '2026-07-28T10:00:00.000Z',
    })
    expect(index.get(OTHER_MANIFEST_ID)?.attemptKind).toBe('cancel')
  })

  /** Recusa antiga sem texto gravado não pode virar string vazia — a tela distingue os dois casos. */
  test('keeps a refusal without a stored message as null', () => {
    const index = indexLastRejections([
      attempt({
        attemptKind: 'issue',
        lastErrorCode: 'FISCAL_REJECTED',
        lastErrorMessage: null,
        manifestId: MANIFEST_ID,
        updatedAt: '2026-07-28T10:00:00.000Z',
      }),
    ])

    expect(index.get(MANIFEST_ID)?.message).toBeNull()
  })

  test('carries the refusal into the manifest the operator reads', () => {
    const rejection = {
      attemptKind: 'issue',
      code: '726',
      message: REJECTION_MESSAGE,
      occurredAt: '2026-07-28T10:00:00.000Z',
    } as const

    expect(mapManifest({ record: manifestRecord, rejection }).lastRejection).toEqual(rejection)
    expect(mapManifest({ record: manifestRecord, rejection: null }).lastRejection).toBeNull()
  })
})
