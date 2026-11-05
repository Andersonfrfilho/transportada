/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 RF21: o comando do atendente para **encerrar a rota/viagem** ("encerrar a rota", "fechar
 * viagem"). Só a frase inteira conta — texto livre com essas palavras segue o fluxo de sempre.
 */
import { normalizeDriverCommandText } from './whatsapp-driver-command.policy.js'

const CLOSE_TRIP_COMMAND =
  /^(encerrar|encerra|fechar|fecha|finalizar|finaliza) (a |esta |essa )?(rota|viagem)$/u

export function isCloseTripCommand(text: string): boolean {
  return CLOSE_TRIP_COMMAND.test(normalizeDriverCommandText(text))
}
