/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { NfeXmlDocument } from '@adatechnology/fiscal-provider'
import { describe, expect, test } from 'bun:test'

import { nfeAddresses, nfeParticipants } from '../../src/database/nfe.schema.js'
import {
  writeDocumentChildren,
  type NfeWriteTransaction,
} from '../../src/nfe-imports/infrastructure/drizzle-nfe-import-consumer.repository.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000101'
const DOCUMENT_ID = '00000000-0000-4000-8000-000000000230'

const DOCUMENT: NfeXmlDocument = {
  accessKey: '35260761156864000191550010000000022000000022',
  issuedAt: '2026-07-22T14:00:00.000Z',
  issuer: {
    address: {
      city: 'Campinas',
      cityCode: '3509502',
      district: 'Centro',
      number: '100',
      postalCode: '13010000',
      state: 'SP',
      street: 'Rua das Cargas',
    },
    name: 'Emitente Teste LTDA',
    taxId: '61156864000191',
  },
  model: '55',
  number: '000012345',
  operationNature: 'Venda de mercadoria',
  operationType: '1',
  products: [],
  recipient: {
    address: {
      city: 'Jundiaí',
      cityCode: '3525904',
      state: 'SP',
      street: 'Avenida Logística',
    },
    name: 'TransportAdA LTDA',
    taxId: '12345678000199',
  },
  relatedCnpjs: [],
  series: '001',
  status: 'authorized',
  totals: { invoice: '958.48', products: '958.48' },
  volumes: [],
}

describe('nfe import consumer document children contract', () => {
  test('persists the ibge city code of every party address', async () => {
    const recorder = createRecordingTransaction()

    await writeDocumentChildren({
      companyId: COMPANY_ID,
      document: DOCUMENT,
      documentId: DOCUMENT_ID,
      tx: recorder.transaction,
    })

    expect(rowsOf(recorder, nfeAddresses).map((row) => row['cityCode'])).toEqual([
      '3509502',
      '3525904',
    ])
  })

  test('keeps the city code null when the xml omits cMun', async () => {
    const recorder = createRecordingTransaction()

    await writeDocumentChildren({
      companyId: COMPANY_ID,
      document: { ...DOCUMENT, issuer: { ...DOCUMENT.issuer, address: { city: 'Campinas' } } },
      documentId: DOCUMENT_ID,
      tx: recorder.transaction,
    })

    expect(rowsOf(recorder, nfeAddresses)[0]).toMatchObject({
      city: 'Campinas',
      cityCode: null,
      participantId: rowsOf(recorder, nfeParticipants)[0]?.['id'],
    })
  })
})

type InsertedBatch = {
  readonly rows: readonly Record<string, unknown>[]
  readonly table: unknown
}

type Recorder = {
  readonly inserts: InsertedBatch[]
  readonly transaction: NfeWriteTransaction
}

function createRecordingTransaction(): Recorder {
  const inserts: InsertedBatch[] = []
  const transaction = {
    insert(table: unknown) {
      return {
        async values(rows: readonly Record<string, unknown>[]): Promise<void> {
          inserts.push({ rows, table })
        },
      }
    },
  }
  return { inserts, transaction: transaction as unknown as NfeWriteTransaction }
}

function rowsOf(recorder: Recorder, table: unknown): readonly Record<string, unknown>[] {
  return recorder.inserts.filter((batch) => batch.table === table).flatMap((batch) => batch.rows)
}
