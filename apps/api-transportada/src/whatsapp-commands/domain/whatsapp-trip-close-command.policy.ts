/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 RF21: o comando do atendente para **encerrar a rota/viagem** ("encerrar a rota", "fechar
 * viagem", "encerrar a rota 17234"). Só a frase inteira conta — texto livre com essas palavras segue o
 * fluxo de sempre.
 */
import { normalizeDriverCommandText } from './whatsapp-driver-command.policy.js'

const CLOSE_TRIP_COMMAND =
  /^(encerrar|encerra|fechar|fecha|finalizar|finaliza) (a |esta |essa )?(rota|viagem)(?: (?:da |com a )?(?:nf |nota )?(\d{1,9}))?$/u

/** `documentNumber` é a NF que escolhe a viagem (conversa individual); `null` quando não veio. */
export function interpretCloseTripCommand(
  text: string,
): { readonly documentNumber: null | string } | null {
  const match = CLOSE_TRIP_COMMAND.exec(normalizeDriverCommandText(text))
  if (match === null) return null
  return { documentNumber: match[4] ?? null }
}

/** No grupo a viagem é a do motorista do grupo: só a frase, sem número de nota. */
export function isCloseTripCommand(text: string): boolean {
  return interpretCloseTripCommand(text)?.documentNumber === null
}
