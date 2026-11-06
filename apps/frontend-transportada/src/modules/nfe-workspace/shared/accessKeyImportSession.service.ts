/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { RestoredAccessKey } from '@/modules/nfe-access-key-lookup/shared/accessKeyLookupQueue.service'
import type { AccessKeyLookupRow } from '@/modules/nfe-access-key-lookup/shared/accessKeyLookupRow.service'

import { NFE_ACCESS_KEY_PATTERN } from '@/modules/shared/nfeAccessKey.service'

const STORAGE_KEY = 'nfe-workspace.access-key-import'
const LOOKUP_ID_MAX_LENGTH = 64

function isRestoredAccessKey(value: unknown): value is RestoredAccessKey {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  const { accessKey, lookupId } = candidate
  return (
    typeof accessKey === 'string' &&
    NFE_ACCESS_KEY_PATTERN.test(accessKey) &&
    typeof candidate['wasRegistered'] === 'boolean' &&
    (lookupId === null || (typeof lookupId === 'string' && lookupId.length <= LOOKUP_ID_MAX_LENGTH))
  )
}

/** O armazenamento da sessão sobrevive ao logout na mesma aba: a lista da pessoa anterior não passa adiante. */
export function clearAccessKeyImportSession(): void {
  try {
    globalThis.sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // Sem armazenamento da sessão não há o que limpar.
  }
}

/** Só chaves e ids: nada da nota. A tela funciona igual quando o navegador nega o armazenamento. */
export function saveAccessKeyImportSession(rows: readonly AccessKeyLookupRow[]): void {
  try {
    const entries: RestoredAccessKey[] = rows.map((row) => ({
      accessKey: row.accessKey,
      lookupId: row.lookupId,
      wasRegistered: row.wasRegistered === true,
    }))
    if (entries.length === 0) globalThis.sessionStorage.removeItem(STORAGE_KEY)
    else globalThis.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch {
    // Sem armazenamento da sessão a lista só deixa de sobreviver ao recarregar.
  }
}

export function loadAccessKeyImportSession(): readonly RestoredAccessKey[] {
  try {
    const stored = globalThis.sessionStorage.getItem(STORAGE_KEY)
    if (stored === null) return []
    const parsed: unknown = JSON.parse(stored)
    return Array.isArray(parsed) ? parsed.filter(isRestoredAccessKey) : []
  } catch {
    return []
  }
}
