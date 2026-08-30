/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  USER_PICTURE_MAX_BYTES,
  type UserPictureMimeType,
} from '../../database/identity-user-picture.schema.js'
import {
  UserPictureTooLargeError,
  UserPictureUnsupportedFormatError,
} from './user-picture.error.js'

export { USER_PICTURE_MAX_BYTES }

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff] as const
/** WebP é um contêiner RIFF: `RIFF`, quatro bytes de tamanho, e só então `WEBP`. */
const RIFF_SIGNATURE = [0x52, 0x49, 0x46, 0x46] as const
const WEBP_MARKER = [0x57, 0x45, 0x42, 0x50] as const
const WEBP_MARKER_OFFSET = 8

/**
 * O tipo declarado no multipart vem do cliente; só a assinatura decide o que a rota de leitura vai
 * devolver como `content-type` para o navegador de outra pessoa.
 */
export function detectUserPictureMimeType(bytes: Uint8Array): UserPictureMimeType | null {
  if (startsWith({ bytes, signature: PNG_SIGNATURE })) return 'image/png'
  if (startsWith({ bytes, signature: JPEG_SIGNATURE })) return 'image/jpeg'
  if (
    startsWith({ bytes, signature: RIFF_SIGNATURE }) &&
    startsWith({ bytes, offset: WEBP_MARKER_OFFSET, signature: WEBP_MARKER })
  ) {
    return 'image/webp'
  }
  return null
}

export function assertUserPictureBytes(bytes: Uint8Array): UserPictureMimeType {
  if (bytes.byteLength > USER_PICTURE_MAX_BYTES) throw new UserPictureTooLargeError()
  const mimeType = detectUserPictureMimeType(bytes)
  if (mimeType === null) throw new UserPictureUnsupportedFormatError()
  return mimeType
}

function startsWith(input: {
  readonly bytes: Uint8Array
  readonly offset?: number
  readonly signature: readonly number[]
}): boolean {
  const offset = input.offset ?? 0
  if (input.bytes.byteLength < offset + input.signature.length) return false
  return input.signature.every((byte, index) => input.bytes[offset + index] === byte)
}
