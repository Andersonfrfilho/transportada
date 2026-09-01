import { useCallback, useState } from 'react'

import type {
  AttachmentClient,
  AttachmentType,
  UploadAttachmentResult,
} from '../shared/attachmentClient.service'

/**
 * Um arquivo, uma linha. O envio é evento — nada de `useEffect` —, e a falha de um anexo não derruba
 * os outros nem o formulário: o cadastro é o que importa, e o anexo é comprovante (spec 070).
 */
export type AttachmentEntryStatus = 'failed' | 'uploaded' | 'uploading'

export type AttachmentEntry = Readonly<{
  draftId?: string
  fileName: string
  id: string
  reason?: 'rejected' | 'too_large' | 'unreachable'
  status: AttachmentEntryStatus
  type: AttachmentType
}>

export type AttachmentUploads = Readonly<{
  /** Só os que chegaram: é isso que o submit amarra à candidatura. */
  draftIds: readonly string[]
  entries: readonly AttachmentEntry[]
  remove: (id: string) => void
  upload: (input: {
    readonly companyId: string
    readonly file: File
    readonly turnstileToken?: string
    readonly type: AttachmentType
  }) => Promise<void>
}>

export function useAttachmentUploads(client: AttachmentClient): AttachmentUploads {
  const [entries, setEntries] = useState<readonly AttachmentEntry[]>([])

  const upload = useCallback<AttachmentUploads['upload']>(
    async ({ companyId, file, turnstileToken, type }) => {
      const id = crypto.randomUUID()
      setEntries((current) => [...current, { fileName: file.name, id, status: 'uploading', type }])

      const result: UploadAttachmentResult = await client.upload({
        companyId,
        file,
        fileName: file.name,
        ...(turnstileToken === undefined ? {} : { turnstileToken }),
        type,
      })

      /**
       * A linha é casada por `id`, e a que sumiu da lista **não volta**: quem removeu o anexo
       * enquanto ele subia não pode vê-lo ressuscitar quando a resposta chegar.
       */
      setEntries((current) =>
        current.map((entry) =>
          entry.id === id
            ? result.status === 'uploaded'
              ? { ...entry, draftId: result.draftId, status: 'uploaded' }
              : { ...entry, reason: result.reason, status: 'failed' }
            : entry,
        ),
      )
    },
    [client],
  )

  const remove = useCallback((id: string): void => {
    setEntries((current) => current.filter((entry) => entry.id !== id))
  }, [])

  return {
    draftIds: entries.flatMap((entry) => (entry.draftId === undefined ? [] : [entry.draftId])),
    entries,
    remove,
    upload,
  }
}
