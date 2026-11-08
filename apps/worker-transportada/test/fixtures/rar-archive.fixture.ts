/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Monta um RAR 4.x com os arquivos **armazenados** (método 0x30, sem compressão) byte a byte — não há `rar` no CI, e o
 * formato armazenado é simples: assinatura, cabeçalho principal, um cabeçalho por arquivo seguido dos dados, fim.
 */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = (c & 1) === 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function headerWithCrc(body: Uint8Array): Uint8Array {
  const crc = crc32(body) & 0xffff
  const out = new Uint8Array(body.length + 2)
  out[0] = crc & 0xff
  out[1] = crc >>> 8
  out.set(body, 2)
  return out
}

export function buildStoredRar(files: Record<string, Uint8Array>): Uint8Array {
  const parts: Uint8Array[] = [new Uint8Array([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00])]
  // MAIN_HEAD: tipo 0x73, flags 0, tamanho 13, 6 bytes reservados
  parts.push(headerWithCrc(new Uint8Array([0x73, 0, 0, 13, 0, 0, 0, 0, 0, 0, 0])))
  const encoder = new TextEncoder()
  for (const [name, content] of Object.entries(files)) {
    const nameBytes = encoder.encode(name)
    const size = 32 + nameBytes.length
    const body = new Uint8Array(size - 2)
    const view = new DataView(body.buffer)
    body[0] = 0x74
    view.setUint16(1, 0x8000, true) // LONG_BLOCK: os dados vêm depois do cabeçalho
    view.setUint16(3, size, true)
    view.setUint32(5, content.length, true) // PACK_SIZE
    view.setUint32(9, content.length, true) // UNP_SIZE
    body[13] = 3 // HOST_OS (unix)
    view.setUint32(14, crc32(content), true)
    view.setUint32(18, 0x5a21_0000, true) // FTIME
    body[22] = 29 // UNP_VER
    body[23] = 0x30 // método: armazenado
    view.setUint16(24, nameBytes.length, true)
    view.setUint32(26, 0x20, true) // ATTR
    body.set(nameBytes, 30)
    parts.push(headerWithCrc(body), content)
  }
  parts.push(new Uint8Array([0xc4, 0x3d, 0x7b, 0x00, 0x40, 0x07, 0x00]))
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}
