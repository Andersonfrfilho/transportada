/* Cópia por valor de apps/frontend-transportada/src/modules/driver-trip/shared/driverTripClient.service.ts (ADR-0075 §7). */
/* Copyright (c) 2026 Ada Technology. MIT License. */
import { getDriverEnvironment } from '@/modules/shared/environment.config'
import {
  getKeycloakAuthProvider,
  isIdentityError,
} from '@/modules/shared/KeycloakAuthProvider.provider'

import {
  isDriverOccurrenceType,
  PROOF_PUNCTUALITY_VALUES,
  type DriverFieldReport,
  type DriverOccurrenceKind,
  type DriverOccurrenceTypesResult,
  type DriverTripSnapshot,
  type ProofPunctuality,
  type StopOccurrenceReportReference,
} from './driverTrip.types'
import { DriverTripResponseError, toDriverTripSnapshot } from './driverTripResponse.validation'
import { LATE_REGISTRATION_FIELD_ENABLED } from './lateRegistration.constant'
import { shouldSendLateRegistration } from './lateRegistration.service'
import type { AttachmentSendOutcome } from './offlineAttachments.service'
import type { DriverTripErrorDetail } from './offlineQueue.service'

const CURRENT_TRIP_PATH = '/me/trips/current'
const LOCATION_CONSENT_PATH = '/me/location-consent'
/** Rede presa (sinal fraco, portal cativo) não pode deixar o painel carregando para sempre. */
const OCCURRENCE_TYPES_TIMEOUT_MILLISECONDS = 10_000

/**
 * ⚠️ **Toda espera de rede tem teto, e a falta de um prendeu um comprovante em produção.** Numa
 * conexão presa — sinal fraco que abre o socket e não anda, portal cativo — o `fetch` do celular
 * nunca se resolve. A drenagem é uma mutação única com trava (`createDrainScheduler`): enquanto a
 * requisição não assenta, o `onSettled` não roda, a trava não abre, e **todo** envio seguinte é
 * engolido, inclusive o "Enviar agora" do motorista. A tela segue dizendo "aguardando envio" com a
 * rede já perfeita, e só recarregar o aplicativo destrava. Medido em 02/10: entrega registrada
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
  /** Spec 179: o storage recusou o `PUT` da foto (URL vencida, assinatura) — resposta, não rede. */
  UPLOAD_FAILED: 'OCCURRENCE_UPLOAD_FAILED',
} as const

export class DriverTripRequestError extends Error {
  public readonly code: string
  /**
   * Spec 206 D9/RF8b: o `409 TRIP_HAS_STOP_EN_ROUTE` que o drenar de um item ANTIGO devolve — a
   * tela não viu a parada a caminho (outro aparelho, ou item enfileirado antes do snapshot). Sem
   * isto, o motivo/atalho da fila (RF8b) não teria como nomear a parada certa nesse caso — o cálculo
   * local (`resolveEnRouteStopId`) não sabe do que aconteceu em outro aparelho.
   */
  public readonly details: readonly DriverTripErrorDetail[] | undefined
  /** `true` só quando a rede falhou — recusa do servidor é resposta, e resposta não se repete. */
  public readonly isOffline: boolean
  /** O status HTTP da recusa — a tela de pendentes imprime `status + código` como causa legível. */
  public readonly status: number | undefined

  public constructor(input: {
    code: string
    details?: readonly DriverTripErrorDetail[]
    isOffline: boolean
    status?: number
  }) {
    super(input.code)
    this.code = input.code
    this.details = input.details
    this.isOffline = input.isOffline
    this.status = input.status
    this.name = 'DriverTripRequestError'
  }
}

/**
 * Quem falhou foi o caminho, não o item: gateway fora (502/503/504), limite de taxa (429) e tempo
 * esgotado (408). ⚠️ O 500 fica de fora — `failed-network` para a drenagem inteira, e um item que
 * derruba o servidor travaria todos os de trás por até 7 dias.
 */
