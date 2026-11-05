/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, mock, test } from 'bun:test'

import { createOwnPictureClient } from '../../src/modules/identity/shared/ownPictureClient.service'
import {
  compressUserPicture,
  listPictureEncodeAttempts,
  USER_PICTURE_MAX_BYTES,
} from '../../src/modules/identity/shared/userPictureCompression.service'

const API_URL = 'http://localhost:53001'
const PNG_TYPE = 'image/png'

function createClient(respond: (request: Request) => Response) {
  const fetchMock = mock((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(respond(new Request(input, init))),
  )
  const client = createOwnPictureClient({
    apiUrl: API_URL,
    fetch: fetchMock,
    getAccessToken: () => Promise.resolve('access-token'),
  })
  return { client, fetchMock }
}

describe('cliente da própria foto (spec 295)', () => {
  test('read devolve a imagem da rota /me/picture com o token do próprio motorista', async () => {
    let seen: Request | undefined
    const { client } = createClient((request) => {
      seen = request
      return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': PNG_TYPE } })
    })

    const picture = await client.read()

    expect(picture?.size).toBe(3)
    expect(seen?.url).toBe(`${API_URL}/me/picture`)
    expect(seen?.headers.get('authorization')).toBe('Bearer access-token')
  })

  test('sem foto (404) não é erro: devolve undefined e o app fica nas iniciais', async () => {
    const { client } = createClient(() => new Response(null, { status: 404 }))

    expect(await client.read()).toBeUndefined()
  })

  test('replace envia multipart com o campo file por PUT, sem id de ninguém', async () => {
    let seen: Request | undefined
    const { client } = createClient((request) => {
      seen = request
      return new Response('{}', { status: 200 })
    })
    const blob = new Blob([new Uint8Array([9, 9])], { type: PNG_TYPE })

    await client.replace(blob)

    expect(seen?.method).toBe('PUT')
    expect(seen?.url).toBe(`${API_URL}/me/picture`)
    const fields = await seen?.formData()
    expect(fields?.get('file')).toBeInstanceOf(File)
    expect([...(fields?.keys() ?? [])]).toEqual(['file'])
  })

  test('recusa da API vira erro com o código estável dela', async () => {
    const { client } = createClient(
      () =>
        new Response(JSON.stringify({ error: { code: 'USER_PICTURE_TOO_LARGE', message: 'x' } }), {
          status: 400,
        }),
    )

    const failure = client.replace(new Blob([new Uint8Array([1])]))

    // eslint-disable-next-line @typescript-eslint/await-thenable
    await expect(failure).rejects.toThrow('USER_PICTURE_TOO_LARGE')
  })

  test('remove usa DELETE e aceita 204', async () => {
    let seen: Request | undefined
    const { client } = createClient((request) => {
      seen = request
      return new Response(null, { status: 204 })
    })

    await client.remove()

    expect(seen?.method).toBe('DELETE')
  })
})

describe('compressão da foto no aparelho (cópia da do painel)', () => {
  test('arquivo que já cabe segue intacto', async () => {
    const file = new Blob([new Uint8Array(10)], { type: PNG_TYPE })
    const encode = mock(() => Promise.resolve(null))

    expect(await compressUserPicture({ encode, file })).toBe(file)
    expect(encode).not.toHaveBeenCalled()
  })

  test('arquivo grande é recodificado até caber no teto da API', async () => {
    const file = new Blob([new Uint8Array(USER_PICTURE_MAX_BYTES + 1)], { type: PNG_TYPE })
    const small = new Blob([new Uint8Array(100)], { type: 'image/webp' })

    const result = await compressUserPicture({ encode: () => Promise.resolve(small), file })

    expect(result).toBe(small)
    expect(listPictureEncodeAttempts().length).toBeGreaterThan(0)
  })
})
