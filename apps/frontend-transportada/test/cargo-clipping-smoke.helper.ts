/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 (revisão das Fases 1–2, `web.md` §10): "sem rolagem horizontal" não basta — conteúdo CLIPADO por um
 * ancestral com `overflow` também passa em `scrollWidth <= clientWidth` e esconde coluna. A medida aqui é a
 * geometria real: nenhum elemento visível de `main` termina além do ancestral que o recorta ou rola.
 */
import { expect, type Page } from '@playwright/test'

const SLACK_PX = 1

/** Cada item é um elemento cortado ou empurrado para fora do contêiner que o recorta, no layout real. */
export async function readClippedElements(page: Page): Promise<readonly string[]> {
  return page.evaluate((slack) => {
    const main = document.querySelector('main')
    if (main === null) return ['sem <main>']
    const problems: string[] = []
    const describe = (element: Element): string => {
      const text = (element.textContent ?? '').trim().replace(/\s+/gu, ' ').slice(0, 32)
      return `<${element.tagName.toLowerCase()}> "${text}"`
    }
    const clippingAncestors = (element: Element): Element[] => {
      const found: Element[] = []
      for (let node = element.parentElement; node !== null; node = node.parentElement) {
        if (getComputedStyle(node).overflowX !== 'visible') found.push(node)
        if (node === main) break
      }
      if (!found.includes(main)) found.push(main)
      return found
    }
    /** O cabeçalho só-leitor (`thead` de 1px com `clip-path`) leva filhos largos de propósito: não se vê. */
    const isVisuallyHidden = (element: Element): boolean => {
      for (
        let node: Element | null = element;
        node !== null && node !== main;
        node = node.parentElement
      ) {
        const box = node.getBoundingClientRect()
        const style = getComputedStyle(node)
        if (
          style.visibility === 'hidden' ||
          ((box.width <= 1 || box.height <= 1) && style.overflowX !== 'visible')
        )
          return true
      }
      return false
    }
    for (const element of main.querySelectorAll('*')) {
      const box = element.getBoundingClientRect()
      if (box.width <= 1 || box.height <= 1) continue
      if (isVisuallyHidden(element)) continue
      for (const ancestor of clippingAncestors(element)) {
        const limit = ancestor.getBoundingClientRect().right
        if (box.right > limit + slack) {
          problems.push(
            `${describe(element)} termina em ${Math.round(box.right)} (limite ${Math.round(limit)})`,
          )
          break
        }
      }
    }
    const overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth
    if (overflow > 0) problems.push(`a página rola de lado em ${overflow}px`)
    return problems
  }, SLACK_PX)
}

export async function expectNoClipping(page: Page): Promise<void> {
  expect(await readClippedElements(page)).toEqual([])
}

/** Todo `<td>` com texto de uma tabela empilhada tem de estar visível e ter o rótulo da coluna. */
export async function readUnlabeledCells(page: Page): Promise<readonly string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('main td')]
      .filter((cell) => {
        const box = cell.getBoundingClientRect()
        const isStacked = getComputedStyle(cell.closest('tr') ?? cell).display === 'grid'
        const hasContent =
          (cell.textContent ?? '').trim() !== '' || cell.querySelector('input,button')
        return isStacked && box.width > 0 && Boolean(hasContent) && !cell.hasAttribute('data-label')
      })
      .map((cell) => (cell.textContent ?? '').trim().slice(0, 32)),
  )
}

/** `SPEC_237_PRINT_ONLY=a,b` regrava só esses prints; sem ela, todos (a conferência de corte roda sempre). */
export function isPrintWanted(name: string): boolean {
  const only = process.env.SPEC_237_PRINT_ONLY
  if (only === undefined || only === '') return true
  return only.split(',').includes(name)
}

/** Cada nota do detalhe mostra a situação, com o rótulo da coluna, dentro da tela — não só "sem rolagem". */
export async function expectEveryNoteStateVisible(page: Page): Promise<void> {
  const rows = page.locator('main tr[data-document-id]')
  const states = page.locator('main tr[data-document-id] td[data-label="Situação"]')
  expect(await rows.count()).toBeGreaterThan(0)
  expect(await states.count()).toBe(await rows.count())
  for (const state of await states.all()) {
    await expect(state).toBeVisible()
    expect(((await state.textContent()) ?? '').trim()).not.toBe('')
  }
}
