/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createHash } from 'node:crypto'

import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import { CompanyLogoNotFoundError } from '../domain/company-logo.error.js'
import { assertCompanyLogoBytes } from '../domain/company-logo.policy.js'
import type {
  CompanyLogo,
  CompanyLogoMetadata,
  CompanyLogoRepositoryPort,
} from './company-logo.port.js'

type Dependencies = {
  readonly repository: CompanyLogoRepositoryPort
}

export type CompanyLogoUseCase = {
  readonly find: (input: { readonly context: CompanyContext }) => Promise<CompanyLogo>
  readonly remove: (input: { readonly context: CompanyContext }) => Promise<void>
  readonly replace: (input: {
    readonly bytes: Uint8Array
    readonly context: CompanyContext
  }) => Promise<CompanyLogoMetadata>
}

export function createCompanyLogoUseCase(dependencies: Dependencies): CompanyLogoUseCase {
  return {
    find: async ({ context }) => {
      const logo = await dependencies.repository.find({ companyId: context.companyId })
      if (logo === null) throw new CompanyLogoNotFoundError()
      return logo
    },
    remove: async ({ context }) => {
      const removed = await dependencies.repository.remove({ companyId: context.companyId })
      if (!removed) throw new CompanyLogoNotFoundError()
    },
    replace: ({ bytes, context }) => {
      const mimeType = assertCompanyLogoBytes(bytes)
      const content = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
      return dependencies.repository.save({
        byteSize: content.byteLength,
        companyId: context.companyId,
        contentBase64: content.toString('base64'),
        mimeType,
        sha256: createHash('sha256').update(content).digest('hex'),
      })
    },
  }
}
