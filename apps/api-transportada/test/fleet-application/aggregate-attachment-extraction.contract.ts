/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { extractAttachmentFields } from '../../src/fleet/infrastructure/aggregate-attachment-extraction.gateway.js'
import { buildSyntheticCcmeiPdf } from '../fixtures/ccmei-pdf.fixture.js'

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0])

describe('extração do anexo no servidor', () => {
  test('lê o CCMEI do arquivo que chegou ao bucket', async () => {
    const extracted = await extractAttachmentFields({
      bytes: buildSyntheticCcmeiPdf(),
      type: 'ccmei',
    })

    expect(extracted?.cnpj).toBe('30213061000106')
    expect(extracted?.openedAt).toBe('2018-04-17')
  })

  /**
   * O tipo declarado é do cliente **anônimo**: ele diz "ccmei" e manda outra coisa. Ler com o mapa
   * errado produziria campos inventados, e campo inventado vira divergência falsa contra a ficha.
   */
  test('documento que não é CCMEI não vira campo nenhum', async () => {
    const extracted = await extractAttachmentFields({
      bytes: buildSyntheticCcmeiPdf({ title: 'Contrato de Prestação de Serviços' }),
      type: 'ccmei',
    })

    expect(extracted).toBeNull()
  })

  /** Imagem não tem camada de texto: é ausência, e ausência nunca vira divergência. */
  test('imagem devolve ausência, não erro', async () => {
    expect(await extractAttachmentFields({ bytes: PNG_BYTES, type: 'ccmei' })).toBeNull()
  })

  /** PDF corrompido não pode derrubar o upload: o arquivo já está salvo quando isto roda. */
  test('bytes ilegíveis devolvem ausência, não exceção', async () => {
    expect(
      await extractAttachmentFields({ bytes: new Uint8Array([1, 2, 3, 4]), type: 'ccmei' }),
    ).toBeNull()
  })

  /** CNH e CRLV ainda não têm mapa por geometria no servidor — e fingir que têm seria pior. */
  test('tipo sem mapa no servidor devolve ausência', async () => {
    expect(
      await extractAttachmentFields({ bytes: buildSyntheticCcmeiPdf(), type: 'other' }),
    ).toBeNull()
  })
})
