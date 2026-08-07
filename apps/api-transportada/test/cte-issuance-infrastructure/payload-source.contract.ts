/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, test } from 'bun:test'

import {
  buildAddressJoinFilters,
  buildBatchItemFilters,
  buildDocumentJoinFilters,
  buildEmitterFilters,
  buildItemDocumentFilters,
  buildParticipantFilters,
  buildProductFilters,
  buildProfileFilters,
  buildVolumeFilters,
  findCteIssuancePayloadSource,
} from '../../src/cte-issuance/infrastructure/cte-issuance-payload.query.js'
import {
  buildGroupedPayloadRows,
  createPayloadQueryableStub,
  GROUPED_BATCH_ID,
  GROUPED_BATCH_ITEM_ID,
  GROUPED_COMPANY_ID,
  GROUPED_DOCUMENTS,
} from './support.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000701'
const OTHER_COMPANY_ID = '00000000-0000-4000-8000-000000000702'
const BATCH_ID = '00000000-0000-4000-8000-000000000703'
const BATCH_ITEM_ID = '00000000-0000-4000-8000-000000000704'
const PROFILE_ID = '00000000-0000-4000-8000-000000000705'
const DOCUMENT_IDS = [
  '00000000-0000-4000-8000-000000000706',
  '00000000-0000-4000-8000-000000000707',
] as const

const dialect = new PgDialect()

const toSql = (filters: readonly Parameters<typeof and>[number][]) =>
  dialect.sqlToQuery(and(...filters)!)

describe('CT-e payload source tenant safety', () => {
  test('scopes the batch item lookup by company, batch and item', () => {
    const query = toSql(
      buildBatchItemFilters({
        batchId: BATCH_ID,
        batchItemId: BATCH_ITEM_ID,
        companyId: COMPANY_ID,
      }),
    )

    expect(query.sql).toContain('"cte_batch_items"."company_id" = $')
    expect(query.sql).toContain('"cte_batch_items"."batch_id" = $')
    expect(query.sql).toContain('"cte_batch_items"."id" = $')
    expect(query.params).toEqual([COMPANY_ID, BATCH_ID, BATCH_ITEM_ID])
  })

  test('scopes the emitter and the profile by company', () => {
    const emitter = toSql(buildEmitterFilters({ companyId: COMPANY_ID }))
    const profile = toSql(buildProfileFilters({ companyId: COMPANY_ID, profileId: PROFILE_ID }))

    expect(emitter.sql).toContain('"company_fiscal_profiles"."company_id" = $')
    expect(emitter.params).toEqual([COMPANY_ID])
    expect(profile.sql).toContain('"cte_emission_profiles"."company_id" = $')
    expect(profile.sql).toContain('"cte_emission_profiles"."id" = $')
    expect(profile.params).toEqual([COMPANY_ID, PROFILE_ID])
  })

  test('scopes the linked documents by company and keeps the join inside the tenant', () => {
    const documents = toSql(
      buildItemDocumentFilters({ batchItemId: BATCH_ITEM_ID, companyId: COMPANY_ID }),
    )
    const join = toSql(buildDocumentJoinFilters())

    expect(documents.sql).toContain('"cte_batch_item_documents"."company_id" = $')
    expect(documents.sql).toContain('"cte_batch_item_documents"."item_id" = $')
    expect(documents.params).toEqual([COMPANY_ID, BATCH_ITEM_ID])
    expect(join.sql).toContain(
      '"nfe_documents"."company_id" = "cte_batch_item_documents"."company_id"',
    )
    expect(join.sql).toContain(
      '"nfe_documents"."id" = "cte_batch_item_documents"."nfe_document_id"',
    )
  })

  test('scopes participants by company and keeps the address join inside the tenant', () => {
    const participants = toSql(
      buildParticipantFilters({ companyId: COMPANY_ID, documentIds: DOCUMENT_IDS }),
    )
    const join = toSql(buildAddressJoinFilters())

    expect(participants.sql).toContain('"nfe_participants"."company_id" = $')
    expect(participants.sql).toContain('"nfe_participants"."document_id" in ($')
    expect(participants.params).toEqual([COMPANY_ID, ...DOCUMENT_IDS])
    expect(join.sql).toContain('"nfe_addresses"."company_id" = "nfe_participants"."company_id"')
    expect(join.sql).toContain('"nfe_addresses"."participant_id" = "nfe_participants"."id"')
  })

  test('scopes products and volumes by company', () => {
    const products = toSql(
      buildProductFilters({ companyId: COMPANY_ID, documentIds: DOCUMENT_IDS }),
    )
    const volumes = toSql(buildVolumeFilters({ companyId: COMPANY_ID, documentIds: DOCUMENT_IDS }))

    expect(products.sql).toContain('"nfe_products"."company_id" = $')
    expect(products.sql).toContain('"nfe_products"."document_id" in ($')
    expect(products.params).toEqual([COMPANY_ID, ...DOCUMENT_IDS])
    expect(volumes.sql).toContain('"nfe_volumes"."company_id" = $')
    expect(volumes.sql).toContain('"nfe_volumes"."document_id" in ($')
    expect(volumes.params).toEqual([COMPANY_ID, ...DOCUMENT_IDS])
  })

  test('carries the company of the caller, never a second tenant', () => {
    const query = toSql(
      buildProductFilters({ companyId: OTHER_COMPANY_ID, documentIds: DOCUMENT_IDS }),
    )

    expect(query.params).toEqual([OTHER_COMPANY_ID, ...DOCUMENT_IDS])
    expect(query.params).not.toContain(COMPANY_ID)
  })
})

