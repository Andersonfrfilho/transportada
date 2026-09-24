/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T406 (RF16): o `From` do e-mail recebido, separado em endereço e nome. O endereço fica
 * como chegou (a comparação com os contatos ignora a caixa na leitura); o nome perde quebra de linha
 * e controle, colapsa espaços e cabe no CHECK do banco (200). Nome igual ao endereço não é nome.
 */
const DISPLAY_NAME_MAX_LENGTH = 200
const ANGLE_ADDRESS = /^(?<name>.*)<(?<address>[^<>]+)>\s*$/su
// eslint-disable-next-line no-control-regex -- é exatamente o controle que se quer tirar do nome.
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]+/gu

export type SenderMailbox = {
  readonly address: string
  readonly displayName: string | null
}

function cleanDisplayName(raw: string, address: string): string | null {
  const unquoted = raw.trim().replace(/^"(.*)"$/su, '$1')
  const name = unquoted.replace(CONTROL_CHARACTERS, ' ').replace(/\s+/gu, ' ').trim()
  if (name.length === 0 || name.toLowerCase() === address.toLowerCase()) return null
  return name.slice(0, DISPLAY_NAME_MAX_LENGTH)
}

export function parseSenderMailbox(from: string): SenderMailbox {
  const trimmed = from.trim()
  const match = ANGLE_ADDRESS.exec(trimmed)
  if (match?.groups === undefined) return { address: trimmed, displayName: null }
  const address = (match.groups.address ?? '').trim()
  return { address, displayName: cleanDisplayName(match.groups.name ?? '', address) }
}
