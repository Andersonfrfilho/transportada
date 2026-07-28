/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
export type MdfeFiscalConfig = {
  readonly bairro: string
  readonly cep: string
  readonly certificadoBase64: string
  readonly certificadoSenha: string
  readonly cnpj: string
  readonly codigoMunicipio: string
  readonly crt: string
  readonly environment: 'homologation' | 'production'
  readonly inscricaoEstadual: string
  readonly logradouro: string
  readonly municipio: string
  readonly numero: string
  readonly numeroMdfe: number
  readonly razaoSocial: string
  readonly serie: string
  readonly telefone?: string
  readonly uf: string
}

export type MdfeProviderConfig = Omit<MdfeFiscalConfig, 'environment'> & {
  readonly environment: 'homologacao' | 'producao'
  readonly model: 'mdfe'
}

type ProviderEmitResult = {
  readonly chaveAcesso?: string
  readonly errorCode?: string
  readonly errorMessage?: string
  readonly protocolo?: string
  readonly success: boolean
  readonly xmlAutorizado?: string
}

type ProviderEventResult = {
  readonly errorCode?: string
  readonly errorMessage?: string
  readonly protocolo?: string
  readonly success: boolean
  readonly xmlEvento?: string
}

export type MdfeFiscalProvider = {
  cancel(input: {
    readonly chaveAcesso: string
    readonly config: MdfeProviderConfig
    readonly justificativa: string
    readonly protocolo?: string
  }): Promise<ProviderEventResult>
  close(input: {
    readonly chaveAcesso: string
    readonly codigoMunicipioEncerramento: string
    readonly config: MdfeProviderConfig
    readonly dataEncerramento: string
    readonly protocolo: string
    readonly ufEncerramento: string
  }): Promise<ProviderEventResult>
  emit(input: {
    readonly config: MdfeProviderConfig
    readonly discountAmount: number
    readonly items: readonly unknown[]
    readonly mdfeData: unknown
    readonly payments: readonly unknown[]
    readonly referenceId: string
    readonly totalAmount: number
  }): Promise<ProviderEmitResult>
  testConnection(input: { readonly config: MdfeProviderConfig }): Promise<{
    readonly message?: string
    readonly ok: boolean
  }>
}

export type MdfeIssueCommand = {
  readonly manifestId: string
  readonly mdfeData: unknown
  readonly tenantId: string
}

export type MdfeCloseCommand = {
  readonly accessKey: string
  readonly authorizationProtocol: string
  readonly closureCityCode: string
  readonly closureDate: string
  readonly closureState: string
  readonly manifestId: string
  readonly tenantId: string
}

export type MdfeCancelCommand = {
  readonly accessKey: string
  readonly authorizationProtocol: string
  readonly justification: string
  readonly manifestId: string
  readonly tenantId: string
}

export type MdfeRejection = {
  readonly code: string
  readonly message?: string
}

export type MdfeIssueOutcome = {
  readonly accessKey?: string
  readonly authorizedXml?: string
  readonly cause?: string
  readonly protocol?: string
  readonly rejection?: MdfeRejection
  readonly status: 'ok' | 'rejected' | 'error'
}

export type MdfeEventOutcome = {
  readonly cause?: string
  readonly eventXml?: string
  readonly protocol?: string
  readonly rejection?: MdfeRejection
  readonly status: 'ok' | 'rejected' | 'error'
}

export type MdfeFiscalGateway = {
  cancel(input: {
    readonly command: MdfeCancelCommand
    readonly config: MdfeFiscalConfig
  }): Promise<MdfeEventOutcome>
  close(input: {
    readonly command: MdfeCloseCommand
    readonly config: MdfeFiscalConfig
  }): Promise<MdfeEventOutcome>
  issue(input: {
    readonly command: MdfeIssueCommand
    readonly config: MdfeFiscalConfig
  }): Promise<MdfeIssueOutcome>
  testConnection(input: { readonly config: MdfeFiscalConfig }): Promise<{
    readonly status: 'ok' | 'failed'
  }>
}

const UNKNOWN_REJECTION_CODE = 'FISCAL_REJECTION'
const UNKNOWN_ERROR_CAUSE = 'UnknownError'

