/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
type MdfeFiscalConfig = {
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
  numeroMdfe: number
  razaoSocial: string
  serie: string
  uf: string
}

type MdfeProviderConfig = Omit<MdfeFiscalConfig, 'environment'> & {
  model: 'mdfe'
  environment: 'homologacao' | 'producao'
}

type MdfeIssueOutcomeShape = {
  status: 'ok' | 'rejected' | 'error'
  accessKey?: string
  authorizedXml?: string
  protocol?: string
  rejection?: { code: string }
  cause?: string
}

type MdfeEventOutcomeShape = {
  status: 'ok' | 'rejected' | 'error'
  eventXml?: string
  protocol?: string
  rejection?: { code: string }
  cause?: string
}

type MdfeCloseCommandShape = {
  accessKey: string
  authorizationProtocol: string
  closureCityCode: string
  closureDate: string
  closureState: string
  manifestId: string
  tenantId: string
}

type MdfeCancelCommandShape = {
  accessKey: string
  authorizationProtocol: string
  justification: string
  manifestId: string
  tenantId: string
}

type MdfeFiscalProvider = {
  emit(input: {
    config: MdfeProviderConfig
    referenceId: string
    totalAmount: number
    discountAmount: number
    items: readonly unknown[]
    payments: readonly unknown[]
    mdfeData: unknown
  }): Promise<{
    success: boolean
    protocolo?: string
    chaveAcesso?: string
    errorCode?: string
    xmlAutorizado?: string
    rawResponse: unknown
  }>
  close(input: {
    config: MdfeProviderConfig
    chaveAcesso: string
    protocolo: string
    dataEncerramento: string
    ufEncerramento: string
    codigoMunicipioEncerramento: string
  }): Promise<{
    success: boolean
    errorCode?: string
    protocolo?: string
    xmlEvento?: string
    rawResponse: unknown
  }>
  cancel(input: {
    config: MdfeProviderConfig
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
  testConnection(input: { config: MdfeProviderConfig }): Promise<{
    ok: boolean
    message: string
  }>
}

type MdfeGateway = {
  issue(input: {
    config: MdfeFiscalConfig
    command: { tenantId: string; manifestId: string; mdfeData: unknown }
  }): Promise<MdfeIssueOutcomeShape>
  close(input: {
    config: MdfeFiscalConfig
    command: MdfeCloseCommandShape
  }): Promise<MdfeEventOutcomeShape>
  cancel(input: {
    config: MdfeFiscalConfig
    command: MdfeCancelCommandShape
  }): Promise<MdfeEventOutcomeShape>
  testConnection(input: { config: MdfeFiscalConfig }): Promise<{ status: 'ok' | 'failed' }>
}

export async function createMdfeFiscalGatewayFixture(input: {
  createProvider(input: { config: MdfeProviderConfig }): MdfeFiscalProvider
}): Promise<MdfeGateway> {
  const module = (await import(
    '../../src/mdfe-issuance/infrastructure/mdfe-fiscal-gateway.js'
  )) as {
    createMdfeFiscalGateway(input: {
      createProvider(input: { config: MdfeProviderConfig }): MdfeFiscalProvider
    }): MdfeGateway
  }

  return module.createMdfeFiscalGateway(input)
}

export const MDFE_FISCAL_COMMAND = {
  tenantId: 'c1f9b9cf-d4e4-4f4f-9c8d-3de2d8f0eaf5',
  manifestId: 'f3efdfdb-1a5c-4aaf-bd0d-c8f3c3f2c8ce',
  mdfeData: {
    ufInicio: 'SP',
    ufFim: 'MG',
    totais: { vCarga: 1000, cUnid: '01', qCarga: 1500 },
  },
} as const

export const MDFE_FISCAL_CONFIG = {
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
  numeroMdfe: 17,
  razaoSocial: 'Transportadora Exemplo LTDA',
  serie: '1',
  uf: 'SP',
} as const

export const MDFE_CLOSE_COMMAND = {
  accessKey: '35260712345678000190580010000000171000000178',
  authorizationProtocol: 'PROTO-AUTH-01',
  closureCityCode: '3106200',
  closureDate: '2026-07-28',
  closureState: 'MG',
  manifestId: MDFE_FISCAL_COMMAND.manifestId,
  tenantId: MDFE_FISCAL_COMMAND.tenantId,
} as const

export const MDFE_CANCEL_COMMAND = {
  accessKey: MDFE_CLOSE_COMMAND.accessKey,
  authorizationProtocol: MDFE_CLOSE_COMMAND.authorizationProtocol,
  justification: 'Viagem cancelada pelo embarcador antes da saida',
  manifestId: MDFE_FISCAL_COMMAND.manifestId,
  tenantId: MDFE_FISCAL_COMMAND.tenantId,
} as const
