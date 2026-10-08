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
const PROVIDER_REQUEST_KEY = '0199b7a4-5c1e-7d2a-9f3b-1a2b3c4d5e6f'
const COMPANY_TAX_ID = '12345678000190'
/** Código do vocabulário da prefeitura. O texto livre do operador fica na nota e não vem para cá. */
const CANCELLATION_MOTIVE = '2'
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
function createDatabaseStub(
  row?: Row,
  historyRows: readonly Row[] = [],
): {
  readonly database: Database
  readonly joins: readonly JoinCall[]
  readonly selectCount: () => number
} {
  const joins: JoinCall[] = []
  let selects = 0

  function createBuilder(result: readonly Row[]): Builder {
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
      then: (resolve) => Promise.resolve(result).then(resolve),
      where: () => builder,
    }
    return builder
  }

  const database = {
    select: () => {
      selects += 1
      return createBuilder(selects === 1 ? (row === undefined ? [] : [row]) : historyRows)
    },
  } as unknown as Database

  return { database, joins, selectCount: () => selects }
}

function createRow(overrides?: Row): Row {
  return {
    attemptKind: 'issue',
    attemptNumber: 1n,
    cancellationMotive: null,
    cancellationReason: CANCELLATION_REASON,
    credentialId: CREDENTIAL_ID,
    envelope: { sealed: true },
    fiscalEnvironment: 'homologation',
    municipalRegistration: '12345678',
    payload: { serviceAmount: '100.0000' },
    providerConfig: { providerApiVersion: 'v3' },
    providerDocumentId: null,
    providerRequestKey: PROVIDER_REQUEST_KEY,
    taxId: COMPANY_TAX_ID,
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

  /**
   * O que sai daqui é o **código** do motivo: é ele que vai no corpo do `/cancelar-nota`. O texto
   * livre do operador fica na nota — trazê-lo para o worker seria carregar PII até a fronteira do
   * provedor sem ninguém precisar dele.
   */
  test('a emissão entrega a versão da própria tentativa, a chave do provedor e o CNPJ', async () => {
    const { database, selectCount } = createDatabaseStub(createRow())

    const execution = await load({ database })

    expect(execution).toEqual({
      credential: {
        companyId: COMPANY_ID,
        credentialId: CREDENTIAL_ID,
        envelope: { sealed: true },
        fiscalEnvironment: 'homologation',
        municipalRegistration: '12345678',
        taxId: COMPANY_TAX_ID,
      },
      payload: { serviceAmount: '100.0000' },
      providerApiVersion: 'v3',
      providerRequestKey: PROVIDER_REQUEST_KEY,
    })
    expect(selectCount()).toBe(1)
  })

  test('tentativa legada sem providerApiVersion nem chave do provedor é v2 e não inventa chave', async () => {
    const { database } = createDatabaseStub(
      createRow({ providerConfig: {}, providerRequestKey: null }),
    )

    const execution = await load({ database })

    expect(execution?.providerApiVersion).toBe('v2')
    expect(execution).not.toHaveProperty('providerRequestKey')
  })

  /**
   * O cancelamento transmite o id do provedor e o motivo, e a versão é a da última **emissão** da
   * nota: ele não congela payload, então a própria tentativa não diz em que API a nota nasceu.
   */
  test('a linha sem payload entrega credencial, código do motivo, documento do provedor e a versão da última emissão', async () => {
    const { database } = createDatabaseStub(
      createRow({
        attemptKind: 'cancel',
        attemptNumber: 2n,
        cancellationMotive: CANCELLATION_MOTIVE,
        payload: null,
        providerConfig: null,
        providerDocumentId: PROVIDER_DOCUMENT_ID,
        providerRequestKey: null,
      }),
      [
        { attemptNumber: 1n, invoiceId: INVOICE_ID, providerConfig: { providerApiVersion: 'v2' } },
        { attemptNumber: 3n, invoiceId: INVOICE_ID, providerConfig: { providerApiVersion: 'v3' } },
      ],
    )

    const execution = await load({ database })

    expect(execution).toEqual({
      cancellationMotive: CANCELLATION_MOTIVE,
      credential: {
        companyId: COMPANY_ID,
        credentialId: CREDENTIAL_ID,
        envelope: { sealed: true },
        fiscalEnvironment: 'homologation',
        municipalRegistration: '12345678',
        taxId: COMPANY_TAX_ID,
      },
      providerApiVersion: 'v3',
      providerDocumentId: PROVIDER_DOCUMENT_ID,
    })
  })

  test('cancelamento de nota sem emissão registrada cai na v2', async () => {
    const { database } = createDatabaseStub(
      createRow({
        attemptKind: 'cancel',
        payload: null,
        providerConfig: null,
        providerDocumentId: PROVIDER_DOCUMENT_ID,
      }),
    )

    expect((await load({ database }))?.providerApiVersion).toBe('v2')
  })

  /** Nunca mandar id_nota de nota da v2 para a v3: a chave de idempotência protege a duplicação. */
  test('reemissão v3 só reaproveita o id_nota quando toda emissão anterior foi v3', async () => {
    const allV3 = createDatabaseStub(
      createRow({ attemptNumber: 2n, providerDocumentId: PROVIDER_DOCUMENT_ID }),
      [
        { attemptNumber: 1n, invoiceId: INVOICE_ID, providerConfig: { providerApiVersion: 'v3' } },
        { attemptNumber: 2n, invoiceId: INVOICE_ID, providerConfig: { providerApiVersion: 'v3' } },
      ],
    )
    const mixed = createDatabaseStub(
      createRow({ attemptNumber: 2n, providerDocumentId: PROVIDER_DOCUMENT_ID }),
      [
        { attemptNumber: 1n, invoiceId: INVOICE_ID, providerConfig: { providerApiVersion: 'v2' } },
        { attemptNumber: 2n, invoiceId: INVOICE_ID, providerConfig: { providerApiVersion: 'v3' } },
      ],
    )

    expect((await load({ database: allV3.database }))?.reissueProviderDocumentId).toBe(
      PROVIDER_DOCUMENT_ID,
    )
    expect(await load({ database: mixed.database })).not.toHaveProperty('reissueProviderDocumentId')
  })

  test('a tentativa já liquidada some da consulta e nada é transmitido', async () => {
    const { database } = createDatabaseStub()

    expect(await load({ database })).toBeUndefined()
  })
})
