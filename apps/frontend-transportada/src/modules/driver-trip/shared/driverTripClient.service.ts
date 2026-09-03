/* Copyright (c) 2026 Ada Technology. MIT License. */
import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import type {
  DriverFieldReport,
  DriverOccurrenceType,
  DriverTripSnapshot,
} from './driverTrip.types'
import { DriverTripResponseError, toDriverTripSnapshot } from './driverTripResponse.validation'

const CURRENT_TRIP_PATH = '/me/trips/current'

export const DRIVER_TRIP_ERROR = {
  /** A rede não respondeu. É o caso do subsolo, e ele **não** tira o item da fila. */
  OFFLINE: 'OFFLINE',
  RESPONSE_INVALID: 'RESPONSE_INVALID',
} as const

export class DriverTripRequestError extends Error {
  public readonly code: string
  /** `true` só quando a rede falhou — recusa do servidor é resposta, e resposta não se repete. */
  public readonly isOffline: boolean
  /** O status HTTP da recusa — a tela de pendentes imprime `status + código` como causa legível. */
  public readonly status: number | undefined

  public constructor(input: { code: string; isOffline: boolean; status?: number }) {
    super(input.code)
    this.code = input.code
    this.isOffline = input.isOffline
    this.status = input.status
    this.name = 'DriverTripRequestError'
  }
}

type ClientDependencies = Readonly<{
  apiUrl: string
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  getAccessToken: () => Promise<string>
}>

export type DriverTripDocumentFile = Readonly<{ blob: Blob; fileName: string }>

export type DriverTripManifestDownload = Readonly<{
  accessKey: string
  downloadUrl: string
  expiresAt: string
}>

export type DriverTripClient = Readonly<{
  /**
   * O comprovante **não passa pela fila**: ele anexa a uma entrega que já foi confirmada, e falhar
   * aqui não desfaz nada. Enfileirar arquivo é outro problema — tamanho, expurgo, cota do aparelho —
   * e está declarado como pendência em vez de resolvido pela metade.
   */
  attachProof: (input: {
    documentId: string
    file: File
    kind: 'photo' | 'signature'
    receiverDocument?: string
    receiverName?: string
  }) => Promise<void>
  /**
   * Spec 079: o que aconteceu **sem** a carga voltar. Não passa pela fila de relatos: ao contrário
   * de entregar e devolver, isto não muda o estado da nota — falhar aqui não deixa a viagem num
   * estado que ninguém sabe destravar, e repetir o toque é o conserto.
   */
  registerDocumentOccurrence: (input: {
    documentId: string
    occurrenceTypeId: string
    productCode: string
  }) => Promise<void>
  /** Os tipos de rua que a empresa cadastrou — o motorista escolhe entre eles. */
  listOccurrenceTypes: () => Promise<readonly DriverOccurrenceType[]>
  /**
   * O DAMDFE vem como **bytes**, não como URL: numa barreira o motorista abre o papel, e uma URL
   * assinada de cinco minutos que expirou no bolso não abre nada.
   */
  readManifestDamdfe: (manifestId: string) => Promise<DriverTripDocumentFile>
  /** Já o XML sai por URL assinada — ele existe para ser repassado, não para ser lido na tela. */
  readManifestXml: (manifestId: string) => Promise<DriverTripManifestDownload>
  readCurrent: () => Promise<DriverTripSnapshot>
  send: (report: DriverFieldReport) => Promise<void>
}>

function reportPath(report: DriverFieldReport): string {
  switch (report.kind) {
    case 'arrive':
      return `${CURRENT_TRIP_PATH}/stops/${report.stopId}/arrive`
    case 'deliver':
      return `${CURRENT_TRIP_PATH}/documents/${report.documentId}/deliver`
    case 'return':
      return `${CURRENT_TRIP_PATH}/documents/${report.documentId}/return`
    case 'occurrence':
      return `${CURRENT_TRIP_PATH}/stops/${report.stopId}/occurrences`
  }
}

function reportBody(report: DriverFieldReport): string {
  switch (report.kind) {
    case 'arrive':
    case 'deliver':
      return JSON.stringify({ location: report.location })
    case 'return':
      return JSON.stringify({ location: report.location, reason: report.reason })
    case 'occurrence':
      return JSON.stringify({
        description: report.description,
        documentId: report.documentId,
        kind: report.occurrenceKind,
      })
  }
}

export function createDriverTripClient(dependencies: ClientDependencies): DriverTripClient {
  return {
    async attachProof(input) {
      const form = new FormData()
      form.set('file', input.file)
      form.set('kind', input.kind)
      if (input.receiverDocument !== undefined) form.set('receiverDocument', input.receiverDocument)
      if (input.receiverName !== undefined) form.set('receiverName', input.receiverName)

      await request({
        dependencies,
        form,
        method: 'POST',
        path: `${CURRENT_TRIP_PATH}/documents/${input.documentId}/proof`,
      })
    },
    async registerDocumentOccurrence(input) {
      await request({
        body: JSON.stringify({
          note: '',
          occurrenceTypeId: input.occurrenceTypeId,
          productCode: input.productCode,
        }),
        dependencies,
        method: 'POST',
        path: `${CURRENT_TRIP_PATH}/documents/${input.documentId}/occurrences`,
      })
    },
    async listOccurrenceTypes() {
      const body = await request({
        dependencies,
        method: 'GET',
        path: '/company-settings/occurrence-types',
      })

      /**
       * ⚠️ Corpo estranho vira **lista vazia**, nunca exceção: sem tipo o botão fica sem opção, e o
       * motorista segue entregando e devolvendo — que é o que não pode parar por causa de um
       * cadastro que não carregou.
       */
      const data = (body as { readonly data?: unknown }).data
      return Array.isArray(data) ? (data as readonly DriverOccurrenceType[]) : []
    },
    async readManifestDamdfe(manifestId) {
      return requestFile({
        dependencies,
        fallbackFileName: 'damdfe.pdf',
        path: `${CURRENT_TRIP_PATH}/manifests/${manifestId}/damdfe`,
      })
    },
    async readManifestXml(manifestId) {
      const payload = await request({
        dependencies,
        method: 'GET',
        path: `${CURRENT_TRIP_PATH}/manifests/${manifestId}`,
      })
      return toManifestDownload(payload)
    },
    async readCurrent() {
      const payload = await request({ dependencies, method: 'GET', path: CURRENT_TRIP_PATH })
      return toDriverTripSnapshot(payload)
    },
    async send(report) {
      await request({
        body: reportBody(report),
        dependencies,
        idempotencyKey: report.idempotencyKey,
        method: 'POST',
        path: reportPath(report),
      })
    },
  }
}

