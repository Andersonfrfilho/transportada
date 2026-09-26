/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 183 RF21 (decisão de 26/09/2026): o aviso por e-mail leva o link
 * `<portal>/?aba=ocorrencias`, e o portal abre direto em Ocorrências. O login preserva a busca
 * (`resolvePostAuthenticationPath`). Valor desconhecido cai na aba de sempre, Entregas.
 */
import { readFile } from 'node:fs/promises'

import { describe, expect, test } from 'bun:test'

import { initialPortalTab } from '../../src/modules/shared/portalTab.service'

describe('a aba inicial do portal pelo link (spec 183 RF21)', () => {
  test('?aba=ocorrencias abre Ocorrências', () => {
    expect(initialPortalTab('?aba=ocorrencias')).toBe('occurrences')
  })

  test('?aba=cobrancas abre Cobranças', () => {
    expect(initialPortalTab('?aba=cobrancas')).toBe('charges')
  })

  for (const search of ['', '?aba=qualquer', '?outra=1']) {
    test(`${JSON.stringify(search)} abre Entregas`, () => {
      expect(initialPortalTab(search)).toBe('deliveries')
    })
  }

  test('a app começa pela aba do link', async () => {
    const main = await readFile(new URL('../../src/main.tsx', import.meta.url), 'utf8')
    expect(main).toContain('useState<Tab>(() => initialPortalTab(window.location.search))')
  })
})
