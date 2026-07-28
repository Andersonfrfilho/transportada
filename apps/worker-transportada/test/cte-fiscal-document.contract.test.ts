/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createHash } from 'node:crypto'

import { describe, expect, test } from 'bun:test'

import { createCteFiscalDocumentStorage } from '../src/cte-issuance/infrastructure/cte-fiscal-document-storage.gateway.js'

import {
  ACCESS_KEY,
  AUTHORIZED_XML,
  CERTIFICATE_PASSWORD,
  COMPANY_ID,
  createEffectFixture,
} from './cte-fiscal-document/fixture.js'

const AUTHORIZED_XML_SHA256 = createHash('sha256').update(AUTHORIZED_XML).digest('hex')

describe('CT-e authorized XML storage contract', () => {
  test('stores the authorized XML under the tenant prefix keyed by access key', async () => {
    const stored: Array<Record<string, unknown>> = []
    const storage = createCteFiscalDocumentStorage({
      bucket: 'fiscal-documents',
      gateway: {
        storeObject: async (input) => {
          stored.push({
            bucket: input.bucket,
            contentLength: input.contentLength,
            contentType: input.contentType,
            key: input.key,
            sha256: input.sha256,
          })
          return undefined as never
        },
      },
    })

    const object = await storage.storeAuthorizedXml({
      accessKey: ACCESS_KEY,
      companyId: COMPANY_ID,
      xml: AUTHORIZED_XML,
    })

    expect(stored).toEqual([
      {
        bucket: 'fiscal-documents',
        contentLength: Buffer.byteLength(AUTHORIZED_XML),
        contentType: 'application/xml',
        key: `tenants/${COMPANY_ID}/cte-documents/${ACCESS_KEY}/authorized.xml`,
        sha256: AUTHORIZED_XML_SHA256,
      },
    ])
    expect(object).toMatchObject({
      bucket: 'fiscal-documents',
      key: `tenants/${COMPANY_ID}/cte-documents/${ACCESS_KEY}/authorized.xml`,
      sha256: AUTHORIZED_XML_SHA256,
      sizeBytes: Buffer.byteLength(AUTHORIZED_XML),
    })
    expect(object.objectId).toMatch(/^[0-9a-f-]{36}$/)
  })
})

describe('CT-e fiscal document write-back contract', () => {
  test('carries the authorized XML from the provider through to the write-back', async () => {
    const fixture = createEffectFixture({
      emit: async () => ({
        success: true,
        chaveAcesso: ACCESS_KEY,
        protocolo: '135260000123456',
        xmlAutorizado: AUTHORIZED_XML,
        rawResponse: {},
      }),
    })

    await fixture.effect.execute({ envelope: fixture.envelope })

    expect(fixture.storedXml).toEqual([{ accessKey: ACCESS_KEY, companyId: COMPANY_ID }])
    expect(fixture.authorizedCalls).toEqual([
      {
        accessKey: ACCESS_KEY,
        protocol: '135260000123456',
        fiscalDocument: {
          accessKey: ACCESS_KEY,
          authorizationProtocol: '135260000123456',
          fiscalEnvironment: 'production',
          fiscalNumber: 100000001n,
          fiscalSeries: '7',
          xml: {
            bucket: 'fiscal-documents',
            key: `tenants/${COMPANY_ID}/cte-documents/${ACCESS_KEY}/authorized.xml`,
            objectId: expect.any(String),
            sha256: AUTHORIZED_XML_SHA256,
            sizeBytes: Buffer.byteLength(AUTHORIZED_XML),
          },
        },
      },
    ])
  })

  test('authorizes without a fiscal document when the provider returns no XML', async () => {
    const fixture = createEffectFixture({
      emit: async () => ({
        success: true,
        chaveAcesso: ACCESS_KEY,
        protocolo: '135260000123456',
        rawResponse: {},
      }),
    })

    await fixture.effect.execute({ envelope: fixture.envelope })

    expect(fixture.storedXml).toEqual([])
    expect(fixture.authorizedCalls).toEqual([
      { accessKey: ACCESS_KEY, protocol: '135260000123456', fiscalDocument: undefined },
    ])
  })

  test('never fails the attempt when storing the authorized XML breaks', async () => {
    const fixture = createEffectFixture({
      emit: async () => ({
        success: true,
        chaveAcesso: ACCESS_KEY,
        protocolo: '135260000123456',
        xmlAutorizado: AUTHORIZED_XML,
        rawResponse: {},
      }),
      storeAuthorizedXml: async () => {
        throw new Error('minio is unreachable')
      },
    })

    await fixture.effect.execute({ envelope: fixture.envelope })

    expect(fixture.authorizedCalls).toEqual([
      { accessKey: ACCESS_KEY, protocol: '135260000123456', fiscalDocument: undefined },
    ])
  })

  test('never lets certificate material reach the storage or the write-back', async () => {
    const fixture = createEffectFixture({
      emit: async () => ({
        success: true,
        chaveAcesso: ACCESS_KEY,
        protocolo: '135260000123456',
        xmlAutorizado: AUTHORIZED_XML,
        rawResponse: {},
      }),
    })

    await fixture.effect.execute({ envelope: fixture.envelope })

    const serialized = JSON.stringify(
      [fixture.authorizedCalls, fixture.storedXml],
      (_key, value) => (typeof value === 'bigint' ? value.toString() : value),
    )
    expect(serialized).not.toContain(CERTIFICATE_PASSWORD)
    expect(serialized).not.toContain('BASE64CERT')
  })
})
