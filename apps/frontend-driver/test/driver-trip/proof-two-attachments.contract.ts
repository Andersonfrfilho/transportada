/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

function readComponentSource(): string {
  return readFileSync(
    new URL(
      '../../src/modules/driver-trip/components/DriverStopCard.component.tsx',
      import.meta.url,
    ),
    'utf8',
  )
}

function proofSection(): string {
  const card = readComponentSource()
  const start = card.indexOf('export function DeliveryProofSection(')
  const end = card.indexOf('type OccurrenceFormProps')
  expect(start).toBeGreaterThan(-1)
  return card.slice(start, end)
}

/**
 * Defeito relatado pelo usuário (26/09): "anexei uma foto e uma assinatura; em vez de ter duas
 * miniaturas, uma entrou no lugar da outra." Causa: `DeliveryProofSection` guardava a foto e a
 * assinatura no MESMO estado — uma `usePhotoPreviewUrl()`, um `attachedKind`, uma `attachedKey`,
 * um `isImageOpen` — então anexar o segundo kind revogava e substituía a miniatura do primeiro
 * (spec 213).
 */
describe('a foto do canhoto e a assinatura têm miniatura, chave e lightbox próprios (spec 213)', () => {
  it('duas instâncias de usePhotoPreviewUrl — uma por kind, nunca uma compartilhada', () => {
    const section = proofSection()
    expect(section.match(/usePhotoPreviewUrl\(\)/gu)).toHaveLength(2)
    expect(section).toContain('const previewByKind = { photo: photoPreview, signature: signaturePreview }')
  })

  it('attach() escreve na miniatura do próprio kind, nunca numa "photoPreview" única', () => {
    const section = proofSection()
    expect(section).toContain('previewByKind[kind].showPhoto(file)')
  })

  it('attachedKey é por kind — não existe mais um attachedKind global', () => {
    const card = readComponentSource()
    expect(proofSection()).toContain('useState<{ photo?: string; signature?: string }>({})')
    expect(card).not.toContain('attachedKind')
  })

  it('handleRemove recebe o kind e apaga só aquele anexo', () => {
    const section = proofSection()
    expect(section).toContain('function handleRemove(kind: \'photo\' | \'signature\'): void')
    expect(section).toContain('const key = attachedKey[kind]')
    expect(section).not.toContain('setAttached({ photo: false, signature: false })')
  })

  it('a miniatura de cada kind é renderizada por uma função própria, chamada duas vezes', () => {
    const section = proofSection()
    expect(section).toContain("renderAttachedThumbnail('photo')")
    expect(section).toContain("renderAttachedThumbnail('signature')")
  })

  it('o lightbox abre pelo kind clicado (openImageKind), nunca por um estado global', () => {
    const section = proofSection()
    expect(section).toContain(
      "openImageKind !== undefined && previewByKind[openImageKind].previewUrl !== undefined",
    )
  })
})
