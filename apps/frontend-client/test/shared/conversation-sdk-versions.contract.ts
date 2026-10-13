/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFile } from 'node:fs/promises'

import { describe, expect, test } from 'bun:test'

type Manifest = { dependencies: Readonly<Record<string, string>>; version?: string }

async function readManifest(url: URL): Promise<Manifest> {
  return JSON.parse(await readFile(url, 'utf8')) as Manifest
}

/** O portal só usa o pacote do operador; a subida existe para não deixar duas cópias do contracts no monorepo. */
describe('conversations-ui 0.10.0 / conversation-contracts 0.6.0 no portal (spec 264 T4.1)', () => {
  test('as duas dependências sobem juntas, em versão exata', async () => {
    const manifest = await readManifest(new URL('../../package.json', import.meta.url))

    expect(manifest.dependencies['@adatechnology/conversations-ui']).toBe('0.10.0')
    expect(manifest.dependencies['@adatechnology/conversation-contracts']).toBe('0.6.0')
  })

  test('o instalado é o declarado, e o UI aponta para o mesmo contracts', async () => {
    const ui = await readManifest(
      new URL('../../node_modules/@adatechnology/conversations-ui/package.json', import.meta.url),
    )

    expect(ui.version).toBe('0.10.0')
    expect(ui.dependencies['@adatechnology/conversation-contracts']).toBe('0.6.0')
  })
})
