/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { NfeStorageGateway } from '../../storage/infrastructure/nfe-storage-gateway.js'

const XML_CONTENT_TYPE = 'application/xml'

type StorageGateway = Pick<NfeStorageGateway, 'getObjectStream' | 'storeObject'>

type NfeImportSourceStorage = {
  readSource(input: { readonly key: string }): Promise<Uint8Array>
}

export type NfeImportStoredObject = {
  readonly bucket: string
  readonly key: string
  readonly objectId: string
  readonly sha256: string
  readonly sizeBytes: number
}

export type NfeImportFinalStorage = {
  storeImportedDocument(input: {
    readonly accessKey: string
    readonly companyId: string
    readonly importId: string
    readonly sourceBytes: Uint8Array
    readonly sourceSha256: string
  }): Promise<NfeImportStoredObject>
  storeImportedEvent(input: {
    readonly accessKey: string
    readonly companyId: string
    readonly importId: string
    readonly sequence: string
    readonly sourceBytes: Uint8Array
    readonly sourceSha256: string
    readonly type: string
  }): Promise<NfeImportStoredObject>
}

export function createNfeImportSourceStorage(input: {
  readonly bucket: string
  readonly gateway: StorageGateway
}): NfeImportSourceStorage {
  return {
    async readSource(params: { readonly key: string }): Promise<Uint8Array> {
      const stream = await input.gateway.getObjectStream({ bucket: input.bucket, key: params.key })
      return new Uint8Array(await new Response(stream).arrayBuffer())
    },
  }
}

export function createNfeXmlObjectReader(input: { readonly gateway: StorageGateway }): {
  readXml(params: { readonly bucket: string; readonly key: string }): Promise<string>
} {
  return {
    async readXml(params: { readonly bucket: string; readonly key: string }): Promise<string> {
      const stream = await input.gateway.getObjectStream({
        bucket: params.bucket,
        key: params.key,
      })
      return new Response(stream).text()
    },
  }
}

export function createNfeImportFinalStorage(input: {
  readonly bucket: string
  readonly gateway: StorageGateway
}): NfeImportFinalStorage {
  return {
    async storeImportedDocument(params): Promise<NfeImportStoredObject> {
      return storeImmutable({
        bucket: input.bucket,
        gateway: input.gateway,
        key: buildDocumentKey({ accessKey: params.accessKey, companyId: params.companyId }),
        sourceBytes: params.sourceBytes,
        sourceSha256: params.sourceSha256,
      })
    },
    async storeImportedEvent(params): Promise<NfeImportStoredObject> {
      return storeImmutable({
        bucket: input.bucket,
        gateway: input.gateway,
        key: buildEventKey({
          accessKey: params.accessKey,
          companyId: params.companyId,
          sequence: params.sequence,
          type: params.type,
        }),
        sourceBytes: params.sourceBytes,
        sourceSha256: params.sourceSha256,
      })
    },
  }
}

async function storeImmutable(input: {
  readonly bucket: string
  readonly gateway: StorageGateway
  readonly key: string
  readonly sourceBytes: Uint8Array
  readonly sourceSha256: string
}): Promise<NfeImportStoredObject> {
  await input.gateway.storeObject({
    body: input.sourceBytes,
    bucket: input.bucket,
    contentLength: input.sourceBytes.byteLength,
    contentType: XML_CONTENT_TYPE,
    key: input.key,
    sha256: input.sourceSha256,
  })

  return {
    bucket: input.bucket,
    key: input.key,
    objectId: crypto.randomUUID(),
    sha256: input.sourceSha256,
    sizeBytes: input.sourceBytes.byteLength,
  }
}

function buildDocumentKey(input: {
  readonly accessKey: string
  readonly companyId: string
}): string {
  return `tenants/${input.companyId}/nfe-documents/${input.accessKey}/original.xml`
}

function buildEventKey(input: {
  readonly accessKey: string
  readonly companyId: string
  readonly sequence: string
  readonly type: string
}): string {
  return `tenants/${input.companyId}/nfe-events/${input.accessKey}/${input.type}-${input.sequence}.xml`
}
