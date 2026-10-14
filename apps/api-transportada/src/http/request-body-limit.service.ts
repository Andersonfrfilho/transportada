/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 265 RF1/RF2: o teto do corpo é **por rota**. Toda rota segue com o de sempre (1 MiB na aplicação,
 * 2 MiB no servidor); só o `POST` do comprovante do motorista passa de 1 MiB, porque o original da
 * câmera sobe inteiro quando a redução no aparelho estourou o orçamento.
 */
import {
  API_ME_CURRENT_TRIP_PATH,
  APPLICATION_MAX_REQUEST_BODY_SIZE_BYTES,
  HTTP_ERROR,
  PROOF_ORIGINAL_MAX_REQUEST_BODY_SIZE_BYTES,
  SERVER_MAX_REQUEST_BODY_SIZE_BYTES,
} from '../shared/api.constant.js'
import { ApiError } from '../shared/api.error.js'

export type RequestBodyLimits = {
  /** O teto conferido contra o `content-length` antes da rota. */
  readonly applicationBytes: number
  /** O teto da leitura em fluxo quando o cliente não declara o tamanho (corpo em pedaços). */
  readonly serverBytes: number
}

const DEFAULT_REQUEST_BODY_LIMITS: RequestBodyLimits = {
  applicationBytes: APPLICATION_MAX_REQUEST_BODY_SIZE_BYTES,
  serverBytes: SERVER_MAX_REQUEST_BODY_SIZE_BYTES,
}

const PROOF_UPLOAD_REQUEST_BODY_LIMITS: RequestBodyLimits = {
  applicationBytes: PROOF_ORIGINAL_MAX_REQUEST_BODY_SIZE_BYTES,
  serverBytes: PROOF_ORIGINAL_MAX_REQUEST_BODY_SIZE_BYTES,
}

/**
 * O teto do `Bun.serve`: o maior de todos os tetos por rota. Ele só impede que o servidor recuse sozinho
 * (sem CORS, sem correlation-id) o corpo que a rota do comprovante aceita; quem cobra o teto de cada
 * rota é `resolveRequestBodyLimits`.
 */
export const SERVER_REQUEST_BODY_CEILING_BYTES = Math.max(
  SERVER_MAX_REQUEST_BODY_SIZE_BYTES,
  PROOF_UPLOAD_REQUEST_BODY_LIMITS.serverBytes,
)

/**
 * ⚠️ Mais estreito que o roteador de propósito: o caminho exato, um segmento de nota, e só `POST`. Um
 * caminho que o roteador nem encontra, ou um verbo que ele recusa, não ganha corpo maior por parecer
 * com a rota do comprovante.
 */
const PROOF_UPLOAD_PATH = new RegExp(
  `^${API_ME_CURRENT_TRIP_PATH}/documents/[^/]{1,64}/proof$`,
  'u',
)

export function resolveRequestBodyLimits(input: {
  readonly method: string
  readonly pathname: string
}): RequestBodyLimits {
  return input.method === 'POST' && PROOF_UPLOAD_PATH.test(input.pathname)
    ? PROOF_UPLOAD_REQUEST_BODY_LIMITS
    : DEFAULT_REQUEST_BODY_LIMITS
}

const METHODS_WITHOUT_BODY: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * Lê o corpo em fluxo e para no primeiro pedaço que passa do teto, com o 413 da API — sem `content-length`
 * o servidor não sabe o tamanho antes de ler, e `maxRequestBodySize` do `Bun.serve` agora é o maior dos
 * tetos. Requisição que não carrega corpo (`GET`, `HEAD`, `OPTIONS`) volta como veio.
 *
 * ⚠️ **Preguiçoso de propósito**: `request.body` só é tocado na primeira leitura do corpo novo. Rota que
 * recusa antes de ler (permissão, chave de idempotência inválida, webhook que responde 204 sem olhar)
 * deixa a requisição de origem intacta — nem o `body` é acessado, nada é puxado da conexão. Um
 * `pipeThrough`, ou até um `const { body } = request`, desfaria essa garantia em toda rota.
 */
export function limitRequestBody(request: Request, maxBytes: number): Request {
  if (METHODS_WITHOUT_BODY.has(request.method)) return request

  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  let received = 0
  const limited = new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        const source = (reader ??= request.body?.getReader() as typeof reader)
        if (source === undefined) {
          controller.close()
          return
        }
        const next = await source.read()
        if (next.done) {
          controller.close()
          return
        }
        received += next.value.byteLength
        if (received > maxBytes) {
          const refusal = new ApiError(HTTP_ERROR.payloadTooLarge)
          await source.cancel(refusal).catch(() => undefined)
          controller.error(refusal)
          return
        }
        controller.enqueue(next.value)
      },
      async cancel(reason) {
        await (reader === undefined ? request.body?.cancel(reason) : reader.cancel(reason))
      },
    },
    { highWaterMark: 0 },
  )

  return new Request(request.url, {
    body: limited,
    duplex: 'half',
    headers: request.headers,
    method: request.method,
    signal: request.signal,
  } as RequestInit)
}
