/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  CTE_FISCAL_COMMAND,
  CTE_FISCAL_CONFIG,
  createCteFiscalGatewayFixture,
} from './cte-fiscal/fixture.js'

describe('worker CT-e fiscal gateway contract', () => {
  test('uses local contract and blocks fiscal-provider import in this module', async () => {
    const gatewaySource = await Bun.file(
      new URL('../src/cte-issuance/infrastructure/cte-fiscal-gateway.ts', import.meta.url),
    ).text()
    expect(gatewaySource).not.toContain("from '@adatechnology/fiscal-provider'")
    expect(gatewaySource).not.toContain('@adatechnology/fiscal-provider/')
    expect(gatewaySource).not.toContain('src/sefaz')
  })

  test('keeps the real Ada fiscal package isolated in the provider factory', async () => {
    const providerFactorySource = await Bun.file(
      new URL(
        '../src/cte-issuance/infrastructure/adatechnology-cte-fiscal-provider.factory.ts',
        import.meta.url,
      ),
    ).text()

    expect(providerFactorySource).toContain("from '@adatechnology/fiscal-provider'")
    expect(providerFactorySource).toContain('createFiscalProvider')
    expect(providerFactorySource).not.toContain('@adatechnology/fiscal-provider/')
    expect(providerFactorySource).not.toContain('src/sefaz')
  })

  test('adapts provider emit output to internal outcome without leaking cert payload', async () => {
    const calls: unknown[] = []
    const gateway = await createCteFiscalGatewayFixture({
      createProvider({ config }) {
        calls.push({
          event: 'createProvider',
          environment: config.environment,
          uf: config.uf,
          cnpj: config.cnpj,
        })
        return {
          emit: async (input) => {
            calls.push({ event: 'emit', referenceId: input.referenceId })
            return {
              success: true,
              protocolo: 'PROTO-01',
              xmlAutorizado: '<cteProc versao="4.00"/>',
              rawResponse: undefined,
            }
          },
          cancel: async () => ({ success: true, rawResponse: undefined }),
          testConnection: async () => ({ ok: true, message: 'ok' }),
        }
      },
    })

    const outcome = await gateway.issue({
      config: CTE_FISCAL_CONFIG,
      command: CTE_FISCAL_COMMAND,
    })

    expect(calls).toHaveLength(2)
    expect(calls[0]).toMatchObject({
      event: 'createProvider',
      environment: 'homologacao',
      cnpj: CTE_FISCAL_CONFIG.cnpj,
      uf: CTE_FISCAL_CONFIG.uf,
    })
    expect(outcome).toMatchObject({
      status: 'ok',
      authorizedXml: '<cteProc versao="4.00"/>',
      protocol: 'PROTO-01',
    })
    expect(JSON.stringify(outcome)).not.toContain(CTE_FISCAL_CONFIG.certificadoBase64)
    expect(JSON.stringify(outcome)).not.toContain(CTE_FISCAL_CONFIG.certificadoSenha)
  })

  test('classifies rejection and timeout as stable internal outcomes', async () => {
    const rejectError = Object.assign(new Error('rejected'), {
      name: 'FiscalRejectionError',
    })
    const timeoutError = Object.assign(new Error('timed out'), {
      name: 'FiscalTimeoutError',
    })

    const rejectedGateway = await createCteFiscalGatewayFixture({
      createProvider() {
        return {
          emit: async () => {
            throw rejectError
          },
          cancel: async () => ({ success: false, rawResponse: undefined }),
          testConnection: async () => ({ ok: true, message: 'ok' }),
        }
      },
    })
    const rejectedOutcome = await rejectedGateway.issue({
      config: CTE_FISCAL_CONFIG,
      command: CTE_FISCAL_COMMAND,
    })
    expect(rejectedOutcome.status).toBe('rejected')
    expect(rejectedOutcome.rejection).toMatchObject({ code: 'FISCAL_REJECTION' })

    const timeoutGateway = await createCteFiscalGatewayFixture({
      createProvider() {
        return {
          emit: async () => {
            throw timeoutError
          },
          cancel: async () => ({ success: false, rawResponse: undefined }),
          testConnection: async () => ({ ok: true, message: 'ok' }),
        }
      },
    })
    const timeoutOutcome = await timeoutGateway.issue({
      config: CTE_FISCAL_CONFIG,
      command: CTE_FISCAL_COMMAND,
    })
    expect(timeoutOutcome.status).toBe('error')
    expect(timeoutOutcome.cause).toBe('FiscalTimeoutError')
    expect(timeoutOutcome.rejection).toBeUndefined()
  })
})
