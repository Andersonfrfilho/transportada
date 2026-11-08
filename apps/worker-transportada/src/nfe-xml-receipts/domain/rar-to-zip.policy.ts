/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 307: o recebimento (e-mail e WhatsApp) aceita `.rar`. Em vez de ensinar o resto da fila a ler RAR, o arquivo é
 * aberto **na entrada** e vira um zip interno (`level: 0`) só com os XMLs — dali em diante tudo é o fluxo do zip, já provado
 * (um item por XML, expansor com os tetos, fatiamento por volume).
 *
 * Os tetos são os do zip (`ZIP_CHUNK_LIMITS`) e valem sobre o tamanho **declarado** no cabeçalho, antes de qualquer
 * descompressão; o tamanho de cada entrada extraída é conferido de novo. RAR com senha, em volumes, corrompido, com caminho
 * perigoso ou acima dos tetos segue como um item recusado (os bytes originais com nome `.zip`): o expansor o recusa com
 * `ZIP_INVALID_ARCHIVE` e o resumo mostra o problema, sem derrubar o resto do lote.
 */
import { createExtractorFromData } from 'node-unrar-js'
import { zipSync } from 'fflate'

import type { ReceiptFile } from '../application/nfe-xml-receipt.types.js'
import { ZIP_CHUNK_LIMITS } from './zip-queue-chunking.policy.js'

const RAR_EXTENSION = '.rar'

export function isRarFileName(name: string): boolean {
  return name.trim().toLowerCase().endsWith(RAR_EXTENSION)
}

type RarHeader = {
  readonly name: string
  readonly flags: { readonly directory: boolean; readonly encrypted: boolean }
  readonly unpSize: number
}

/** O RAR inteiro fica em memória até virar zip: teto próprio (o zip resultante ainda é fatiado pelo volume). */
const RAR_LIMITS = { maxEntries: 5000, maxTotalBytes: 256 * 1024 * 1024 } as const

export async function convertRarToZip(file: ReceiptFile): Promise<ReceiptFile> {
  if (!isRarFileName(file.name)) return file
  const base = file.name.replace(/\.rar$/iu, '')
  const refused: ReceiptFile = { bytes: file.bytes, name: `${base}.rar.zip` }
  try {
    const data = file.bytes.buffer.slice(
      file.bytes.byteOffset,
      file.bytes.byteOffset + file.bytes.byteLength,
    ) as ArrayBuffer
    const extractor = await createExtractorFromData({ data })
    const headers = [...extractor.getFileList().fileHeaders] as RarHeader[]
    const wanted = headers.filter(
      (header) => !header.flags.directory && header.name.toLowerCase().endsWith('.xml'),
    )
    if (wanted.length === 0 || !withinLimits(wanted)) return refused

    const names = new Set(wanted.map((header) => header.name))
    const extracted: Record<string, Uint8Array> = {}
    for (const entry of extractor.extract({ files: (header) => names.has(header.name) }).files) {
      const content = entry.extraction
      if (content === undefined) return refused
      if (content.byteLength === 0 || content.byteLength > ZIP_CHUNK_LIMITS.maxEntryBytes) {
        return refused
      }
      extracted[entry.fileHeader.name.replaceAll('\\', '/')] = content
    }
    if (Object.keys(extracted).length !== wanted.length) return refused
    return { bytes: zipSync(extracted, { level: 0 }), name: `${base}.zip` }
  } catch {
    return refused
  }
}

function withinLimits(entries: readonly RarHeader[]): boolean {
  let total = 0
  for (const entry of entries) {
    if (entry.flags.encrypted || !isSafeName(entry.name)) return false
    if (entry.unpSize <= 0 || entry.unpSize > ZIP_CHUNK_LIMITS.maxEntryBytes) return false
    total += entry.unpSize
    if (total > RAR_LIMITS.maxTotalBytes) return false
  }
  return entries.length <= RAR_LIMITS.maxEntries
}

function isSafeName(name: string): boolean {
  return !(
    name.startsWith('/') ||
    name.includes('\0') ||
    name.split(/[\\/]/u).some((segment) => segment === '..') ||
    /^[a-zA-Z]:/u.test(name)
  )
}
