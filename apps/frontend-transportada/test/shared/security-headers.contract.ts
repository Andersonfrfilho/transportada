/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

const SERVER_SOURCE = new URL('../../server.ts', import.meta.url)
const HEADER_BLOCK_PATTERN =
  /const SECURITY_HEADERS: Readonly<Record<string, string>> = \{\n([\s\S]*?)\n\}/u
const HEADER_ENTRY_PATTERN = /^\s*'([^']+)': (.+),$/u
const DIRECTIVE_PATTERN = /^([a-z-]+)=(.+)$/u

/**
 * O cabeçalho é lido do texto de `server.ts`, não do processo: importar o arquivo sobe um
 * `Bun.serve` e exige o `dist/` do build, e o que este contrato guarda é a decisão escrita.
 */
async function readSecurityHeaders(): Promise<ReadonlyMap<string, string>> {
  const source = await Bun.file(SERVER_SOURCE).text()
  const block = HEADER_BLOCK_PATTERN.exec(source)
  if (block?.[1] === undefined) {
    throw new Error('FRONTEND_SECURITY_HEADERS_BLOCK_NOT_FOUND')
  }

  return new Map(
    block[1]
      .split('\n')
      // A linha de comentário explica o porquê da abertura da câmera e não é cabeçalho.
      .filter((line) => line.trim() !== '' && !line.trim().startsWith('//'))
      .map((line) => {
        const entry = HEADER_ENTRY_PATTERN.exec(line)
        if (entry?.[1] === undefined || entry[2] === undefined) {
          throw new Error(`FRONTEND_SECURITY_HEADER_UNREADABLE_${line.trim()}`)
        }
        return [entry[1], entry[2]] as const
      }),
  )
}

function parsePermissionsPolicy(value: string): ReadonlyMap<string, string> {
  return new Map(
    value.split(', ').map((entry) => {
      const directive = DIRECTIVE_PATTERN.exec(entry)
      if (directive?.[1] === undefined || directive[2] === undefined) {
        throw new Error(`FRONTEND_PERMISSIONS_POLICY_UNREADABLE_${entry}`)
      }
      return [directive[1], directive[2]] as const
    }),
  )
}

describe('frontend security headers', () => {
  /**
   * As duas metades vivem no mesmo `toEqual` de propósito. `camera=()` nega a **própria** origem, e
   * `getUserMedia` falha antes de qualquer diálogo — o separador não conseguiria bipar a nota. Já
   * `geolocation` e `microphone` voltarem a `(self)` seria capacidade de dispositivo aberta de
   * carona, que é exatamente o que ninguém repara numa revisão de seis meses.
   */
  test('opens the camera to its own origin and keeps the other two devices shut', async () => {
    const headers = await readSecurityHeaders()
    const permissionsPolicy = headers.get('Permissions-Policy')
    if (permissionsPolicy === undefined) {
      throw new Error('FRONTEND_PERMISSIONS_POLICY_MISSING')
    }

    expect([...parsePermissionsPolicy(permissionsPolicy.replaceAll("'", ''))]).toEqual([
      ['camera', '(self)'],
      ['geolocation', '()'],
      ['microphone', '()'],
    ])
  })

  test('keeps the built policy and the other three headers untouched', async () => {
    const headers = await readSecurityHeaders()

    expect(headers.get('Content-Security-Policy')).toBe('contentSecurityPolicy')
    expect(headers.get('Referrer-Policy')).toBe(`'strict-origin-when-cross-origin'`)
    expect(headers.get('X-Content-Type-Options')).toBe(`'nosniff'`)
    expect(headers.get('X-Frame-Options')).toBe(`'DENY'`)
  })
})
