/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  MDFE_CANCEL_COMMAND,
  MDFE_CLOSE_COMMAND,
  MDFE_FISCAL_COMMAND,
  MDFE_FISCAL_CONFIG,
  createMdfeFiscalGatewayFixture,
} from './mdfe-fiscal/fixture.js'

type ProviderStub = {
  readonly closeResult?: {
    success: boolean
    errorCode?: string
    protocolo?: string
    xmlEvento?: string
    rawResponse: unknown
  }
  readonly cancelResult?: {
    success: boolean
    errorCode?: string
    protocolo?: string
    xmlEvento?: string
    rawResponse: unknown
  }
  readonly emitError?: unknown
  readonly emitResult?: {
    success: boolean
    protocolo?: string
    chaveAcesso?: string
    errorCode?: string
    xmlAutorizado?: string
    rawResponse: unknown
  }
  readonly onCall?: (call: Record<string, unknown>) => void
}

function stubProvider(stub: ProviderStub) {
  return ({ config }: { config: { environment: string; cnpj: string; uf: string } }) => {
    stub.onCall?.({
      event: 'createProvider',
      cnpj: config.cnpj,
      environment: config.environment,
      uf: config.uf,
    })

    return {
      emit: async (input: { referenceId: string }) => {
        stub.onCall?.({ event: 'emit', referenceId: input.referenceId })
        if (stub.emitError !== undefined) throw stub.emitError
        return stub.emitResult ?? { success: true, rawResponse: undefined }
      },
      close: async (input: Record<string, unknown>) => {
        stub.onCall?.({ event: 'close', ...input, config: undefined })
        return stub.closeResult ?? { success: true, rawResponse: undefined }
      },
      cancel: async (input: Record<string, unknown>) => {
        stub.onCall?.({ event: 'cancel', ...input, config: undefined })
        return stub.cancelResult ?? { success: true, rawResponse: undefined }
      },
      testConnection: async () => ({ ok: true, message: 'ok' }),
    }
  }
}

