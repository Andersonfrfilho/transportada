/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { MdfeXmlReaderPort } from '../application/read-mdfe-document.port.js'

type ObjectStreamGateway = {
  readonly getObjectStream: (input: {
    readonly bucket: string
    readonly key: string
  }) => Promise<ReadableStream<Uint8Array>>
}

export function createMdfeXmlReaderGateway(input: {
  readonly storage: ObjectStreamGateway
}): MdfeXmlReaderPort {
  return {
    async readXml(location) {
      const stream = await input.storage.getObjectStream({
        bucket: location.bucket,
        key: location.objectKey,
      })
      return new Response(stream).text()
    },
  }
}