const RETRYABLE_STATUSES: ReadonlySet<number> = new Set([408, 429, 502, 503, 504])

export function isRetryableStatus(status: number | undefined): boolean {
  return status !== undefined && RETRYABLE_STATUSES.has(status)
}

/**
 * O resultado de um envio da fila. Rede caída **e** erro de identidade (`IDENTITY_*`: refresh sem
 * transporte, sessão vencida) são "tente depois" — o item fica drenável, sem causa de recusa, e sobe
 * depois de a rede ou a sessão voltarem. Só a resposta do servidor recusa.
 */
export function toAttachmentSendOutcome(error: unknown): AttachmentSendOutcome {
  if (error instanceof DriverTripRequestError && error.isOffline) return { kind: 'failed-network' }
  if (error instanceof DriverTripRequestError && isRetryableStatus(error.status)) {
    return { kind: 'failed-network' }
  }
  if (isIdentityError(error)) return { kind: 'failed-network' }
  const cause =
    error instanceof DriverTripRequestError
      ? error.status !== undefined
        ? `${error.status} ${error.code}`
        : error.code
      : 'REQUEST_FAILED'
  const details = error instanceof DriverTripRequestError ? error.details : undefined
  return { cause, ...(details === undefined ? {} : { details }), kind: 'rejected' }
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
    kind: 'cargo' | 'photo' | 'signature'
    /** Pedido do usuário (25/09): mesma marca do `deliver`/`return`, atrás do mesmo interruptor. */
    lateRegistration?: boolean
    latitude?: number
    longitude?: number
    /** Spec 193 D1: quem recebeu, em relação ao destinatário, e o detalhe curto. */
    receivedBy?: string
    receivedByDetail?: string
    receiverDocument?: string
    receiverName?: string
    /** Spec 220 RF17: a miniatura do comprovante — opcional, nunca condição para o anexo subir. */
    thumbnail?: File
  }) => Promise<Readonly<{ id: string; punctuality: ProofPunctuality }>>
  /**
   * Os tipos de rua que a empresa cadastrou — o motorista escolhe entre eles.
   *
   * ⚠️ **Nunca lança.** Falha de rede, recusa do servidor ou corpo inválido viram `{ status:
   * 'failed' }` — quem chama decide o aviso, e entregar/devolver não dependem disto (spec 157 RF5).
   *
   * Spec 218 RF-B2 (follow-up): a exceção por contratante/destinatário já chega resolvida em
   * `DriverTripDocument.occurrenceTypes`, embutida no snapshot — esta rota continua servindo só a
   * lista geral da empresa (os tipos de parada, sem contratante/destinatário único para resolver
   * contra). Nunca manda CPF/CNPJ como parâmetro: security.md §3 proíbe dado pessoal em URL.
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
  /**
   * Pedido do usuário (01/10): o canhoto que o servidor já tem, por URL assinada de 5 min. A
   * miniatura guardada no aparelho responde primeiro; esta leitura é a saída para a foto que não
   * passou por este celular, ou passou faz mais de 24 h.
   */
  readDeliveryProofs: (documentId: string) => Promise<readonly DriverDeliveryProof[]>
  /** Spec 189 T7.5: o consentimento de posição — `null` é "nunca consentiu" ou "retirou". */
  readLocationConsent: () => Promise<LocationConsent>
  send: (report: DriverFieldReport) => Promise<void>
  /** A posição ao vivo. Sem id de viagem: o servidor resolve a viagem do motorista (ADR-0050 §5). */
  sendLocation: (
    position: Readonly<{ latitude: string; longitude: string }>,
    signal: AbortSignal,
  ) => Promise<void>
  setLocationConsent: (accepted: boolean) => Promise<LocationConsent>
}>

/** O que a rua usa do comprovante: a imagem e o que ela é. Nada de quem recebeu — isso é do painel. */
export type DriverDeliveryProof = Readonly<{
  downloadUrl: string
  id: string
  kind: 'cargo' | 'photo' | 'signature'
  thumbnailUrl?: string
}>

