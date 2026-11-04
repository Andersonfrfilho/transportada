/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { EvolutionWhatsAppChannel } from '@adatechnology/evolution-whatsapp-provider'

import type {
  EvolutionGroup,
  WhatsAppEvolutionGatewayPort,
  WhatsAppEvolutionProvisionerPort,
} from '../application/whatsapp-evolution.port.js'
import type {
  EvolutionGroupDirectoryGatewayPort,
  EvolutionGroupParticipant,
} from '../application/evolution-group-identity.service.js'
import type { WhatsAppEvolutionWebhookGatewayPort } from '../application/whatsapp-evolution-webhook.port.js'
import { parseJid } from '../domain/evolution-group-message.policy.js'

/**
 * Spec 281 T4: a única porta da API para o Evolution. O canal do SDK é criado por chamada, com a
 * chave aberta só durante ela; nada é guardado em campo, log ou métrica.
 */
export function createEvolutionConnectionGateway(
  dependencies: { readonly fetch?: typeof fetch } = {},
): EvolutionGroupDirectoryGatewayPort &
  WhatsAppEvolutionGatewayPort &
  WhatsAppEvolutionWebhookGatewayPort {
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
    async getOwnerNumber(input) {
      const response = await (dependencies.fetch ?? fetch)(
        `${input.baseUrl}/instance/fetchInstances?instanceName=${encodeURIComponent(input.instanceName)}`,
        {
          headers: { apikey: input.apiKey },
          method: 'GET',
          signal: AbortSignal.timeout(OWNER_TIMEOUT_MILLISECONDS),
        },
      )
      if (response.status >= 300) return null
      return readOwnerNumber((await response.json().catch(() => null)) as unknown)
    },
    /** Spec 281 (adendo): `DELETE /instance/logout/{instância}` com a chave da própria instância. */
    async logout(input) {
      const response = await (dependencies.fetch ?? fetch)(
        `${input.baseUrl}/instance/logout/${encodeURIComponent(input.instanceName)}`,
        {
          headers: { apikey: input.apiKey },
          method: 'DELETE',
          signal: AbortSignal.timeout(OWNER_TIMEOUT_MILLISECONDS),
        },
      )
      // 400/404: a instância já está desconectada; o estado final é o mesmo que se pediu.
      if (response.status >= 500) throw new Error(`evolution logout failed (${response.status})`)
    },
    /** Spec 292 T1: `GET /group/fetchAllGroups/{instância}?getParticipants=false`; falha de rede ou status ≥ 300 lança. */
    async listGroups(input) {
      const response = await (dependencies.fetch ?? fetch)(
        `${input.baseUrl}/group/fetchAllGroups/${encodeURIComponent(input.instanceName)}?getParticipants=false`,
        {
          headers: { apikey: input.apiKey },
          method: 'GET',
          signal: AbortSignal.timeout(GROUPS_TIMEOUT_MILLISECONDS),
        },
      )
      if (response.status >= 300)
        throw new Error(`evolution fetchAllGroups failed (${response.status})`)
      return readGroups((await response.json().catch(() => null)) as unknown)
    },
    /**
     * Spec 292 T3: `GET /group/participants/{instância}?groupJid=…`, para traduzir `@lid` em número.
     * Falha de rede ou status ≥ 300 lança.
     */
    async listGroupParticipants({ groupJid, ...input }) {
      const response = await (dependencies.fetch ?? fetch)(
        `${input.baseUrl}/group/participants/${encodeURIComponent(input.instanceName)}?groupJid=${encodeURIComponent(groupJid)}`,
        {
          headers: { apikey: input.apiKey },
          method: 'GET',
          signal: AbortSignal.timeout(GROUPS_TIMEOUT_MILLISECONDS),
        },
      )
      if (response.status >= 300)
        throw new Error(`evolution group participants failed (${response.status})`)
      return readGroupParticipants((await response.json().catch(() => null)) as unknown)
    },
    /** Spec 281 T6: o Evolution passa a entregar mensagens e status na URL da empresa, com o segredo no cabeçalho. */
    setWebhook: ({ headers, url, ...request }) =>
      open(request).setWebhook({ headers: { ...headers }, url }),
  }
}

const PROVISION_TIMEOUT_MILLISECONDS = 15_000
const OWNER_TIMEOUT_MILLISECONDS = 10_000
const GROUPS_TIMEOUT_MILLISECONDS = 30_000
const GROUP_JID_PATTERN = /^[0-9]+(?:-[0-9]+)?@g\.us$/u

/** Só o que é grupo de verdade (`…@g.us`), sem repetição, em ordem alfabética do nome; o resto da resposta é descartado. */
export function readGroups(value: unknown): readonly EvolutionGroup[] {
  if (!Array.isArray(value)) return []
  const byJid = new Map<string, EvolutionGroup>()
  for (const item of value as unknown[]) {
    if (typeof item !== 'object' || item === null) continue
    const record = item as Record<string, unknown>
    const id = record.id
    if (typeof id !== 'string' || !GROUP_JID_PATTERN.test(id)) continue
    const subject = typeof record.subject === 'string' ? record.subject.trim() : ''
    byJid.set(id, { groupJid: id, name: subject === '' ? id : subject })
  }
  return [...byJid.values()].sort((left, right) =>
    left.name.localeCompare(right.name, 'pt-BR', { sensitivity: 'base' }),
  )
}

/**
 * Spec 292 T3: cada participante do grupo vira o par `@lid` ↔ número (só dígitos). O formato muda entre
 * versões do Evolution/Baileys: o `id` pode ser o `@lid` (com o número em `phoneNumber`/`jid`/`pn`) ou o
 * número (com o `@lid` em `lid`). Lê todos os campos e classifica cada um pelo sufixo.
 */
export function readGroupParticipants(value: unknown): readonly EvolutionGroupParticipant[] {
  const record =
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
  const list = Array.isArray(value)
    ? (value as unknown[])
    : Array.isArray(record.participants)
      ? (record.participants as unknown[])
      : []
  const participants: EvolutionGroupParticipant[] = []
  for (const item of list) {
    if (typeof item !== 'object' || item === null) continue
    const fields = item as Record<string, unknown>
    let lid: null | string = null
    let number: null | string = null
    for (const candidate of [fields.id, fields.lid, fields.phoneNumber, fields.jid, fields.pn]) {
      const parsed = parseJid(candidate)
      if (parsed?.server === 'lid') lid ??= parsed.digits
      else if (parsed?.server === 'user') number ??= parsed.digits
    }
    if (lid !== null || number !== null) participants.push({ lid, number })
  }
  return participants
}

/** `ownerJid` ("5516…@s.whatsapp.net") da instância; versões antigas usam `owner`. Só dígitos, ou `null`. */
export function readOwnerNumber(value: unknown): null | string {
  const list = Array.isArray(value) ? (value as unknown[]) : [value]
  for (const item of list) {
    if (typeof item !== 'object' || item === null) continue
    const record = item as Record<string, unknown>
    const instance =
      typeof record.instance === 'object' && record.instance !== null
        ? (record.instance as Record<string, unknown>)
        : {}
    for (const candidate of [record.ownerJid, record.owner, instance.owner, instance.ownerJid]) {
      if (typeof candidate !== 'string') continue
      const digits = candidate.split('@')[0]?.replace(/\D/gu, '') ?? ''
      if (digits.length >= 10) return digits
    }
  }
  return null
}

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
