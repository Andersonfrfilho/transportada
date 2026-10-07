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
 *
 * Spec 237 T4.7c: a verificação inteira tem PRAZO (a `mailauth` consulta o DNS de cada assinatura em série; um
 * DNS mudo prenderia o consumidor por tempo de timeout vezes número de assinaturas), e o `From` que a própria
 * `mailauth` alinhou sai junto: quem decide por endereço compara com o dela, nunca com um segundo leitor.
 */
import { resolveTxt } from 'node:dns/promises'

import { dkimVerify } from 'mailauth'

import {
  DKIM_ALIGNMENT_RESULT,
  resolveDkimAlignment,
  type DkimAlignmentResult,
} from '../domain/dkim-alignment.policy.js'

const DEFAULT_DNS_TIMEOUT_MS = 5_000
/** Cabe a mensagem mais lenta legítima (poucas assinaturas, DNS comum); o excesso é "sem veredito", e repete. */
export const DKIM_VERIFICATION_DEADLINE_MS = 15_000

export type DkimDnsResolver = (name: string, recordType: string) => Promise<string[][] | string[]>

/**
 * Spec 143 T010: o resolvedor de verdade, para produção — só `TXT`, que é tudo que o DKIM
 * consulta. Qualquer outro tipo de registro pedido pela `mailauth` é sinal de algo inesperado, e
 * vira falha transitória (`unverifiable`) como qualquer outro erro do resolvedor.
 */
export const resolveDkimDnsRecord: DkimDnsResolver = async (name, recordType) => {
  if (recordType !== 'TXT') throw new Error(`unsupported DNS record type: ${recordType}`)
  return resolveTxt(name)
}

/** `headerFrom`: os endereços que a `mailauth` leu nos cabeçalhos `From` — o que ela alinha ao `d=`. */
export type DkimVerification = {
  readonly alignment: DkimAlignmentResult
  readonly headerFrom: readonly string[]
}

export type VerifyDkimAlignmentPort = {
  verify(rawMessage: Buffer): Promise<DkimAlignmentResult>
}

export type VerifyDkimHeaderFromPort = {
  verifyWithHeaderFrom(rawMessage: Buffer): Promise<DkimVerification>
}

export type CreateDkimVerifierGatewayInput = {
  readonly deadlineMs?: number
  readonly dnsTimeoutMs?: number
  readonly resolveDns: DkimDnsResolver
}

const NO_VERDICT: DkimVerification = {
  alignment: DKIM_ALIGNMENT_RESULT.UNVERIFIABLE,
  headerFrom: [],
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
 * lança na hora. `deadlineMs` é o teto da verificação inteira; passado ele, o resolvedor recusa na hora, e o
 * laço da `mailauth` que seguiria em segundo plano acaba sem sair para a rede.
 */
export function createDkimVerifierGateway(
  input: CreateDkimVerifierGatewayInput,
): VerifyDkimAlignmentPort & VerifyDkimHeaderFromPort {
  const dnsTimeoutMs = input.dnsTimeoutMs ?? DEFAULT_DNS_TIMEOUT_MS
  const deadlineMs = input.deadlineMs ?? DKIM_VERIFICATION_DEADLINE_MS

  async function verifyWithHeaderFrom(rawMessage: Buffer): Promise<DkimVerification> {
    let isExpired = false
    const verification = dkimVerify(rawMessage, {
      resolver: (name, recordType) =>
        isExpired
          ? Promise.reject(new Error('dkim verification deadline exceeded'))
          : withTimeout(input.resolveDns(name, recordType), dnsTimeoutMs),
    })
    // Passado o prazo ninguém mais espera por ela: uma rejeição tardia não pode virar rejeição não tratada.
    verification.catch(() => undefined)

    let timer: ReturnType<typeof setTimeout> | undefined
    const deadline = new Promise<DkimVerification>((resolve) => {
      timer = setTimeout(() => {
        isExpired = true
        resolve(NO_VERDICT)
      }, deadlineMs)
    })
    try {
      return await Promise.race([
        verification.then((result) => ({
          alignment: resolveDkimAlignment(result.results),
          headerFrom: result.headerFrom,
        })),
        deadline,
      ])
    } finally {
      clearTimeout(timer)
    }
  }

  return {
    async verify(rawMessage) {
      return (await verifyWithHeaderFrom(rawMessage)).alignment
    },
    verifyWithHeaderFrom,
  }
}
