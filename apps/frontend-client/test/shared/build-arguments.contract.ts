/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

/**
 * `VITE_*` é **inlinado no build**: variável sem `ARG` no `Dockerfile` não entra no bundle, e o
 * `readTrustedUrl` lança na primeira tela — com o serviço já criado e o domínio já apontado.
 *
 * O par divergiu de verdade: o `Dockerfile` declarava `VITE_APP_URL` e o código lia
 * `VITE_CLIENT_APP_URL`. Nada falhava — `ARG` não declarado não é erro de Docker, o build passa, e
 * esta app não tem teste de tela que exercite a configuração. O defeito só apareceria no primeiro
 * deploy.
 */

const ENVIRONMENT_CONFIG_PATH = new URL(
  '../../src/modules/shared/environment.config.ts',
  import.meta.url,
).pathname
const DOCKERFILE_PATH = new URL('../../Dockerfile', import.meta.url).pathname

const VITE_REFERENCE_PATTERN = /import\.meta\.env\.(VITE_[A-Z0-9_]+)/gu
const BUILD_ARGUMENT_PATTERN = /^ARG (VITE_[A-Z0-9_]+)$/gmu

async function readViteNames(path: string, pattern: RegExp): Promise<ReadonlySet<string>> {
  const source = await Bun.file(path).text()
  return new Set([...source.matchAll(pattern)].map(([, name]) => name ?? ''))
}

describe('argumentos de build do portal do contratante', () => {
  test('toda VITE_ que o código lê tem ARG no Dockerfile', async () => {
    const [read, declared] = await Promise.all([
      readViteNames(ENVIRONMENT_CONFIG_PATH, VITE_REFERENCE_PATTERN),
      readViteNames(DOCKERFILE_PATH, BUILD_ARGUMENT_PATTERN),
    ])

    expect(read.size).toBeGreaterThan(0)
    expect([...read].filter((name) => !declared.has(name))).toEqual([])
  })
})
