/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { SQL } from 'drizzle-orm'
import { getTableName } from 'drizzle-orm'
import { PgDialect, type PgTable } from 'drizzle-orm/pg-core'

import type { PayloadQueryable } from '../../src/cte-issuance/infrastructure/cte-issuance-payload.query.js'

type Row = Record<string, unknown>

export type StubRowsByTable = Readonly<Record<string, readonly Row[]>>

type QueryBuilder = {
  readonly from: (table: PgTable) => QueryBuilder
  readonly innerJoin: () => QueryBuilder
  readonly leftJoin: () => QueryBuilder
  readonly limit: (count: number) => QueryBuilder
  readonly orderBy: (...expressions: readonly SQL[]) => QueryBuilder
  readonly then: (resolve: (rows: readonly Row[]) => unknown) => Promise<unknown>
  readonly where: () => QueryBuilder
}

const dialect = new PgDialect()

/**
 * Substitui o query builder do Drizzle sem banco: devolve linhas por tabela consultada e registra as
 * ordenações pedidas, para que a ordem de um item com várias notas seja verificável no contrato.
 */
export function createPayloadQueryableStub(rows: StubRowsByTable): {
  readonly orderings: readonly string[]
  readonly queryable: PayloadQueryable
} {
  const orderings: string[] = []

  function createBuilder(): QueryBuilder {
    let tableName = ''
    let limitCount: null | number = null

    const builder: QueryBuilder = {
      from(table) {
        tableName = getTableName(table)
        return builder
      },
      innerJoin: () => builder,
      leftJoin: () => builder,
      limit(count) {
        limitCount = count
        return builder
      },
      orderBy(...expressions) {
        for (const expression of expressions) orderings.push(dialect.sqlToQuery(expression).sql)
        return builder
      },
      then(resolve) {
        const selected = rows[tableName] ?? []
        return Promise.resolve(limitCount === null ? selected : selected.slice(0, limitCount)).then(
          resolve,
        )
      },
      where: () => builder,
    }

    return builder
  }

  return {
    orderings,
    queryable: { select: () => createBuilder() } as unknown as PayloadQueryable,
  }
}

export const GROUPED_COMPANY_ID = '00000000-0000-4000-8000-000000000801'
export const GROUPED_BATCH_ID = '00000000-0000-4000-8000-000000000802'
export const GROUPED_BATCH_ITEM_ID = '00000000-0000-4000-8000-000000000803'
export const GROUPED_PROFILE_ID = '00000000-0000-4000-8000-000000000804'

export const GROUPED_DOCUMENTS = [
  { accessKey: '11111111111111111111111111111111111111110001', id: 'doc-1', totalAmount: '100.00' },
  { accessKey: '11111111111111111111111111111111111111110002', id: 'doc-2', totalAmount: '250.00' },
  { accessKey: '11111111111111111111111111111111111111110003', id: 'doc-3', totalAmount: '375.50' },
] as const

const SENDER = {
  city: 'CIDADE ALFA',
  cityCode: '3500000',
  district: 'DISTRITO ALFA',
  legalName: 'REMETENTE ALFA LTDA',
  number: '100',
  postalCode: '01000000',
  role: 'emitter',
  state: 'SP',
  stateRegistration: '110000000000',
  street: 'RUA ALFA',
  taxId: '11222333000181',
} as const

const RECIPIENT = {
  city: 'CIDADE BRAVO',
  cityCode: '3600000',
  district: 'DISTRITO BRAVO',
  legalName: 'DESTINATARIO BRAVO LTDA',
  number: '200',
  postalCode: '02000000',
  role: 'recipient',
  state: 'MG',
  stateRegistration: '220000000000',
  street: 'RUA BRAVO',
  taxId: '44555666000172',
} as const

export const GROUPED_SNAPSHOT = {
  fiscalAmount: '33.99',
  fiscalComponents: [{ amount: '33.99', label: 'Frete' }],
  profile: { id: GROUPED_PROFILE_ID },
} as const

const EMITTER_ROW = {
  city: 'CIDADE CHARLIE',
  cityIbgeCode: '3700000',
  cnpj: '77888999000160',
  district: 'DISTRITO CHARLIE',
  legalName: 'TRANSPORTADORA CHARLIE LTDA',
  number: '300',
  postalCode: '03000000',
  rntrc: '12345678',
  state: 'SP',
  stateRegistration: '330000000000',
  street: 'RUA CHARLIE',
  taxRegime: '1',
} as const

const PROFILE_ROW = {
  cfopInternal: '5353',
  cfopInterstate: '6353',
  icmsBaseReductionRate: '0.000000',
  icmsCst: '90',
  icmsRate: '0.000000',
  modal: '01',
  observations: '',
  operationNature: 'PRESTACAO DE SERVICO DE TRANSPORTE',
  pickupDetails: '',
  pickupIndicator: '1',
  predominantProductMode: 'highest_quantity',
  predominantProductName: '',
  receiverIeIndicator: '1',
  serviceType: '0',
  taker: '0',
} as const

export function buildGroupedPayloadRows(): StubRowsByTable {
  return {
    company_fiscal_profiles: [EMITTER_ROW],
    cte_batch_item_documents: [...GROUPED_DOCUMENTS],
    cte_batch_items: [{ calculationSnapshot: GROUPED_SNAPSHOT }],
    cte_emission_profiles: [PROFILE_ROW],
    nfe_participants: GROUPED_DOCUMENTS.flatMap((document) => [
      { ...SENDER, documentId: document.id },
      { ...RECIPIENT, documentId: document.id },
    ]),
    nfe_products: [
      {
        description: 'PRODUTO ALFA',
        documentId: 'doc-1',
        ordinal: 1n,
        quantity: '5.0000',
        totalValue: '100.00',
      },
      {
        description: 'PRODUTO BRAVO',
        documentId: 'doc-2',
        ordinal: 1n,
        quantity: '12.0000',
        totalValue: '150.00',
      },
      {
        description: 'PRODUTO CHARLIE',
        documentId: 'doc-2',
        ordinal: 2n,
        quantity: '3.0000',
        totalValue: '100.00',
      },
      {
        description: 'PRODUTO DELTA',
        documentId: 'doc-3',
        ordinal: 1n,
        quantity: '9.0000',
        totalValue: '375.50',
      },
    ],
    nfe_volumes: [
      { documentId: 'doc-1', grossWeight: '10.500', netWeight: '10.000', quantity: '2' },
      { documentId: 'doc-2', grossWeight: '20.250', netWeight: '19.000', quantity: '3' },
      { documentId: 'doc-3', grossWeight: '30.000', netWeight: '28.500', quantity: '1' },
    ],
  }
}
