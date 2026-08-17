/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type { NfseCredentialAccess } from '../src/nfse-issuance/infrastructure/nfse-fiscal-gateway.js'
import { createNfseFiscalGateway } from '../src/nfse-issuance/infrastructure/nfse-fiscal-gateway.js'

const PRODUCTION_BASE_URL = 'https://producao.exemplo/api/v2'

/**
 * A `CallbackUrl` não chega ao gateway pronta: ela é montada aqui, da base configurada mais o token
 * opaco que vem **do envelope selado**. Quem abre o envelope é o gateway, uma vez por operação —
 * fazer o consumidor montar a URL obrigaria o `callbackToken` a atravessar o leitor de execução e a
 * porta, dois lugares a mais para um segredo aparecer.
 */
const CALLBACK_BASE_URL = 'https://api.exemplo'
const CALLBACK_TOKEN = 'token-opaco-sintetico-nao-vazar'
const CALLBACK_URL = `${CALLBACK_BASE_URL}/public/nfse-callbacks/${CALLBACK_TOKEN}`

/** 20:30 em São Paulo do dia 17 — a mesma instante é 17/08 lá e 17/08 em UTC. */
const CLOCK = (): Date => new Date('2026-08-17T23:30:00.000Z')

const PAYLOAD = {
  cnaeCode: '4930202',
  description: 'Transporte rodoviário de carga',
  issAmount: '10.00',
  issExigibility: '1',
  issRate: '2.00',
  issWithheld: false,
  municipalityIbgeCode: '3543402',
  municipalTaxationCode: '',
  nbsCode: '',
  serviceAmount: '500.00',
  serviceListItem: '16.02',
  taker: { legalName: 'Tomador Exemplo', taxId: '11222333000181' },
} as const

function createCredential(
  fiscalEnvironment: NfseCredentialAccess['fiscalEnvironment'],
): NfseCredentialAccess {
  return {
    companyId: '00000000-0000-4000-8000-000000000001',
    credentialId: '00000000-0000-4000-8000-000000000002',
    envelope: { sealed: true },
    fiscalEnvironment,
    municipalRegistration: '12345678',
  }
}

function rejectingFetch(): never {
  throw new Error('The gateway contract must not reach the network')
}

function captureIssuedRps(clock: () => Date = CLOCK) {
  const rps: Readonly<Record<string, unknown>>[] = []
  const gateway = createNfseFiscalGateway({
    clock,
    config: {
      baseUrl: PRODUCTION_BASE_URL,
      callbackBaseUrl: CALLBACK_BASE_URL,
      timeoutMilliseconds: 15_000,
    },
    createClient: () => ({
      cancel: async () => ({ status: 'accepted' as const }),
      fetchDocument: async () => ({ status: 'error' as const }),
      fetchStatus: async () => ({ status: 'pending' as const }),
      issue: async (input) => {
        rps.push(input.rps)
        return { providerDocumentId: 'nota-1', status: 'accepted' as const }
      },
    }),
    fetch: rejectingFetch,
    secretService: {
      decrypt: async () => ({ apiToken: 'token-sintetico', callbackToken: CALLBACK_TOKEN }),
    },
  })

  return { gateway, rps }
}