describe('worker MDF-e fiscal gateway contract', () => {
  test('uses local contract and blocks fiscal-provider import in this module', async () => {
    const gatewaySource = await Bun.file(
      new URL('../src/mdfe-issuance/infrastructure/mdfe-fiscal-gateway.ts', import.meta.url),
    ).text()

    expect(gatewaySource).not.toContain("from '@adatechnology/fiscal-provider'")
    expect(gatewaySource).not.toContain('@adatechnology/fiscal-provider/')
    expect(gatewaySource).not.toContain('src/sefaz')
  })

  test('keeps the real Ada fiscal package isolated in the provider factory', async () => {
    const providerFactorySource = await Bun.file(
      new URL(
        '../src/mdfe-issuance/infrastructure/adatechnology-mdfe-fiscal-provider.factory.ts',
        import.meta.url,
      ),
    ).text()

    expect(providerFactorySource).toContain("from '@adatechnology/fiscal-provider'")
    expect(providerFactorySource).toContain('SefazMdfeProvider')
    expect(providerFactorySource).not.toContain('@adatechnology/fiscal-provider/')
    expect(providerFactorySource).not.toContain('src/sefaz')
  })

  test('wires the real provider factory into the mdfe issuance consumer', async () => {
    const mainSource = await Bun.file(new URL('../src/main.ts', import.meta.url)).text()
    const mdfeEffectSource = mainSource.slice(
      mainSource.indexOf('createMdfeIssuanceWorkerEffect({'),
    )

    expect(mainSource).toContain('createAdatechnologyMdfeFiscalProvider')
    expect(mdfeEffectSource).toContain('createProvider: createAdatechnologyMdfeFiscalProvider')
  })

  test('adapts provider emit output to internal outcome without leaking cert payload', async () => {
    const calls: Record<string, unknown>[] = []
    const gateway = await createMdfeFiscalGatewayFixture({
      createProvider: stubProvider({
        emitResult: {
          success: true,
          chaveAcesso: MDFE_CLOSE_COMMAND.accessKey,
          protocolo: 'PROTO-01',
          xmlAutorizado: '<mdfeProc versao="3.00"/>',
          rawResponse: undefined,
        },
        onCall: (call) => calls.push(call),
      }),
    })

    const outcome = await gateway.issue({
      config: MDFE_FISCAL_CONFIG,
      command: MDFE_FISCAL_COMMAND,
    })

    expect(calls[0]).toMatchObject({
      event: 'createProvider',
      cnpj: MDFE_FISCAL_CONFIG.cnpj,
      environment: 'homologacao',
      uf: MDFE_FISCAL_CONFIG.uf,
    })
    expect(calls[1]).toMatchObject({ event: 'emit' })
    expect(outcome).toMatchObject({
      status: 'ok',
      accessKey: MDFE_CLOSE_COMMAND.accessKey,
      authorizedXml: '<mdfeProc versao="3.00"/>',
      protocol: 'PROTO-01',
    })
    expect(JSON.stringify(outcome)).not.toContain(MDFE_FISCAL_CONFIG.certificadoBase64)
    expect(JSON.stringify(outcome)).not.toContain(MDFE_FISCAL_CONFIG.certificadoSenha)
  })

  // O 110112 exige data, UF e município de encerramento — sem eles a SEFAZ rejeita o evento
  test('forwards the closure event with the trip end place and date', async () => {
    const calls: Record<string, unknown>[] = []
    const gateway = await createMdfeFiscalGatewayFixture({
      createProvider: stubProvider({
        closeResult: {
          success: true,
          protocolo: 'PROTO-ENC-01',
          xmlEvento: '<procEventoMDFe/>',
          rawResponse: undefined,
        },
        onCall: (call) => calls.push(call),
      }),
    })

    const outcome = await gateway.close({
      config: MDFE_FISCAL_CONFIG,
      command: MDFE_CLOSE_COMMAND,
    })

    expect(calls[1]).toMatchObject({
      event: 'close',
      chaveAcesso: MDFE_CLOSE_COMMAND.accessKey,
      codigoMunicipioEncerramento: MDFE_CLOSE_COMMAND.closureCityCode,
      dataEncerramento: MDFE_CLOSE_COMMAND.closureDate,
      protocolo: MDFE_CLOSE_COMMAND.authorizationProtocol,
      ufEncerramento: MDFE_CLOSE_COMMAND.closureState,
    })
    expect(outcome).toMatchObject({
      status: 'ok',
      eventXml: '<procEventoMDFe/>',
      protocol: 'PROTO-ENC-01',
    })
  })

  test('forwards the cancellation event with the justification', async () => {
    const calls: Record<string, unknown>[] = []
    const gateway = await createMdfeFiscalGatewayFixture({
      createProvider: stubProvider({
        cancelResult: {
          success: true,
          protocolo: 'PROTO-CANC-01',
          xmlEvento: '<procEventoMDFe/>',
          rawResponse: undefined,
        },
        onCall: (call) => calls.push(call),
      }),
    })

    const outcome = await gateway.cancel({
      config: MDFE_FISCAL_CONFIG,
      command: MDFE_CANCEL_COMMAND,
    })

    expect(calls[1]).toMatchObject({
      event: 'cancel',
      chaveAcesso: MDFE_CANCEL_COMMAND.accessKey,
      justificativa: MDFE_CANCEL_COMMAND.justification,
      protocolo: MDFE_CANCEL_COMMAND.authorizationProtocol,
    })
    expect(outcome).toMatchObject({
      status: 'ok',
      eventXml: '<procEventoMDFe/>',
      protocol: 'PROTO-CANC-01',
    })
  })

  test('maps an unsuccessful provider result to a rejection with a stable code', async () => {
    const gateway = await createMdfeFiscalGatewayFixture({
      createProvider: stubProvider({
        emitResult: { success: false, errorCode: '999', rawResponse: undefined },
      }),
    })

    const outcome = await gateway.issue({
      config: MDFE_FISCAL_CONFIG,
      command: MDFE_FISCAL_COMMAND,
    })

    expect(outcome.status).toBe('rejected')
    expect(outcome.rejection).toMatchObject({ code: '999' })
  })

  test('classifies rejection and timeout as stable internal outcomes', async () => {
    const rejectedGateway = await createMdfeFiscalGatewayFixture({
      createProvider: stubProvider({
        emitError: Object.assign(new Error('rejected'), { name: 'FiscalRejectionError' }),
      }),
    })
    const rejectedOutcome = await rejectedGateway.issue({
      config: MDFE_FISCAL_CONFIG,
      command: MDFE_FISCAL_COMMAND,
    })
    expect(rejectedOutcome.status).toBe('rejected')
    expect(rejectedOutcome.rejection).toMatchObject({ code: 'FISCAL_REJECTION' })

    const timeoutGateway = await createMdfeFiscalGatewayFixture({
      createProvider: stubProvider({
        emitError: Object.assign(new Error('timed out'), { name: 'FiscalTimeoutError' }),
      }),
    })
    const timeoutOutcome = await timeoutGateway.issue({
      config: MDFE_FISCAL_CONFIG,
      command: MDFE_FISCAL_COMMAND,
    })
    expect(timeoutOutcome.status).toBe('error')
    expect(timeoutOutcome.cause).toBe('FiscalTimeoutError')
    expect(timeoutOutcome.rejection).toBeUndefined()
  })
})
