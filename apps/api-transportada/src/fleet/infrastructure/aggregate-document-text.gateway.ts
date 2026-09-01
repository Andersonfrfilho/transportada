/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Escolhe como ler o documento pelo tipo do arquivo, e é o único lugar que sabe dessa escolha: PDF
 * sai pela camada de texto (exata, sem rede), imagem sai pelo OCR (palpite, com rede). O use-case
 * enxerga uma porta só e não decide nada disso.
 *
 * O OCR self-hosted não lê PDF (`Pdf reading is not supported`, confirmado contra o serviço) — daí
 * o PDF nunca chegar nele. Antes desta composição o host simplesmente não extraía nada de PDF, e
 * cartão CNPJ, RNTRC e CRLV-e digital passavam direto sem conferência.
 */
import { extractPdfTextLayer } from '../../shared/pdf-text-layer.service.js'
import type { AggregateDocumentOcrPort } from '../application/aggregate-document-ocr.port.js'

const PDF_MIME_TYPE = 'application/pdf'

export function createAggregateDocumentTextGateway(input: {
  readonly ocr?: AggregateDocumentOcrPort
}): AggregateDocumentOcrPort {
  return {
    async extractText({ bytes, mimeType }) {
      if (mimeType === PDF_MIME_TYPE) return extractPdfTextLayer(bytes)
      // Sem serviço de OCR configurado, imagem é ausência de texto — não é erro, e o upload já
      // está salvo: a revisão manual segue sendo o caminho.
      if (input.ocr === undefined) return ''
      return input.ocr.extractText({ bytes, mimeType })
    },
  }
}
