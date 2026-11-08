/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 300 RF13: o vínculo de quem recebeu, com o ícone de cada opção. A ordem é a do seletor do app
 * (`RECEIVED_BY_OPTIONS`); o número da resposta é a posição.
 */
import { RECEIVED_BY_OPTIONS, type ReceivedBy } from '../../database/trip.schema.js'
import type { MessageOption } from './whatsapp-message-format.policy.js'

export const RECEIVED_BY_LABELS: Readonly<Record<ReceivedBy, string>> = {
  child: 'Filho ou filha',
  doorman: 'Porteiro',
  employee: 'Funcionário do local',
  neighbor: 'Vizinho',
  other: 'Outra pessoa',
  other_relative: 'Outro parente',
  parent: 'Pai ou mãe',
  recipient: 'O próprio destinatário',
  sibling: 'Irmão ou irmã',
  spouse: 'Cônjuge',
}

const RECEIVED_BY_ICONS: Readonly<Record<ReceivedBy, string>> = {
  child: '🧒',
  doorman: '🛎️',
  employee: '🧑‍💼',
  neighbor: '🏘️',
  other: '👤',
  other_relative: '👪',
  parent: '🧓',
  recipient: '🙋',
  sibling: '🧑‍🤝‍🧑',
  spouse: '💍',
}

export const RECEIVED_BY_MESSAGE_OPTIONS: readonly MessageOption[] = RECEIVED_BY_OPTIONS.map(
  (option) => ({ action: RECEIVED_BY_LABELS[option], icon: RECEIVED_BY_ICONS[option] }),
)

/** O vínculo no meio da frase ("Anotado: funcionário do local"). */
export function describeReceivedByInSentence(receivedBy: ReceivedBy): string {
  return RECEIVED_BY_LABELS[receivedBy].toLocaleLowerCase('pt-BR')
}
