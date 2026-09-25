/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Revisão de design da spec 183 (T902, pedido do usuário em 25/09/2026): a página "Clientes de
 * entrega" fugia do padrão das outras no celular — título solto e gigante colado na borda, campo de
 * busca cru (21px, borda do navegador) e a tabela estourando a página em 86 px a 360. Ela passa a
 * seguir o molde de Ocorrências: cabeçalho em painel com sobretítulo, campo com a métrica
 * `--field-*` (`docs/frontend/fields.md`) e a tabela rolando no próprio quadro
 * (`docs/frontend/responsive.md`).
 */
import { readFile } from 'node:fs/promises'

import { describe, expect, test } from 'bun:test'

const read = (path: string) =>
  readFile(new URL(`../../src/modules/delivery-clients/${path}`, import.meta.url), 'utf8')

function block(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`)
  return start === -1 ? '' : css.slice(start, css.indexOf('}', start) + 1)
}

describe('a página de clientes no padrão (revisão da spec 183)', () => {
  test('cabeçalho em painel com sobretítulo, como as outras páginas', async () => {
    const [page, css] = await Promise.all([
      read('pages/DeliveryClientWorkspace.page.tsx'),
      read('styles/deliveryClients.module.css'),
    ])

    expect(page).toContain('className={styles.kicker}')
    expect(block(css, '.header')).toContain('padding: var(--space-4)')
    expect(block(css, '.header h1')).toContain('font-size: 1.75rem')
  })

  test('a página centraliza na largura da casa, como o cabeçalho da aplicação', async () => {
    const css = await read('styles/deliveryClients.module.css')

    expect(block(css, '.shell')).toContain('width: var(--layout-width)')
    expect(block(css, '.shell')).toContain('margin-inline: auto')
  })

  test('o campo de busca tem a métrica de campo', async () => {
    const css = await read('styles/deliveryClients.module.css')
    const field = block(css, '.field input')

    expect(field).toContain('min-height: var(--field-height)')
    expect(field).toContain('padding: var(--field-padding)')
    expect(field).toContain('font-size: var(--field-font-size)')
  })

  test('a tabela rola no próprio quadro, nunca a página', async () => {
    const [page, css] = await Promise.all([
      read('pages/DeliveryClientWorkspace.page.tsx'),
      read('styles/deliveryClients.module.css'),
    ])

    expect(page).toMatch(
      /<div className=\{styles\.tableScroll\}>\s*<table className=\{styles\.table\}>/u,
    )
    expect(block(css, '.tableScroll')).toContain('overflow-x: auto')
  })
})
