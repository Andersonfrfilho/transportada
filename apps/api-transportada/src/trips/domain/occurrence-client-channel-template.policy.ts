/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 286 (RF1, RF2): quando um modelo do módulo de notificação serve a um canal do retorno ao cliente do tipo. O tipo
 * só **seleciona** a chave; o texto mora no módulo (`notification.templates`, a versão ativa mais alta da chave no canal,
 * `pt-BR`). Pura: devolve todos os problemas de uma vez, como a 271.
 */
import { SYSTEM_NOTIFICATION_TEMPLATE_KEYS } from '../../occurrence-conversation/domain/occurrence-contractor-template.policy.js'
import {
  OCCURRENCE_CLIENT_CHANNEL,
  type OccurrenceClientChannel,
} from '../../shared/occurrence-client-channel.constant.js'

export type ClientChannelTemplateProblem =
  | { readonly code: 'empty_body' }
  | { readonly code: 'empty_subject' }
  | { readonly code: 'not_found' }
  | { readonly code: 'system_key' }

export type ClientChannelTemplateContent = {
  readonly body: string
  /** O WhatsApp é texto puro, sem assunto: `null` ali é o normal. */
  readonly subject: null | string
}

export function assessClientChannelTemplate(params: {
  readonly channel: OccurrenceClientChannel
  readonly key: string
  /** A versão ativa mais alta da chave no canal; `null` é "não existe" (ou é de outra empresa). */
  readonly template: ClientChannelTemplateContent | null
}): readonly ClientChannelTemplateProblem[] {
  const { channel, key, template } = params
  if (template === null) return [{ code: 'not_found' }]
  const needsSubject = channel === OCCURRENCE_CLIENT_CHANNEL.EMAIL
  return [
    ...(SYSTEM_NOTIFICATION_TEMPLATE_KEYS.has(key) ? [{ code: 'system_key' } as const] : []),
    ...(needsSubject && (template.subject ?? '').trim() === ''
      ? [{ code: 'empty_subject' } as const]
      : []),
    ...(template.body.trim() === '' ? [{ code: 'empty_body' } as const] : []),
  ]
}

/** Um modelo do módulo como o editor do tipo o lista para escolher num canal. */
export type ClientChannelTemplateView = ClientChannelTemplateContent & {
  readonly channel: OccurrenceClientChannel
  readonly key: string
  readonly problems: readonly ClientChannelTemplateProblem[]
  readonly usable: boolean
  readonly version: number
}

/** A mesma avaliação da gravação: o que o editor mostra como utilizável é o que a gravação aceita. */
export function toClientChannelTemplateView(params: {
  readonly body: string
  readonly channel: OccurrenceClientChannel
  readonly key: string
  readonly subject: null | string
  readonly version: number
}): ClientChannelTemplateView {
  const problems = assessClientChannelTemplate({
    channel: params.channel,
    key: params.key,
    template: { body: params.body, subject: params.subject },
  })
  return { ...params, problems, usable: problems.length === 0 }
}
