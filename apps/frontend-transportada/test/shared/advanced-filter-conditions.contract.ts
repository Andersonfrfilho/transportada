/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  clearAdvancedFilterConditions,
  countAdvancedFilterConditions,
  removeAdvancedFilterCondition,
} from '../../src/modules/shared/advancedFilterConditions.service'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

async function readSource(path: string): Promise<string> {
  return Bun.file(new URL(path, APPLICATION_ROOT)).text()
}

type LocaleTree = Readonly<Record<string, unknown>>

function readKey(tree: LocaleTree, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (node, key) =>
        typeof node === 'object' && node !== null ? (node as LocaleTree)[key] : undefined,
      tree,
    )
}

/** Cada construtor de filtro avançado, com o hook que guarda o modelo e o locale do módulo. */
const BUILDERS = [
  {
    builder: 'src/modules/nfe-workspace/components/AdvancedFilterBuilder.component.tsx',
    hook: 'src/modules/nfe-workspace/hooks/useNfeDocumentTable.hook.ts',
    localeKey: 'documents.builder.clearConditions',
    locales: ['src/modules/nfe-workspace/locales/nfeWorkspace.locale.json'],
  },
  {
    builder: 'src/modules/cte-batch/components/CteBatchAdvancedFilterBuilder.component.tsx',
    hook: 'src/modules/cte-batch/hooks/useCteBatchTable.hook.ts',
    localeKey: 'advanced.clearConditions',
    locales: [
      'src/modules/cte-batch/locales/cteBatch.locale.json',
      'src/modules/cte-batch/locales/cteBatch.en.locale.json',
    ],
  },
  {
    builder: 'src/modules/mdfe-manifest/components/MdfeManifestAdvancedFilterBuilder.component.tsx',
    hook: 'src/modules/mdfe-manifest/hooks/useMdfeManifestTable.hook.ts',
    localeKey: 'advanced.clearConditions',
    locales: [
      'src/modules/mdfe-manifest/locales/mdfeManifest.locale.json',
      'src/modules/mdfe-manifest/locales/mdfeManifest.en.locale.json',
    ],
  },
  {
    builder: 'src/modules/nfse-invoice/components/NfseInvoiceAdvancedFilterBuilder.component.tsx',
    hook: 'src/modules/nfse-invoice/hooks/useNfseAdvancedFilter.hook.ts',
    localeKey: 'advanced.clearConditions',
    locales: [
      'src/modules/nfse-invoice/locales/nfseInvoice.locale.json',
      'src/modules/nfse-invoice/locales/nfseInvoice.en.locale.json',
    ],
  },
  {
    builder: 'src/modules/billing/components/BillingEligibleFilters.component.tsx',
    hook: 'src/modules/billing/components/BillingEligibleFilters.component.tsx',
    localeKey: 'eligible.advanced.clearConditions',
    locales: [
      'src/modules/billing/locales/billingWorkspace.locale.json',
      'src/modules/billing/locales/billingWorkspace.en.locale.json',
    ],
  },
] as const

function buildModel() {
  return {
    connector: 'and' as const,
    groups: [
      {
        conditions: [{ id: 'c1', value: 'x' }],
        connector: 'or' as const,
        id: 'g1',
      },
      {
        conditions: [
          { id: 'c2', value: 'y' },
          { id: 'c3', value: 'z' },
        ],
        connector: 'and' as const,
        id: 'g2',
      },
    ],
  }
}

describe('filtro avançado — remover a última condição e limpar todas', () => {
  test('remover a última condição de um grupo é permitido e deixa o grupo vazio', () => {
    const single = {
      connector: 'and' as const,
      groups: [{ conditions: [{ id: 'c1', value: 'x' }], connector: 'or' as const, id: 'g1' }],
    }
    const result = removeAdvancedFilterCondition({
      conditionId: 'c1',
      groupId: 'g1',
      model: single,
    })
    expect(result.groups).toHaveLength(1)
    expect(result.groups[0]?.conditions).toEqual([])
    expect(countAdvancedFilterConditions(result)).toBe(0)
  })

  test('remover mexe só no grupo e na condição indicados', () => {
    const result = removeAdvancedFilterCondition({
      conditionId: 'c2',
      groupId: 'g2',
      model: buildModel(),
    })
    expect(result.groups[0]?.conditions.map((condition) => condition.id)).toEqual(['c1'])
    expect(result.groups[1]?.conditions.map((condition) => condition.id)).toEqual(['c3'])
    expect(countAdvancedFilterConditions(result)).toBe(2)
  })

  test('limpar apaga todas as condições de uma vez e sobra um grupo vazio', () => {
    const result = clearAdvancedFilterConditions(buildModel())
    expect(countAdvancedFilterConditions(result)).toBe(0)
    expect(result.groups).toHaveLength(1)
    expect(result.groups[0]?.id).toBe('g1')
    expect(result.connector).toBe('and')
  })

  test('contagem soma as condições de todos os grupos', () => {
    expect(countAdvancedFilterConditions(buildModel())).toBe(3)
    expect(countAdvancedFilterConditions({ groups: [] })).toBe(0)
  })

  test('o botão de limpar do design system fica desabilitado sem condição e tem rótulo', async () => {
    const source = await readSource('src/components/ui/advanced-filter-clear-button.tsx')
    expect(source).toContain("from '@/components/ui/button'")
    expect(source).toContain('disabled={conditionCount === 0}')
    expect(source).toContain('aria-label={label}')
    expect(source).toContain('type="button"')
  })

  for (const entry of BUILDERS) {
    describe(entry.builder, () => {
      test('usa o botão comum de limpar condições', async () => {
        const source = await readSource(entry.builder)
        expect(source).toContain('AdvancedFilterClearButton')
        expect(source).toContain(entry.localeKey.split('.').slice(-2).join('.'))
      })

      test('o botão de remover não trava na última condição', async () => {
        const source = await readSource(entry.builder)
        expect(source).not.toContain('conditions.length <= 1')
        expect(source).not.toContain('conditions.length > 1')
        expect(source).not.toContain('isRemovable')
      })

      test('remover e limpar passam pelo primitivo comum', async () => {
        const source = await readSource(entry.hook)
        expect(source).toContain('removeAdvancedFilterCondition')
        expect(source).toContain('clearAdvancedFilterConditions')
        expect(source).not.toContain('group.conditions.length === 1')
      })

      test('o texto está no locale, acentuado', async () => {
        for (const path of entry.locales) {
          const tree = (await Bun.file(new URL(path, APPLICATION_ROOT)).json()) as LocaleTree
          const expected = path.includes('.en.') ? 'Clear conditions' : 'Limpar condições'
          expect(readKey(tree, entry.localeKey)).toBe(expected)
        }
      })
    })
  }

  test('no nfe-workspace, limpar também zera o filtro avançado salvo na preferência', async () => {
    const source = await readSource('src/modules/nfe-workspace/hooks/useNfeDocumentTable.hook.ts')
    const clearBody = source.slice(source.indexOf('function clearConditions'))
    const body = clearBody.slice(0, clearBody.indexOf('\n  }\n'))
    expect(body).toContain('clearAdvancedFilterConditions')
    expect(body).toContain('setSavedAdvancedFilter(null)')
  })
})
