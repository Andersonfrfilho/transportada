/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  DacteDocumentNotAuthorizedError,
  DacteDocumentNotFoundError,
} from '../domain/dacte.error.js'
import type { DactePdfGateway } from '../infrastructure/dacte-pdf.gateway.js'

import {
  buildDacteFileName,
  type DacteLogoPort,
  type DacteRenderRequest,
  type DacteRenderResult,
  type DacteSourcePort,
  type DacteXmlReaderPort,
  type RenderDacteUseCase,
} from './render-dacte.port.js'

export type RenderDacteDependencies = {
  readonly logos: DacteLogoPort
  readonly renderer: DactePdfGateway
  readonly source: DacteSourcePort
  readonly xmlReader: DacteXmlReaderPort
}

/**
 * O DACTE nasce do XML autorizado, nunca do que pedimos à SEFAZ: a autorização pode ter trocado o
 * número do CT-e, e um papel montado a partir do payload imprimiria um número que não existe.
 */
export function createRenderDacteUseCase(
  dependencies: RenderDacteDependencies,
): RenderDacteUseCase {
  return {
    async renderDacte(input: DacteRenderRequest): Promise<DacteRenderResult> {
      const lookup = await dependencies.source.findAuthorizedDocument({
        batchId: input.batchId,
        batchItemId: input.batchItemId,
        companyId: input.context.companyId,
      })
      if (lookup.kind === 'missing') throw new DacteDocumentNotFoundError()
      if (lookup.kind === 'not-authorized') throw new DacteDocumentNotAuthorizedError()

      const [xml, logo] = await Promise.all([
        dependencies.xmlReader.readXml({
          bucket: lookup.document.bucket,
          objectKey: lookup.document.objectKey,
        }),
        dependencies.logos.findLogo({ companyId: input.context.companyId }),
      ])
      const pdf = await dependencies.renderer.render({ logo, xml })

      return { bytes: pdf.bytes, fileName: buildDacteFileName(lookup.document.accessKey) }
    },
  }
}
