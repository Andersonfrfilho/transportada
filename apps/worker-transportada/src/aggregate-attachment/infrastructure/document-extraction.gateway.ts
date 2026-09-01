/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 071: **o único lugar que escolhe como ler.** PDF sai pela camada de texto, numa
 * `worker_thread` (ADR-0053); imagem sai pelo OCR, que é rede e fica no event loop — o motivo da
 * thread é isolar CPU, e uma chamada HTTP não é CPU.
 *
 * A CNH-e é o caso que explica a assimetria: ela é imagem embrulhada em PDF pelo invólucro do
 * Serpro, sem camada de texto útil (medido: ~400 caracteres de texto legal e nenhum campo). Ela cai
 * no ramo do PDF, não reconhece nada e grava `null` — e isso é o resultado **correto**, não uma
 * falha. Quem chega pelo OCR é a CNH fotografada.
 *
 * Sem `AGGREGATE_DOCUMENT_OCR_URL` o ramo de imagem devolve `null`: leitura é conveniência para o
 * operador, nunca porta de entrada, e ausência de serviço não pode reciclar mensagem para sempre.
 */
import { extractCnhFields, type OcrTextReader } from '@adatechnology/document-intake'

import type { AttachmentExtractionPort } from '../application/extract-attachment-fields.port.js'

import { imageMimeType, isPdfDocument } from './document-signature.js'

const CNH_TYPE = 'cnh'

export function createDocumentExtractionGateway(input: {
  readonly ocr?: OcrTextReader
  readonly textLayer: AttachmentExtractionPort
}): AttachmentExtractionPort {
  return {
    async extract({ bytes, type }) {
      if (isPdfDocument(bytes)) return input.textLayer.extract({ bytes, type })

      const mimeType = imageMimeType(bytes)
      if (input.ocr === undefined || mimeType === undefined) return null

      const text = await input.ocr.extractText({ bytes, mimeType })

      return readImageFields({ text, type })
    },
  }
}

/**
 * ⚠️ O OCR só tem mapa para a CNH, e o mapa é escolhido pelo **tipo declarado** — ao contrário do
 * PDF, onde o título do documento decide. Não há como identificar o documento numa foto sem outro
 * classificador, e inventar um seria adivinhação com aparência de leitura: fora da CNH, grava `null`.
 *
 * O que sai daqui **nunca preenche o formulário do candidato** — ele já enviou e foi embora. Vai
 * para `extracted_fields`, que é o que o operador confere contra o que foi declarado.
 */
function readImageFields(input: {
  readonly text: string
  readonly type: string
}): Readonly<Record<string, unknown>> | null {
  if (input.type !== CNH_TYPE || input.text.trim().length === 0) return null

  const fields = extractCnhFields(input.text)
  const filled = Object.entries(fields).filter(([, value]) => value !== null)

  return filled.length === 0 ? null : Object.fromEntries(filled)
}
