/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Onde o rascunho da montagem mora: chave, envelope, prazo e limpeza. `sessionStorage`, e não
 * `localStorage`, para o rascunho morrer com a aba — e ainda assim sair da conta apaga tudo, porque
 * a aba sobrevive ao logout.
 */
import { clearFormDraft, type FormDraftStorage } from '@/modules/shared/formDraft.service'

export const TRIP_ASSEMBLY_DRAFT_VERSION = 1
/** Um turno: rascunho da manhã não pode reaparecer na montagem do dia seguinte. */
export const TRIP_ASSEMBLY_DRAFT_TTL_MS = 8 * 60 * 60 * 1000
const TRIP_ASSEMBLY_DRAFT_KEY_PREFIX = 'transportada.trip.assembly-draft:'

export const TRIP_ASSEMBLY_DRAFT_MODE = {
  automatic: 'automatic',
  manual: 'manual',
} as const
export type TripAssemblyDraftMode =
  (typeof TRIP_ASSEMBLY_DRAFT_MODE)[keyof typeof TRIP_ASSEMBLY_DRAFT_MODE]

export type TripAssemblyDraftScope = Readonly<{ companyId: string; userId: string }>

/** O recorte do `Storage` que a limpeza por prefixo precisa: listar as chaves. */
export type TripAssemblyDraftStorage = FormDraftStorage &
  Readonly<{ key: (index: number) => null | string; length: number }>

type StorageInput = Readonly<{
  scope: TripAssemblyDraftScope
  storage: TripAssemblyDraftStorage | null
}>
type ModeInput = StorageInput & Readonly<{ mode: TripAssemblyDraftMode }>

export function resolveTripAssemblyDraftStorage(): TripAssemblyDraftStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage
  } catch {
    return null
  }
}

export function buildTripAssemblyDraftKey(
  input: Readonly<{ mode: TripAssemblyDraftMode; scope: TripAssemblyDraftScope }>,
): string {
  return `${TRIP_ASSEMBLY_DRAFT_KEY_PREFIX}${input.mode}:${input.scope.companyId}:${input.scope.userId}`
}

export function clearTripAssemblyDraft(input: ModeInput): void {
  clearFormDraft({ storage: input.storage, storageKey: buildTripAssemblyDraftKey(input) })
}

/**
 * ⚠️ `false` quando a gravação não aconteceu — armazenamento bloqueado ou cheio. A tela avisa: o
 * operador que sai para medir achando que o rascunho ficou guardado perde a montagem calado.
 */
export function writeTripAssemblyDraft(
  input: ModeInput & Readonly<{ draft: unknown; now: number }>,
): boolean {
  if (input.storage === null) return false
  const envelope = {
    companyId: input.scope.companyId,
    draft: input.draft,
    savedAt: input.now,
    userId: input.scope.userId,
    v: TRIP_ASSEMBLY_DRAFT_VERSION,
  }
  try {
    input.storage.setItem(buildTripAssemblyDraftKey(input), JSON.stringify(envelope))
    return true
  } catch {
    return false
  }
}

/**
 * O rascunho é entrada não confiável: sobrevive a versão nova do formato e a quem edita o
 * armazenamento à mão. Envelope que não bate com a versão, a empresa, o usuário ou o prazo é
 * apagado — ele nunca mais seria lido, e ficaria ocupando a aba.
 */
export function readTripAssemblyDraft<TDraft>(
  input: ModeInput & Readonly<{ isDraft: (value: unknown) => value is TDraft; now: number }>,
): TDraft | undefined {
  if (input.storage === null) return undefined
  try {
    const raw = input.storage.getItem(buildTripAssemblyDraftKey(input))
    if (raw === null) return undefined
    const draft = readCurrentDraft({
      envelope: JSON.parse(raw) as unknown,
      now: input.now,
      scope: input.scope,
    })
    if (input.isDraft(draft)) return draft
  } catch {
    clearTripAssemblyDraft(input)
    return undefined
  }
  clearTripAssemblyDraft(input)
  return undefined
}

function readCurrentDraft(
  input: Readonly<{ envelope: unknown; now: number; scope: TripAssemblyDraftScope }>,
): unknown {
  const { envelope } = input
  if (typeof envelope !== 'object' || envelope === null || Array.isArray(envelope)) return undefined
  const record = envelope as Record<string, unknown>
  if (record.v !== TRIP_ASSEMBLY_DRAFT_VERSION) return undefined
  if (record.companyId !== input.scope.companyId || record.userId !== input.scope.userId) {
    return undefined
  }
  if (typeof record.savedAt !== 'number') return undefined
  if (input.now - record.savedAt > TRIP_ASSEMBLY_DRAFT_TTL_MS) return undefined
  return record.draft
}

function listDraftKeys(storage: TripAssemblyDraftStorage): readonly string[] {
  const keys: string[] = []
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index)
    if (key?.startsWith(TRIP_ASSEMBLY_DRAFT_KEY_PREFIX) === true) keys.push(key)
  }
  return keys
}

function removeKeys(
  input: Readonly<{ keep: ReadonlySet<string>; storage: TripAssemblyDraftStorage | null }>,
): void {
  if (input.storage === null) return
  try {
    for (const key of listDraftKeys(input.storage)) {
      if (!input.keep.has(key)) input.storage.removeItem(key)
    }
  } catch {
    return
  }
}

/** Sair da conta: a aba continua aberta, e o próximo usuário não herda a montagem de ninguém. */
export function clearAllTripAssemblyDrafts(storage: TripAssemblyDraftStorage | null): void {
  removeKeys({ keep: new Set(), storage })
}

/** A volta apaga o rascunho de outra empresa ou usuário que ficou na aba: ele nunca seria lido. */
export function clearOtherScopeTripAssemblyDrafts(input: StorageInput): void {
  const keep = new Set(
    Object.values(TRIP_ASSEMBLY_DRAFT_MODE).map((mode) =>
      buildTripAssemblyDraftKey({ mode, scope: input.scope }),
    ),
  )
  removeKeys({ keep, storage: input.storage })
}
