/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { WhatsAppEvolutionBaseUrlRejectedError } from './whatsapp-evolution.error.js'

/** Rede privada do próprio Railway: o Evolution do ambiente fala com a API sem sair para a internet. */
const PRIVATE_NETWORK_SUFFIX = '.railway.internal'

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/u

/**
 * Spec 281 T4: o endereço do Evolution é digitado pelo dono e a **API** faz a chamada, então ele é
 * superfície de SSRF. A regra é lista fechada: origem pura (sem usuário, caminho, consulta), `https`
 * em host público, ou `http` só na rede privada do Railway. IP literal, `localhost`, rede privada,
 * link-local e o endereço de metadados da nuvem são recusados. ⚠️ Não resolve DNS: um nome público
 * que aponte para rede interna é risco que o roteamento de saída do ambiente precisa cobrir.
 */
export function normalizeEvolutionBaseUrl(raw: string): string {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    throw new WhatsAppEvolutionBaseUrlRejectedError()
  }
  const isPure =
    url.username === '' &&
    url.password === '' &&
    (url.pathname === '/' || url.pathname === '') &&
    url.search === '' &&
    url.hash === ''
  if (!isPure) throw new WhatsAppEvolutionBaseUrlRejectedError()

  const host = url.hostname.toLowerCase()
  const isPrivateNetwork =
    host.endsWith(PRIVATE_NETWORK_SUFFIX) && host.length > PRIVATE_NETWORK_SUFFIX.length
  if (url.protocol === 'http:' && !isPrivateNetwork)
    throw new WhatsAppEvolutionBaseUrlRejectedError()
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new WhatsAppEvolutionBaseUrlRejectedError()
  }
  if (!isPrivateNetwork && !isPublicHostname(host))
    throw new WhatsAppEvolutionBaseUrlRejectedError()

  return url.origin
}

function isPublicHostname(host: string): boolean {
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return false
  if (host.includes(':') || host.startsWith('[')) return false
  const ipv4 = IPV4.exec(host)
  if (ipv4 !== null) return false
  return host.includes('.')
}
