/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 169 P2: quem tem `settings.manage` cadastra a espécie que a operação usa — sem deploy.
 */
import type { CompanyEntryKindSide } from '../../database/trip-financial.schema.js'
import { CompanyEntryKindNameConflictError } from '../domain/company-entry-kind.error.js'
import type { CompanyEntryKind, CompanyEntryKindPort } from './company-entry-kind.port.js'

type Actor = {
  readonly companyId: string
}

export function createListCompanyEntryKindsUseCase(dependencies: {
  readonly entryKinds: CompanyEntryKindPort
}): {
  readonly execute: (input: Actor) => Promise<readonly CompanyEntryKind[]>
} {
  return { execute: (input) => dependencies.entryKinds.listByCompany(input) }
}

export function createListActiveCompanyEntryKindsUseCase(dependencies: {
  readonly entryKinds: CompanyEntryKindPort
}): {
  readonly execute: (
    input: Actor & { readonly side: CompanyEntryKindSide },
  ) => Promise<readonly CompanyEntryKind[]>
} {
  return { execute: (input) => dependencies.entryKinds.listActiveBySide(input) }
}

export function createCreateCompanyEntryKindUseCase(dependencies: {
  readonly entryKinds: CompanyEntryKindPort
}): {
  readonly execute: (
    input: Actor & { readonly name: string; readonly side: CompanyEntryKindSide },
  ) => Promise<CompanyEntryKind>
} {
  return {
    execute: async (input) => {
      const conflicts = await dependencies.entryKinds.existsByName(input)
      if (conflicts) throw new CompanyEntryKindNameConflictError()

      return dependencies.entryKinds.create(input)
    },
  }
}

export function createDeactivateCompanyEntryKindUseCase(dependencies: {
  readonly entryKinds: CompanyEntryKindPort
}): {
  readonly execute: (
    input: Actor & { readonly entryKindId: string },
  ) => Promise<CompanyEntryKind | null>
} {
  return { execute: (input) => dependencies.entryKinds.deactivate(input) }
}
