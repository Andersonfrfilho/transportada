/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  AccessKeyCheckEntry,
  CheckAccessKeysParams,
  NfeDocumentAccessKeyCheckReaderPort,
} from './nfe-document-access-key-check.types.js'

export function createCheckAccessKeysUseCase(dependencies: {
  readonly reader: NfeDocumentAccessKeyCheckReaderPort
}) {
  return {
    async execute(request: CheckAccessKeysParams): Promise<readonly AccessKeyCheckEntry[]> {
      const documentIds = await dependencies.reader.findDocumentIdsByAccessKeys({
        accessKeys: request.accessKeys,
        companyId: request.context.companyId,
      })
      return request.accessKeys.map((accessKey) => ({
        accessKey,
        documentId: documentIds.get(accessKey) ?? null,
      }))
    },
  }
}
