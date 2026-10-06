/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 RF4/RF11/RF1c2: as edições da lista de exceções do tipo. O `PUT` substitui as duas listas,
 * então toda edição devolve o conjunto inteiro; campo não editado segue como está (nulo herda do tipo).
 */
import {
  OCCURRENCE_ITEMS_MODE,
  type OccurrenceAttachmentContractorOverride,
  type OccurrenceAttachmentMode,
  type OccurrenceAttachmentOverrides,
  type OccurrenceAttachmentRecipientOverride,
  type OccurrenceItemsMode,
} from './occurrence.constant'

export type OccurrenceExceptionKey =
  | Readonly<{ contractorId: string; kind: 'contractor' }>
  | Readonly<{ kind: 'recipient'; taxId: string }>

export type OccurrenceExceptionEdit = Readonly<{
  attachmentMode?: OccurrenceAttachmentMode
  itemsMinimumCount?: null | number
  itemsMode?: null | OccurrenceItemsMode
  noteMode?: null | OccurrenceAttachmentMode
  photoMinimumCount?: null | number
  signatureMode?: null | OccurrenceAttachmentMode
}>

export type OccurrenceExceptionEntry =
  | OccurrenceAttachmentContractorOverride
  | OccurrenceAttachmentRecipientOverride

type AnyOverride = OccurrenceExceptionEntry

export function toExceptionKey(entry: OccurrenceExceptionEntry): OccurrenceExceptionKey {
  return 'contractorId' in entry
    ? { contractorId: entry.contractorId, kind: 'contractor' }
    : { kind: 'recipient', taxId: entry.taxId }
}

/** Mínimo de produtos só existe com Produtos obrigatório declarado na própria exceção (a API recusa o resto com 400). */
export function canEditExceptionItemsMinimum(entry: Readonly<{ itemsMode?: null | string }>) {
  return entry.itemsMode === OCCURRENCE_ITEMS_MODE.required
}

function applyEdit<TEntry extends AnyOverride>(
  entry: TEntry,
  edit: OccurrenceExceptionEdit,
): TEntry {
  const nextItemsMode = edit.itemsMode === undefined ? entry.itemsMode : edit.itemsMode
  const isLeavingRequired =
    edit.itemsMode !== undefined && edit.itemsMode !== OCCURRENCE_ITEMS_MODE.required
  const { itemsMinimumCount, ...rest } = edit
  const minimum =
    itemsMinimumCount !== undefined && nextItemsMode === OCCURRENCE_ITEMS_MODE.required
      ? { itemsMinimumCount }
      : {}
  return { ...entry, ...rest, ...(isLeavingRequired ? { itemsMinimumCount: null } : minimum) }
}

function isKeyOf(key: OccurrenceExceptionKey, entry: AnyOverride): boolean {
  if (key.kind === 'contractor') {
    return 'contractorId' in entry && entry.contractorId === key.contractorId
  }
  return 'taxId' in entry && entry.taxId === key.taxId
}

export function editException(
  overrides: OccurrenceAttachmentOverrides,
  key: OccurrenceExceptionKey,
  edit: OccurrenceExceptionEdit,
): OccurrenceAttachmentOverrides {
  return {
    contractorOverrides: overrides.contractorOverrides.map((entry) =>
      isKeyOf(key, entry) ? applyEdit(entry, edit) : entry,
    ),
    recipientOverrides: overrides.recipientOverrides.map((entry) =>
      isKeyOf(key, entry) ? applyEdit(entry, edit) : entry,
    ),
  }
}

export function removeException(
  overrides: OccurrenceAttachmentOverrides,
  key: OccurrenceExceptionKey,
): OccurrenceAttachmentOverrides {
  return {
    contractorOverrides: overrides.contractorOverrides.filter((entry) => !isKeyOf(key, entry)),
    recipientOverrides: overrides.recipientOverrides.filter((entry) => !isKeyOf(key, entry)),
  }
}

const INHERITING_FIELDS = {
  itemsMinimumCount: null,
  itemsMode: null,
  noteMode: null,
  photoMinimumCount: null,
  signatureMode: null,
} as const

/**
 * A foto da exceção é declarada (coluna `NOT NULL`); os outros campos nascem herdando do tipo. O nulo é
 * **explícito**: a API, para tolerar o painel antigo, grava a observação seguindo a foto quando a chave falta.
 */
export function addException(
  overrides: OccurrenceAttachmentOverrides,
  input: Readonly<{ attachmentMode: OccurrenceAttachmentMode; key: OccurrenceExceptionKey }>,
): OccurrenceAttachmentOverrides {
  if (input.key.kind === 'contractor') {
    return {
      ...overrides,
      contractorOverrides: [
        ...overrides.contractorOverrides,
        {
          attachmentMode: input.attachmentMode,
          contractorId: input.key.contractorId,
          ...INHERITING_FIELDS,
        },
      ],
    }
  }
  return {
    ...overrides,
    recipientOverrides: [
      ...overrides.recipientOverrides,
      { attachmentMode: input.attachmentMode, taxId: input.key.taxId, ...INHERITING_FIELDS },
    ],
  }
}

export function countExceptions(overrides: OccurrenceAttachmentOverrides | undefined): number {
  if (overrides === undefined) return 0
  return overrides.contractorOverrides.length + overrides.recipientOverrides.length
}
