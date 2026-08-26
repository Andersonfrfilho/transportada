/* Copyright (c) 2026 Ada Technology. MIT License. */
import { getStoredAccessToken, storeAccessToken } from './portalSession.service'

export type PortalUserProfile = Readonly<{
  email: string
  id: string
  isActive: boolean
  name: string
}>

export type PortalSession = Readonly<{
  accessToken: string
  expiresInSeconds: number
  user: PortalUserProfile
}>

export type PortalDriverAddress = Readonly<{
  city: string
  complement: string
  district: string
  number: string
  postalCode: string
  state: string
  street: string
}>

export type PortalDriverProfile = Readonly<{
  address: PortalDriverAddress
  email: string
  name: string
  phone: string
}>

export type PortalApplicationStatus = 'approved' | 'pending' | 'rejected'

export type PortalProfile = Readonly<{
  driver: PortalDriverProfile | null
  rejectionReason: string
  status: PortalApplicationStatus
}>

export type PortalDocumentType = 'cnh' | 'crlv'
export type PortalDocumentStatus = 'approved' | 'pending' | 'rejected'

export type PortalDocument = Readonly<{
  createdAt: string
  id: string
  rejectionReason: string
  status: PortalDocumentStatus
  type: PortalDocumentType
  updatedAt: string
}>

export type PortalDocumentListItem = Readonly<{
  document: PortalDocument | null
  type: PortalDocumentType
}>

export type PortalDocumentExtractedFields = Readonly<Record<string, string | number | null>>

export type PortalDocumentUploadResult = PortalDocument &
  Readonly<{ extracted: PortalDocumentExtractedFields | null }>

export class PortalRequestError extends Error {
  public readonly code: string

  public constructor(code: string, message: string) {
    super(message)
    this.name = 'PortalRequestError'
    this.code = code
  }
}

type Envelope<T> = Readonly<{ data: T }>
type ErrorEnvelope = Readonly<{ error: Readonly<{ code: string; message: string }> }>

export type PortalClient = Readonly<{
  getDocuments: () => Promise<readonly PortalDocumentListItem[]>
  getProfile: () => Promise<PortalProfile>
  login: (input: { readonly email: string; readonly password: string }) => Promise<PortalSession>
  logout: () => Promise<void>
  register: (input: {
    readonly email: string
    readonly name: string
    readonly password: string
    readonly taxId: string
  }) => Promise<PortalSession>
  uploadDocument: (input: {
    readonly bytes: Uint8Array
    readonly contentType: string
    readonly type: PortalDocumentType
  }) => Promise<PortalDocumentUploadResult>
}>

const USER_BASE_PATH = '/user'
const PORTAL_BASE_PATH = '/aggregate-portal'
const PUBLIC_ACCOUNTS_PATH = '/public/aggregate-accounts'

export function createPortalClient(dependencies: Readonly<{ apiBaseUrl: string }>): PortalClient {
  let accessToken = getStoredAccessToken()

  function setAccessToken(token: string): void {
    accessToken = token
    storeAccessToken(token)
  }

  async function parseEnvelope<T>(response: Response): Promise<T> {
    const body = (await response.json().catch(() => null)) as Envelope<T> | ErrorEnvelope | null
    if (!response.ok || body === null || !('data' in body)) {
      const error = body !== null && 'error' in body ? body.error : undefined
      throw new PortalRequestError(error?.code ?? 'PORTAL_REQUEST_FAILED', error?.message ?? 'Request failed')
    }
    return body.data
  }

  async function refreshSession(): Promise<boolean> {
    const response = await fetch(`${dependencies.apiBaseUrl}${USER_BASE_PATH}/auth/refresh`, {
      credentials: 'include',
      method: 'POST',
    })
    if (!response.ok) return false
    const session = await parseEnvelope<PortalSession>(response)
    setAccessToken(session.accessToken)
    return true
  }

  /** Um 401 tenta renovar pela sessão do cookie uma vez só — nunca entra em loop de retry. */
  async function authenticatedFetch(path: string, init: RequestInit = {}): Promise<Response> {
    const request = (): Promise<Response> =>
      fetch(`${dependencies.apiBaseUrl}${path}`, {
        ...init,
        credentials: 'include',
        headers: { ...init.headers, ...(accessToken === undefined ? {} : { authorization: `Bearer ${accessToken}` }) },
      })

    const response = await request()
    if (response.status !== 401) return response

    const refreshed = await refreshSession()
    if (!refreshed) return response
    return request()
  }

  return {
    async getDocuments() {
      const response = await authenticatedFetch(`${PORTAL_BASE_PATH}/documents`)
      return parseEnvelope<readonly PortalDocumentListItem[]>(response)
    },

    async getProfile() {
      const response = await authenticatedFetch(`${PORTAL_BASE_PATH}/me`)
      return parseEnvelope<PortalProfile>(response)
    },

    async login({ email, password }) {
      const response = await fetch(`${dependencies.apiBaseUrl}${USER_BASE_PATH}/auth/login`, {
        body: JSON.stringify({ email, password }),
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      })
      const session = await parseEnvelope<PortalSession>(response)
      setAccessToken(session.accessToken)
      return session
    },

    async logout() {
      await authenticatedFetch(`${USER_BASE_PATH}/auth/logout`, { method: 'POST' })
      accessToken = undefined
    },

    async register({ email, name, password, taxId }) {
      const response = await fetch(`${dependencies.apiBaseUrl}${PUBLIC_ACCOUNTS_PATH}`, {
        body: JSON.stringify({ email, name, password, taxId }),
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      })
      const session = await parseEnvelope<PortalSession>(response)
      setAccessToken(session.accessToken)
      return session
    },

    async uploadDocument({ bytes, contentType, type }) {
      const response = await authenticatedFetch(`${PORTAL_BASE_PATH}/documents/${type}`, {
        body: new Blob([bytes.slice()]),
        headers: { 'content-type': contentType },
        method: 'POST',
      })
      return parseEnvelope<PortalDocumentUploadResult>(response)
    },
  }
}
