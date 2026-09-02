/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  ATTACHMENT_MAX_BYTES,
  createAttachmentClient,
} from '@/modules/application/shared/attachmentClient.service'

const COMPANY_ID = crypto.randomUUID()
const DRAFT_ID = crypto.randomUUID()

function buildFile(size = 8): Blob {
  return new Blob([new Uint8Array(size)], { type: 'application/pdf' })
}

function buildClient(respond: (request: Request) => Promise<Response> | Response) {
  const requests: Request[] = []
  const client = createAttachmentClient({
    apiBaseUrl: 'https://api.test',
    fetch: async (url, init) => {
      const request = new Request(url, init)
      requests.push(request)
      return respond(request)
    },
  })

  return { client, requests }
}

describe('envio do anexo pela landing', () => {
  test('manda multipart para a rota pública e devolve o rascunho', async () => {
    const { client, requests } = buildClient(
      () => new Response(JSON.stringify({ data: { draftId: DRAFT_ID, type: 'ccmei' } })),
    )

    const result = await client.upload({
      companyId: COMPANY_ID,
      file: buildFile(),
      fileName: 'ccmei.pdf',
      turnstileToken: 'token',
      type: 'ccmei',
    })

    expect(result).toEqual({ draftId: DRAFT_ID, status: 'uploaded' })
    expect(requests[0]?.url).toBe('https://api.test/public/aggregate-application-attachments')
    expect(requests[0]?.method).toBe('POST')

    const form = await (requests[0] as Request).formData()
    expect(form.get('companyId')).toBe(COMPANY_ID)
    expect(form.get('type')).toBe('ccmei')
    expect(form.get('turnstileToken')).toBe('token')
    expect(form.get('file')).toBeInstanceOf(Blob)
  })

  /**
   * O teto é conferido **antes** da rede: subir 10 MB para receber 413 no fim é fazer quem se
   * candidata pagar a espera por um "não" que já se sabia.
   */
  test('arquivo acima do teto nem sai do aparelho', async () => {
    const { client, requests } = buildClient(() => new Response('', { status: 201 }))

    const result = await client.upload({
      companyId: COMPANY_ID,
      file: buildFile(ATTACHMENT_MAX_BYTES + 1),
      fileName: 'grande.pdf',
      type: 'ccmei',
    })

    expect(result).toEqual({ reason: 'too_large', status: 'failed' })
    expect(requests).toEqual([])
  })

  /**
   * Resposta sem `draftId` é falha, não sucesso silencioso: sem o identificador o submit não teria o
   * que amarrar, e a candidatura chegaria ao operador anunciando um anexo que não existe.
   */
  test('resposta sem identificador de rascunho é falha', async () => {
    const { client } = buildClient(() => new Response(JSON.stringify({ data: {} })))

    const result = await client.upload({
      companyId: COMPANY_ID,
      file: buildFile(),
      fileName: 'ccmei.pdf',
      type: 'ccmei',
    })

    expect(result).toEqual({ reason: 'rejected', status: 'failed' })
  })

  test('recusa da API e rede fora do ar não estouram exceção', async () => {
    const { client: rejecting } = buildClient(() => new Response('', { status: 429 }))
    const { client: offline } = buildClient(() => {
      throw new Error('rede fora')
    })

    const upload = { companyId: COMPANY_ID, fileName: 'ccmei.pdf', type: 'ccmei' } as const

    expect(await rejecting.upload({ ...upload, file: buildFile() })).toEqual({
      reason: 'rejected',
      status: 'failed',
    })
    expect(await offline.upload({ ...upload, file: buildFile() })).toEqual({
      reason: 'unreachable',
      status: 'failed',
    })
  })

  /** Nada do que a API leu volta para o cliente anônimo — e nem há o que voltar (ADR-0053). */
  test('a resposta não traz campo extraído nenhum', async () => {
    const { client } = buildClient(
      () =>
        new Response(
          JSON.stringify({ data: { draftId: DRAFT_ID, legalName: 'ACME MEI', type: 'ccmei' } }),
        ),
    )

    const result = await client.upload({
      companyId: COMPANY_ID,
      file: buildFile(),
      fileName: 'ccmei.pdf',
      type: 'ccmei',
    })

    expect(Object.keys(result).sort()).toEqual(['draftId', 'status'])
  })
})
