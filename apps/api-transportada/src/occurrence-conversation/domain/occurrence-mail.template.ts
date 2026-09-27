/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 RF7: o e-mail da conversa com a contratante, montado por **uma** função — a prévia do
 * diálogo e o envio chamam esta, e é por isso que a prévia mostra exatamente o que sai. O texto é o
 * que o operador escreveu (partindo do modelo do tipo da ocorrência, spec 079), mais a assinatura.
 * O HTML escapa tudo: o texto veio de gente e de XML de terceiro, e nenhum dos dois vira marcação.
 */
import { escapeMailHtml } from '../../contractor-mail/domain/mail-template-render.policy.js'

export type OccurrenceMail = {
  readonly html: string
  readonly subject: string
  readonly text: string
}

const SIGNATURE_SEPARATOR = '--'

function toParagraphs(text: string): string {
  return text
    .split(/\n{2,}/u)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== '')
    .map((paragraph) => `<p>${escapeMailHtml(paragraph).replaceAll('\n', '<br>')}</p>`)
    .join('\n')
}

export function buildOccurrenceMail(input: {
  readonly bodyText: string
  readonly carrierName: string
  readonly operatorName: string
  readonly subject: string
}): OccurrenceMail {
  const body = input.bodyText.trim()
  const signature = [input.operatorName.trim(), input.carrierName.trim()].filter(
    (line) => line !== '',
  )
  const text =
    signature.length === 0 ? body : `${body}\n\n${SIGNATURE_SEPARATOR}\n${signature.join('\n')}`
  const html = [
    toParagraphs(body),
    ...(signature.length === 0
      ? []
      : [`<p>${SIGNATURE_SEPARATOR}<br>${signature.map(escapeMailHtml).join('<br>')}</p>`]),
  ].join('\n')
  return { html, subject: input.subject.trim(), text }
}
