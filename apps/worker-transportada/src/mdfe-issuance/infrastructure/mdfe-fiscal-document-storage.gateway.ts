/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createHash } from 'node:crypto'

import type {
  MdfeAuthorizedDocumentStorage,
  MdfeEventDocumentStorage,
  MdfeEventName,
  MdfeStoredXmlObject,
} from '../application/mdfe-issuance-consumer.effect.js'
import type { NfeStorageGateway } from '../../storage/infrastructure/nfe-storage-gateway.js'

const XML_CONTENT_TYPE = 'application/xml'

const EVENT_FILE_NAME: Readonly<Record<MdfeEventName, string>> = {
  cancellation: 'cancellation.xml',
  closure: 'closure.xml',
}

type StorageGateway = Pick<NfeStorageGateway, 'storeObject'>

export function createMdfeFiscalDocumentStorage(input: {
  readonly bucket: string
  readonly gateway: StorageGateway
}): MdfeAuthorizedDocumentStorage & MdfeEventDocumentStorage {
  async function storeXml(params: {
    readonly key: string
    readonly xml: string
  }): Promise<MdfeStoredXmlObject> {
    const body = Buffer.from(params.xml, 'utf8')
    const sha256 = createHash('sha256').update(body).digest('hex')

    await input.gateway.storeObject({
      body: new Uint8Array(body),
      bucket: input.bucket,
      contentLength: body.byteLength,
      contentType: XML_CONTENT_TYPE,
      key: params.key,
      sha256,
    })

    return {
      bucket: input.bucket,
      key: params.key,
      objectId: crypto.randomUUID(),
      sha256,
      sizeBytes: body.byteLength,
    }
  }

  return {
    async storeAuthorizedXml(params) {
      return storeXml({
        key: buildFiscalXmlKey({
          accessKey: params.accessKey,
          companyId: params.companyId,
          fileName: 'authorized.xml',
        }),
        xml: params.xml,
      })
    },
    async storeEventXml(params) {
      return storeXml({
        key: buildFiscalXmlKey({
          accessKey: params.accessKey,
          companyId: params.companyId,
          fileName: EVENT_FILE_NAME[params.eventName],
        }),
        xml: params.xml,
      })
    },
  }
}

function buildFiscalXmlKey(input: {
  readonly accessKey: string
  readonly companyId: string
  readonly fileName: string
}): string {
  return `tenants/${input.companyId}/mdfe-documents/${input.accessKey}/${input.fileName}`
}
