/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const COMPONENTS = 'src/modules/cte-batch/components'

/**
 * `web.md` §9: o mesmo ícone significa a mesma ação em todo o produto. `export` desenha a seta para
 * **cima** (`M12 15V4`) e `download` para baixo — os três botões rotulados "Baixar" do lote levavam
 * a seta de subir, que é o gesto contrário ao que eles fazem.
 */
const DOWNLOAD_BUTTONS: readonly Readonly<{ file: string; label: string }>[] = [
  { file: 'CteBatchSelectionBar.component.tsx', label: 'actions.exportSelection' },
  { file: 'CteItemSelectionBar.component.tsx', label: 'cteItems.exportSelection' },
  { file: 'CteItemFilters.component.tsx', label: 'cteItems.exportFiltered' },
]

function readComponent(file: string): Promise<string> {
  return Bun.file(new URL(`${COMPONENTS}/${file}`, APPLICATION_ROOT)).text()
}

function findButtonBlock(source: string, label: string): string {
  const block = [...source.matchAll(/<Button\b[\s\S]*?<\/Button>/g)]
    .map((match) => match[0])
    .find((candidate) => candidate.includes(`t('${label}'`))
  expect(block).toBeDefined()
  return block ?? ''
}

describe('baixar do lote de CT-e mostra para onde vai, e que está indo', () => {
  test('a seta aponta para baixo nos três botões de baixar', async () => {
    for (const button of DOWNLOAD_BUTTONS) {
      const block = findButtonBlock(await readComponent(button.file), button.label)

      expect(block).toContain("'download'")
      expect(block).not.toContain('"export"')
    }
  })

  /**
   * Desabilitar os três botões sem nada girando lê como tela travada: o ZIP leva segundos e a única
   * pista era a troca do rótulo, que some da vista de quem já estava olhando o cursor.
   */
  test('enquanto o ZIP é preparado o próprio botão gira', async () => {
    for (const button of DOWNLOAD_BUTTONS) {
      const block = findButtonBlock(await readComponent(button.file), button.label)

      expect(/isExporting\s*\?\s*'spinner'\s*:\s*'download'/.test(block)).toBe(true)
    }
  })

  /** O ícone que gira é o do design system — `<svg>` cru não herda a animação nem o `currentColor`. */
  test('o giro vem do primitivo de ícone', async () => {
    const icon = await Bun.file(new URL('src/components/ui/icon.tsx', APPLICATION_ROOT)).text()

    expect(icon).toContain("new Set<IconName>(['spinner'])")
  })
})
