/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { ArchiveObjectStreamGateway } from '../../shared/archive-stream.service.js'
import { createArchiveStream } from '../../shared/archive-stream.service.js'
import type { CteArchiveEntry, CteArchivePort } from '../application/export-cte-documents.port.js'

export function createCteArchiveGateway(input: {
  readonly storage: ArchiveObjectStreamGateway
}): CteArchivePort {
  return {
    async createArchive(entries: readonly CteArchiveEntry[]): Promise<ReadableStream<Uint8Array>> {
      return createArchiveStream({ entries, storage: input.storage })
    },
  }
}
