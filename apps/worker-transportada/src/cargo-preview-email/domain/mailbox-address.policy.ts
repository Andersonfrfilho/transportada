/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.6/T4.7a/T4.7c: um cabeçalho de remetente só vira endereço quando é EXATAMENTE uma caixa — `endereço`
 * ou `nome <endereço>`. Lista, grupo, comentário, mais de um `<`/`@` fora de aspas, prefixo `mailto:` e nome
 * codificado sem endereço real são recusados: quem lê o remetente nunca adivinha qual dos endereços valia.
 * O nome de exibição é descartado (ele pode imitar o endereço permitido). Os dois formatos do Outlook, que
 * repetem o endereço em `<mailto:…>` ou `[mailto:…]`, são desembrulhados antes — e só quando repetem o mesmo.
 * As aspas saem só para localizar o `<…>`: o endereço lido tem de estar LITERALMENTE no fim do valor original,
 * senão `<a"@evil.example>"@t.example>` seria lido aqui como `a@t.example` e pela `mailauth` como `a"@evil.example`.
 */
const ADDRESS = /^[^\s<>[\]():;,"@]+@[^\s<>[\]():;,"@]+$/u
const QUOTED_STRING = /"(?:[^"\\]|\\.)*"/gu
const ANGLE_MAILBOX = /^([^<>]*)<([^<>]+)>\s*$/u
const OUTLOOK_TEXT = /^([^<>]*)<([^<>\s]+)<mailto:([^<>\s]+)>>$/iu
const OUTLOOK_CLASSIC = /^(.*?)\s*\[mailto:([^[\]\s]+)\]$/iu
const NAME_FORBIDDEN = /[@()[\]:;]/u
const MAX_MAILBOX_LENGTH = 998

export function readSingleMailboxAddress(value: string): string | undefined {
  const mailbox = unwrapOutlookMailto(value.trim())
  if (mailbox === undefined || mailbox.length === 0 || mailbox.length > MAX_MAILBOX_LENGTH) {
    return undefined
  }
  const outsideQuotes = mailbox.replace(QUOTED_STRING, '')
  const address = outsideQuotes.includes('<')
    ? readAngleAddress({ mailbox, outsideQuotes })
    : readBareAddress(mailbox, outsideQuotes)
  return address?.toLowerCase()
}

/** `Nome <a@x<mailto:a@x>>` e `Nome [mailto:a@x]`: o endereço repetido some; outro endereço recusa. */
function unwrapOutlookMailto(value: string): string | undefined {
  const text = OUTLOOK_TEXT.exec(value)
  if (text !== null) {
    const [, name = '', address = '', repeated = ''] = text
    return address.toLowerCase() === repeated.toLowerCase() ? `${name}<${address}>` : undefined
  }
  const classic = OUTLOOK_CLASSIC.exec(value)
  if (classic === null) return value
  const [, name = '', address = ''] = classic
  const displayName = name.trim().toLowerCase() === address.toLowerCase() ? '' : name
  return `${displayName}<${address}>`
}

/** A vírgula no nome sem aspas (`Silva, João <a@x>`) vale: o `<endereço>` literal no fim é um só. */
function readAngleAddress(input: {
  readonly mailbox: string
  readonly outsideQuotes: string
}): string | undefined {
  const match = ANGLE_MAILBOX.exec(input.outsideQuotes)
  if (match === null) return undefined
  const [, name = '', address = ''] = match
  if (NAME_FORBIDDEN.test(name)) return undefined
  if (!input.mailbox.trimEnd().endsWith(`<${address}>`)) return undefined
  return ADDRESS.test(address.trim()) ? address.trim() : undefined
}

/** Sem `<>`: o valor inteiro é o endereço — nome entre aspas ao lado dele não vale. */
function readBareAddress(mailbox: string, outsideQuotes: string): string | undefined {
  if (outsideQuotes !== mailbox) return undefined
  return ADDRESS.test(mailbox) ? mailbox : undefined
}
