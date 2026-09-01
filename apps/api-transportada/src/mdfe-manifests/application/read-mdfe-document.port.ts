/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

export const DAMDFE_CONTENT_TYPE = 'application/pdf'

/**
 * `driverId` presente é a leitura do **motorista**: ele alcança o manifesto da viagem dele e de
 * mais nenhuma. Ausente é a leitura do escritório, que já passou por `mdfe.read`.
 */
export type MdfeDocumentSourceQuery = {
  readonly companyId: string
  readonly driverId?: string
  readonly manifestId: string
}

export type MdfeDocumentSource = {
  readonly accessKey: string
  readonly authorizedAt: string | null
  readonly bucket: string
  readonly objectKey: string
  readonly protocol: string
}

export type MdfeDocumentLookup =
  | { readonly document: MdfeDocumentSource; readonly kind: 'authorized' }
  | { readonly kind: 'missing' }
  | { readonly kind: 'not-authorized' }

export type MdfeDocumentSourcePort = {
  findAuthorizedDocument(query: MdfeDocumentSourceQuery): Promise<MdfeDocumentLookup>
}

export type MdfeXmlReaderPort = {
  readXml(location: { readonly bucket: string; readonly objectKey: string }): Promise<string>
}

export type MdfeSignedDownloadPort = {
  createDownloadUrl(input: {
    readonly bucket: string
    readonly fileName: string
    readonly objectKey: string
  }): Promise<{ readonly expiresAt: string; readonly url: string }>
}

export type MdfeDocumentDownload = {
  readonly accessKey: string
  readonly authorizedAt: string | null
  readonly downloadUrl: string
  readonly expiresAt: string
  readonly protocol: string
}

export type DamdfeRenderResult = {
  readonly bytes: Uint8Array
  readonly fileName: string
}

export function buildMdfeXmlFileName(accessKey: string): string {
  return `mdfe-${accessKey}.xml`
}

export function buildDamdfeFileName(accessKey: string): string {
  return `damdfe-${accessKey}.pdf`
}
