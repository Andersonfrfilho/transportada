/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 286 (RF2): a matriz "Retorno ao cliente" do tipo de ocorrência e a paridade com os campos antigos. Pura.
 *
 * - `client_channel` continua gravado e **derivado** da matriz (e-mail+WhatsApp = `both`, nenhum = `off`): o painel e o
 *   app já publicados leem só ele.
 * - O painel antigo ainda grava `client_channel`, `client_email_type` e `client_email_send_mode`: a gravação dele liga e
 *   desliga as caixas da matriz pela mesma regra que a migration usou no preenchimento, e nunca apaga a chave do modelo.
 * - Tipo sem linha na tabela filha (gravado por uma API anterior a esta) lê a matriz derivada dos campos antigos.
 */
import {
  CLIENT_CHANNEL,
  CLIENT_EMAIL_TYPE_OFF,
  type ClientChannel,
  type ClientEmailSendMode,
  type ClientEmailType,
} from '../../shared/delivery-client-email.constant.js'
import {
  OCCURRENCE_CLIENT_CHANNEL,
  OCCURRENCE_CLIENT_CHANNEL_SEND_MODE_DEFAULT,
  type OccurrenceClientChannel,
  type OccurrenceClientChannelSendMode,
} from '../../shared/occurrence-client-channel.constant.js'

export type OccurrenceClientChannelSetting = {
  readonly enabled: boolean
  readonly sendMode: OccurrenceClientChannelSendMode
  /** A chave do modelo do módulo de notificação no canal; `null` é "sem modelo" (o canal não sai). */
  readonly templateKey: null | string
}

export type OccurrenceClientChannelMatrix = Readonly<
  Record<OccurrenceClientChannel, OccurrenceClientChannelSetting>
>

/** O que o `PUT` manda: cada canal presente substitui o gravado inteiro; ausente é "não mexa". */
export type OccurrenceClientChannelMatrixChange = {
  readonly [channel in OccurrenceClientChannel]?: OccurrenceClientChannelSetting | undefined
}

export type OccurrenceClientChannelLegacyFields = {
  readonly clientChannel: ClientChannel
  readonly clientEmailSendMode: ClientEmailSendMode
  readonly clientEmailType: ClientEmailType
}

function includesEmail(channel: ClientChannel): boolean {
  return channel === CLIENT_CHANNEL.EMAIL || channel === CLIENT_CHANNEL.BOTH
}

function includesWhatsApp(channel: ClientChannel): boolean {
  return channel === CLIENT_CHANNEL.WHATSAPP || channel === CLIENT_CHANNEL.BOTH
}

/** E-mail+WhatsApp = `both`, só um = ele, nenhum = `off`. */
export function deriveClientChannelFromMatrix(
  matrix: OccurrenceClientChannelMatrix,
): ClientChannel {
  const email = matrix.email.enabled
  const whatsapp = matrix.whatsapp.enabled
  if (email && whatsapp) return CLIENT_CHANNEL.BOTH
  if (email) return CLIENT_CHANNEL.EMAIL
  if (whatsapp) return CLIENT_CHANNEL.WHATSAPP
  return CLIENT_CHANNEL.OFF
}

/**
 * As caixas como os campos antigos as diziam: o e-mail sai quando o canal o inclui **e** o tipo de e-mail do cliente
 * está escolhido (spec 279: `client_email_type = off` não manda nada), no modo da 279; o WhatsApp só tinha envio manual.
 * É a mesma regra do preenchimento da migration (`*_occurrence_type_client_channels`).
 */
export function deriveClientChannelMatrixFromLegacy(
  legacy: OccurrenceClientChannelLegacyFields,
): OccurrenceClientChannelMatrix {
  return {
    email: {
      enabled:
        includesEmail(legacy.clientChannel) && legacy.clientEmailType !== CLIENT_EMAIL_TYPE_OFF,
      sendMode: legacy.clientEmailSendMode,
      templateKey: null,
    },
    whatsapp: {
      enabled: includesWhatsApp(legacy.clientChannel),
      sendMode: OCCURRENCE_CLIENT_CHANNEL_SEND_MODE_DEFAULT,
      templateKey: null,
    },
  }
}

/** A leitura tolerante: o gravado, ou o derivado dos campos antigos quando o tipo não tem linha. */
export function resolveClientChannelMatrix(params: {
  readonly legacy: OccurrenceClientChannelLegacyFields
  readonly stored: OccurrenceClientChannelMatrixChange | undefined
}): OccurrenceClientChannelMatrix {
  const derived = deriveClientChannelMatrixFromLegacy(params.legacy)
  return {
    email: params.stored?.email ?? derived.email,
    whatsapp: params.stored?.whatsapp ?? derived.whatsapp,
  }
}

/** A gravação nova: cada canal mandado substitui o gravado; os outros ficam. */
export function mergeClientChannelMatrix(params: {
  readonly change: OccurrenceClientChannelMatrixChange
  readonly current: OccurrenceClientChannelMatrix
}): OccurrenceClientChannelMatrix {
  return {
    email: params.change.email ?? params.current.email,
    whatsapp: params.change.whatsapp ?? params.current.whatsapp,
  }
}

/**
 * A gravação do painel antigo: as caixas seguem os campos antigos já gravados; a chave do modelo fica, e o modo do
 * WhatsApp também (o painel antigo não o conhece). O modo do e-mail é o da 279.
 */
export function applyLegacyFieldsToClientChannelMatrix(params: {
  readonly current: OccurrenceClientChannelMatrix
  readonly legacy: OccurrenceClientChannelLegacyFields
}): OccurrenceClientChannelMatrix {
  const derived = deriveClientChannelMatrixFromLegacy(params.legacy)
  return {
    email: {
      ...params.current.email,
      enabled: derived.email.enabled,
      sendMode: derived.email.sendMode,
    },
    whatsapp: { ...params.current.whatsapp, enabled: derived.whatsapp.enabled },
  }
}

/**
 * Os campos antigos que a matriz gravada impõe ao tipo: `client_channel` derivado e o modo do e-mail. O
 * `client_email_type` não é derivado (é qual e-mail do cliente, não se o canal liga): e-mail ligado com ele `off` é
 * recusado por quem grava, para a leitura antiga não divergir da matriz.
 */
export function deriveLegacyFieldsFromClientChannelMatrix(matrix: OccurrenceClientChannelMatrix): {
  readonly clientChannel: ClientChannel
  readonly clientEmailSendMode: ClientEmailSendMode
} {
  return {
    clientChannel: deriveClientChannelFromMatrix(matrix),
    clientEmailSendMode: matrix.email.sendMode,
  }
}

/** E-mail ligado sem o tipo de e-mail do cliente escolhido: a leitura antiga diria desligado. */
export function isEmailEnabledWithoutClientEmailType(params: {
  readonly clientEmailType: ClientEmailType
  readonly matrix: OccurrenceClientChannelMatrix
}): boolean {
  return params.matrix.email.enabled && params.clientEmailType === CLIENT_EMAIL_TYPE_OFF
}

export const OCCURRENCE_CLIENT_CHANNEL_ORDER: readonly OccurrenceClientChannel[] = [
  OCCURRENCE_CLIENT_CHANNEL.EMAIL,
  OCCURRENCE_CLIENT_CHANNEL.WHATSAPP,
]
