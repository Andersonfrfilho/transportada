/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { DacteXmlLocation, DacteXmlReaderPort } from '../application/render-dacte.port.js'

type ObjectStreamGateway = {
  readonly getObjectStream: (input: {
    readonly bucket: string
    readonly key: string
  }) => Promise<ReadableStream<Uint8Array>>
}

export function createDacteXmlReaderGateway(input: {
  readonly storage: ObjectStreamGateway
}): DacteXmlReaderPort {
  return {
    async readXml(location: DacteXmlLocation): Promise<string> {
      const stream = await input.storage.getObjectStream({
        bucket: location.bucket,
        key: location.objectKey,
      })
      return new Response(stream).text()
    },
  }
}
