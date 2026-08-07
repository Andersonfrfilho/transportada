/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

import { describeCteUnknownError } from '../domain/cte-unknown-error.policy.js'

type FiscalEnvironment = 'homologation' | 'production'
type FiscalProviderEnvironment = 'homologacao' | 'producao'

export type CteFiscalProviderConfig = {
  readonly bairro: string
  readonly cep: string
  readonly certificadoBase64: string
  readonly certificadoSenha: string
  readonly cnpj: string
  readonly codigoMunicipio: string
  readonly complemento?: string
  readonly crt: string
  readonly environment: FiscalEnvironment
  readonly inscricaoEstadual: string
  readonly logradouro: string
  readonly municipio: string
  readonly numero: string
  readonly numeroCte: number
  readonly razaoSocial: string
  readonly rntrc: string
  readonly serie: string
  readonly telefone?: string
  readonly uf: string
}

export type CteProviderConfig = {
  model: 'cte'
  environment: FiscalProviderEnvironment
  cnpj: string
  certificadoBase64: string
  certificadoSenha: string
  uf: string
  bairro: string
  cep: string
  codigoMunicipio: string
  complemento?: string
  crt: string
  inscricaoEstadual: string
  logradouro: string
  municipio: string
  numero: string
  numeroCte: number
  razaoSocial: string
  rntrc: string
  serie: string
  telefone?: string
}

type CteData = {
  readonly valorTotalReceber?: number
}

export type CteProviderEmitResult = {
  success: boolean
  protocolo?: string
  chaveAcesso?: string
  errorCode?: string
  xmlAutorizado?: string
  rawResponse: unknown
}

type CteProviderResult = {
  ok: boolean
  message?: string
  rawResponse: unknown
}

type CteProviderCancelResult = {
  success: boolean
  errorCode?: string
  protocolo?: string
  xmlEvento?: string
  rawResponse: unknown
}

export type CteFiscalProvider = {
  emit(input: {
    config: CteProviderConfig
    referenceId: string
    totalAmount: number
    discountAmount: number
    items: readonly unknown[]
    payments: readonly unknown[]
    cteData: unknown
  }): Promise<CteProviderEmitResult>
  cancel(input: {
    config: CteProviderConfig
    chaveAcesso: string
    protocolo?: string
    justificativa: string
  }): Promise<CteProviderCancelResult>
  testConnection(input: { config: CteProviderConfig }): Promise<CteProviderResult>
}

export type CteIssueOutcome = {
  status: 'ok' | 'rejected' | 'error'
  accessKey?: string
  authorizedXml?: string
  protocol?: string
  /** Resposta do provedor como ela chegou — é o único lugar onde a SEFAZ diz o motivo por extenso. */
  raw?: unknown
  rejection?: {
    code: string
  }
  cause?: string
}

export type CteCancelOutcome = {
  status: 'ok' | 'rejected' | 'error'
  eventXml?: string
  protocol?: string
  raw?: unknown
  rejection?: {
    code: string
  }
  cause?: string
}

export type CteCancelCommand = {
  accessKey: string
  authorizationProtocol: string
  documentId: string
  justification: string
  tenantId: string
}

type CteGateway = {
  issue(input: {
    config: CteFiscalProviderConfig
    command: {
      tenantId: string
      documentId: string
      cteData: unknown
    }
  }): Promise<CteIssueOutcome>
  cancel(input: {
    config: CteFiscalProviderConfig
    command: CteCancelCommand
  }): Promise<CteCancelOutcome>
  testConnection(input: { config: CteFiscalProviderConfig }): Promise<{ status: 'ok' | 'failed' }>
}

type CteGatewayDependencies = {
  createProvider: (input: { config: CteProviderConfig }) => CteFiscalProvider
}

