/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
type CteFiscalConfig = {
  environment: 'homologation' | 'production'
  cnpj: string
  certificadoBase64: string
  certificadoSenha: string
  uf: string
}

type ProviderCreateInput = {
  readonly config: {
    model: 'cte'
    environment: 'homologacao' | 'producao'
    cnpj: string
    certificadoBase64: string
    certificadoSenha: string
    uf: string
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
    rawResponse: unknown
  }>
  cancel(input: {
    config: ProviderCreateInput['config']
    chaveAcesso: string
    protocolo?: string
    justificativa: string
  }): Promise<{
    success: boolean
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
    protocol?: string
    rejection?: { code: string }
    cause?: string
  }>
  cancel(input: {
    config: CteFiscalConfig
    command: {
      tenantId: string
      documentId: string
    }
  }): Promise<{ status: 'ok' | 'failed' }>
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
        protocol?: string
        rejection?: { code: string }
        cause?: string
      }>
      cancel(input: {
        config: CteFiscalConfig
        command: {
          tenantId: string
          documentId: string
        }
      }): Promise<{ status: 'ok' | 'failed' }>
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
  environment: 'homologation' as const,
  cnpj: '12345678000190',
  certificadoBase64: 'BASE64CERT',
  certificadoSenha: 'secret-password',
  uf: 'SP',
} as const
