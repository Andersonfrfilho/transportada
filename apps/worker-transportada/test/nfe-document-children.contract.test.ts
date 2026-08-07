/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { NfeXmlDocument } from '@adatechnology/fiscal-provider'
import { describe, expect, test } from 'bun:test'
import { getTableName } from 'drizzle-orm'
import type { PgTable } from 'drizzle-orm/pg-core'

import {
  writeDocumentChildren,
  type NfeWriteTransaction,
} from '../src/nfe-imports/infrastructure/drizzle-nfe-import-consumer.repository.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000901'
const DOCUMENT_ID = '00000000-0000-4000-8000-000000000902'

type Insert = { readonly table: string; readonly values: readonly Record<string, unknown>[] }

function createTransactionStub(): {
  readonly inserts: readonly Insert[]
  readonly tx: NfeWriteTransaction
} {
  const inserts: Insert[] = []
  const tx = {
    insert(table: PgTable) {
      const name = getTableName(table)
      return {
        async values(values: readonly Record<string, unknown>[]) {
          inserts.push({ table: name, values })
        },
      }
    },
  }

  return { inserts, tx: tx as unknown as NfeWriteTransaction }
}

const DOCUMENT = {
  accessKey: '35260861156864000191570010000000181296092838',
  issuer: {
    address: {
      city: 'CIDADE ALFA',
      cityCode: '3500000',
      complement: 'GALPAO B',
      district: 'DISTRITO ALFA',
      number: '100',
      phone: '1133334444',
      postalCode: '01000000',
      state: 'SP',
      street: 'RUA ALFA',
    },
    name: 'REMETENTE ALFA LTDA',
    stateRegistration: '110000000000',
    taxId: '11222333000181',
    tradeName: 'ALFA DISTRIBUICAO',
  },
  products: [],
  recipient: {
    address: {
      city: 'CIDADE BRAVO',
      cityCode: '3600000',
      district: 'DISTRITO BRAVO',
      number: '200',
      postalCode: '02000000',
      state: 'MG',
      street: 'RUA BRAVO',
    },
    name: 'DESTINATARIO BRAVO LTDA',
    taxId: '44555666000172',
  },
  volumes: [],
} as unknown as NfeXmlDocument

// O XML da NF-e traz nome fantasia e telefone do participante; sem persistir, o CT-e sai sem
// xFant e sem fone e não há como recuperar o dado sem reprocessar o arquivo.
describe('NF-e document children persistence', () => {
  test('persists the trade name and the phone the XML carried', async () => {
    const { inserts, tx } = createTransactionStub()

    await writeDocumentChildren({
      companyId: COMPANY_ID,
      document: DOCUMENT,
      documentId: DOCUMENT_ID,
      tx,
    })

    const participants = inserts.find((entry) => entry.table === 'nfe_participants')?.values ?? []
    const addresses = inserts.find((entry) => entry.table === 'nfe_addresses')?.values ?? []

    expect(participants[0]?.['tradeName']).toBe('ALFA DISTRIBUICAO')
    expect(participants[1]?.['tradeName']).toBeNull()
    expect(addresses[0]?.['phone']).toBe('1133334444')
    expect(addresses[0]?.['complement']).toBe('GALPAO B')
    expect(addresses[1]?.['phone']).toBeNull()
  })
})
