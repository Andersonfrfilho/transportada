/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * Só o que a máquina **leu** (ADR-0092 §2): o veredito é do servidor. `null` nos quatro campos é "li e
 * não achei" — e é por isso que nenhum deles é opcional.
 */
export type CanhotoReadingReport = Readonly<{
  readDocumentId: string | null
  readNumber: string | null
  readSeries: string | null
  readSource: 'barcode' | null
}>

export type ReportCanhotoReadingParams = Readonly<{
  companyId: string
  /** `trip_documents.id` do comprovante: o `:documentId` da rota, não o `readDocumentId` lido. */
  documentId: string
  reading: CanhotoReadingReport
  tripId: string
}>

/** `review` é o estado em que o servidor deixou o canhoto (`approved` ou `pending`). */
export type CanhotoReviewApiPort = Readonly<{
  report: (params: ReportCanhotoReadingParams) => Promise<Readonly<{ review: string }>>
}>
