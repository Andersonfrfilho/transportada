/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Cliente do `hertzg/tesseract-server` self-hosted (Tesseract, sem chave de API) — `POST /tesseract`
 * espera `multipart/form-data` com os campos `options` (JSON `{"languages":[...]}` ) e `file` (a
 * imagem). Devolve `{data: {exit: {code}, stdout, stderr}}`; `exit.code !== 0` é falha (formato não
 * suportado, imagem ilegível), tratada como "não deu pra ler", nunca como upload inválido — o
 * documento já foi salvo antes desta chamada (ver `aggregate-document.use-case.ts`).
 *
 * Só lê imagem raster (PNG/JPEG) — build sem suporte a PDF (`Pdf reading is not supported`,
 * confirmado testando contra o serviço de verdade). Chamar com PDF é desperdício de round-trip
 * sabendo que vai falhar, então o host não chama OCR pra esse tipo — ver `aggregate-document.use-case.ts`.
 */
const OCR_REQUEST_TIMEOUT_MS = 15_000
const OCR_LANGUAGES = ['por'] as const

type TesseractServerResponse = Readonly<{
  data: Readonly<{
    exit: Readonly<{ code: number; signal: string | null }>
    stderr: string
    stdout: string
  }>
}>

export function createHttpAggregateDocumentOcrGateway(input: { readonly baseUrl: string }): {
  readonly extractText: (params: {
    readonly bytes: Uint8Array
    readonly mimeType: string
  }) => Promise<string>
} {
  return {
    async extractText({ bytes, mimeType }) {
      const form = new FormData()
      form.set('options', JSON.stringify({ languages: OCR_LANGUAGES }))
      form.set('file', new Blob([bytes], { type: mimeType }), 'document')

      const response = await fetch(`${input.baseUrl}/tesseract`, {
        body: form,
        method: 'POST',
        signal: AbortSignal.timeout(OCR_REQUEST_TIMEOUT_MS),
      })
      if (!response.ok)
        throw new Error(`aggregate document OCR request failed with status ${response.status}`)

      const result = (await response.json()) as TesseractServerResponse
      if (result.data.exit.code !== 0) {
        throw new Error(`aggregate document OCR could not read the file: ${result.data.stderr}`)
      }
      return result.data.stdout
    },
  }
}
