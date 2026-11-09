/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * Spec 313: os domínios de e-mail liberados a enviar XML de NF-e, sempre de um contratante. A API valida o domínio
 * (provedor público é recusado); aqui só se confere a forma da resposta.
 */
export type NfeXmlAllowedDomain = Readonly<{
  contractorId: null | string
  contractorName: null | string
  createdAt: string
  domain: string
  id: string
  status: 'active' | 'inactive'
}>

type Dependencies = Readonly<{
  apiUrl: string
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  getAccessToken: () => Promise<string>
}>

const PATH = '/nfe-xml-allowed-domains'

export class NfeXmlAllowedDomainRequestError extends Error {
  public constructor(public readonly code: string) {
    super(code)
  }
}

export function createNfeXmlAllowedDomainsClient(dependencies: Dependencies) {
  async function send(path: string, method: string, body?: unknown): Promise<unknown> {
    const accessToken = await dependencies.getAccessToken()
    const response = await dependencies.fetch(
      new Request(`${dependencies.apiUrl}${path}`, {
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        cache: 'no-store',
        headers: {
          authorization: `Bearer ${accessToken}`,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        method,
      }),
    )
    const payload = (await response.json().catch(() => undefined)) as unknown
    if (!response.ok) {
      throw new NfeXmlAllowedDomainRequestError(readErrorCode(payload))
    }
    return payload
  }
  return {
    async list(): Promise<readonly NfeXmlAllowedDomain[]> {
      return parseNfeXmlAllowedDomains(await send(PATH, 'GET'))
    },
    async release(input: Readonly<{ contractorId: string; domain: string }>): Promise<void> {
      await send(PATH, 'POST', { contractorId: input.contractorId, domain: input.domain })
    },
    async setStatus(input: Readonly<{ id: string; status: 'active' | 'inactive' }>): Promise<void> {
      await send(`${PATH}/${input.id}`, 'PATCH', { status: input.status })
    },
  }
}

export function parseNfeXmlAllowedDomains(body: unknown): readonly NfeXmlAllowedDomain[] {
  const data = isRecord(body) ? body.data : undefined
  if (!Array.isArray(data)) throw new Error('NFE_XML_ALLOWED_DOMAINS_RESPONSE_INVALID')
  return data.flatMap((item): NfeXmlAllowedDomain[] => {
    if (
      !isRecord(item) ||
      typeof item.id !== 'string' ||
      typeof item.domain !== 'string' ||
      typeof item.createdAt !== 'string' ||
      (item.status !== 'active' && item.status !== 'inactive')
    ) {
      return []
    }
    return [
      {
        contractorId: typeof item.contractorId === 'string' ? item.contractorId : null,
        contractorName: typeof item.contractorName === 'string' ? item.contractorName : null,
        createdAt: item.createdAt,
        domain: item.domain,
        id: item.id,
        status: item.status,
      },
    ]
  })
}

function readErrorCode(payload: unknown): string {
  const error = isRecord(payload) ? payload.error : undefined
  return isRecord(error) && typeof error.code === 'string'
    ? error.code
    : 'NFE_XML_ALLOWED_DOMAIN_REQUEST_FAILED'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