function toProviderConfig(input: CteFiscalProviderConfig): CteProviderConfig {
  return {
    model: 'cte',
    environment: input.environment === 'homologation' ? 'homologacao' : 'producao',
    bairro: input.bairro,
    cep: input.cep,
    certificadoBase64: input.certificadoBase64,
    certificadoSenha: input.certificadoSenha,
    cnpj: input.cnpj,
    codigoMunicipio: input.codigoMunicipio,
    ...(input.complemento === undefined ? {} : { complemento: input.complemento }),
    crt: input.crt,
    inscricaoEstadual: input.inscricaoEstadual,
    logradouro: input.logradouro,
    municipio: input.municipio,
    numero: input.numero,
    numeroCte: input.numeroCte,
    razaoSocial: input.razaoSocial,
    rntrc: input.rntrc,
    serie: input.serie,
    ...(input.telefone === undefined ? {} : { telefone: input.telefone }),
    uf: input.uf,
  }
}

function mapIssueOutcome(result: CteProviderEmitResult): CteIssueOutcome {
  if (result.success) {
    const protocol = result.protocolo ?? result.chaveAcesso
    return {
      status: 'ok',
      ...(result.chaveAcesso === undefined ? {} : { accessKey: result.chaveAcesso }),
      ...(result.xmlAutorizado === undefined ? {} : { authorizedXml: result.xmlAutorizado }),
      ...(protocol === undefined ? {} : { protocol }),
      raw: result.rawResponse,
    }
  }

  return {
    status: 'rejected',
    raw: result.rawResponse,
    rejection: {
      code: result.errorCode ?? 'FISCAL_REJECTED',
    },
  }
}

function classifyIssueError(error: unknown): {
  status: 'rejected' | 'error'
  raw: unknown
  rejection?: {
    code: string
  }
  cause?: string
} {
  const raw = describeCteUnknownError(error)

  if (error instanceof Error && error.name === 'FiscalRejectionError') {
    return {
      status: 'rejected',
      raw,
      rejection: {
        code: 'FISCAL_REJECTION',
      },
    }
  }

  if (error instanceof Error && error.name === 'FiscalTimeoutError') {
    return {
      status: 'error',
      cause: 'FiscalTimeoutError',
      raw,
    }
  }

  return {
    status: 'error',
    cause: error instanceof Error ? error.name : 'UnknownError',
    raw,
  }
}

function mapCancelOutcome(result: CteProviderCancelResult): CteCancelOutcome {
  if (result.success) {
    return {
      status: 'ok',
      ...(result.xmlEvento === undefined ? {} : { eventXml: result.xmlEvento }),
      ...(result.protocolo === undefined ? {} : { protocol: result.protocolo }),
      raw: result.rawResponse,
    }
  }

  return {
    status: 'rejected',
    raw: result.rawResponse,
    rejection: {
      code: result.errorCode ?? 'FISCAL_REJECTED',
    },
  }
}

function mapTestConnectionResult(input: { ok: boolean }): { status: 'ok' | 'failed' } {
  return { status: input.ok ? 'ok' : 'failed' }
}

export function createCteFiscalGateway(input: CteGatewayDependencies): CteGateway {
  return {
    async issue({ config, command }) {
      const providerConfig = toProviderConfig(config)
      const provider = input.createProvider({ config: providerConfig })

      try {
        const result = await provider.emit({
          config: providerConfig,
          referenceId: `tenant:${command.tenantId}:document:${command.documentId}`,
          totalAmount:
            (command.cteData as { readonly valorTotalReceber?: number })?.valorTotalReceber ?? 0,
          discountAmount: 0,
          items: [],
          payments: [],
          cteData: command.cteData as CteData,
        })

        return mapIssueOutcome(result)
      } catch (error) {
        return classifyIssueError(error)
      }
    },
    async cancel({ config, command }) {
      const providerConfig = toProviderConfig(config)
      const provider = input.createProvider({ config: providerConfig })
      try {
        const result = await provider.cancel({
          config: providerConfig,
          chaveAcesso: command.accessKey,
          protocolo: command.authorizationProtocol,
          justificativa: command.justification,
        })

        return mapCancelOutcome(result)
      } catch (error) {
        return classifyIssueError(error)
      }
    },
    async testConnection({ config }) {
      const providerConfig = toProviderConfig(config)
      const provider = input.createProvider({ config: providerConfig })
      const result = await provider.testConnection({ config: providerConfig })
      return mapTestConnectionResult(result)
    },
  }
}
