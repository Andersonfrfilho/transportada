/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { getTableName } from 'drizzle-orm'
import type { PgTable } from 'drizzle-orm/pg-core'
import { describe, expect, test } from 'bun:test'

import { DrizzleNfseIssuanceExecutionRepository } from '../src/nfse-issuance/infrastructure/drizzle-nfse-issuance-execution.repository.js'

const COMPANY_ID = '3b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e'
const INVOICE_ID = '5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c8d'
const ATTEMPT_ID = '6b7c8d9e-0f1a-4b2c-8d3e-4f5a6b7c8d9e'
const CREDENTIAL_ID = '9e0f1a2b-3c4d-4e5f-8a6b-7c8d9e0f1a2b'
const PROVIDER_DOCUMENT_ID = 'nota-rp-4711'
const CANCELLATION_REASON = 'Cliente Fulano de Tal pediu por telefone'

const PAYLOAD_TABLE = 'nfse_issuance_payloads'

type Row = Record<string, unknown>

type JoinCall = { readonly kind: 'inner' | 'left'; readonly table: string }

type Database = ConstructorParameters<typeof DrizzleNfseIssuanceExecutionRepository>[0]

type Builder = {
  readonly from: (table: PgTable) => Builder
  readonly innerJoin: (table: PgTable) => Builder
  readonly leftJoin: (table: PgTable) => Builder
  readonly limit: (count: number) => Builder
  readonly then: (resolve: (rows: readonly Row[]) => unknown) => Promise<unknown>
  readonly where: () => Builder
}

/** Substitui o query builder do Drizzle sem banco, no molde de billing-infrastructure/support.ts. */
function createDatabaseStub(row?: Row): {
  readonly database: Database
  readonly joins: readonly JoinCall[]
} {
  const joins: JoinCall[] = []

  const builder: Builder = {
    from: () => builder,
    innerJoin(table) {
      joins.push({ kind: 'inner', table: getTableName(table) })
      return builder
    },
    leftJoin(table) {
      joins.push({ kind: 'left', table: getTableName(table) })
      return builder
    },
    limit: () => builder,
    then: (resolve) => Promise.resolve(row === undefined ? [] : [row]).then(resolve),
    where: () => builder,
  }

  return { database: { select: () => builder } as unknown as Database, joins }
}

function createRow(overrides?: Row): Row {
  return {
    cancellationReason: CANCELLATION_REASON,
    credentialId: CREDENTIAL_ID,
    envelope: { sealed: true },
    fiscalEnvironment: 'homologation',
    municipalRegistration: '12345678',
    payload: { serviceAmount: '100.0000' },
    providerDocumentId: PROVIDER_DOCUMENT_ID,
    ...overrides,
  }
}

async function load(input: {
  readonly database: Database
}): Promise<Awaited<ReturnType<DrizzleNfseIssuanceExecutionRepository['load']>>> {
  return new DrizzleNfseIssuanceExecutionRepository(input.database).load({
    attemptId: ATTEMPT_ID,
    companyId: COMPANY_ID,
    invoiceId: INVOICE_ID,
  })
}

describe('NFS-e issuance execution input contract', () => {
  /**
   * Só a emissão congela payload; o cancelamento transmite o id do provedor e o motivo. Com o
   * vínculo obrigatório, a tentativa de cancelamento não vinha na consulta, o efeito a tratava como
   * linha que sumiu e a mensagem era confirmada sem nada ter sido transmitido.
   */
  test('o payload congelado é vínculo opcional: a tentativa de cancelamento não tem um', async () => {
    const { database, joins } = createDatabaseStub(createRow())

    await load({ database })

    expect(joins).toContainEqual({ kind: 'left', table: PAYLOAD_TABLE })
  })

  test('a nota e a credencial continuam obrigatórias: sem elas não há o que transmitir', async () => {
    const { database, joins } = createDatabaseStub(createRow())

    await load({ database })

    expect(joins).toContainEqual({ kind: 'inner', table: 'nfse_service_invoices' })
    expect(joins).toContainEqual({ kind: 'inner', table: 'nfse_provider_credentials' })
  })

  test('a linha sem payload entrega credencial, motivo e documento do provedor', async () => {
    const { database } = createDatabaseStub(createRow({ payload: null }))

    const execution = await load({ database })

    expect(execution).toEqual({
      cancellationReason: CANCELLATION_REASON,
      credential: {
        companyId: COMPANY_ID,
        credentialId: CREDENTIAL_ID,
        envelope: { sealed: true },
        fiscalEnvironment: 'homologation',
        municipalRegistration: '12345678',
      },
      providerDocumentId: PROVIDER_DOCUMENT_ID,
    })
  })

  test('a tentativa já liquidada some da consulta e nada é transmitido', async () => {
    const { database } = createDatabaseStub()

    expect(await load({ database })).toBeUndefined()
  })
})
