/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

/**
 * Medido em 06/09/2026, no `vite dev`: como `import()` dinâmico o sufixo `?url` é ignorado e o que
 * volta é o módulo do worker (`{ WorkerMessageHandler }`), sem `default`. O `workerSrc` recebia
 * `undefined` e o pdf.js lançava `Invalid workerSrc type` **antes de olhar o arquivo** — todo upload
 * de documento falhava em desenvolvimento, com qualquer PDF, sob a mensagem "confira se é um PDF".
 *
 * Nenhum teste pegava: os smokes rodam contra o bundle construído, onde a forma dinâmica funciona.
 * Por isso o contrato é sobre a **forma do import**, que é onde a diferença mora.
 */
describe('pdf.js worker', () => {
  test('resolves the worker URL through a static ?url import', async () => {
    const source = await readApplicationFile(
      'src/modules/document-intake/shared/pdfjsLoader.service.ts',
    )

    expect(source).toMatch(
      /^import pdfWorkerUrl from 'pdfjs-dist\/build\/pdf\.worker\.min\.mjs\?url'$/mu,
    )
    /** A forma dinâmica é a que quebra em dev — ela não pode voltar por refatoração de import. */
    expect(source).not.toMatch(/import\([^)]*pdf\.worker[^)]*\)/u)
  })

  test('keeps the heavy pdf.js module lazy', async () => {
    const source = await readApplicationFile(
      'src/modules/document-intake/shared/pdfjsLoader.service.ts',
    )

    /** São 300 kB: quem cadastra veículo digitando não paga por eles no carregamento da tela. */
    expect(source).toContain("await import('pdfjs-dist')")
    expect(source).not.toMatch(/^import .* from 'pdfjs-dist'$/mu)
  })
})
