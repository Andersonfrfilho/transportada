/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { COPY_FEEDBACK_MILLISECONDS } from '@/modules/shared/clipboard.constant'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

/**
 * O e-mail do cabeçalho é o dado que mais se copia para colar em chamado e em convite, e copiá-lo
 * à mão de um texto de 0,72rem no celular é onde o erro de caractere nasce.
 */
describe('copiar o e-mail do cabeçalho', () => {
  test('o botão existe, é só de ícone e tem rótulo acessível', async () => {
    const shell = await readApplicationFile('src/main.tsx')

    expect(shell).toContain('application-user-copy-email')
    expect(shell).toContain('aria-label="Copiar e-mail"')
    expect(shell).toContain("name={hasCopiedEmail ? 'check' : 'copy'}")
  })

  /** Sem subtítulo não há e-mail: um botão que copiaria vazio é pior que botão nenhum. */
  test('o botão só aparece quando há e-mail', async () => {
    const shell = await readApplicationFile('src/main.tsx')

    expect(shell).toContain('userProfile.subtitle !== undefined')
  })

  /**
   * O valor estava duplicado em `VehicleSelectionBar` e `FreightRegionSelectionBar`; o cabeçalho
   * seria o terceiro (§16 do code-standart: repetiu duas vezes, extrai).
   */
  test('o tempo do feedback é constante compartilhada, não número solto', async () => {
    expect(COPY_FEEDBACK_MILLISECONDS).toBe(2_000)

    for (const path of [
      'src/modules/fleet/components/VehicleSelectionBar.component.tsx',
      'src/modules/fleet/components/FreightRegionSelectionBar.component.tsx',
      'src/main.tsx',
    ]) {
      const source = await readApplicationFile(path)
      expect(source).toContain("from '@/modules/shared/clipboard.constant'")
      expect(source).not.toContain('const COPY_FEEDBACK_MILLISECONDS =')
    }
  })
})
