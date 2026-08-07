/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

export const DACTE_CONTENT_TYPE = 'application/pdf'

/** A aplicação só precisa da empresa: permissão é decisão da camada de rota. */
export type DacteRenderRequest = {
  readonly batchId: string
  readonly batchItemId: string
  readonly context: {
    readonly companyId: string
  }
}

export type DacteSourceQuery = {
  readonly batchId: string
  readonly batchItemId: string
  readonly companyId: string
}

export type DacteSourceDocument = {
  readonly accessKey: string
  readonly bucket: string
  readonly objectKey: string
}

/**
 * Item inexistente e item sem autorização são respostas diferentes: a tela precisa distinguir
 * "não é seu" de "ainda não autorizou" para saber se oferece o botão de reprocessar.
 */
export type DacteSourceLookup =
  | { readonly document: DacteSourceDocument; readonly kind: 'authorized' }
  | { readonly kind: 'missing' }
  | { readonly kind: 'not-authorized' }

export type DacteSourcePort = {
  findAuthorizedDocument(query: DacteSourceQuery): Promise<DacteSourceLookup>
}

export type DacteXmlLocation = {
  readonly bucket: string
  readonly objectKey: string
}

export type DacteXmlReaderPort = {
  readXml(location: DacteXmlLocation): Promise<string>
}

/** Empresa sem marca cadastrada é o caso normal: o cabeçalho do DACTE simplesmente não a desenha. */
export type DacteLogo = { readonly bytes: Buffer }

export type DacteLogoQuery = {
  readonly companyId: string
}

export type DacteLogoPort = {
  findLogo(query: DacteLogoQuery): Promise<DacteLogo | null>
}

export type DacteRenderResult = {
  readonly bytes: Uint8Array
  readonly fileName: string
}

export type RenderDacteUseCase = {
  renderDacte(input: DacteRenderRequest): Promise<DacteRenderResult>
}

export function buildDacteFileName(accessKey: string): string {
  return `dacte-${accessKey}.pdf`
}
