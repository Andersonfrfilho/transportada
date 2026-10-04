/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.3: adultera o diretório central de um zip montado pelo `fflate`, para provar que o
 * leitor da prévia não confia no tamanho declarado, nem aceita cifra ou ZIP64.
 */

const END_OF_CENTRAL_DIRECTORY = 0x06054b50
const CENTRAL_DIRECTORY_HEADER = 0x02014b50
const CENTRAL_HEADER_SIZE = 46

type CentralDirectoryPatch = {
  readonly compressedSize?: number
  readonly entryName: string
  readonly flags?: number
  readonly uncompressedSize?: number
}

function findEndOfCentralDirectory(view: DataView): number {
  for (let offset = view.byteLength - 22; offset >= 0; offset -= 1) {
    if (view.getUint32(offset, true) === END_OF_CENTRAL_DIRECTORY) return offset
  }
  throw new Error('FIXTURE_ZIP_WITHOUT_END_OF_CENTRAL_DIRECTORY')
}

/** Devolve uma cópia com os campos do diretório central da entrada trocados. */
export function patchCentralDirectory(bytes: Uint8Array, patch: CentralDirectoryPatch): Uint8Array {
  const copy = bytes.slice()
  const view = new DataView(copy.buffer)
  const end = findEndOfCentralDirectory(view)
  const entries = view.getUint16(end + 10, true)
  let offset = view.getUint32(end + 16, true)
  for (let index = 0; index < entries; index += 1) {
    if (view.getUint32(offset, true) !== CENTRAL_DIRECTORY_HEADER) break
    const nameLength = view.getUint16(offset + 28, true)
    const extraLength = view.getUint16(offset + 30, true)
    const commentLength = view.getUint16(offset + 32, true)
    const nameStart = offset + CENTRAL_HEADER_SIZE
    const name = new TextDecoder().decode(copy.subarray(nameStart, nameStart + nameLength))
    if (name === patch.entryName) {
      if (patch.flags !== undefined) view.setUint16(offset + 8, patch.flags, true)
      if (patch.compressedSize !== undefined)
        view.setUint32(offset + 20, patch.compressedSize, true)
      if (patch.uncompressedSize !== undefined) {
        view.setUint32(offset + 24, patch.uncompressedSize, true)
      }
      return copy
    }
    offset = nameStart + nameLength + extraLength + commentLength
  }
  throw new Error(`FIXTURE_ZIP_ENTRY_NOT_FOUND:${patch.entryName}`)
}

/** Marca o arquivo como ZIP64 (contagem de entradas 0xFFFF no fim do diretório). */
export function markAsZip64(bytes: Uint8Array): Uint8Array {
  const copy = bytes.slice()
  const view = new DataView(copy.buffer)
  const end = findEndOfCentralDirectory(view)
  view.setUint16(end + 10, 0xffff, true)
  return copy
}

/** Poliglota: bytes de outro formato na frente de um zip válido, com os deslocamentos corrigidos. */
export function prependToZip(bytes: Uint8Array, prefix: Uint8Array): Uint8Array {
  const output = new Uint8Array(prefix.length + bytes.length)
  output.set(prefix)
  output.set(bytes, prefix.length)
  const view = new DataView(output.buffer)
  const end = findEndOfCentralDirectory(view)
  const entries = view.getUint16(end + 10, true)
  const directory = view.getUint32(end + 16, true) + prefix.length
  view.setUint32(end + 16, directory, true)
  let offset = directory
  for (let index = 0; index < entries; index += 1) {
    view.setUint32(offset + 42, view.getUint32(offset + 42, true) + prefix.length, true)
    const trailing =
      view.getUint16(offset + 28, true) +
      view.getUint16(offset + 30, true) +
      view.getUint16(offset + 32, true)
    offset += CENTRAL_HEADER_SIZE + trailing
  }
  return output
}
