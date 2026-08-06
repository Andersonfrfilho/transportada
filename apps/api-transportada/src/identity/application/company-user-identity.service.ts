/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { IdentitySubjectNotFoundError } from '../domain/company-user.error.js'
import type { CompanyUserRepositoryPort } from './company-user.port.js'

/** Ponto único de tradução do id da aplicação para o `subject` que o Admin API endereça. */
export async function resolveIdentitySubject({
  repository,
  userId,
}: {
  readonly repository: Pick<CompanyUserRepositoryPort, 'findIdentitySubject'>
  readonly userId: string
}): Promise<string> {
  const subject = await repository.findIdentitySubject({ userId })
  if (subject === undefined) throw new IdentitySubjectNotFoundError()

  return subject
}
