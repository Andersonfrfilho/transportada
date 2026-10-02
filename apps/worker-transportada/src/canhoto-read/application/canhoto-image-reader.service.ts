/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { AttachmentObjectReaderPort } from '../../aggregate-attachment/application/extract-attachment-fields.port.js'
import {
  CANHOTO_READ_MAX_OBJECT_BYTES,
  CANHOTO_SUPPORTED_MEDIA_TYPES,
  type CanhotoReadFailureOutcome,
  type CanhotoSupportedMediaType,
} from '../domain/canhoto-read.constant.js'
import type { CanhotoBarcodeDecoderPort } from './canhoto-barcode-decoder.port.js'
import { CanhotoDecodeTimeoutError } from './canhoto-decode-timeout.error.js'
import type { PendingCanhotoProof } from './canhoto-read-queue.port.js'

type CanhotoImageReadFailure = Extract<
  CanhotoReadFailureOutcome,
  'object_unavailable' | 'unsupported_media' | 'too_large' | 'decode_timeout'
>

export type CanhotoImageReadResult =
  | Readonly<{ kind: 'read'; text: string | null }>
  | Readonly<{ kind: 'failed'; outcome: CanhotoImageReadFailure }>

export type CanhotoImageReaderPort = Readonly<{
  read: (proof: PendingCanhotoProof) => Promise<CanhotoImageReadResult>
}>

function isSupportedMediaType(mediaType: string): mediaType is CanhotoSupportedMediaType {
  return (CANHOTO_SUPPORTED_MEDIA_TYPES as readonly string[]).includes(mediaType)
}

/** Teto e formato saem do que o `stored_objects` já gravou: nenhum byte é baixado para ser recusado. */
export function createCanhotoImageReader(dependencies: {
  readonly decoder: CanhotoBarcodeDecoderPort
  readonly objectReader: AttachmentObjectReaderPort
}): CanhotoImageReaderPort {
  return {
    async read(proof) {
      if (proof.sizeBytes > CANHOTO_READ_MAX_OBJECT_BYTES) {
        return { kind: 'failed', outcome: 'too_large' }
      }
      if (!isSupportedMediaType(proof.mimeType)) {
        return { kind: 'failed', outcome: 'unsupported_media' }
      }

      const bytes = await dependencies.objectReader.read({
        bucket: proof.bucket,
        key: proof.objectKey,
      })
      if (bytes === undefined) return { kind: 'failed', outcome: 'object_unavailable' }

      try {
        return {
          kind: 'read',
          text: await dependencies.decoder.decode({ bytes, mediaType: proof.mimeType }),
        }
      } catch (error) {
        if (error instanceof CanhotoDecodeTimeoutError) {
          return { kind: 'failed', outcome: 'decode_timeout' }
        }
        throw error
      }
    },
  }
}
