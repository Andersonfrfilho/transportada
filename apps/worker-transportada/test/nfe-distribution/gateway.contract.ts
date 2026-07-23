/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  DISTRIBUTION_CONFIG,
  createDistributionItem,
  createNfeDistributionGatewayFixture,
} from './nfe-distribution.fixture.js'

describe('NF-e distribution gateway contract', () => {
  test('pins the published fiscal provider and builds an A1-in-memory gateway without leaking certificate material', async () => {
    const packageManifest = (await Bun.file(
      new URL('../../package.json', import.meta.url),
    ).json()) as {
      readonly dependencies?: Readonly<Record<string, string>>
    }
    expect(packageManifest.dependencies?.['@adatechnology/fiscal-provider']).toBe('0.2.0')

    const calls: string[] = []
    const gatewayFactory = await createNfeDistributionGatewayFixture({
      createProvider(input) {
        calls.push(
          `provider:${input.config.model}:${input.config.environment}:${input.config.cnpj}:${input.config.uf}`,
        )
        expect(input.config.certificadoBase64).toBe('BASE64CERT')
        expect(input.config.certificadoSenha).toBe('secret-password')
        return {
          async consultarDFe(query) {
            calls.push(`consultarDFe:${query.ultNSU}`)
            return {
              itens: [
                createDistributionItem({
                  accessKey: '35190730290856000160550010000000011000000010',
                  nsu: '000000000000001',
                }),
              ],
              maxNSU: '000000000000051',
              temMais: true,
              ultNSU: '000000000000001',
            }
          },
        }
      },
    })

    const gateway = gatewayFactory.create({ config: DISTRIBUTION_CONFIG })
    await expect(
      gateway.consultarDFe({ config: DISTRIBUTION_CONFIG, ultNSU: '000000000000000' }),
    ).resolves.toEqual({
      itens: [
        createDistributionItem({
          accessKey: '35190730290856000160550010000000011000000010',
          nsu: '000000000000001',
        }),
      ],
      maxNSU: '000000000000051',
      temMais: true,
      ultNSU: '000000000000001',
    })

    expect(calls).toEqual([
      'provider:nfe-distribuicao:homologation:12345678000190:SP',
      'consultarDFe:000000000000000',
    ])
    expect(calls.join(':')).not.toContain('secret-password')
  })
})
