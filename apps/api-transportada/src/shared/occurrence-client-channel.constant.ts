/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 286 (RF2): o retorno ao cliente do tipo de ocorrência é uma matriz por canal — cada canal uma caixa de marcar,
 * com o modelo do módulo de notificação (pela chave) e o modo de envio. Canal novo (SMS etc.) entra como mais uma
 * entrada desta lista e mais uma linha da tabela filha, nunca coluna nova no tipo.
 */
export const OCCURRENCE_CLIENT_CHANNEL = {
  EMAIL: 'email',
  WHATSAPP: 'whatsapp',
} as const
export const OCCURRENCE_CLIENT_CHANNELS = ['email', 'whatsapp'] as const
export type OccurrenceClientChannel = (typeof OCCURRENCE_CLIENT_CHANNELS)[number]

/** Desligado é a caixa desmarcada (`enabled = false`); o modo diz só como sai quando está ligado. */
export const OCCURRENCE_CLIENT_CHANNEL_SEND_MODES = ['manual', 'automatic'] as const
export type OccurrenceClientChannelSendMode = (typeof OCCURRENCE_CLIENT_CHANNEL_SEND_MODES)[number]
export const OCCURRENCE_CLIENT_CHANNEL_SEND_MODE_DEFAULT: OccurrenceClientChannelSendMode = 'manual'

/** O teto da chave do módulo (`notification.templates.key`). */
export const OCCURRENCE_CLIENT_CHANNEL_TEMPLATE_KEY_MAX_LENGTH = 128

/**
 * Spec 286 (RF5): a chave do modelo que a migration cria a partir do texto livre antigo do tipo
 * (`forward_email_subject`/`forward_email_body`). A mesma chave nos dois canais: a identidade do módulo inclui o canal.
 */
export const OCCURRENCE_CLIENT_REPLY_TEMPLATE_KEY_PREFIX = 'occurrence.client-reply.'
