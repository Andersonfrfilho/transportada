import { describe, expect, it } from 'bun:test'

import { createClientMessageIdEcho } from '../../src/modules/conversation/shared/clientMessageIdEcho.service'

const message = (id: string) => ({
  attachments: [],
  createdAt: '2026-10-09T10:00:00.000Z',
  direction: 'inbound' as const,
  id,
})

function createStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  }
}

describe('clientMessageIdEcho (spec 260 T1b.2)', () => {
  it('decora só a mensagem que o POST devolveu', () => {
    const echo = createClientMessageIdEcho()
    echo.remember({ clientMessageId: 'client-1', serverMessageId: 'server-1' })
    expect(echo.decorate([message('server-1'), message('server-2')])).toEqual([
      { ...message('server-1'), clientMessageId: 'client-1' },
      message('server-2'),
    ])
  })

  it('sobrevive ao recarregar pela sessionStorage', () => {
    const storage = createStorage()
    createClientMessageIdEcho(storage).remember({ clientMessageId: 'c', serverMessageId: 's' })
    expect(createClientMessageIdEcho(storage).decorate([message('s')])[0]?.clientMessageId).toBe(
      'c',
    )
  })

  it('armazenamento que lança não derruba o envio', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    const echo = createClientMessageIdEcho(broken)
    expect(() => echo.remember({ clientMessageId: 'c', serverMessageId: 's' })).not.toThrow()
    expect(echo.decorate([message('s')])[0]?.clientMessageId).toBe('c')
  })

  it('guarda no máximo 200 entradas, descartando as mais antigas', () => {
    const echo = createClientMessageIdEcho()
    for (let index = 0; index < 201; index += 1) {
      echo.remember({ clientMessageId: `c${index}`, serverMessageId: `s${index}` })
    }
    expect(echo.decorate([message('s0')])[0]?.clientMessageId).toBeUndefined()
    expect(echo.decorate([message('s200')])[0]?.clientMessageId).toBe('c200')
  })
})
