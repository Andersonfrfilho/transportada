/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A aba de Notas desmonta quando o operador troca de aba, e os filtros dela vivem em `useState`.
 * O que os traz de volta é `useTableViewPreferences` — e eram dois caminhos por onde ele perdia:
 * o debounce pendente que morria no desmonte, e a resposta antiga do react-query que sobrescrevia
 * o filtro recém-editado na volta.
 */
import { describe, expect, test } from 'bun:test'

import { useTableViewPreferences } from '@/modules/nfe-workspace/hooks/useTableViewPreferences.hook'
import { parseTableViewPreferences } from '@/modules/nfe-workspace/shared/viewPreferences.serialization'
import type {
  ViewPreferencesClient,
  ViewPreferencesRecord,
} from '@/modules/nfe-workspace/shared/viewPreferencesClient.service'
import type { TableViewPreferences } from '@/modules/nfe-workspace/hooks/useNfeDocumentTable.hook'

import { renderHook, settle } from './renderHook.helper'

const VIEW_KEY = 'nfe-documents'
const QUERY_KEY = 'view-preferences'
const STALE_NUMBER = '100'
const EDITED_NUMBER = '883663'

function record(preferences: Record<string, unknown>): ViewPreferencesRecord {
  return { preferences, updatedAt: '2026-09-23T00:00:00.000Z' }
}

function stubClient(saved: ViewPreferencesRecord[]): ViewPreferencesClient {
  return {
    get: () => Promise.resolve(record({ filters: { numberFrom: STALE_NUMBER } })),
    save: ({ preferences }) => {
      const stored = record(preferences)
      saved.push(stored)
      return Promise.resolve(stored)
    },
  }
}

function edited(current: TableViewPreferences): TableViewPreferences {
  return { ...current, filters: { ...current.filters, numberFrom: EDITED_NUMBER } }
}

describe('preferências de visão sobrevivem à troca de aba', () => {
  test('a edição entra no cache da consulta antes do debounce vencer', async () => {
    const saved: ViewPreferencesRecord[] = []
    const hook = await renderHook(() =>
      useTableViewPreferences({ client: stubClient(saved), viewKey: VIEW_KEY }),
    )
    await settle()

    hook.result().onChange(edited(hook.result().initial))
    await settle()

    const cached = hook.queryClient.getQueryData<ViewPreferencesRecord>([QUERY_KEY, VIEW_KEY])
    expect(parseTableViewPreferences(cached?.preferences).filters.numberFrom).toBe(EDITED_NUMBER)

    hook.unmount()
  })

  test('desmontar com o debounce pendente ainda grava no servidor', async () => {
    const saved: ViewPreferencesRecord[] = []
    const hook = await renderHook(() =>
      useTableViewPreferences({ client: stubClient(saved), viewKey: VIEW_KEY }),
    )
    await settle()

    hook.result().onChange(edited(hook.result().initial))
    hook.unmount()
    await settle()

    expect(saved).toHaveLength(1)
    expect(parseTableViewPreferences(saved[0]?.preferences).filters.numberFrom).toBe(EDITED_NUMBER)
  })
})
