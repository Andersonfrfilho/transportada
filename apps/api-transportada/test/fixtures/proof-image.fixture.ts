/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * PNG sólido gerado em memória, para os testes do PDF de canhotos não dependerem de arquivo binário.
 */
import { deflateSync } from 'node:zlib'

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  return value >>> 0
})

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff
  for (const byte of bytes) crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function buildChunk(type: string, data: Buffer): Buffer {
  const header = Buffer.alloc(8)
  header.writeUInt32BE(data.length, 0)
  header.write(type, 4, 'ascii')
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(Buffer.concat([header.subarray(4), data])), 0)
  return Buffer.concat([header, data, checksum])
}

export function buildSolidPngBytes(input: {
  readonly heightPx: number
  readonly widthPx: number
}): Uint8Array {
  const { heightPx, widthPx } = input
  const header = Buffer.alloc(13)
  header.writeUInt32BE(widthPx, 0)
  header.writeUInt32BE(heightPx, 4)
  header.writeUInt8(8, 8)
  header.writeUInt8(2, 9)
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(widthPx * 3, 0x88)])
  const pixels = Buffer.concat(Array.from({ length: heightPx }, () => row))
  return new Uint8Array(
    Buffer.concat([
      PNG_SIGNATURE,
      buildChunk('IHDR', header),
      buildChunk('IDAT', deflateSync(pixels)),
      buildChunk('IEND', Buffer.alloc(0)),
    ]),
  )
}
