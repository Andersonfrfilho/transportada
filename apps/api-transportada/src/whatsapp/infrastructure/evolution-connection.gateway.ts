/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { EvolutionWhatsAppChannel } from '@adatechnology/evolution-whatsapp-provider'

import type {
  WhatsAppEvolutionGatewayPort,
  WhatsAppEvolutionProvisionerPort,
} from '../application/whatsapp-evolution.port.js'
import type { WhatsAppEvolutionWebhookGatewayPort } from '../application/whatsapp-evolution-webhook.port.js'

/**
 * Spec 281 T4: a única porta da API para o Evolution. O canal do SDK é criado por chamada, com a
 * chave aberta só durante ela; nada é guardado em campo, log ou métrica.
 */
export function createEvolutionConnectionGateway(
  dependencies: { readonly fetch?: typeof fetch } = {},
): WhatsAppEvolutionGatewayPort & WhatsAppEvolutionWebhookGatewayPort {
  const open = (input: { apiKey: string; baseUrl: string; instanceName: string }) =>
    new EvolutionWhatsAppChannel({
      apiKey: input.apiKey,
      baseUrl: input.baseUrl,
      instance: input.instanceName,
      ...(dependencies.fetch === undefined ? {} : { fetch: dependencies.fetch }),
    })

  return {
    getConnectionState: (input) => open(input).getConnectionState(),
    async getQrCode(input) {
      const qr = await open(input).getQrCode()
      return { pairingCode: qr.pairingCode, qrBase64: qr.base64 }
    },
    /** Spec 281 T6: o Evolution passa a entregar mensagens e status na URL da empresa, com o segredo no cabeçalho. */
    setWebhook: ({ headers, url, ...request }) =>
      open(request).setWebhook({ headers: { ...headers }, url }),
  }
}

const PROVISION_TIMEOUT_MILLISECONDS = 15_000

/**
 * Spec 281 T4b: cria a instância com a chave global (cabeçalho `apikey`, nunca em URL nem em log) e devolve o token dela.
 * Instância que já existe (reprovisionar após apagar a linha do banco) é lida em vez de criada de novo.
 * O formato do token varia entre versões do Evolution (`hash` texto, `hash.apikey`, `token`): lê os três.
 */
export function createEvolutionProvisioner(dependencies: {
  readonly baseUrl: string
  readonly fetch?: typeof fetch
  readonly globalApiKey: string
}): WhatsAppEvolutionProvisionerPort {
  const doFetch = dependencies.fetch ?? fetch
  const call = async (method: 'GET' | 'POST', path: string, body?: unknown) => {
    const response = await doFetch(`${dependencies.baseUrl}${path}`, {
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      headers: { apikey: dependencies.globalApiKey, 'content-type': 'application/json' },
      method,
      signal: AbortSignal.timeout(PROVISION_TIMEOUT_MILLISECONDS),
    })
    return { json: (await response.json().catch(() => null)) as unknown, status: response.status }
  }

  return {
    baseUrl: dependencies.baseUrl,
    async createInstance({ instanceName }) {
      const created = await call('POST', '/instance/create', {
        integration: 'WHATSAPP-BAILEYS',
        instanceName,
        qrcode: false,
      })
      const fromCreate = created.status < 300 ? readToken(created.json) : undefined
      if (fromCreate !== undefined) return { token: fromCreate }

      // 403/409: o nome já existe. Lê a instância existente para reaproveitar o token.
      if (created.status === 403 || created.status === 409) {
        const found = await call(
          'GET',
          `/instance/fetchInstances?instanceName=${encodeURIComponent(instanceName)}`,
        )
        const list = Array.isArray(found.json) ? (found.json as unknown[]) : []
        for (const item of list) {
          const token = readToken(item)
          if (token !== undefined) return { token }
        }
      }
      throw new Error(`evolution provisioning failed (${created.status})`)
    },
  }
}

function readToken(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const record = value as Record<string, unknown>
  const hash = record.hash
  const candidates = [
    typeof hash === 'string' ? hash : undefined,
    typeof hash === 'object' && hash !== null
      ? (hash as Record<string, unknown>).apikey
      : undefined,
    record.token,
    record.apikey,
    typeof record.instance === 'object' && record.instance !== null
      ? (record.instance as Record<string, unknown>).token
      : undefined,
  ]
  const found = candidates.find((item) => typeof item === 'string' && item !== '')
  return typeof found === 'string' ? found : undefined
}