describe('CT-e payload source for an item grouped by sender and recipient', () => {
  const loadGroupedSource = () => {
    const stub = createPayloadQueryableStub(buildGroupedPayloadRows())
    return findCteIssuancePayloadSource(stub.queryable, {
      batchId: GROUPED_BATCH_ID,
      batchItemId: GROUPED_BATCH_ITEM_ID,
      companyId: GROUPED_COMPANY_ID,
    }).then((source) => ({ orderings: stub.orderings, source }))
  }

  test('returns one entry per invoice, in the position order of the item documents', async () => {
    const { orderings, source } = await loadGroupedSource()

    expect(source?.invoices).toHaveLength(3)
    expect(source?.invoices.map((invoice) => invoice.accessKey)).toEqual([
      GROUPED_DOCUMENTS[0].accessKey,
      GROUPED_DOCUMENTS[1].accessKey,
      GROUPED_DOCUMENTS[2].accessKey,
    ])
    expect(orderings).toContain('"cte_batch_item_documents"."position" asc')
  })

  test('keeps the products and the volumes of every invoice on their own invoice', async () => {
    const { source } = await loadGroupedSource()

    expect(
      source?.invoices.map((invoice) => invoice.products.map((product) => product.description)),
    ).toEqual([['PRODUTO ALFA'], ['PRODUTO BRAVO', 'PRODUTO CHARLIE'], ['PRODUTO DELTA']])
    expect(
      source?.invoices.map((invoice) => invoice.volumes.map((volume) => volume.grossWeight)),
    ).toEqual([['10.500'], ['20.250'], ['30.000']])
    expect(source?.invoices.map((invoice) => invoice.totalAmount)).toEqual([
      '100.00',
      '250.00',
      '375.50',
    ])
  })

  test('carries the same sender and recipient pair on every invoice of the group', async () => {
    const { source } = await loadGroupedSource()
    const senders = source?.invoices.map((invoice) => invoice.sender.taxId) ?? []
    const recipients = source?.invoices.map((invoice) => invoice.recipient.taxId) ?? []

    expect(new Set(senders).size).toBe(1)
    expect(new Set(recipients).size).toBe(1)
    expect(senders[0]).not.toBe(recipients[0])
    expect(source?.invoices[0]?.sender.legalName).toBe('REMETENTE ALFA LTDA')
    expect(source?.invoices[0]?.recipient.legalName).toBe('DESTINATARIO BRAVO LTDA')
  })

  // O XML da NF-e traz estes campos e o CT-e de referência os repete: descartá-los na leitura
  // empobrece o documento fiscal sem que nada falhe.
  test('carries the trade name, the phone and the address complement of the parties', async () => {
    const { source } = await loadGroupedSource()
    const sender = source?.invoices[0]?.sender
    const recipient = source?.invoices[0]?.recipient

    expect(sender?.tradeName).toBe('ALFA DISTRIBUICAO')
    expect(sender?.phone).toBe('1133334444')
    expect(sender?.complement).toBe('GALPAO B')
    expect(recipient?.tradeName).toBeNull()
    expect(recipient?.phone).toBe('3144445555')
    expect(recipient?.complement).toBeNull()
  })

  test('reads the charge and the profile from the item snapshot, once for the whole group', async () => {
    const { source } = await loadGroupedSource()

    expect(source?.charge).toEqual({
      components: [{ amount: '33.99', label: 'Frete' }],
      totalAmount: '33.99',
    })
    expect(source?.profile.predominantProductMode).toBe('highest_quantity')
    expect(source?.emitter.taxRegime).toBe('1')
  })
})
