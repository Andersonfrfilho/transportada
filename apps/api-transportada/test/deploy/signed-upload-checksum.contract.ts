/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 (decisão do dono do projeto em 26/09/2026): o `@adatechnology/object-storage-provider`
 * 0.3.0 assina a URL de PUT com o CRC32 do corpo **vazio** (SDK 3.1091 sem
 * `requestChecksumCalculation: 'WHEN_REQUIRED'`), e o storage que confere o checksum recusa o
 * upload direto com `BadDigest` — medido no S3 local, 400 → 200 com a variável. A correção vai para
 * o pacote (0.3.1); até a API subir para ela, a variável padrão do SDK fica ligada no ambiente da
 * API, que é quem assina. Não é segredo: literal no `railway.ts`, para não depender de lembrar no
 * painel. Quando a API estiver na 0.3.1, a variável sai — e este contrato junto.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

const RAILWAY = readFileSync(new URL('../../../../.railway/railway.ts', import.meta.url), 'utf8')
const ENV_EXAMPLE = readFileSync(new URL('../../../../.env.example', import.meta.url), 'utf8')

function serviceBlock(name: string): string {
  const start = RAILWAY.indexOf(`service('${name}', {`)
  expect(start).toBeGreaterThanOrEqual(0)
  const next = RAILWAY.indexOf("service('", start + 1)
  return RAILWAY.slice(start, next < 0 ? undefined : next)
}

describe('o upload assinado não leva checksum do corpo vazio (spec 183)', () => {
  it('a API, que assina, sobe com a variável do SDK ligada nos dois ambientes', () => {
    expect(serviceBlock('api')).toContain("AWS_REQUEST_CHECKSUM_CALCULATION: 'WHEN_REQUIRED'")
  })

  it('o ambiente local também', () => {
    expect(ENV_EXAMPLE).toContain('\nAWS_REQUEST_CHECKSUM_CALCULATION=WHEN_REQUIRED\n')
  })
})
