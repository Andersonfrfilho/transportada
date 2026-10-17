/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 271 (ADR-0108): o que o editor "E-mail à contratante" do tipo lê da API — os modelos do módulo de
 * notificação que o tipo pode escolher e os contatos que podem ser destinatários.
 */

/** Por que o modelo não serve ao e-mail à contratante; `unknown_variables` leva os nomes. */
export type ContractorTemplateProblem = Readonly<{
  code:
    | 'empty_subject'
    | 'html_body'
    | 'malformed_placeholder'
    | 'not_found'
    | 'system_key'
    | 'unknown_variables'
  variables?: readonly string[]
}>

/** `usable` é "sem problema algum"; o editor só oferece os utilizáveis e avisa do já escolhido que deixou de ser. */
export type ContractorMailTemplateChoice = Readonly<{
  body: string
  key: string
  problems: readonly ContractorTemplateProblem[]
  subject: string
  usable: boolean
  version: number
}>

export type OccurrenceTypeRecipientCandidate = Readonly<{
  contactId: string
  contractorId: string
  email: string
  name: string
  receivesOccurrences: boolean
  status: string
}>
