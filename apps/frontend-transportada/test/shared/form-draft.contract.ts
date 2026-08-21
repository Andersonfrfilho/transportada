/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  clearFormDraft,
  readFormDraft,
  writeFormDraft,
  type FormDraftStorage,
} from '../../src/modules/shared/formDraft.service'

const FIELDS = ['licenseCategory', 'name', 'taxId'] as const
const STORAGE_KEY = 'transportada.test.draft'

function createStorage(initial: Record<string, string> = {}): FormDraftStorage & {
  readonly items: Record<string, string>
} {
  const items: Record<string, string> = { ...initial }
  return {
    getItem: (key) => items[key] ?? null,
    items,
    removeItem: (key) => {
      delete items[key]
    },
    setItem: (key, value) => {
      items[key] = value
    },
  }
}

describe('form draft contract', () => {
  // Fechar a página no meio do cadastro não pode custar o que já foi digitado
  test('brings the typed fields back on the next visit', () => {
    const storage = createStorage()

    writeFormDraft({
      draft: { licenseCategory: 'E', name: 'Jose da Silva', taxId: '' },
      fields: FIELDS,
      storage,
      storageKey: STORAGE_KEY,
    })

    expect(readFormDraft({ fields: FIELDS, storage, storageKey: STORAGE_KEY })).toEqual({
      licenseCategory: 'E',
      name: 'Jose da Silva',
    })
  })

  // Formulário intocado não deixa rastro: rascunho vazio seria dado pessoal guardado à toa
  test('keeps nothing when every field is empty', () => {
    const storage = createStorage({ [STORAGE_KEY]: '{"name":"Jose"}' })

    writeFormDraft({
      draft: { licenseCategory: '', name: '', taxId: '' },
      fields: FIELDS,
      storage,
      storageKey: STORAGE_KEY,
    })

    expect(storage.items[STORAGE_KEY]).toBeUndefined()
  })

  test('drops the draft when the operator clears the form', () => {
    const storage = createStorage({ [STORAGE_KEY]: '{"name":"Jose"}' })

    clearFormDraft({ storage, storageKey: STORAGE_KEY })

    expect(readFormDraft({ fields: FIELDS, storage, storageKey: STORAGE_KEY })).toEqual({})
  })

  // O armazenamento é entrada não confiável: campo desconhecido e valor que não é texto ficam fora
  test('ignores unknown fields, broken json and a storage that is not there', () => {
    const foreign = createStorage({ [STORAGE_KEY]: '{"name":"Jose","secret":1,"axleCount":3}' })
    const broken = createStorage({ [STORAGE_KEY]: 'not json' })

    expect(readFormDraft({ fields: FIELDS, storage: foreign, storageKey: STORAGE_KEY })).toEqual({
      name: 'Jose',
    })
    expect(readFormDraft({ fields: FIELDS, storage: broken, storageKey: STORAGE_KEY })).toEqual({})
    expect(readFormDraft({ fields: FIELDS, storage: null, storageKey: STORAGE_KEY })).toEqual({})
  })
})