describe('NFS-e fiscal gateway configuration contract', () => {
  // O ambiente fiscal da credencial continua existindo e continua escolhendo a credencial; ele não
  // escolhe mais o endereço, porque a Nota RP tem um só (ADR-0035).
  test('uses the single configured base URL whatever the credential declares', async () => {
    const baseUrls: string[] = []
    const gateway = createNfseFiscalGateway({
      config: {
        baseUrl: PRODUCTION_BASE_URL,
        callbackBaseUrl: CALLBACK_BASE_URL,
        timeoutMilliseconds: 15_000,
      },
      createClient: ({ config }) => {
        baseUrls.push(config.baseUrl)
        return {
          cancel: async () => ({ status: 'accepted' as const }),
          fetchDocument: async () => ({ status: 'error' as const }),
          fetchStatus: async () => ({ status: 'pending' as const }),
          issue: async () => ({ providerDocumentId: 'nota-1', status: 'accepted' as const }),
        }
      },
      fetch: rejectingFetch,
      secretService: {
        decrypt: async () => ({ apiToken: 'token-sintetico', callbackToken: CALLBACK_TOKEN }),
      },
    })

    const issued = { payload: PAYLOAD }
    await gateway.issue({ ...issued, credential: createCredential('homologation') })
    await gateway.issue({ ...issued, credential: createCredential('production') })

    expect(baseUrls).toEqual([PRODUCTION_BASE_URL, PRODUCTION_BASE_URL])
  })

  /**
   * O corpo inteiro do `/emitir`, contra a coleção oficial da v2 — não uma chave por vez. O
   * vocabulário era inferido, e a inferência errou em oito campos: `Cnae`, `TomadorRazaoSocial`,
   * `TomadorCnpjCpf` e `ValorIss` não existem no contrato; `IssRetido` é booleano, não `"1"`/`"2"`;
   * `ItemListaServico` é o código sem a formatação `00.00`; e `DataEmissao` é obrigatório e nunca
   * era mandado. `toEqual` no objeto todo é de propósito: campo inventado reprova junto com campo
   * ausente, que é o que uma asserção por chave deixava passar.
   */
  test('sends the RPS body the official v2 collection documents', async () => {
    const sent = captureIssuedRps()

    await sent.gateway.issue({
      credential: createCredential('production'),
      payload: PAYLOAD,
    })

    expect(sent.rps[0]).toEqual({
      Aliquota: '2.00',
      CallbackUrl: CALLBACK_URL,
      CodigoCnae: '4930202',
      CodigoMunicipio: '3543402',
      CpfCnpj: '11222333000181',
      DataEmissao: '17/08/2026',
      Discriminacao: 'Transporte rodoviário de carga',
      EnviarEmail: false,
      ExigibilidadeISS: '1',
      IssRetido: false,
      ItemListaServico: '1602',
      RazaoSocial: 'Tomador Exemplo',
      ValorServicos: '500.00',
      _exterior: false,
    })
  })

  /** Código de tributação e NBS são opcionais: em branco eles não viajam, preenchidos viajam. */
  test('carries the optional municipal codes only when the profile filled them', async () => {
    const sent = captureIssuedRps()

    await sent.gateway.issue({
      credential: createCredential('production'),
      payload: { ...PAYLOAD, municipalTaxationCode: '10100', nbsCode: '115090000' },
    })

    expect(sent.rps[0]?.['CodigoTributacaoMunicipio']).toBe('10100')
    expect(sent.rps[0]?.['CodigoNbs']).toBe('115090000')
  })

  /**
   * A data vai no fuso de quem emite, não no de UTC: às 23h de São Paulo o instante já é o dia
   * seguinte em UTC, e a nota sairia com a competência de amanhã.
   */
  test('dates the RPS in São Paulo, not in UTC', async () => {
    const sent = captureIssuedRps(() => new Date('2026-08-18T02:00:00.000Z'))

    await sent.gateway.issue({
      credential: createCredential('production'),
      payload: PAYLOAD,
    })

    expect(sent.rps[0]?.['DataEmissao']).toBe('17/08/2026')
  })

  /**
   * O token opaco do retorno sai do **envelope selado**, não da configuração: ele é por empresa, e a
   * rota pública da API o compara contra `callback_token_sha256` da própria linha da credencial.
   * Montar a URL com qualquer outra fonte entregaria o retorno da nota à empresa errada.
   */
  test('builds the callback URL from the sealed token, not from configuration', async () => {
    const sent = captureIssuedRps()

    await sent.gateway.issue({ credential: createCredential('production'), payload: PAYLOAD })

    expect(sent.rps[0]?.['CallbackUrl']).toBe(
      `${CALLBACK_BASE_URL}/public/nfse-callbacks/${CALLBACK_TOKEN}`,
    )
  })

  /**
   * Emissão na v2 é assíncrona e a `CallbackUrl` é obrigatória: sem base configurada o pedido não
   * seria aceito, e insistir contra o provedor é gastar tentativa por defeito de configuração. O
   * envelope continua fechado — não há segredo a abrir para descobrir isso.
   */
  test('refuses to issue without a configured callback base URL, leaving the envelope sealed', async () => {
    const decryptCalls: number[] = []
    const gateway = createNfseFiscalGateway({
      clock: CLOCK,
      config: {
        baseUrl: PRODUCTION_BASE_URL,
        callbackBaseUrl: undefined,
        timeoutMilliseconds: 15_000,
      },
      createClient: () => {
        throw new Error('The gateway must not build a client without a callback base URL')
      },
      fetch: rejectingFetch,
      secretService: {
        decrypt: async () => {
          decryptCalls.push(1)
          return { apiToken: 'token-sintetico', callbackToken: CALLBACK_TOKEN }
        },
      },
    })

    const outcome = await gateway.issue({
      credential: createCredential('production'),
      payload: PAYLOAD,
    })

    expect(outcome).toEqual({ cause: 'provider_not_configured', status: 'error' })
    expect(decryptCalls).toEqual([])
  })

  /** O token do retorno é segredo: se ele aparecer no outcome, entra em log e em tela de operador. */
  test('never returns the callback token in the outcome', async () => {
    const sent = captureIssuedRps()

    const outcome = await sent.gateway.issue({
      credential: createCredential('production'),
      payload: PAYLOAD,
    })

    expect(JSON.stringify(outcome)).not.toContain(CALLBACK_TOKEN)
  })

  /**
   * Instalação que ainda não contratou a Nota RP não tem endereço para chamar. A causa é própria:
   * `transport_failure` mandaria o trilho tentar de novo para sempre contra uma URL vazia, e
   * `credential_unreadable` acusaria o segredo de um defeito que é de configuração.
   */
  test('reports an unconfigured provider without opening the sealed token', async () => {
    const decryptCalls: number[] = []
    const gateway = createNfseFiscalGateway({
      config: {
        baseUrl: undefined,
        callbackBaseUrl: CALLBACK_BASE_URL,
        timeoutMilliseconds: 15_000,
      },
      createClient: () => {
        throw new Error('The gateway must not build a client without a base URL')
      },
      fetch: rejectingFetch,
      secretService: {
        decrypt: async () => {
          decryptCalls.push(1)
          return { apiToken: 'token-sintetico', callbackToken: CALLBACK_TOKEN }
        },
      },
    })

    const credential = createCredential('production')

    expect(await gateway.issue({ credential, payload: PAYLOAD })).toEqual({
      cause: 'provider_not_configured',
      status: 'error',
    })
    expect(
      await gateway.cancel({ credential, providerDocumentId: 'nota-1', reason: 'erro' }),
    ).toEqual({ cause: 'provider_not_configured', status: 'error' })
    expect(await gateway.fetchStatus({ credential, providerDocumentId: 'nota-1' })).toEqual({
      cause: 'provider_not_configured',
      status: 'error',
    })
    expect(
      await gateway.fetchDocument({ credential, kind: 'pdf', providerDocumentId: 'nota-1' }),
    ).toEqual({ cause: 'provider_not_configured', status: 'error' })
    expect(decryptCalls).toEqual([])
  })
})
