/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Lê o anexo **no servidor**, do arquivo que chegou ao bucket. O que o operador confere precisa ter
 * sido lido por nós: a landing também lê, no navegador de quem anexa, mas aquilo é conveniência para
 * preencher o formulário — o cliente é anônimo, e aceitar a leitura dele como prova deixaria um
 * atacante escolher o que o operador veria.
 *
 * Usa o mesmo `@adatechnology/document-intake` da landing, com o build `legacy/` do pdf.js: o normal
 * quebra fora do navegador (`DOMMatrix is not defined`). Medido no runtime desta app antes de ser
 * escrito — Bun 1.3.14 lê os fragmentos com geometria e extrai o campo.
 */
import * as pdfjsLegacy from 'pdfjs-dist/legacy/build/pdf.mjs'
import {
  identifyDocumentKind,
  readCcmei,
  readPdfTextLayer,
  type PdfGetDocument,
} from '@adatechnology/document-intake'

import type { AggregateApplicationAttachmentType } from '../../database/aggregate-application.schema.js'

const getDocument = pdfjsLegacy.getDocument as unknown as PdfGetDocument

/**
 * O tipo declarado vem do cliente anônimo — ele diz `ccmei` e manda outra coisa. Quem decide o mapa
 * é o **documento**, pelo título na faixa superior; ler com o mapa errado produziria campos
 * inventados, e campo inventado vira divergência falsa contra a ficha de quem se candidatou.
 */
export async function extractAttachmentFields(input: {
  readonly bytes: Uint8Array
  readonly type: AggregateApplicationAttachmentType
}): Promise<Readonly<Record<string, unknown>> | null> {
  if (input.type !== 'ccmei') return null

  try {
    const page = await readPdfTextLayer({ data: input.bytes, getDocument })
    if (identifyDocumentKind(page) !== 'ccmei') return null

    const reading = readCcmei(page)
    return Object.keys(reading.values).length === 0 ? null : { ...reading.values }
  } catch {
    // Documento ilegível é ausência, nunca exceção: o arquivo já está salvo quando isto roda, e
    // derrubar aqui perderia o anexo que o operador ainda vai revisar à mão.
    return null
  }
}
