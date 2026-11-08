/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 301 (RN3): volume não recusa, enfileira. O expansor de zip da importação aceita até 500 XMLs e 100 MB por zip —
 * proteção do worker, não regra de negócio. Um zip com 5 mil notas não pode ser recusado por isso: aqui ele é
 * fatiado, **antes** de entrar na fila, em zips menores que cabem nos tetos do expansor, e cada fatia vira um item da
 * mesma importação, processado no seu turno.
 *
 * Só se fatia o que é são. Zip corrompido, com caminho perigoso, entrada grande demais ou razão de compressão de bomba
 * segue inteiro para o expansor, que o recusa com o código exato (`ZIP_*`) e descarta só aquele item — a segurança
 * continua sendo dele, não daqui. As fatias saem sem compressão (`level: 0`): o expansor só confere a razão de
 * compressão em entradas deflate, e o tamanho do objeto no storage é o menor dos problemas.
 */
import { type UnzipFileInfo, unzipSync, zipSync } from 'fflate'

import {
  effectiveEntrySizes,
  extractZipEntry,
  readZipDirectory,
  readZipEntrySizes,
} from '../../nfe-imports/infrastructure/zip-entry-sizes.reader.js'
import type { ReceiptFile } from '../application/nfe-xml-receipt.types.js'

/** Abaixo dos tetos do expansor (500 entradas, 100 MB) para sobrar folga. */
export const ZIP_CHUNK_LIMITS = {
  maxEntries: 400,
  maxEntryBytes: 25 * 1024 * 1024,
  maxCompressionRatio: 20,
  maxTotalBytes: 80 * 1024 * 1024,
  /** Acima disto o zip é, na prática, uma bomba: segue inteiro e o expansor o recusa. */
  maxPlannedBytes: 4 * 1024 * 1024 * 1024,
} as const

const DEFLATE = 8

type Entry = { readonly name: string; readonly size: number }

export function chunkOversizedZip(file: ReceiptFile): readonly ReceiptFile[] {
  if (!file.name.trim().toLowerCase().endsWith('.zip')) return [file]
  const entries = listSafeXmlEntries(file.bytes)
  if (entries === undefined) return [file]
  const total = entries.reduce((sum, entry) => sum + entry.size, 0)
  if (entries.length <= ZIP_CHUNK_LIMITS.maxEntries && total <= ZIP_CHUNK_LIMITS.maxTotalBytes) {
    return [file]
  }

  const base = file.name.replace(/\.zip$/iu, '')
  const chunks: ReceiptFile[] = []
  for (const [index, names] of planChunks(entries).entries()) {
    const wanted = new Set(names)
    const extracted = extractWanted(file.bytes, wanted)
    chunks.push({
      bytes: zipSync(extracted, { level: 0 }),
      name: `${base}-parte-${String(index + 1).padStart(3, '0')}.zip`,
    })
  }
  return chunks
}

/** Zip em fluxo (spec 305) não passa pelo `unzipSync`: ele alocaria 4 GiB por entrada com o marcador de 32 bits. */
function extractWanted(bytes: Uint8Array, wanted: ReadonlySet<string>): Record<string, Uint8Array> {
  const directory = readZipDirectory(bytes)
  if (!directory.streamed) return unzipSync(bytes, { filter: (info) => wanted.has(info.name) })
  const extracted: Record<string, Uint8Array> = {}
  for (const entry of directory.entries) {
    if (wanted.has(entry.name)) extracted[entry.name] = extractZipEntry(bytes, entry)
  }
  return extracted
}

function planChunks(entries: readonly Entry[]): readonly (readonly string[])[] {
  const chunks: string[][] = []
  let current: string[] = []
  let currentBytes = 0
  for (const entry of entries) {
    if (
      current.length >= ZIP_CHUNK_LIMITS.maxEntries ||
      (current.length > 0 && currentBytes + entry.size > ZIP_CHUNK_LIMITS.maxTotalBytes)
    ) {
      chunks.push(current)
      current = []
      currentBytes = 0
    }
    current.push(entry.name)
    currentBytes += entry.size
  }
  if (current.length > 0) chunks.push(current)
  return chunks
}

/** Lê só o diretório do zip (nada é inflado). `undefined` = qualquer coisa fora do normal: não fatia. */
function listSafeXmlEntries(bytes: Uint8Array): readonly Entry[] | undefined {
  const entries: Entry[] = []
  let planned = 0
  let unsafe = false
  const directory = readZipEntrySizes(bytes)
  try {
    unzipSync(bytes, {
      filter(info: UnzipFileInfo): boolean {
        const name = info.name
        const sizes = effectiveEntrySizes(info, directory)
        if (name.endsWith('/') || !name.toLowerCase().endsWith('.xml')) return false
        if (
          !isSafeName(name) ||
          sizes.originalSize <= 0 ||
          sizes.originalSize > ZIP_CHUNK_LIMITS.maxEntryBytes
        ) {
          unsafe = true
          return false
        }
        if (
          info.compression === DEFLATE &&
          sizes.compressedSize > 0 &&
          sizes.originalSize / sizes.compressedSize > ZIP_CHUNK_LIMITS.maxCompressionRatio
        ) {
          unsafe = true
          return false
        }
        planned += sizes.originalSize
        if (planned > ZIP_CHUNK_LIMITS.maxPlannedBytes) unsafe = true
        entries.push({ name, size: sizes.originalSize })
        return false
      },
    })
  } catch {
    return undefined
  }
  return unsafe || entries.length === 0 ? undefined : entries
}

function isSafeName(name: string): boolean {
  return !(
    name.startsWith('/') ||
    name.includes('\\') ||
    name.includes('\0') ||
    name.split('/').some((segment) => segment === '..') ||
    /^[a-zA-Z]:/u.test(name)
  )
}
