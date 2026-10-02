/* Copyright (c) 2026 Ada Technology. MIT License. */
import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import {
  PROOF_PUNCTUALITY_VALUES,
  type DriverFieldReport,
  type DriverOccurrenceType,
  type DriverOccurrenceTypesResult,
  type DriverTripSnapshot,
  type ProofPunctuality,
} from './driverTrip.types'
import { DriverTripResponseError, toDriverTripSnapshot } from './driverTripResponse.validation'
import { createIdempotencyKey } from './offlineQueue.service'

const CURRENT_TRIP_PATH = '/me/trips/current'
/** Rede presa (sinal fraco, portal cativo) não pode deixar o painel carregando para sempre. */
const OCCURRENCE_TYPES_TIMEOUT_MILLISECONDS = 10_000

/**
 * ⚠️ **Toda espera de rede tem teto, e a falta de um prendeu um comprovante em produção.** Numa
 * conexão presa — sinal fraco que abre o socket e não anda, portal cativo — o `fetch` do celular
 * nunca se resolve. A drenagem é uma por vez, com trava (`isDrainingRef`): enquanto a requisição
 * não assenta, o `onSettled` não roda, a trava não abre, e **todo** envio seguinte é engolido,
 * inclusive o "Enviar agora" do motorista. A tela segue dizendo "aguardando envio" com a rede já
 * perfeita, e só recarregar o aplicativo destrava. Medido em 02/10: entrega registrada
 * (`POST .../deliver` 201 às 12:33:42) e nenhuma requisição ao `/proof` jamais saiu do aparelho.
 *
 * Estourar o teto é **rede que não respondeu** (`OFFLINE`), não recusa: o item fica na fila e vai
 * de novo na próxima drenagem, que é o que já acontece no subsolo.
 */
const REQUEST_TIMEOUT_MILLISECONDS = 20_000
/**
 * O multipart leva a foto do canhoto, com teto de 960 KiB (`PROOF_PHOTO_MAX_BYTES`): perto de um
 * minuto num 2G de beira de estrada. O teto é generoso de propósito — ele existe contra a conexão
 * parada, não contra a conexão lenta.
 */
const UPLOAD_TIMEOUT_MILLISECONDS = 90_000
/** O refresh do token precede a requisição: sem teto aqui, o teto de baixo nunca é alcançado. */
const ACCESS_TOKEN_TIMEOUT_MILLISECONDS = 15_000

/**
 * Spec 159 (T11): a API recusa `accuracyMeters` acima de 10 km com `400` (item 4 da revisão). O
 * cliente nunca manda um valor que a API já sabe que vai recusar — precisão fora disso vira
 * ausência, exatamente como GPS desligado (ADR-0045 §3). Vale para a captura nova **e** para o que
 * já estava parado na fila offline com o valor antigo, sem teto: os dois passam por aqui.
 */
export const MAX_PROOF_ACCURACY_METERS = 10_000

export function clampProofAccuracyMeters(accuracyMeters: number | undefined): number | undefined {
  if (accuracyMeters === undefined) return undefined
  return accuracyMeters > MAX_PROOF_ACCURACY_METERS ? undefined : accuracyMeters
}

