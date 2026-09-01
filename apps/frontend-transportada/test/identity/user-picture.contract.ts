/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

import { createCompanyUsersClient } from '../../src/modules/identity/shared/companyUsersClient.service'

const USER_ID = '018f6a45-2d9d-7e60-bb42-5b1a4c4d3e93'

type Recorded = { readonly body: unknown; readonly method: string; readonly url: string }

function createClient(respond: (request: Request) => Response) {
  const requests: Recorded[] = []

  const client = createCompanyUsersClient({
    apiUrl: 'https://api.test',
    fetch(input) {
      const request = input instanceof Request ? input : new Request(input)
      requests.push({
        body: request.body === null ? null : 'multipart',
        method: request.method,
        url: request.url,
      })
      return Promise.resolve(respond(request))
    },
    getAccessToken: () => Promise.resolve('token-de-contrato'),
    newIdempotencyKey: () => 'idempotencia-de-contrato',
  })

  return { client, requests }
}

/**
 * A foto é binária dos dois lados. Ela não passa pelo caminho JSON do cliente: um `JSON.parse` sobre
 * um PNG produziria "resposta inválida" no lugar de uma imagem.
 */
describe('foto de perfil no cliente', () => {
  test('lê os bytes da rota da pessoa', async () => {
    const { client, requests } = createClient(
      () => new Response(new Blob([new Uint8Array([1, 2])]), { status: 200 }),
    )

    const blob = await client.readPicture({ userId: USER_ID })

    expect(blob).not.toBeNull()
    expect(requests[0]?.url).toBe(`https://api.test/company-users/${USER_ID}/picture`)
    expect(requests[0]?.method).toBe('GET')
  })

  /** Sem foto é ausência, não falha: a tela desenha as iniciais e segue. */
  test('404 vira ausência, não erro', async () => {
    const { client } = createClient(() => new Response(null, { status: 404 }))

    expect(await client.readPicture({ userId: USER_ID })).toBeNull()
  })

  test('sobe como multipart, não como JSON', async () => {
    const { client, requests } = createClient(() => new Response(null, { status: 200 }))

    await client.replacePicture({ file: new Blob([new Uint8Array([1])]), userId: USER_ID })

    expect(requests[0]?.method).toBe('PUT')
    expect(requests[0]?.body).toBe('multipart')
  })

  /**
   * Apagar o que já não existe é o estado desejado, não uma falha: duas abas abertas, dois cliques,
   * e o segundo não pode pintar erro vermelho para quem conseguiu o que queria.
   */
  test('apagar foto ausente não vira erro na tela', async () => {
    const { client } = createClient(() => new Response(null, { status: 404 }))

    expect(await client.removePicture({ userId: USER_ID })).toBeUndefined()
  })

  test('falha real continua sendo falha', async () => {
    const { client } = createClient(() => new Response(null, { status: 500 }))

    /** `rejects` sem espera passa calado quando a promessa resolve: o erro é capturado à mão. */
    const failure = await client
      .replacePicture({ file: new Blob(), userId: USER_ID })
      .then(() => null)
      .catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(Error)
  })
})

/**
 * A miniatura do arquivo escolhido é o "antes" do par que o painel de revisão promete. Ela ficava
 * amarrada ao `previewUrl` do recorte: quem escolhia uma imagem e não pedia remoção de fundo — ou
 * estava num navegador em que ela não roda — via "confira antes de salvar" sem nada para conferir.
 */
describe('a imagem escolhida aparece antes de ser enviada', () => {
  const source = readFileSync(
    'src/modules/identity/components/CompanyUserPictureField.component.tsx',
    'utf8',
  )

  test('o original é desenhado a partir do arquivo escolhido, não do recorte', () => {
    expect(source).toContain('src={chosenUrl}')
  })

  test('a miniatura do original não depende de o recorte ter rodado', () => {
    const comparison = source.slice(source.indexOf('styles.pictureComparison'))
    const originalAt = comparison.indexOf('src={chosenUrl}')
    const cutoutGuardAt = comparison.indexOf('cutout.previewUrl === null')

    expect(originalAt).toBeGreaterThan(-1)
    expect(originalAt).toBeLessThan(cutoutGuardAt)
  })

  /** URL de objeto sem revogação prende um blob na aba por toda a sessão, a cada arquivo tentado. */
  test('a URL do arquivo escolhido é revogada', () => {
    expect(source).toContain('URL.revokeObjectURL(created)')
  })
})
