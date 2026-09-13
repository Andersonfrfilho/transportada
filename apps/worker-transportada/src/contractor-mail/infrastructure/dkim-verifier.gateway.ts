/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ADR-0063 §3, spec 143 T004: invólucro fino sobre a `mailauth` para verificar DKIM no MIME bruto
 * do e-mail recebido. Sem rede aqui — quem resolve DNS é o `resolveDns` injetado, e é por isso que
 * o teste da política roda sem sair da máquina.
 *
 * A `mailauth` já resolve o alinhamento relaxado (domínio organizacional) e classifica o veredito
 * em `status.result`/`status.aligned` — este gateway só chama `dkimVerify` e repassa o resultado
 * para `resolveDkimAlignment`, que é onde a decisão de negócio mora.
 */
import { dkimVerify } from 'mailauth'

import { resolveDkimAlignment, type DkimAlignmentResult } from '../domain/dkim-alignment.policy.js'

const DEFAULT_DNS_TIMEOUT_MS = 5_000

export type DkimDnsResolver = (name: string, recordType: string) => Promise<string[][] | string[]>

export type VerifyDkimAlignmentPort = {
  verify(rawMessage: Buffer): Promise<DkimAlignmentResult>
}

export type CreateDkimVerifierGatewayInput = {
  readonly resolveDns: DkimDnsResolver
  readonly dnsTimeoutMs?: number
}

function withTimeout<TResult>(promise: Promise<TResult>, timeoutMs: number): Promise<TResult> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('dns resolver timeout')), timeoutMs)

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

/**
 * `dnsTimeoutMs` existe porque a `mailauth` não impõe prazo ao resolvedor: um DNS lento travaria a
 * verificação por tanto tempo quanto o resolvedor demorar. Estourar o prazo vira rejeição, e a
 * `mailauth` trata isso como falha transitória (`temperror`) — o mesmo caminho de um resolvedor que
 * lança na hora.
 */
export function createDkimVerifierGateway(
  input: CreateDkimVerifierGatewayInput,
): VerifyDkimAlignmentPort {
  const dnsTimeoutMs = input.dnsTimeoutMs ?? DEFAULT_DNS_TIMEOUT_MS

  return {
    async verify(rawMessage) {
      const result = await dkimVerify(rawMessage, {
        resolver: (name, recordType) =>
          withTimeout(input.resolveDns(name, recordType), dnsTimeoutMs),
      })

      return resolveDkimAlignment(result.results)
    },
  }
}