export const DRIVER_TRIP_ERROR = {
  /** A rede não respondeu. É o caso do subsolo, e ele **não** tira o item da fila. */
  OFFLINE: 'OFFLINE',
  RESPONSE_INVALID: 'RESPONSE_INVALID',
  /** Spec 209: o storage recusou o `PUT` da foto (URL vencida, assinatura) — resposta, não rede. */
  UPLOAD_FAILED: 'OCCURRENCE_UPLOAD_FAILED',
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
  /** Só o teste passa, para provar o teto sem esperar por ele; em produção vale o deste arquivo. */
  timeouts?: Readonly<{
    accessTokenMilliseconds?: number
    requestMilliseconds?: number
    uploadMilliseconds?: number
  }>
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
    /** Spec 159 RF3/RF5-RF6: posição lida no momento da captura — opcional, e nunca bloqueia o anexo. */
    accuracyMeters?: number
    /** Idempotência POR ANEXO: gerada na captura e reenviada igual — o servidor não duplica o blob. */
    attachmentKey?: string
    /** ISO — referência de horário da RF5; sem ele, a API usa o recebimento no servidor. */
    capturedAt?: string
    documentId: string
    file: File
    kind: 'photo' | 'signature'
    latitude?: number
    longitude?: number
    receiverDocument?: string
    receiverName?: string
  }) => Promise<Readonly<{ id: string; punctuality: ProofPunctuality }>>
  /**
   * Spec 082 (revisão): o snapshot inclui viagem `route_planned`, e é o motorista quem inicia o
   * trajeto. Fora de `dispatched`/`in_transit` a API recusa as escritas de campo — este é o botão
   * que abre o portão.
   */
  dispatchTrip: (input: { tripId: string }) => Promise<void>
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
  /**
   * Os tipos de rua que a empresa cadastrou — o motorista escolhe entre eles.
   *
   * ⚠️ **Nunca lança.** Falha de rede, recusa do servidor ou corpo inválido viram `{ status:
   * 'failed' }` — quem chama decide o aviso, e entregar/devolver não dependem disto (spec 157 RF5).
   */
  listOccurrenceTypes: () => Promise<DriverOccurrenceTypesResult>
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

type StopOccurrencePhotoReport = Extract<DriverFieldReport, { kind: 'stopOccurrencePhoto' }>
/** Os relatos que são um `POST` JSON só — a foto do "Deu problema" tem caminho próprio. */
type JsonFieldReport = Exclude<DriverFieldReport, StopOccurrencePhotoReport>

