/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 271 (ADR-0108, D13): o `To` do e-mail à contratante num tipo com destinatários escolhidos. Pura.
 *
 * Quem entra em `contacts` já é da contratante **da nota**, ativo e com `receives_occurrences` (o leitor filtra),
 * então a escolha de outra contratante, de contato inativo ou que deixou de receber ocorrências simplesmente não
 * casa. A escolha explícita ignora a etapa; sem nenhum escolhido que sobre (inclusive por falta de e-mail), vale a
 * regra de hoje, os contatos da etapa — nunca "ninguém".
 */
export type OccurrenceRecipientContact = {
  readonly email: null | string
  readonly id: string
  readonly occurrenceStages: readonly string[]
}

export type ResolvedOccurrenceRecipients = {
  readonly contactIds: readonly string[]
  readonly source: 'chosen' | 'stage'
}

export function resolveOccurrenceRecipients(params: {
  readonly chosenContactIds: readonly string[]
  readonly contacts: readonly OccurrenceRecipientContact[]
  readonly stage: string
}): ResolvedOccurrenceRecipients {
  const chosen = new Set(params.chosenContactIds)
  const chosenWithEmail = params.contacts.filter(
    (contact) => chosen.has(contact.id) && (contact.email ?? '').trim() !== '',
  )
  if (chosenWithEmail.length > 0) {
    return { contactIds: chosenWithEmail.map((contact) => contact.id), source: 'chosen' }
  }
  return {
    contactIds: params.contacts
      .filter((contact) => contact.occurrenceStages.includes(params.stage))
      .map((contact) => contact.id),
    source: 'stage',
  }
}