export type LocationConsent = Readonly<{ acceptedAt: string | null }>

type DocumentOccurrenceReport = Extract<DriverFieldReport, { kind: 'documentOccurrence' }>
type StopOccurrencePhotoReport = Extract<DriverFieldReport, { kind: 'stopOccurrencePhoto' }>
/** Spec 193 D7: o PATCH `.../proof/receiver` — tem caminho e método próprios, fora do POST comum. */
type ProofReceiverReport = Extract<DriverFieldReport, { kind: 'proofReceiver' }>
/** Os relatos que são um `POST` JSON só — os que levam foto ou usam outro método têm caminho próprio. */
type JsonFieldReport = Exclude<
  DriverFieldReport,
  DocumentOccurrenceReport | StopOccurrencePhotoReport | ProofReceiverReport
>

/** Spec 206: exportada — `stop-departure.contract.ts` prova o caminho de `depart`/`cancelDeparture`. */
export function reportPath(report: JsonFieldReport): string {
  switch (report.kind) {
    case 'arrive':
      return `${CURRENT_TRIP_PATH}/stops/${report.stopId}/arrive`
    case 'depart':
      return `${CURRENT_TRIP_PATH}/stops/${report.stopId}/depart`
    case 'cancelDeparture':
      return `${CURRENT_TRIP_PATH}/stops/${report.stopId}/cancel-departure`
    case 'dispatch':
      return `${CURRENT_TRIP_PATH}/dispatch`
    case 'deliver':
      return `${CURRENT_TRIP_PATH}/documents/${report.documentId}/deliver`
    case 'return':
      return `${CURRENT_TRIP_PATH}/documents/${report.documentId}/return`
    case 'occurrence':
      return `${CURRENT_TRIP_PATH}/stops/${report.stopId}/occurrences`
  }
}

/**
 * ⚠️ `lateRegistration` só entra quando `LATE_REGISTRATION_FIELD_ENABLED` ligar: a API ainda recusa
 * a chave (schemas `.strict()`, 400). Exportada para o contrato provar que o corpo sai igual ao de
 * hoje enquanto a constante estiver desligada.
 */
export function reportBody(report: JsonFieldReport): string {
  switch (report.kind) {
    case 'arrive':
      return JSON.stringify({ location: report.location })
    case 'depart':
    case 'cancelDeparture':
      return JSON.stringify({ location: report.location, tappedAt: report.tappedAt })
    case 'dispatch':
      return JSON.stringify({ tripId: report.tripId })
    case 'deliver':
      return JSON.stringify({
        location: report.location,
        ...(shouldSendLateRegistration({
          isFieldEnabled: LATE_REGISTRATION_FIELD_ENABLED,
          lateRegistration: report.lateRegistration,
        })
          ? { lateRegistration: true }
          : {}),
      })
    case 'return':
      return JSON.stringify({
        location: report.location,
        reason: report.reason,
        ...(shouldSendLateRegistration({
          isFieldEnabled: LATE_REGISTRATION_FIELD_ENABLED,
          lateRegistration: report.lateRegistration,
        })
          ? { lateRegistration: true }
          : {}),
      })
    case 'occurrence':
      return JSON.stringify({
        description: report.description,
        documentId: report.documentId,
        ...stopOccurrenceReference(report),
      })
  }
}

/**
 * Spec 218 D2: o tipo do catálogo quando o item o tem; o item gravado antes da troca sai com o
 * valor fixo — a API aceita os dois, nunca os dois juntos.
 */
function stopOccurrenceReference(
  report: StopOccurrenceReportReference,
): Readonly<{ kind: DriverOccurrenceKind } | { occurrenceTypeId: string }> {
  return report.occurrenceTypeId === undefined
    ? { kind: report.occurrenceKind }
    : { occurrenceTypeId: report.occurrenceTypeId }
}