export function getDriverTripClient(): DriverTripClient {
  return createDriverTripClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (input, init) => fetch(input, init),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}

/** O nome do arquivo é o que o servidor mandou: é ele que carrega a chave de acesso. */
async function requestFile(
  input: Readonly<{
    dependencies: ClientDependencies
    fallbackFileName: string
    path: string
  }>,
): Promise<DriverTripDocumentFile> {
  const accessToken = await input.dependencies.getAccessToken()

  let response: Response
  try {
    response = await input.dependencies.fetch(
      new Request(`${input.dependencies.apiUrl}${input.path}`, {
        cache: 'no-store',
        headers: { authorization: `Bearer ${accessToken}` },
        method: 'GET',
      }),
    )
  } catch {
    throw new DriverTripRequestError({ code: DRIVER_TRIP_ERROR.OFFLINE, isOffline: true })
  }

  if (!response.ok) {
    let payload: unknown = {}
    try {
      payload = JSON.parse(await response.text()) as unknown
    } catch {
      payload = {}
    }
    throw new DriverTripRequestError({ code: readErrorCode(payload), isOffline: false })
  }

  return {
    blob: await response.blob(),
    fileName: readFileName(response.headers.get('content-disposition'), input.fallbackFileName),
  }
}

function readFileName(disposition: string | null, fallback: string): string {
  const match = disposition?.match(/filename="([^"]+)"/u)
  return match?.[1] ?? fallback
}

function toManifestDownload(payload: unknown): DriverTripManifestDownload {
  const data =
    typeof payload === 'object' && payload !== null
      ? (payload as { readonly data?: unknown }).data
      : undefined
  if (typeof data !== 'object' || data === null) throw new DriverTripResponseError()

  const record = data as Record<string, unknown>
  if (
    typeof record.accessKey !== 'string' ||
    typeof record.downloadUrl !== 'string' ||
    typeof record.expiresAt !== 'string'
  ) {
    throw new DriverTripResponseError()
  }

  return {
    accessKey: record.accessKey,
    downloadUrl: record.downloadUrl,
    expiresAt: record.expiresAt,
  }
}

async function request(
  input: Readonly<{
    body?: string
    dependencies: ClientDependencies
    form?: FormData
    idempotencyKey?: string
    method: 'GET' | 'POST'
    path: string
  }>,
): Promise<unknown> {
  const accessToken = await input.dependencies.getAccessToken()
  const headers: Record<string, string> = { authorization: `Bearer ${accessToken}` }
  if (input.body !== undefined) headers['content-type'] = 'application/json'
  if (input.idempotencyKey !== undefined) headers['idempotency-key'] = input.idempotencyKey

  const requestInit: RequestInit = { cache: 'no-store', headers, method: input.method }
  if (input.body !== undefined) requestInit.body = input.body
  // O `content-type` do multipart carrega a fronteira, e só o próprio `fetch` sabe qual ela é.
  if (input.form !== undefined) requestInit.body = input.form

  let response: Response
  try {
    response = await input.dependencies.fetch(
      new Request(`${input.dependencies.apiUrl}${input.path}`, requestInit),
    )
  } catch {
    // Rede caída: quem chamou devolve o item para a fila em vez de dizer ao motorista que falhou.
    throw new DriverTripRequestError({ code: DRIVER_TRIP_ERROR.OFFLINE, isOffline: true })
  }

  const rawBody = await response.text()
  let payload: unknown
  try {
    payload = rawBody.length === 0 ? {} : (JSON.parse(rawBody) as unknown)
  } catch {
    throw new DriverTripRequestError({
      code: DRIVER_TRIP_ERROR.RESPONSE_INVALID,
      isOffline: false,
    })
  }

  /**
   * O código sobe como veio: é ele que a tela traduz. `TRIP_DOCUMENT_NOT_REACHABLE` vira "esta nota
   * saiu da sua viagem", e trocá-lo por um genérico apagaria a única explicação que o motorista tem.
   */
  if (!response.ok) {
    throw new DriverTripRequestError({
      code: readErrorCode(payload),
      isOffline: false,
      status: response.status,
    })
  }

  return payload
}

function readErrorCode(payload: unknown): string {
  if (typeof payload !== 'object' || payload === null) return 'REQUEST_FAILED'
  const error = (payload as { readonly error?: { readonly code?: unknown } }).error
  return typeof error?.code === 'string' ? error.code : 'REQUEST_FAILED'
}
