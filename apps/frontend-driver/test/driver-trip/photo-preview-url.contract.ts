/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'bun:test'

const HOOK = readFileSync(
  join(import.meta.dir, '../../src/modules/driver-trip/hooks/usePhotoPreviewUrl.hook.ts'),
  'utf8',
)

/**
 * Teste local (15/10): a miniatura do canhoto aparecia quebrada (largura 0) até recarregar. A URL
 * `blob:` era criada ao iniciar o estado e liberada pelo cleanup que o `StrictMode` roda ao
 * desmontar e remontar, deixando a tela com uma URL já liberada. Sem DOM de verdade aqui, o contrato
 * trava a forma que evita isso: a URL nasce dentro do efeito, junto do cleanup que a libera.
 */
describe('URL da miniatura da foto sobrevive ao StrictMode (teste local de 15/10)', () => {
  it('não cria a URL ao iniciar o estado', () => {
    const initializers = HOOK.match(/useState<[^>]*>\(([^)]*)\)/gu) ?? []
    expect(initializers.length).toBeGreaterThan(0)
    for (const initializer of initializers) expect(initializer).not.toContain('createObjectURL')
  })

  it('cria a URL dentro do efeito e a libera no cleanup do mesmo efeito', () => {
    const effect = HOOK.slice(HOOK.indexOf('useEffect('))
    expect(effect).toContain('URL.createObjectURL(blob)')
    expect(effect).toContain('return () => URL.revokeObjectURL(url)')
  })

  it('refaz a URL quando a foto troca, e não a libera fora do efeito', () => {
    expect(HOOK).toContain('[blob]')
    expect(HOOK.match(/revokeObjectURL/gu)).toHaveLength(1)
  })

  it('mantém a interface que as telas já usam', () => {
    expect(HOOK).toContain('export function usePhotoPreviewUrl(initialBlob?: Blob): PhotoPreview')
    expect(HOOK).toContain('showPhoto: setBlob')
  })
})