function toProviderConfig(input: MdfeFiscalConfig): MdfeProviderConfig {
  return {
    bairro: input.bairro,
    cep: input.cep,
    certificadoBase64: input.certificadoBase64,
    certificadoSenha: input.certificadoSenha,
    cnpj: input.cnpj,
    codigoMunicipio: input.codigoMunicipio,
    crt: input.crt,
    environment: input.environment === 'homologation' ? 'homologacao' : 'producao',
    inscricaoEstadual: input.inscricaoEstadual,
    logradouro: input.logradouro,
    model: 'mdfe',
    municipio: input.municipio,
    numero: input.numero,
    numeroMdfe: input.numeroMdfe,
    razaoSocial: input.razaoSocial,
    serie: input.serie,
    ...(input.telefone === undefined ? {} : { telefone: input.telefone }),
    uf: input.uf,
  }
}

function toRejection(result: {
  readonly errorCode?: string
  readonly errorMessage?: string
}): MdfeRejection {
  return {
    code: result.errorCode ?? UNKNOWN_REJECTION_CODE,
    ...(result.errorMessage === undefined ? {} : { message: result.errorMessage }),
  }
}

function classifyError(error: unknown): {
  readonly cause?: string
  readonly rejection?: MdfeRejection
  readonly status: 'rejected' | 'error'
} {
  if (error instanceof Error && error.name === 'FiscalRejectionError') {
    return {
      rejection: { code: UNKNOWN_REJECTION_CODE, message: error.message },
      status: 'rejected',
    }
  }

  return { cause: error instanceof Error ? error.name : UNKNOWN_ERROR_CAUSE, status: 'error' }
}

function mapIssueResult(result: ProviderEmitResult): MdfeIssueOutcome {
  if (!result.success) return { rejection: toRejection(result), status: 'rejected' }

  return {
    ...(result.chaveAcesso === undefined ? {} : { accessKey: result.chaveAcesso }),
    ...(result.xmlAutorizado === undefined ? {} : { authorizedXml: result.xmlAutorizado }),
    ...(result.protocolo === undefined ? {} : { protocol: result.protocolo }),
    status: 'ok',
  }
}

function mapEventResult(result: ProviderEventResult): MdfeEventOutcome {
  if (!result.success) return { rejection: toRejection(result), status: 'rejected' }

  return {
    ...(result.xmlEvento === undefined ? {} : { eventXml: result.xmlEvento }),
    ...(result.protocolo === undefined ? {} : { protocol: result.protocolo }),
    status: 'ok',
  }
}

export function createMdfeFiscalGateway(input: {
  createProvider(input: { readonly config: MdfeProviderConfig }): MdfeFiscalProvider
}): MdfeFiscalGateway {
  function buildProvider(config: MdfeFiscalConfig): {
    readonly config: MdfeProviderConfig
    readonly provider: MdfeFiscalProvider
  } {
    const providerConfig = toProviderConfig(config)

    return { config: providerConfig, provider: input.createProvider({ config: providerConfig }) }
  }

  return {
    async cancel({ command, config }) {
      const { config: providerConfig, provider } = buildProvider(config)

      try {
        return mapEventResult(
          await provider.cancel({
            chaveAcesso: command.accessKey,
            config: providerConfig,
            justificativa: command.justification,
            protocolo: command.authorizationProtocol,
          }),
        )
      } catch (error: unknown) {
        return classifyError(error)
      }
    },

    async close({ command, config }) {
      const { config: providerConfig, provider } = buildProvider(config)

      try {
        return mapEventResult(
          await provider.close({
            chaveAcesso: command.accessKey,
            codigoMunicipioEncerramento: command.closureCityCode,
            config: providerConfig,
            dataEncerramento: command.closureDate,
            protocolo: command.authorizationProtocol,
            ufEncerramento: command.closureState,
          }),
        )
      } catch (error: unknown) {
        return classifyError(error)
      }
    },

    async issue({ command, config }) {
      const { config: providerConfig, provider } = buildProvider(config)

      try {
        return mapIssueResult(
          await provider.emit({
            config: providerConfig,
            discountAmount: 0,
            items: [],
            mdfeData: command.mdfeData,
            payments: [],
            referenceId: command.manifestId,
            totalAmount: 0,
          }),
        )
      } catch (error: unknown) {
        return classifyError(error)
      }
    },

    async testConnection({ config }) {
      const { config: providerConfig, provider } = buildProvider(config)

      try {
        const result = await provider.testConnection({ config: providerConfig })

        return { status: result.ok ? 'ok' : 'failed' }
      } catch {
        return { status: 'failed' }
      }
    },
  }
}
