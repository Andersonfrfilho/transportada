/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { MxRecord } from 'node:dns'
import { resolveMx as defaultResolveMx } from 'node:dns/promises'

/**
 * Spec 143 T007: confere se `resposta.<domínio>` já tem o MX do Resend publicado — item da lista
 * de verificação do RF12. `resolveDns` é injetado para o contrato rodar sem sair da máquina, no
 * mesmo molde do `resolveDns` de `dkim-verifier.gateway.ts` (worker).
 *
 * `absent` e `unreachable` são estados diferentes de propósito: `ENOTFOUND`/`ENODATA` é "este
 * domínio não tem MX", e qualquer outra falha (timeout, `SERVFAIL`, rede fora do ar) é "não deu
 * para perguntar" — confundir os dois faria a tela dizer "falta configurar o MX" quando o problema
 * era só um DNS lento.
 */
export type MxLookupResolver = (hostname: string) => Promise<readonly MxRecord[]>

export type MxLookupResult =
  | { readonly hosts: readonly string[]; readonly kind: 'found' }
  | { readonly kind: 'absent' }
  | { readonly kind: 'unreachable' }

export type MxLookupGateway = {
  lookupMx(input: { readonly domain: string }): Promise<MxLookupResult>
}

export type CreateMxLookupGatewayInput = {
  readonly resolveDns?: MxLookupResolver
  readonly timeoutMilliseconds?: number
}

const DEFAULT_TIMEOUT_MILLISECONDS = 5_000
const ABSENT_DNS_ERROR_CODES = new Set(['ENODATA', 'ENOTFOUND'])

export function createMxLookupGateway(input: CreateMxLookupGatewayInput = {}): MxLookupGateway {
  const resolveDns = input.resolveDns ?? defaultResolveMx
  const timeoutMilliseconds = input.timeoutMilliseconds ?? DEFAULT_TIMEOUT_MILLISECONDS

  return {
    async lookupMx({ domain }) {
      try {
        const records = await withTimeout(resolveDns(domain), timeoutMilliseconds)
        if (records.length === 0) return { kind: 'absent' }
        return { hosts: records.map((record) => record.exchange), kind: 'found' }
      } catch (error) {
        return isAbsentDnsError(error) ? { kind: 'absent' } : { kind: 'unreachable' }
      }
    },
  }
}

function isAbsentDnsError(error: unknown): boolean {
  const code = (error as { code?: unknown } | undefined)?.code
  return typeof code === 'string' && ABSENT_DNS_ERROR_CODES.has(code)
}

function withTimeout<TResult>(
  promise: Promise<TResult>,
  timeoutMilliseconds: number,
): Promise<TResult> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('mx lookup timeout')), timeoutMilliseconds)

    promise
      .then((value) => {
        clearTimeout(timer)
        resolve(value)
      })
      .catch((error: unknown) => {
        clearTimeout(timer)
        reject(error)
      })
  })
}
