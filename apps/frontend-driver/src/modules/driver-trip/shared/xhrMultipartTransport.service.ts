/* Copyright (c) 2026 Ada Technology. MIT License. */

/** Spec 265 RF12: o que o envio do comprovante reporta enquanto os bytes saem do aparelho. */
export type UploadProgress = Readonly<{ loaded: number; total: number }>

type XhrTransportInput = Readonly<{
  createXhr: () => XMLHttpRequest
  form: FormData
  headers: Readonly<Record<string, string>>
  method: string
  onProgress: (progress: UploadProgress) => void
  /** O mesmo sinal que o `fetch` receberia (teto + chamador): abortar cancela o envio. */
  signal: AbortSignal
  url: string
}>

function abortError(signal: AbortSignal): Error {
  const reason: unknown = signal.reason
  if (reason instanceof Error) return reason
  const error = new Error('The upload was aborted')
  error.name = 'AbortError'
  return error
}

/**
 * Spec 265 RF12: `fetch` não reporta progresso de **envio**; só `XMLHttpRequest.upload.onprogress`.
 * Esta função existe só para o multipart do comprovante e devolve uma `Response`, para o resto de
 * `request()` (relógio, JSON, 4xx/5xx) seguir idêntico ao caminho do `fetch`. Rede caída e teto
 * estourado rejeitam como o `fetch` rejeitaria (`TypeError` / `TimeoutError`|`AbortError`).
 */
export function sendFormWithUploadProgress(input: XhrTransportInput): Promise<Response> {
  return new Promise<Response>((resolve, reject) => {
    if (input.signal.aborted) {
      reject(abortError(input.signal))
      return
    }
    const xhr = input.createXhr()
    const onAbort = () => xhr.abort()
    input.signal.addEventListener('abort', onAbort, { once: true })
    const settle = (action: () => void) => {
      input.signal.removeEventListener('abort', onAbort)
      action()
    }

    let lastTotal = 0
    xhr.open(input.method, input.url, true)
    for (const [name, value] of Object.entries(input.headers)) xhr.setRequestHeader(name, value)
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return
      lastTotal = event.total
      input.onProgress({ loaded: event.loaded, total: event.total })
    }
    xhr.upload.onload = () => {
      /** Os bytes terminaram de sair: 100% de verdade, antes de o servidor responder. */
      if (lastTotal > 0) input.onProgress({ loaded: lastTotal, total: lastTotal })
    }
    xhr.onerror = () => settle(() => reject(new TypeError('Network request failed')))
    xhr.ontimeout = () => settle(() => reject(abortError(input.signal)))
    xhr.onabort = () => settle(() => reject(abortError(input.signal)))
    xhr.onload = () =>
      settle(() => {
        const { status } = xhr
        const text = xhr.responseText
        const headers = new Headers()
        const date = xhr.getResponseHeader('date')
        if (date !== null) headers.set('date', date)
        const contentType = xhr.getResponseHeader('content-type')
        if (contentType !== null) headers.set('content-type', contentType)
        /** `Response` recusa corpo em status sem corpo (204/205/304). */
        const hasBody = text.length > 0 && status !== 204 && status !== 205 && status !== 304
        try {
          resolve(new Response(hasBody ? text : null, { headers, status }))
        } catch {
          reject(new TypeError('Network request failed'))
        }
      })
    xhr.send(input.form)
  })
}
