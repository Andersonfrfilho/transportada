import { describe, expect, it } from 'bun:test'

import { dropEmptyEmojiLines } from '../src/occurrence-conversation/infrastructure/contractor-reply-client-template.support.js'

describe('boleto ao cliente no WhatsApp: linha de emoji sem valor', () => {
  it('remove a linha que ficou só com o emoji e mantém as demais', () => {
    const body = '📞 (16) 99385-7105\n✉️ \n\n_Obrigado!_ 🤝'
    expect(dropEmptyEmojiLines(body)).toBe('📞 (16) 99385-7105\n\n_Obrigado!_ 🤝')
  })

  it('mantém a linha com conteúdo', () => {
    const body = '✉️ contato@x.com.br\n🏢 *Empresa*'
    expect(dropEmptyEmojiLines(body)).toBe(body)
  })
})
