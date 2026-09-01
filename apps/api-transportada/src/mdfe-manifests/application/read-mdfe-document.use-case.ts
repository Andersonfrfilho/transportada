/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { DamdfePdfGateway } from '../infrastructure/damdfe-pdf.gateway.js'
import {
  DamdfeDocumentNotAuthorizedError,
  DamdfeDocumentNotFoundError,
} from '../domain/damdfe.error.js'

import {
  buildDamdfeFileName,
  buildMdfeXmlFileName,
  type DamdfeRenderResult,
  type MdfeDocumentDownload,
  type MdfeDocumentSourcePort,
  type MdfeDocumentSourceQuery,
  type MdfeSignedDownloadPort,
  type MdfeXmlReaderPort,
} from './read-mdfe-document.port.js'

export type ReadMdfeDocumentDependencies = {
  readonly downloads: MdfeSignedDownloadPort
  readonly renderer: DamdfePdfGateway
  readonly source: MdfeDocumentSourcePort
  readonly xmlReader: MdfeXmlReaderPort
}

export type ReadMdfeDocumentUseCase = {
  /** O XML autorizado, por URL assinada de vida curta — o objeto nunca vira público. */
  readXmlDownload(query: MdfeDocumentSourceQuery): Promise<MdfeDocumentDownload>
  renderDamdfe(query: MdfeDocumentSourceQuery): Promise<DamdfeRenderResult>
}

/**
 * O DAMDFE nasce do **XML autorizado**, nunca do payload que pedimos à SEFAZ: a autorização carrega
 * o protocolo e pode ter ajustado o que o papel precisa mostrar. Papel montado do pedido imprimiria
 * um documento que a SEFAZ não conhece — e é justamente o papel que a barreira confere.
 */
export function createReadMdfeDocumentUseCase(
  dependencies: ReadMdfeDocumentDependencies,
): ReadMdfeDocumentUseCase {
  async function requireAuthorized(query: MdfeDocumentSourceQuery) {
    const lookup = await dependencies.source.findAuthorizedDocument(query)
    if (lookup.kind === 'missing') throw new DamdfeDocumentNotFoundError()
    if (lookup.kind === 'not-authorized') throw new DamdfeDocumentNotAuthorizedError()

    return lookup.document
  }

  return {
    async readXmlDownload(query) {
      const document = await requireAuthorized(query)
      const download = await dependencies.downloads.createDownloadUrl({
        bucket: document.bucket,
        fileName: buildMdfeXmlFileName(document.accessKey),
        objectKey: document.objectKey,
      })

      return {
        accessKey: document.accessKey,
        authorizedAt: document.authorizedAt,
        downloadUrl: download.url,
        expiresAt: download.expiresAt,
        protocol: document.protocol,
      }
    },
    async renderDamdfe(query) {
      const document = await requireAuthorized(query)
      const xml = await dependencies.xmlReader.readXml({
        bucket: document.bucket,
        objectKey: document.objectKey,
      })
      const pdf = await dependencies.renderer.render({ xml })

      return { bytes: pdf.bytes, fileName: buildDamdfeFileName(document.accessKey) }
    },
  }
}