export function createDriverTripClient(dependencies: ClientDependencies): DriverTripClient {
  return {
    async attachProof(input) {
      const form = new FormData()
      form.set('file', input.file)
      form.set('kind', input.kind)
      if (input.thumbnail !== undefined) form.set('thumbnail', input.thumbnail)
      if (input.attachmentKey !== undefined) form.set('attachmentKey', input.attachmentKey)
      if (input.receivedBy !== undefined) form.set('receivedBy', input.receivedBy)
      if (input.receivedByDetail !== undefined) form.set('receivedByDetail', input.receivedByDetail)
      if (input.receiverDocument !== undefined) form.set('receiverDocument', input.receiverDocument)
      if (input.receiverName !== undefined) form.set('receiverName', input.receiverName)
      if (input.latitude !== undefined) form.set('latitude', String(input.latitude))
      if (input.longitude !== undefined) form.set('longitude', String(input.longitude))
      const accuracyMeters = clampProofAccuracyMeters(input.accuracyMeters)
      if (accuracyMeters !== undefined) form.set('accuracyMeters', String(accuracyMeters))
      if (input.capturedAt !== undefined) form.set('capturedAt', input.capturedAt)
      if (
        shouldSendLateRegistration({
          isFieldEnabled: LATE_REGISTRATION_FIELD_ENABLED,
          lateRegistration: input.lateRegistration,
        })
      ) {
        form.set('lateRegistration', 'true')
      }

      const payload = await request({
        dependencies,
        form,
        method: 'POST',
        path: `${CURRENT_TRIP_PATH}/documents/${input.documentId}/proof`,
      })
      return toProofAttachResult(payload)
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
    async readDeliveryProofs(documentId) {
      const payload = await request({
        dependencies,
        method: 'GET',
        path: `${CURRENT_TRIP_PATH}/documents/${documentId}/proof`,
      })
      return toDriverDeliveryProofs(payload)
    },
    async readLocationConsent() {
      const payload = await request({ dependencies, method: 'GET', path: LOCATION_CONSENT_PATH })
      return toLocationConsent(payload)
    },
    async sendLocation(position, signal) {
      await request({
        body: JSON.stringify(position),
        dependencies,
        method: 'POST',
        path: `${CURRENT_TRIP_PATH}/location`,
        signal,
      })
    },
    async setLocationConsent(accepted) {
      const payload = await request({
        body: JSON.stringify({ accepted }),
        dependencies,
        method: 'PUT',
        path: LOCATION_CONSENT_PATH,
      })
      return toLocationConsent(payload)
    },
    async send(report) {
      if (report.kind === 'documentOccurrence') {
        await sendDocumentOccurrence({ dependencies, report })
        return
      }
      if (report.kind === 'stopOccurrencePhoto') {
        await sendStopOccurrencePhoto({ dependencies, report })
        return
      }
      if (report.kind === 'proofReceiver') {
        await request({
          body: JSON.stringify(report.fields),
          dependencies,
          idempotencyKey: report.idempotencyKey,
          method: 'PATCH',
          path: `${CURRENT_TRIP_PATH}/documents/${report.documentId}/proof/receiver`,
        })
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
 * Spec 179 (RF2/T303): a foto sobe **antes** do registro, no mesmo `send` — a API recusa tipo
 * `required` sem anexo. Rede caída em qualquer passo é "tente depois": o item fica na fila e o
 * reenvio pede uma URL nova (a anterior vence em minutos); o registro casa pela chave do toque.
 */
async function sendDocumentOccurrence(input: {
  readonly dependencies: ClientDependencies
  readonly report: DocumentOccurrenceReport
}): Promise<void> {
  const { dependencies, report } = input
  const attachmentObjectId =
    report.photo === null
      ? undefined
      : await uploadOccurrencePhoto({
          dependencies,
          photo: report.photo.blob,
          uploadsPath: `${CURRENT_TRIP_PATH}/documents/${report.documentId}/occurrence-uploads`,
        })

  await request({
    body: JSON.stringify({
      ...(attachmentObjectId === undefined ? {} : { attachmentObjectId }),
      note: report.note,
      occurrenceTypeId: report.occurrenceTypeId,
      productCode: report.productCode,
    }),
    dependencies,
    idempotencyKey: report.idempotencyKey,
    method: 'POST',
    path: `${CURRENT_TRIP_PATH}/documents/${report.documentId}/occurrences`,
  })
}

/**
 * Spec 209 (D2): a foto do "Deu problema" sobe pela rota da parada e **reenvia a ocorrência** com a
 * chave dela e o anexo — a API completa o anexo da ocorrência que já subiu sem ele, uma vez. Nada
 * aqui passa pelo comprovante de entrega da nota (`/documents/:id/proof`).
 */
async function sendStopOccurrencePhoto(input: {
  readonly dependencies: ClientDependencies
  readonly report: StopOccurrencePhotoReport
}): Promise<void> {
  const { dependencies, report } = input
  const stopPath = `${CURRENT_TRIP_PATH}/stops/${report.stopId}`
  const attachmentObjectId = await uploadOccurrencePhoto({
    dependencies,
    photo: report.photo.blob,
    uploadsPath: `${stopPath}/occurrence-uploads`,
  })

  await request({
    body: JSON.stringify({
      attachmentObjectId,
      description: report.description,
      documentId: report.documentId,
      ...stopOccurrenceReference(report),
    }),
    dependencies,
    idempotencyKey: report.occurrenceKey,
    method: 'POST',
    path: `${stopPath}/occurrences`,
  })
}

/**
 * Pede a URL assinada, sobe o arquivo direto ao storage e confirma — devolve o id do objeto. O
 * caminho é da nota (179) ou da parada (209): o mecanismo é um só.
 */
async function uploadOccurrencePhoto(input: {
  readonly dependencies: ClientDependencies
  readonly photo: Blob
  readonly uploadsPath: string
}): Promise<string> {
  const { uploadsPath } = input
  const upload = toOccurrenceUpload(
    await request({
      body: JSON.stringify({ mimeType: input.photo.type, sizeBytes: input.photo.size }),
      dependencies: input.dependencies,
      method: 'POST',
      path: uploadsPath,
    }),
  )

  let response: Response
  try {
    // Sem `authorization`: o token da API não vai ao storage — a assinatura da URL é a credencial.
    response = await input.dependencies.fetch(
      new Request(upload.uploadUrl, {
        body: input.photo,
        cache: 'no-store',
        headers: { 'content-type': input.photo.type },
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
    dependencies: input.dependencies,
    method: 'POST',
    path: `${uploadsPath}/${upload.id}/confirm`,
  })
  return readDataId(confirmed)
}

function readData(payload: unknown): Record<string, unknown> {
  const data =
    typeof payload === 'object' && payload !== null
      ? (payload as { readonly data?: unknown }).data
      : undefined
  if (typeof data !== 'object' || data === null) throw invalidResponse()
  return data as Record<string, unknown>
}

function readDataId(payload: unknown): string {
  const id = readData(payload).id
  if (typeof id !== 'string') throw invalidResponse()
  return id
}

function toOccurrenceUpload(payload: unknown): Readonly<{ id: string; uploadUrl: string }> {
  const record = readData(payload)
  if (
    typeof record.id !== 'string' ||
    typeof record.uploadUrl !== 'string' ||
    !isSafeDownloadUrl(record.uploadUrl)
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
    apiUrl: getDriverEnvironment().apiBaseUrl,
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

const PROOF_KINDS: ReadonlySet<string> = new Set(['cargo', 'photo', 'signature'])

/**
 * A lista do comprovante. Entrega sem canhoto é lista vazia — resposta legítima, nunca erro. Item
 * sem a forma esperada derruba a leitura inteira: meia lista mostraria a foto errada na nota.
 */
function toDriverDeliveryProofs(payload: unknown): readonly DriverDeliveryProof[] {
  const data =
    typeof payload === 'object' && payload !== null
      ? (payload as { readonly data?: unknown }).data
      : undefined
  if (!Array.isArray(data)) throw new DriverTripResponseError()

  return data.map((item) => {
    if (typeof item !== 'object' || item === null) throw new DriverTripResponseError()
    const record = item as Record<string, unknown>
    const { downloadUrl, id, kind, thumbnailUrl } = record
    if (typeof downloadUrl !== 'string' || typeof id !== 'string') {
      throw new DriverTripResponseError()
    }
    if (typeof kind !== 'string' || !PROOF_KINDS.has(kind)) throw new DriverTripResponseError()
    if (thumbnailUrl !== undefined && typeof thumbnailUrl !== 'string') {
      throw new DriverTripResponseError()
    }

    return {
      downloadUrl,
      id,
      kind: kind as DriverDeliveryProof['kind'],
      ...(thumbnailUrl === undefined ? {} : { thumbnailUrl }),
    }
  })
}

function toLocationConsent(payload: unknown): LocationConsent {
  const data =
    typeof payload === 'object' && payload !== null
      ? (payload as { readonly data?: unknown }).data
      : undefined
  if (typeof data !== 'object' || data === null) throw new DriverTripResponseError()

  const acceptedAt = (data as Record<string, unknown>).acceptedAt
  if (acceptedAt !== null && typeof acceptedAt !== 'string') throw new DriverTripResponseError()

  return { acceptedAt }
}

const LOOPBACK_HOSTNAMES: ReadonlySet<string> = new Set(['127.0.0.1', 'localhost', '[::1]'])

/**
 * Spec 189 T9.2 (L6): a URL assinada vai direto para `window.open`. `javascript:`/`data:` vindos de
 * uma resposta adulterada rodariam na origem da app — só `https:` abre, e `http:` só de loopback,
 * que é o MinIO do `make dev`.
 */
function isSafeDownloadUrl(value: string): boolean {
  try {
    const url = new URL(value)
    if (url.protocol === 'https:') return true
    return url.protocol === 'http:' && LOOPBACK_HOSTNAMES.has(url.hostname)
  } catch {
    return false
  }
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
    typeof record.expiresAt !== 'string' ||
    !isSafeDownloadUrl(record.downloadUrl)
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
    method: 'GET' | 'PATCH' | 'POST' | 'PUT'
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
    /** O status só vai quando a resposta já era recusa: o HTML de um 502 precisa dele para esperar. */
    throw new DriverTripRequestError({
      code: DRIVER_TRIP_ERROR.RESPONSE_INVALID,
      isOffline: false,
      ...(response.ok ? {} : { status: response.status }),
    })
  }

  /**
   * O código sobe como veio: é ele que a tela traduz. `TRIP_DOCUMENT_NOT_REACHABLE` vira "esta nota
   * saiu da sua viagem", e trocá-lo por um genérico apagaria a única explicação que o motorista tem.
   */
  if (!response.ok) {
    const details = readErrorDetails(payload)
    throw new DriverTripRequestError({
      code: readErrorCode(payload),
      ...(details === undefined ? {} : { details }),
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

/** Spec 206 D9: `error.details` — ausente na maioria das recusas, presente no `TRIP_HAS_STOP_EN_ROUTE`. */
function readErrorDetails(payload: unknown): readonly DriverTripErrorDetail[] | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined
  const error = (payload as { readonly error?: { readonly details?: unknown } }).error
  if (!Array.isArray(error?.details)) return undefined
  const details = error.details.filter(
    (item): item is DriverTripErrorDetail =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as { field?: unknown }).field === 'string' &&
      typeof (item as { message?: unknown }).message === 'string',
  )
  return details.length > 0 ? details : undefined
}
