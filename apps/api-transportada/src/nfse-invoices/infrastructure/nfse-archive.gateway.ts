/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { ArchiveObjectStreamGateway } from '../../shared/archive-stream.service.js'
import { createArchiveStream } from '../../shared/archive-stream.service.js'
import type {
  NfseArchiveEntry,
  NfseArchivePort,
} from '../application/export-nfse-documents.port.js'

export function createNfseArchiveGateway(input: {
  readonly storage: ArchiveObjectStreamGateway
}): NfseArchivePort {
  return {
    async createArchive(entries: readonly NfseArchiveEntry[]): Promise<ReadableStream<Uint8Array>> {
      return createArchiveStream({ entries, storage: input.storage })
    },
  }
}