function reportPath(report: JsonFieldReport): string {
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

function reportBody(report: JsonFieldReport): string {
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
      if (input.attachmentKey !== undefined) form.set('attachmentKey', input.attachmentKey)
      if (input.receiverDocument !== undefined) form.set('receiverDocument', input.receiverDocument)
      if (input.receiverName !== undefined) form.set('receiverName', input.receiverName)
      if (input.latitude !== undefined) form.set('latitude', String(input.latitude))
      if (input.longitude !== undefined) form.set('longitude', String(input.longitude))
      const accuracyMeters = clampProofAccuracyMeters(input.accuracyMeters)
      if (accuracyMeters !== undefined) form.set('accuracyMeters', String(accuracyMeters))
      if (input.capturedAt !== undefined) form.set('capturedAt', input.capturedAt)

      const payload = await request({
        dependencies,
        form,
        method: 'POST',
        path: `${CURRENT_TRIP_PATH}/documents/${input.documentId}/proof`,
      })
      return toProofAttachResult(payload)
    },
    async dispatchTrip(input) {
      await request({
        body: JSON.stringify({ tripId: input.tripId }),
        dependencies,
        method: 'POST',
        path: `${CURRENT_TRIP_PATH}/dispatch`,
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
        // Um toque, uma chave: repetir o toque depois de uma falha é o conserto (spec 179 T200).
        idempotencyKey: createIdempotencyKey(),
        method: 'POST',
        path: `${CURRENT_TRIP_PATH}/documents/${input.documentId}/occurrences`,
      })
    },
    async listOccurrenceTypes() {
      /**
       * ⚠️ Falha vira **estado**, nunca exceção: rede fora do ar, recusa do servidor e corpo
       * inválido contam a mesma história para quem chama — "não sabemos os tipos agora" —, e é a
       * tela que decide como avisar. Lista vazia de verdade (empresa sem tipo de rua ativo) é um
       * fato diferente e chega como `{ status: 'loaded', types: [] }`.
       */
      try {
        const body = await request({
          dependencies,
          method: 'GET',
          path: `${CURRENT_TRIP_PATH}/occurrence-types`,
          timeoutMilliseconds: OCCURRENCE_TYPES_TIMEOUT_MILLISECONDS,
        })
        const data = (body as { readonly data?: unknown }).data
        if (!Array.isArray(data) || !data.every(isDriverOccurrenceType)) return { status: 'failed' }
        return { status: 'loaded', types: data }
      } catch {
        return { status: 'failed' }
      }
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
      if (report.kind === 'stopOccurrencePhoto') {
        await sendStopOccurrencePhoto({ dependencies, report })
        return
      }
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

/**
 * Spec 209 (D2): a foto do "Deu problema" sobe pela rota da parada e **reenvia a ocorrência** com a
 * chave dela e o anexo — a API completa o anexo da ocorrência que já subiu sem ele, uma vez. Mesmo
 * caminho da app do motorista (`apps/frontend-driver`, spec 179/209).
 */
async function sendStopOccurrencePhoto(input: {
  readonly dependencies: ClientDependencies
  readonly report: StopOccurrencePhotoReport
}): Promise<void> {
  const { dependencies, report } = input
  const stopPath = `${CURRENT_TRIP_PATH}/stops/${report.stopId}`
  const uploadsPath = `${stopPath}/occurrence-uploads`
  const upload = toOccurrenceUpload(
    await request({
      body: JSON.stringify({ mimeType: report.photo.blob.type, sizeBytes: report.photo.blob.size }),
      dependencies,
      method: 'POST',
      path: uploadsPath,
    }),
  )

  let response: Response
  try {
    // Sem `authorization`: o token da API não vai ao storage — a assinatura da URL é a credencial.
    response = await dependencies.fetch(
      new Request(upload.uploadUrl, {
        body: report.photo.blob,
        cache: 'no-store',
        headers: { 'content-type': report.photo.blob.type },
        method: 'PUT',
        signal: abortSignalWithDeadline({ milliseconds: UPLOAD_TIMEOUT_MILLISECONDS }),
      }),
    )
  } catch {
    throw offline()
  }
  if (!response.ok) {
    throw new DriverTripRequestError({
      code: DRIVER_TRIP_ERROR.UPLOAD_FAILED,
      isOffline: false,
      status: response.status,
    })
  }

  const confirmed = await request({
    dependencies,
    method: 'POST',
    path: `${uploadsPath}/${upload.id}/confirm`,
  })
  await request({
    body: JSON.stringify({
      attachmentObjectId: readDataId(confirmed),
      description: report.description,
      documentId: report.documentId,
      kind: report.occurrenceKind,
    }),
    dependencies,
    idempotencyKey: report.occurrenceKey,
    method: 'POST',
    path: `${stopPath}/occurrences`,
  })
}

function readDataRecord(payload: unknown): Record<string, unknown> {
  const data =
    typeof payload === 'object' && payload !== null
      ? (payload as { readonly data?: unknown }).data
      : undefined
  if (typeof data !== 'object' || data === null) throw invalidResponse()
  return data as Record<string, unknown>
}

function readDataId(payload: unknown): string {
  const id = readDataRecord(payload).id
  if (typeof id !== 'string') throw invalidResponse()
  return id
}

/** A URL assinada só vale em HTTPS (ou no loopback do desenvolvimento). */
function isSignedUploadUrl(value: string): boolean {
  try {
    const url = new URL(value)
    if (url.protocol === 'https:') return true
    return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  } catch {
    return false
  }
}

function toOccurrenceUpload(payload: unknown): Readonly<{ id: string; uploadUrl: string }> {
  const record = readDataRecord(payload)
  if (
    typeof record.id !== 'string' ||
    typeof record.uploadUrl !== 'string' ||
    !isSignedUploadUrl(record.uploadUrl)
  ) {
    throw invalidResponse()
  }
  return { id: record.id, uploadUrl: record.uploadUrl }
}

/** Resposta que não se deixa ler é recusa, não rede: repetir não a conserta. */
function invalidResponse(): DriverTripRequestError {
  return new DriverTripRequestError({ code: DRIVER_TRIP_ERROR.RESPONSE_INVALID, isOffline: false })
}

/** Rede que não respondeu: o item fica na fila e tenta de novo. */
function offline(): DriverTripRequestError {
  return new DriverTripRequestError({ code: DRIVER_TRIP_ERROR.OFFLINE, isOffline: true })
}

/**
 * `keycloak.updateToken()` não aceita `AbortSignal`: na conexão presa ele fica pendente para
 * sempre, e quem o espera trava **antes** de qualquer requisição sair — por isso o aparelho fica
 * silencioso em vez de dar erro. O teto é nosso, por fora. Recusa de verdade (sessão expirada)
 * continua subindo como veio: é a tela que decide reautenticar.
 */
async function getAccessTokenWithinDeadline(dependencies: ClientDependencies): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      dependencies.getAccessToken(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(offline()),
          dependencies.timeouts?.accessTokenMilliseconds ?? ACCESS_TOKEN_TIMEOUT_MILLISECONDS,
        )
      }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

/**
 * `AbortSignal.any` só existe do Chrome 116 em diante, e o aparelho do campo roda o 115
 * (SamsungBrowser 23) — a união do sinal de quem chamou com o do teto é feita à mão.
 */
function abortSignalWithDeadline(
  input: Readonly<{ milliseconds: number; signal?: AbortSignal }>,
): AbortSignal {
  const deadline = AbortSignal.timeout(input.milliseconds)
  const caller = input.signal
  if (caller === undefined) return deadline

  const controller = new AbortController()
  for (const source of [caller, deadline]) {
    if (source.aborted) {
      controller.abort()
      return controller.signal
    }
    source.addEventListener('abort', () => controller.abort(), { once: true })
  }
  return controller.signal
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
  const accessToken = await getAccessTokenWithinDeadline(input.dependencies)

  let response: Response
  try {
    response = await input.dependencies.fetch(
      new Request(`${input.dependencies.apiUrl}${input.path}`, {
        cache: 'no-store',
        headers: { authorization: `Bearer ${accessToken}` },
        method: 'GET',
        signal: abortSignalWithDeadline({ milliseconds: REQUEST_TIMEOUT_MILLISECONDS }),
      }),
    )
  } catch {
    throw offline()
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

function toProofAttachResult(
  payload: unknown,
): Readonly<{ id: string; punctuality: ProofPunctuality }> {
  const data =
    typeof payload === 'object' && payload !== null
      ? (payload as { readonly data?: unknown }).data
      : undefined
  if (typeof data !== 'object' || data === null) throw new DriverTripResponseError()

  const record = data as Record<string, unknown>
  if (
    typeof record.id !== 'string' ||
    typeof record.punctuality !== 'string' ||
    !(PROOF_PUNCTUALITY_VALUES as readonly string[]).includes(record.punctuality)
  ) {
    throw new DriverTripResponseError()
  }

  return { id: record.id, punctuality: record.punctuality as ProofPunctuality }
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
    signal?: AbortSignal
    timeoutMilliseconds?: number
  }>,
): Promise<unknown> {
  const accessToken = await getAccessTokenWithinDeadline(input.dependencies)
  const headers: Record<string, string> = { authorization: `Bearer ${accessToken}` }
  if (input.body !== undefined) headers['content-type'] = 'application/json'
  if (input.idempotencyKey !== undefined) headers['idempotency-key'] = input.idempotencyKey

  const requestInit: RequestInit = { cache: 'no-store', headers, method: input.method }
  if (input.body !== undefined) requestInit.body = input.body
  // O `content-type` do multipart carrega a fronteira, e só o próprio `fetch` sabe qual ela é.
  if (input.form !== undefined) requestInit.body = input.form
  const { timeouts } = input.dependencies
  requestInit.signal = abortSignalWithDeadline({
    milliseconds:
      input.timeoutMilliseconds ??
      (input.form === undefined
        ? (timeouts?.requestMilliseconds ?? REQUEST_TIMEOUT_MILLISECONDS)
        : (timeouts?.uploadMilliseconds ?? UPLOAD_TIMEOUT_MILLISECONDS)),
    ...(input.signal === undefined ? {} : { signal: input.signal }),
  })

  let response: Response
  try {
    response = await input.dependencies.fetch(
      new Request(`${input.dependencies.apiUrl}${input.path}`, requestInit),
    )
  } catch {
    // Rede caída: quem chamou devolve o item para a fila em vez de dizer ao motorista que falhou.
    throw offline()
  }

  let rawBody: string
  try {
    rawBody = await response.text()
  } catch {
    /** O corpo que para no meio do caminho é rede, não recusa — e abortar aqui cai neste mesmo ramo. */
    throw offline()
  }
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

function isDriverOccurrenceType(value: unknown): value is DriverOccurrenceType {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as { readonly id?: unknown; readonly name?: unknown }
  return typeof candidate.id === 'string' && typeof candidate.name === 'string'
}
