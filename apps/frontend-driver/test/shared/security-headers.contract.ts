/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

const SERVER_SOURCE = new URL('../../server.ts', import.meta.url)
const HEADER_BLOCK_PATTERN =
  /const SECURITY_HEADERS: Readonly<Record<string, string>> = \{\n([\s\S]*?)\n\}/u
/** O valor é literal entre aspas ou, na CSP, o identificador lido do `dist`. */
const HEADER_ENTRY_PATTERN = /^\s*'([^']+)': '?([^']+?)'?,$/u

/**
 * O cabeçalho é lido do texto de `server.ts`, não do processo: importar o arquivo sobe um
 * `Bun.serve` e exige o `dist/` do build, e o que este contrato guarda é a decisão escrita.
 */
async function readSecurityHeaders(): Promise<ReadonlyMap<string, string>> {
  const source = await Bun.file(SERVER_SOURCE).text()
  const block = HEADER_BLOCK_PATTERN.exec(source)
  if (block?.[1] === undefined) {
    throw new Error('DRIVER_SECURITY_HEADERS_BLOCK_NOT_FOUND')
  }

  return new Map(
    block[1]
      .split('\n')
      .filter((line) => line.trim() !== '' && !line.trim().startsWith('//'))
      .map((line) => {
        const entry = HEADER_ENTRY_PATTERN.exec(line)
        if (entry?.[1] === undefined || entry[2] === undefined) {
          throw new Error(`DRIVER_SECURITY_HEADER_UNREADABLE_${line.trim()}`)
        }
        return [entry[1], entry[2]] as const
      }),
  )
}

describe('os cabeçalhos da app do motorista (ADR-0075 §4)', () => {
  /**
   * O motorista fotografa o canhoto e a entrega carrega onde aconteceu: câmera e posição abertas
   * para a própria origem, o valor do painel e não o do portal. O microfone fica fechado.
   */
  test('abre câmera e posição para a própria origem e fecha o microfone', async () => {
    const headers = await readSecurityHeaders()

    expect(headers.get('Permissions-Policy')).toBe(
      'camera=(self), geolocation=(self), microphone=()',
    )
  })

  /**
   * Primeira app a emitir HSTS. Sem `includeSubDomains` e sem `preload`: a zona é da instalação, e
   * prender subdomínio alheio ou a lista dos navegadores é decisão que não se desfaz num deploy.
   */
  test('emite HSTS de um ano, sem subdomínios e sem preload', async () => {
    const headers = await readSecurityHeaders()

    expect(headers.get('Strict-Transport-Security')).toBe('max-age=31536000')
  })

  test('mantém os três cabeçalhos do portal', async () => {
    const headers = await readSecurityHeaders()

    expect(headers.get('X-Frame-Options')).toBe('DENY')
    expect(headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
  })

  /** Publicar sem CSP é a falha que não quebra nada visível: o servidor não sobe sem ela. */
  test('recusa subir sem a CSP emitida no build', async () => {
    const server = await Bun.file(SERVER_SOURCE).text()

    expect(server).toContain('FRONTEND_MISSING_CONTENT_SECURITY_POLICY')
    expect(server).toContain('FRONTEND_EMPTY_CONTENT_SECURITY_POLICY')
    expect(server).toContain("'Content-Security-Policy': contentSecurityPolicy")
  })

  /**
   * `sw.js` em cache imutável prenderia o motorista numa versão velha para sempre. Só `/assets/`,
   * que leva hash no nome, é imutável; o `sw.js` fica na raiz do `dist` e sai com `no-cache` — o
   * `dist.contract.test.ts` confere que ele nasce ali.
   */
  test('só /assets/ é imutável, e o resto revalida', async () => {
    const server = await Bun.file(SERVER_SOURCE).text()

    expect(server).toContain("const IMMUTABLE_ASSET_PREFIX = '/assets/'")
    expect(server).toContain("const REVALIDATE_CACHE_CONTROL = 'no-cache'")
    expect(server).toMatch(
      /return pathname\.startsWith\(IMMUTABLE_ASSET_PREFIX\)\s*\?\s*IMMUTABLE_CACHE_CONTROL\s*:\s*REVALIDATE_CACHE_CONTROL/u,
    )
  })
})
