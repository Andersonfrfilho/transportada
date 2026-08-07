/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CteDacteRendererPort } from '../application/export-cte-documents.port.js'
import type { DacteXmlLocation, DacteXmlReaderPort } from '../application/render-dacte.port.js'

import type { DactePdfGateway } from './dacte-pdf.gateway.js'

/** Junta leitura do XML autorizado e desenho do papel para quem só quer os bytes do DACTE. */
export function createDacteRendererGateway(input: {
  readonly pdf: DactePdfGateway
  readonly xmlReader: DacteXmlReaderPort
}): CteDacteRendererPort {
  return {
    async renderDacte(location: DacteXmlLocation): Promise<Uint8Array> {
      const xml = await input.xmlReader.readXml(location)
      const pdf = await input.pdf.render({ xml })

      return pdf.bytes
    },
  }
}
