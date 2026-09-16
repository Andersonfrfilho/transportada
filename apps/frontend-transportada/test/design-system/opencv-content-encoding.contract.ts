/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

const SERVER_PATH = new URL('../../server.ts', import.meta.url)

/**
 * `server.ts` sobe um `Bun.serve` de verdade ao ser importado, e exige `dist/` — o mesmo motivo
 * pelo qual `security-headers.contract.ts` lê o arquivo como texto em vez de importar. A função de
 * negociação é pura (sem `Bun.*`, sem closure sobre o servidor), então este contrato extrai só o
 * corpo dela por regex e a executa de verdade com `new Function`, em vez de reimplementá-la — é
 * comportamento real sendo testado, não o texto do arquivo.
 */
async function loadNegotiationFunction(): Promise<(header: string) => readonly string[]> {
  const source = await Bun.file(SERVER_PATH).text()
  const match = /function acceptedEncodings\([\s\S]*?\n\}/u.exec(source)
  if (match === null) {
    throw new Error('FRONTEND_ACCEPTED_ENCODINGS_FUNCTION_NOT_FOUND')
  }
  const transpiler = new Bun.Transpiler({ loader: 'ts' })
  const javascript = transpiler.transformSync(`export ${match[0]}`)
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`
  const loaded = (await import(moduleUrl)) as { acceptedEncodings: (header: string) => string[] }
  return loaded.acceptedEncodings
}

describe('negociação de Accept-Encoding do servidor estático (T14 item 5)', () => {
  it('ignora um encoding com q=0, mesmo que o token apareça no header', async () => {
    const acceptedEncodings = await loadNegotiationFunction()
    expect(acceptedEncodings('br;q=0, gzip')).toEqual(['gzip'])
  })

  it('não casa gzip dentro de x-gzip por substring — é um token distinto', async () => {
    const acceptedEncodings = await loadNegotiationFunction()
    expect(acceptedEncodings('x-gzip')).toEqual(['x-gzip'])
    expect(acceptedEncodings('x-gzip').includes('gzip')).toBe(false)
  })

  it('header ausente ou vazio não aceita nenhuma codificação', async () => {
    const acceptedEncodings = await loadNegotiationFunction()
    expect(acceptedEncodings('')).toEqual([])
  })

  it('aceita br e gzip normalmente, sem qualificador', async () => {
    const acceptedEncodings = await loadNegotiationFunction()
    expect(acceptedEncodings('gzip, br')).toEqual(['gzip', 'br'])
  })

  it('emite Vary: Accept-Encoding em todo ramo, inclusive o não comprimido', async () => {
    const server = await Bun.file(SERVER_PATH).text()
    const functionBody = server
      .split('async function precompressedResponse')[1]
      ?.split('\nfunction resolveAsset')[0]
    expect(functionBody).toBeDefined()

    // O ramo comprimido seta Vary explicitamente, e o fallback não comprimido precisa fazer o
    // mesmo antes de devolver a resposta — não só nos ramos que casam encoding.
    const fallbackIndex = functionBody?.indexOf('new Response(original)') ?? -1
    expect(fallbackIndex).toBeGreaterThan(-1)
    const fallbackParagraph = functionBody?.slice(fallbackIndex) ?? ''
    expect(fallbackParagraph).toContain('Vary')
  })
})
