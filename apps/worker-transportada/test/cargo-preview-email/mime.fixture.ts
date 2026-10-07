/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.6: e-mails sintéticos do encaminhamento, montados à mão. Nenhum endereço, nome ou
 * planilha é real; o "xlsx" são só os bytes de assinatura de um zip, que é tudo o que o ramo confere.
 */
const CRLF = '\r\n'

export const WORKBOOK_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...new Array(64).fill(7)])

export type MimeAttachment = {
  readonly bytes?: Uint8Array
  readonly contentType?: string
  readonly disposition?: 'attachment' | 'inline'
  readonly fileName: string
}

export type MimeBuild = {
  readonly attachments?: readonly MimeAttachment[]
  readonly extraHeaders?: readonly string[]
  readonly forwardedMessages?: readonly string[]
  readonly from: string
  readonly text?: string
  readonly to?: string
}

function boundaryFor(seed: string): string {
  return `b-${seed}-${'x'.repeat(8)}`
}

export function buildMime(input: MimeBuild): string {
  const boundary = boundaryFor('outer')
  const parts: string[] = [
    ['Content-Type: text/plain; charset=utf-8', '', input.text ?? 'segue a previa', ''].join(CRLF),
  ]
  for (const attachment of input.attachments ?? []) {
    const bytes = attachment.bytes ?? WORKBOOK_BYTES
    parts.push(
      [
        `Content-Type: ${attachment.contentType ?? 'application/octet-stream'}; name="${attachment.fileName}"`,
        `Content-Disposition: ${attachment.disposition ?? 'attachment'}; filename="${attachment.fileName}"`,
        'Content-Transfer-Encoding: base64',
        '',
        Buffer.from(bytes).toString('base64'),
        '',
      ].join(CRLF),
    )
  }
  for (const forwarded of input.forwardedMessages ?? []) {
    parts.push(
      [
        'Content-Type: message/rfc822',
        'Content-Disposition: attachment; filename="fwd.eml"',
        '',
        forwarded,
        '',
      ].join(CRLF),
    )
  }
  return [
    `From: ${input.from}`,
    `To: ${input.to ?? 'previa@entrada.example'}`,
    'Subject: Fwd: previa',
    'Date: Tue, 06 Oct 2026 12:00:00 +0000',
    'Message-ID: <outer@forwarder.example>',
    'MIME-Version: 1.0',
    ...(input.extraHeaders ?? []),
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    ...parts.map((part) => `--${boundary}${CRLF}${part}`),
    `--${boundary}--`,
    '',
  ].join(CRLF)
}

/** O e-mail original do contratante, para ir como anexo `message/rfc822` ou dentro de um bloco. */
export function buildOriginalMime(input: {
  readonly attachments?: readonly MimeAttachment[]
  readonly extraHeaders?: readonly string[]
  readonly from: string
}): string {
  return buildMime({
    attachments: input.attachments ?? [{ fileName: 'FR-06-10.xlsm' }],
    extraHeaders: input.extraHeaders ?? [],
    from: input.from,
    text: 'previa do dia',
    to: 'equipe@forwarder.example',
  })
}

export function gmailForwardText(input: { readonly from: string; readonly note?: string }): string {
  return [
    input.note ?? 'segue',
    '',
    '---------- Forwarded message ---------',
    `From: ${input.from}`,
    'Date: Tue, Oct 6, 2026 at 8:00 AM',
    'Subject: previa',
    'To: <equipe@forwarder.example>',
    '',
    'corpo original',
  ].join('\n')
}
