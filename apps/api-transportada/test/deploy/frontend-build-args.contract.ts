/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Todo `ARG VITE_*` do Dockerfile de um frontend está declarado no serviço dele no
 * `.railway/railway.ts`. `VITE_*` entra no bundle no **build**, e no IaC omitir é apagar: variável
 * fora do arquivo some no próximo `railway config apply`, e o bundle nasce sem ela, em silêncio.
 * Achado na spec 183 (26/09/2026): o painel lia `VITE_OBJECT_STORAGE_URL` (a origem do bucket na
 * CSP — a foto e o anexo) sem que o serviço a declarasse.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

const ROOT = new URL('../../../../', import.meta.url)
const RAILWAY = readFileSync(new URL('.railway/railway.ts', ROOT), 'utf8')

function serviceBlock(name: string): string {
  const start = RAILWAY.indexOf(`service('${name}', {`)
  expect(start).toBeGreaterThanOrEqual(0)
  const next = RAILWAY.indexOf("service('", start + 1)
  return RAILWAY.slice(start, next < 0 ? undefined : next)
}

function buildArgs(dockerfile: string): readonly string[] {
  const source = readFileSync(new URL(dockerfile, ROOT), 'utf8')
  return [...source.matchAll(/^ARG (VITE_[A-Z0-9_]+)/gmu)].map(([, name]) => name as string)
}

describe('as variáveis de build dos frontends estão no railway.ts', () => {
  for (const [service, dockerfile] of [
    ['transportada-frontend', 'apps/frontend-transportada/Dockerfile'],
    ['client', 'apps/frontend-client/Dockerfile'],
  ] as const) {
    it(`${service}: todo ARG VITE_* do Dockerfile está declarado`, () => {
      const block = serviceBlock(service)
      const missing = buildArgs(dockerfile).filter((name) => !block.includes(`${name}:`))
      expect(missing).toEqual([])
    })
  }
})
