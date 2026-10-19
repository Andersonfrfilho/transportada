/* Copyright (c) 2026 Ada Technology. MIT License. */

/** O limite da API (`job_title varchar(80)`, ADR-0110 D10); acima disso a API responde 400. */
export const JOB_TITLE_MAX_LENGTH = 80

/**
 * O que vai no PATCH: `undefined` não altera, `null` limpa, texto grava. A API normaliza espaços; aqui só se
 * aparam as pontas para não mandar uma alteração que a API trataria como igual.
 */
export function resolveJobTitleChange(
  draft: string,
  current: string | undefined,
): null | string | undefined {
  const trimmed = draft.trim()
  if (trimmed === (current ?? '')) return undefined
  return trimmed === '' ? null : trimmed
}
