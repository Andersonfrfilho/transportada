/* Copyright (c) 2026 Ada Technology. MIT License. */

import { normalizeLabel } from './labelGeometry.service'
import type { PdfPageText } from './pdfTextLayer.service'

/**
 * Spec 048: **a identificação é pelo título, nunca pela palavra solta.** Medido: o CRLV contém a
 * palavra "CNH" no rodapé promocional da Carteira Digital de Trânsito. Um classificador
 * "contém CNH → é CNH" chama todo CRLV de habilitação, e o operador só descobre quando o formulário
 * de motorista abre com dado de veículo.
 *
 * CNH e ANTT continuam fora: a spec tem `[NEEDS CLARIFICATION]` para as duas, e mapa de campo
 * escrito sem amostra é adivinhação com aparência de código.
 */
export const DOCUMENT_KIND = ['crlv', 'scanned', 'unknown'] as const
export type DocumentKind = (typeof DOCUMENT_KIND)[number]

const CRLV_TITLE = 'CERTIFICADO DE REGISTRO E LICENCIAMENTO DE VEICULO'

/** O título é impresso no cabeçalho; procurá-lo na folha inteira é voltar à palavra solta. */
const TITLE_BAND_RATIO = 0.7

export function identifyDocumentKind(page: PdfPageText): DocumentKind {
  if (page.fragments.length === 0) return 'scanned'

  const titleFloor = page.height * TITLE_BAND_RATIO
  const hasCrlvTitle = page.fragments.some(
    (fragment) => fragment.y >= titleFloor && normalizeLabel(fragment.text).includes(CRLV_TITLE),
  )

  return hasCrlvTitle ? 'crlv' : 'unknown'
}
