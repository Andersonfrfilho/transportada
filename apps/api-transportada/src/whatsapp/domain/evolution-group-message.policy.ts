/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 292 T3: **o que o bot aceita de um grupo.** Decisão pura, sem rede nem banco: quem chama já
 * resolveu o grupo (lista de permissão), o número do bot, os `@lid` dele e de quem escreveu.
 *
 * Regras (spec 292, regras 3, 4 e 12):
 * - grupo que não está na ficha de um motorista, mensagem do próprio número, sem texto ou de quem não
 *   tem número conhecido: ignorada;
 * - marcou o bot: aceita (`mention`), seja chamada nova, seja alguém respondendo pelo dono;
 * - sem marcação: aceita **só** se há pedido aberto no grupo e quem escreveu é o dono (`owner_reply`).
 *   Se a resposta cabe na pergunta aberta é a sessão do pedido (T4) que decide, não esta porta.
 *
 * ⚠️ Marcação por `@lid`: o WhatsApp passou a marcar pelo identificador oculto (`…@lid`) em vez do
 * número. O `evolutionMentionsNumber` do SDK só casa por número, então quem chama traduz os `@lid` do
 * bot (pela lista de participantes do grupo) e passa em `botLids`.
 */

export type GroupMessageIgnoredReason =
  | 'from_me'
  | 'identity_unavailable'
  | 'no_text'
  | 'not_addressed'
  | 'own_number'
  | 'unknown_group'
  | 'unknown_sender'

export type GroupMessageDecision =
  | {
      readonly admitted: true
      /** Quem escreveu, só dígitos. */
      readonly sender: string
      /** O texto sem a marcação do bot, sem espaços nas pontas; vazio quando só marcou. */
      readonly text: string
      readonly via: 'mention' | 'owner_reply'
    }
  | { readonly admitted: false; readonly reason: GroupMessageIgnoredReason }

export type GroupMessageFacts = {
  /** Os dígitos do `@lid` do bot naquele grupo (pode haver mais de um, ou nenhum conhecido). */
  readonly botLids: ReadonlySet<string>
  /** O número do bot, só dígitos. */
  readonly botNumber: string
  readonly fromMe: boolean
  /** O grupo está na ficha de um motorista desta empresa. */
  readonly groupRegistered: boolean
  readonly mentionedJids: readonly string[]
  /** O dono do pedido aberto no grupo (só dígitos), ou `null` sem pedido aberto. */
  readonly requestOwner: null | string
  /** Quem escreveu, só dígitos; vazio quando nem o `@lid` foi traduzido. */
  readonly sender: string
  readonly text: null | string
}

export function decideGroupMessage(facts: GroupMessageFacts): GroupMessageDecision {
  if (facts.fromMe) return { admitted: false, reason: 'from_me' }
  if (!facts.groupRegistered) return { admitted: false, reason: 'unknown_group' }
  if (facts.text === null) return { admitted: false, reason: 'no_text' }
  if (facts.sender === '') return { admitted: false, reason: 'unknown_sender' }
  if (facts.sender === facts.botNumber) return { admitted: false, reason: 'own_number' }

  const tokens = botMentionTokens(facts.botNumber, facts.botLids)
  if (mentionsBot(facts.mentionedJids, facts.botNumber, facts.botLids)) {
    return {
      admitted: true,
      sender: facts.sender,
      text: stripMentions(facts.text, tokens),
      via: 'mention',
    }
  }
  if (facts.requestOwner !== null && facts.requestOwner === facts.sender) {
    return { admitted: true, sender: facts.sender, text: facts.text.trim(), via: 'owner_reply' }
  }
  return { admitted: false, reason: 'not_addressed' }
}

/** Os dígitos pelos quais o bot pode ser marcado: o número e cada `@lid`. Vazios ficam de fora. */
function botMentionTokens(botNumber: string, botLids: ReadonlySet<string>): ReadonlySet<string> {
  return new Set([botNumber, ...botLids].filter((token) => token !== ''))
}

/** O número só casa marcação por número; o `@lid` só casa marcação por `@lid`. */
export function mentionsBot(
  mentionedJids: readonly string[],
  botNumber: string,
  botLids: ReadonlySet<string>,
): boolean {
  return mentionedJids.some((jid) => {
    const parsed = parseJid(jid)
    if (parsed === null) return false
    if (parsed.server === 'lid') return botLids.has(parsed.digits)
    return parsed.server === 'user' && botNumber !== '' && parsed.digits === botNumber
  })
}

/** Tira do texto o `@<dígitos>` que o WhatsApp escreve no lugar da marcação do bot. */
function stripMentions(text: string, tokens: ReadonlySet<string>): string {
  return text
    .replace(/@(\d{5,})/gu, (whole, digits: string) => (tokens.has(digits) ? ' ' : whole))
    .replace(/\s+/gu, ' ')
    .trim()
}

export type ParsedJid = {
  readonly digits: string
  readonly server: 'group' | 'lid' | 'other' | 'user'
}

/**
 * `5516…@s.whatsapp.net` → `user`; `123…@lid` → `lid`; `…@g.us` → `group`. O sufixo `:N` de
 * dispositivo (`5516…:12@s.whatsapp.net`) é descartado antes de tirar os dígitos.
 */
export function parseJid(jid: unknown): null | ParsedJid {
  if (typeof jid !== 'string') return null
  const [user = '', server = ''] = jid.split('@')
  const digits = (user.split(':')[0] ?? '').replace(/\D/gu, '')
  if (digits === '') return null
  if (server === 's.whatsapp.net' || server === 'c.us') return { digits, server: 'user' }
  if (server === 'lid') return { digits, server: 'lid' }
  if (server === 'g.us') return { digits, server: 'group' }
  return { digits, server: 'other' }
}
