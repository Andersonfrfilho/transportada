/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
export type NfeRecipientEmailPendingDocument = {
  readonly bucket: string
  readonly companyId: string
  readonly documentId: string
  readonly objectKey: string
}

export type NfeRecipientEmailBackfillRepository = {
  listDocumentsWithoutRecipientEmail(input: {
    readonly cursor: string | undefined
    readonly limit: number
  }): Promise<readonly NfeRecipientEmailPendingDocument[]>
  /** Devolve `false` quando a nota já tinha e-mail: a escrita nunca troca o que está gravado. */
  fillRecipientEmail(input: {
    readonly companyId: string
    readonly documentId: string
    readonly email: string
  }): Promise<boolean>
}

export type NfeRecipientEmailXmlReader = {
  readXml(input: { readonly bucket: string; readonly key: string }): Promise<string>
}
