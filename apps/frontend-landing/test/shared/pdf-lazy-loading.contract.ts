/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

async function readSource(path: string): Promise<string> {
  return Bun.file(new URL(path, APPLICATION_ROOT)).text()
}

/**
 * A asserção é sobre o código, não sobre a prosa: o comentário do carregador **explica** que `blob:`
 * e CDN seriam errados, e varrer o arquivo inteiro faria o próprio texto reprovar o teste.
 */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/\/\/[^\n]*/gu, '')
}

const LOADER_PATH = 'src/modules/application/shared/pdfjsLoader.service.ts'

describe('o pdf.js entra sob demanda e na nossa origem', () => {
  /**
   * `import()` é o que mantém os 423 KiB do pdf.js fora do primeiro carregamento. Um import estático
   * o traria para o bundle de entrada da página **pública** de cadastro, que é o pior lugar
   * possível: quem preenche digitando — a maioria — pagaria por ele sem anexar nada.
   */
  test('o carregador importa o pdf.js dinamicamente, nunca no topo do arquivo', async () => {
    const source = await readSource(LOADER_PATH)

    expect(source).toContain("import('pdfjs-dist')")
    expect(source).not.toMatch(/^import .*from 'pdfjs-dist'/mu)
  })

  /**
   * O worker sai empacotado por `?url`, emitido pelo Vite na nossa origem. `blob:` e CDN são os dois
   * caminhos que obrigariam a afrouxar `worker-src 'self'` — e a CSP publicada não os tem.
   */
  test('o worker é referenciado por ?url, sem blob: e sem CDN', async () => {
    const source = await readSource(LOADER_PATH)

    const code = withoutComments(source)

    expect(code).toContain('pdfjs-dist/build/pdf.worker.min.mjs?url')
    expect(code).not.toContain('blob:')
    expect(code.toLowerCase()).not.toContain('cdn')
  })

  /**
   * `import()` tira o pdf.js do primeiro render, não da conta de dados: sem esta exclusão o service
   * worker o baixa no precache de **todo** visitante. Medido: o precache saltou de 289 KiB para
   * 718 KiB quando a leitura foi ligada, e voltou a 294 KiB com a exclusão.
   */
  test('o pdf.js fica fora do precache do service worker', async () => {
    const config = await readSource('vite.config.ts')

    expect(config).toContain('globIgnores')
    expect(config).toContain('**/pdf-*.js')
    expect(config).toContain('**/pdf.worker.min-*.{js,mjs}')
  })
})
