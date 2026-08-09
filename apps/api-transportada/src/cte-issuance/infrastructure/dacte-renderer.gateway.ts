/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  CteDacteRenderRequest,
  CteDacteRendererPort,
} from '../application/export-cte-documents.port.js'
import type { DacteXmlReaderPort } from '../application/render-dacte.port.js'

import type { DactePdfGateway } from './dacte-pdf.gateway.js'

/** Junta leitura do XML autorizado e desenho do papel para quem só quer os bytes do DACTE. */
export function createDacteRendererGateway(input: {
  readonly pdf: DactePdfGateway
  readonly xmlReader: DacteXmlReaderPort
}): CteDacteRendererPort {
  return {
    async renderDacte(request: CteDacteRenderRequest): Promise<Uint8Array> {
      const xml = await input.xmlReader.readXml({
        bucket: request.bucket,
        objectKey: request.objectKey,
      })
      const pdf = await input.pdf.render({ logo: request.logo, xml })

      return pdf.bytes
    },
  }
}
