/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * `contractor_mail_messages` não guarda assunto (só `body_text`): ele é fixo por
 * `subject_type` da conversa. Só `setup_test` existe até a T009 — o P1 (T015) acrescenta os outros
 * subject types junto do envio de ocorrência, e este mapa cresce com ele.
 */
const CONTRACTOR_MAIL_SUBJECT_BY_THREAD_SUBJECT_TYPE: Record<string, string> = {
  setup_test: 'Teste de configuração de e-mail com contratantes',
}

export class ContractorMailUnknownThreadSubjectTypeError extends Error {
  public constructor(subjectType: string) {
    super(`No email subject is registered for thread subject type "${subjectType}"`)
    this.name = 'ContractorMailUnknownThreadSubjectTypeError'
  }
}

export function resolveContractorMailSubject(subjectType: string): string {
  const subject = CONTRACTOR_MAIL_SUBJECT_BY_THREAD_SUBJECT_TYPE[subjectType]
  if (subject === undefined) throw new ContractorMailUnknownThreadSubjectTypeError(subjectType)
  return subject
}
