/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'
import { createNfeWorkspaceClient } from '@/modules/nfe-workspace/shared/nfeWorkspaceClient.service'

export type XmlFeedback = Readonly<{ accessKey: string; kind: 'failed' | 'notImported' }>

export type UseXmlRecheckInput = Readonly<{
  recheck: (accessKey: string) => Promise<boolean>
  /** O leitor de mão perde o foco a cada clique: toda ação da lista o devolve a ele. */
  refocusReader: () => void
  uploadXml?: (file: File) => Promise<void>
}>

function uploadXmlFile(file: File): Promise<void> {
  const client = createNfeWorkspaceClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request) => fetch(request),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
  return client
    .requestUpload({ files: [file], idempotencyKey: crypto.randomUUID() })
    .then(() => undefined)
}

/** Envia o XML da linha que a SEFAZ não entregou e confere o cadastro; a mesma regra em todas as telas. */
export function useXmlRecheck(input: UseXmlRecheckInput) {
  const { recheck, refocusReader, uploadXml = uploadXmlFile } = input
  const [xmlFeedback, setXmlFeedback] = useState<XmlFeedback | undefined>(undefined)

  async function sendXml(accessKey: string, file: File | undefined): Promise<void> {
    if (file === undefined) return
    setXmlFeedback(undefined)
    try {
      await uploadXml(file)
      if (!(await recheck(accessKey))) setXmlFeedback({ accessKey, kind: 'notImported' })
    } catch {
      setXmlFeedback({ accessKey, kind: 'failed' })
    }
    refocusReader()
  }

  return { sendXml, xmlFeedback }
}
