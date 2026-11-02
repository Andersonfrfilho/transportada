/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 286 T4 (RF2): as regras puras do bloco "Retorno ao cliente" do tipo — quais modelos cada canal oferece, quando o
 * canal avisa que não vai sair e qual é a troca que a caixa, o modelo e o modo gravam. Sem DOM: o componente só desenha.
 */
import { OCCURRENCE_MAIL_SAMPLE_VALUES } from '@/modules/occurrence-conversation/shared/occurrenceTypeMailTemplate.service'
import type {
  ClientChannelTemplateChoice,
  ClientChannelTemplateProblemCode,
} from '@/modules/occurrence-conversation/shared/occurrenceTypeMail.types'

import type {
  ClientReturnChannel,
  ClientReturnChannelSetting,
  ClientReturnMatrix,
  ClientReturnSendMode,
} from './occurrenceContractorReply.constant'

/**
 * Os valores de exemplo da prévia do boleto ao cliente: os do e-mail de ocorrência mais os dados da transportadora que
 * só o modelo do canal tem (`CONTRACTOR_REPLY_CLIENT_TEMPLATE_VARIABLES` da API).
 */
export const CLIENT_RETURN_SAMPLE_VALUES: Readonly<Record<string, string>> = {
  ...OCCURRENCE_MAIL_SAMPLE_VALUES,
  emailTransportadora: 'financeiro@transportadora.exemplo',
  enderecoTransportadora: 'Rua Exemplo, 100 – Centro, Ribeirão Preto/SP – CEP 14010-000',
  telefoneTransportadora: '(16) 3333-4444',
  tipoOcorrencia: 'Prorrogação do boleto',
}

/** O que o `PUT` leva: só o canal que mudou, inteiro — o outro fica como está. */
export type ClientReturnEdit = Readonly<{
  clientChannels: Readonly<Partial<Record<ClientReturnChannel, ClientReturnChannelSetting>>>
}>

export function buildClientReturnEdit(
  channel: ClientReturnChannel,
  setting: ClientReturnChannelSetting,
): ClientReturnEdit {
  return { clientChannels: { [channel]: setting } }
}

export function toggleClientReturnChannel(
  matrix: ClientReturnMatrix,
  channel: ClientReturnChannel,
  enabled: boolean,
): ClientReturnEdit {
  return buildClientReturnEdit(channel, { ...matrix[channel], enabled })
}

export function selectClientReturnTemplate(
  matrix: ClientReturnMatrix,
  channel: ClientReturnChannel,
  templateKey: null | string,
): ClientReturnEdit {
  return buildClientReturnEdit(channel, { ...matrix[channel], templateKey })
}

export function selectClientReturnSendMode(
  matrix: ClientReturnMatrix,
  channel: ClientReturnChannel,
  sendMode: ClientReturnSendMode,
): ClientReturnEdit {
  return buildClientReturnEdit(channel, { ...matrix[channel], sendMode })
}

/** Os modelos do canal, sem o aviso do sistema; o já escolhido continua na lista mesmo que tenha deixado de servir. */
export function listClientReturnTemplates(
  choices: readonly ClientChannelTemplateChoice[],
  channel: ClientReturnChannel,
  selectedKey: null | string,
): readonly ClientChannelTemplateChoice[] {
  return choices
    .filter((choice) => choice.channel === channel)
    .filter((choice) => choice.usable || choice.key === selectedKey)
    .toSorted((first, second) => first.key.localeCompare(second.key))
}

export type ClientReturnChannelProblem =
  | Readonly<{ kind: 'missing' }>
  | Readonly<{ codes: readonly ClientChannelTemplateProblemCode[]; kind: 'unusable' }>
  | Readonly<{ kind: 'not_found' }>

/**
 * O que o editor avisa de um canal ligado: sem modelo, modelo que sumiu do módulo (ou de outra empresa) ou modelo que
 * deixou de servir. Em todos o canal não sai (409 `…TEMPLATE_MISSING`); `null` é "tudo certo". Canal desligado não avisa.
 * `choices === undefined` é a lista ainda carregando ou que falhou: não se afirma que o modelo sumiu.
 */
export function resolveClientReturnProblem(input: {
  readonly channel: ClientReturnChannel
  readonly choices: readonly ClientChannelTemplateChoice[] | undefined
  readonly setting: ClientReturnChannelSetting
}): ClientReturnChannelProblem | null {
  const { channel, choices, setting } = input
  if (!setting.enabled) return null
  if (setting.templateKey === null) return { kind: 'missing' }
  if (choices === undefined) return null
  const selected = choices.find(
    (choice) => choice.channel === channel && choice.key === setting.templateKey,
  )
  if (selected === undefined) return { kind: 'not_found' }
  if (!selected.usable) {
    return { codes: selected.problems.map((problem) => problem.code), kind: 'unusable' }
  }
  return null
}

/**
 * Spec 288: o canal ligado em envio manual não sai sozinho — só pelo botão da ocorrência. É o motivo mais comum de
 * "o e-mail não saiu"; o editor avisa. `null` quando sai sozinho ou o canal está desligado.
 */
export function resolveClientReturnSendNote(setting: ClientReturnChannelSetting): 'manual' | null {
  return setting.enabled && setting.sendMode === 'manual' ? 'manual' : null
}
