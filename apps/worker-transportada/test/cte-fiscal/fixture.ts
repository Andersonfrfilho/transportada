/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
type CteFiscalConfig = {
  bairro: string
  cep: string
  certificadoBase64: string
  certificadoSenha: string
  cnpj: string
  codigoMunicipio: string
  crt: string
  environment: 'homologation' | 'production'
  inscricaoEstadual: string
  logradouro: string
  municipio: string
  numero: string
  numeroCte: number
  razaoSocial: string
  rntrc: string
  serie: string
  uf: string
}

type CteCancelCommandShape = {
  accessKey: string
  authorizationProtocol: string
  documentId: string
  justification: string
  tenantId: string
}

type CteCancelOutcomeShape = {
  status: 'ok' | 'rejected' | 'error'
  eventXml?: string
  protocol?: string
  rejection?: { code: string }
  cause?: string
}

type ProviderCreateInput = {
  readonly config: Omit<CteFiscalConfig, 'environment'> & {
    model: 'cte'
    environment: 'homologacao' | 'producao'
  }
}

type CteFiscalProvider = {
  emit(input: {
    config: ProviderCreateInput['config']
    referenceId: string
    totalAmount: number
    discountAmount: number
    items: readonly unknown[]
    payments: readonly unknown[]
    cteData: unknown
  }): Promise<{
    success: boolean
    protocolo?: string
    chaveAcesso?: string
    errorCode?: string
    xmlAutorizado?: string
    rawResponse: unknown
  }>
  cancel(input: {
    config: ProviderCreateInput['config']
    chaveAcesso: string
    protocolo?: string
    justificativa: string
  }): Promise<{
    success: boolean
    errorCode?: string
    protocolo?: string
    xmlEvento?: string
    rawResponse: unknown
  }>
  testConnection(input: { config: ProviderCreateInput['config'] }): Promise<{
    ok: boolean
    message: string
  }>
}

export async function createCteFiscalGatewayFixture(input: {
  createProvider(input: ProviderCreateInput): CteFiscalProvider
}): Promise<{
  issue(input: {
    config: CteFiscalConfig
    command: {
      tenantId: string
      documentId: string
      cteData: unknown
    }
  }): Promise<{
    status: 'ok' | 'rejected' | 'error'
    authorizedXml?: string
    protocol?: string
    rejection?: { code: string }
    cause?: string
  }>
  cancel(input: {
    config: CteFiscalConfig
    command: CteCancelCommandShape
  }): Promise<CteCancelOutcomeShape>
  testConnection(input: { config: CteFiscalConfig }): Promise<{ status: 'ok' | 'failed' }>
}> {
  const module = (await import('../../src/cte-issuance/infrastructure/cte-fiscal-gateway.js')) as {
    createCteFiscalGateway(input: {
      createProvider(input: ProviderCreateInput): CteFiscalProvider
    }): {
      issue(input: {
        config: CteFiscalConfig
        command: {
          tenantId: string
          documentId: string
          cteData: unknown
        }
      }): Promise<{
        status: 'ok' | 'rejected' | 'error'
        authorizedXml?: string
        protocol?: string
        rejection?: { code: string }
        cause?: string
      }>
      cancel(input: {
        config: CteFiscalConfig
        command: CteCancelCommandShape
      }): Promise<CteCancelOutcomeShape>
      testConnection(input: { config: CteFiscalConfig }): Promise<{ status: 'ok' | 'failed' }>
    }
  }

  return module.createCteFiscalGateway(input)
}

export const CTE_FISCAL_COMMAND = {
  tenantId: 'c1f9b9cf-d4e4-4f4f-9c8d-3de2d8f0eaf5',
  documentId: 'f3efdfdb-1a5c-4aaf-bd0d-c8f3c3f2c8ce',
  cteData: {
    valorTotalReceber: 120,
    valorTotalPrestacao: 100,
  },
} as const

export const CTE_FISCAL_CONFIG = {
  bairro: 'Centro',
  cep: '09010000',
  certificadoBase64: 'BASE64CERT',
  certificadoSenha: 'secret-password',
  cnpj: '12345678000190',
  codigoMunicipio: '3526902',
  crt: '3',
  environment: 'homologation' as const,
  inscricaoEstadual: '111222333444',
  logradouro: 'Rua das Transportadoras',
  municipio: 'Jundiai',
  numero: '250',
  numeroCte: 100000001,
  razaoSocial: 'Transportadora Exemplo LTDA',
  rntrc: '12345678',
  serie: '7',
  uf: 'SP',
} as const
