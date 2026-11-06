/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { nfeAccessKeyLookupNotFound } from './nfe-access-key-lookup.error.js'
import type {
  AccessKeyLookupReaderPort,
  AccessKeyLookupView,
  GetAccessKeyLookupParams,
} from './nfe-access-key-lookup.types.js'

export function createGetAccessKeyLookupUseCase(dependencies: {
  readonly reader: AccessKeyLookupReaderPort
}) {
  return {
    async execute(request: GetAccessKeyLookupParams): Promise<AccessKeyLookupView> {
      const lookup = await dependencies.reader.findById({
        companyId: request.context.companyId,
        lookupId: request.lookupId,
      })
      if (lookup === null) throw nfeAccessKeyLookupNotFound()
      return lookup
    },
  }
}
