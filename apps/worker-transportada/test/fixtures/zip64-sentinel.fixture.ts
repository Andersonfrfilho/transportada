/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 305: reescreve o diretório central de um zip comum no formato de um zip feito em fluxo — `0xFFFFFFFF` nos
 * campos de 32 bits e o tamanho de verdade no campo extra Zip64. É o que o zip de 389 notas do cliente trazia, e o que
 * fez o teto por arquivo ver 4 GiB em cada entrada.
 */
const SENTINEL = 0xffffffff

export function withZip64Sentinels(
  zip: Uint8Array,
  options: { readonly claimedOriginalSize?: bigint } = {},
): Uint8Array {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
  const eocd = zip.byteLength - 22
  if (view.getUint32(eocd, true) !== 0x06054b50) throw new Error('zip sem comentário esperado')
  const count = view.getUint16(eocd + 10, true)
  const directoryOffset = view.getUint32(eocd + 16, true)

  const entries: Uint8Array[] = []
  let cursor = directoryOffset
  for (let index = 0; index < count; index += 1) {
    const nameLength = view.getUint16(cursor + 28, true)
    const extraLength = view.getUint16(cursor + 30, true)
    const commentLength = view.getUint16(cursor + 32, true)
    const length = 46 + nameLength + extraLength + commentLength
    const entry = new Uint8Array(length + 20 - extraLength)
    const entryView = new DataView(entry.buffer)
    const compressed = view.getUint32(cursor + 20, true)
    const original = view.getUint32(cursor + 24, true)
    entry.set(zip.subarray(cursor, cursor + 46 + nameLength), 0)
    entry.set(
      zip.subarray(cursor + 46 + nameLength + extraLength, cursor + length),
      46 + nameLength + 20,
    )
    entryView.setUint32(20, SENTINEL, true)
    entryView.setUint32(24, SENTINEL, true)
    entryView.setUint16(30, 20, true)
    const extra = 46 + nameLength
    entryView.setUint16(extra, 0x0001, true)
    entryView.setUint16(extra + 2, 16, true)
    entryView.setBigUint64(extra + 4, options.claimedOriginalSize ?? BigInt(original), true)
    entryView.setBigUint64(extra + 12, BigInt(compressed), true)
    entries.push(entry)
    cursor += length
  }
  const directory = new Uint8Array(entries.reduce((total, entry) => total + entry.length, 0))
  let position = 0
  for (const entry of entries) {
    directory.set(entry, position)
    position += entry.length
  }
  const result = new Uint8Array(directoryOffset + directory.length + 22)
  result.set(zip.subarray(0, directoryOffset), 0)
  result.set(directory, directoryOffset)
  result.set(zip.subarray(eocd), directoryOffset + directory.length)
  new DataView(result.buffer).setUint32(
    directoryOffset + directory.length + 12,
    directory.length,
    true,
  )
  return result
}
