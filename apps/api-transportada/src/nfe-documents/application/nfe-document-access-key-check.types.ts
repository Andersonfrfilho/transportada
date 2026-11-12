/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CompanyContext } from '../../identity/domain/tenant-context.js'

export type FindDocumentIdsByAccessKeysParams = {
  readonly accessKeys: readonly string[]
  readonly companyId: string
}

export type NfeDocumentAccessKeyCheckReaderPort = {
  /** Mapa chave → id só das notas da empresa; chave sem nota, ou de outra empresa, não aparece. */
  findDocumentIdsByAccessKeys(
    params: FindDocumentIdsByAccessKeysParams,
  ): Promise<ReadonlyMap<string, string>>
}

export type CheckAccessKeysParams = {
  readonly accessKeys: readonly string[]
  readonly context: CompanyContext
}

export type AccessKeyCheckEntry = {
  readonly accessKey: string
  readonly documentId: string | null
}
