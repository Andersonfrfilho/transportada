/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A foto do balão da conversa saía pela borda direita (SDK conversations-ui 0.14.0): o anexo é um `<figure>` com margem
 * lateral do navegador e sem `min-width: 0`. A correção mora no SDK (0.14.1); o painel e o app do motorista não
 * carregam CSS local para isso. O contrato trava o piso da versão e a ausência do remendo local.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

const PACKAGES = {
  driver: new URL('../../../frontend-driver/package.json', import.meta.url),
  panel: new URL('../../package.json', import.meta.url),
} as const
const STYLESHEETS = {
  driver: new URL('../../../frontend-driver/src/styles/index.css', import.meta.url),
  panel: new URL('../../src/styles/index.css', import.meta.url),
} as const

describe('foto no balão da conversa fica dentro do balão (correção no SDK)', () => {
  for (const app of Object.keys(PACKAGES) as (keyof typeof PACKAGES)[]) {
    test(`${app}: usa o SDK com a correção e não remenda o balão no CSS local`, () => {
      const manifest = JSON.parse(readFileSync(PACKAGES[app], 'utf8')) as {
        dependencies: Record<string, string>
      }
      const [major = 0, minor = 0, patch = 0] = (
        manifest.dependencies['@adatechnology/conversations-ui'] ?? ''
      )
        .split('.')
        .map(Number)
      expect(major > 0 || minor > 14 || (minor === 14 && patch >= 1)).toBe(true)
      expect(readFileSync(STYLESHEETS[app], 'utf8')).not.toContain(
        '.cv-p-bubble > .cv-p-attachment',
      )
    })
  }
})
