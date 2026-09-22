/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import {
  validateAddressCorrectionFields,
  type AddressCorrectionFieldErrors,
  type AddressCorrectionFields,
  type AddressCorrectionRequestRecord,
} from '../shared/addressCorrection.validation'
import {
  AddressCorrectionRequestError,
  fieldLabelKey,
  toFieldErrorMap,
} from '../shared/addressCorrectionRequestError.service'
import { createNfeWorkspaceClient } from '../shared/nfeWorkspaceClient.service'
import { ADDRESS_CORRECTION_REQUESTS_QUERY_KEY } from '../shared/nfeWorkspace.constant'
import { ADDRESS_REPORT_QUERY_KEY } from './useAddressReport.hook'

export type UseAddressCorrectionFormInput = Readonly<{
  addressKey: string
  initial: AddressCorrectionFields
  onSaved: (saved: AddressCorrectionRequestRecord) => void
}>

function createClient() {
  return createNfeWorkspaceClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request, init) => fetch(request, init),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}

/**
 * O estado de um formulário de correção (spec 150, T201): campos, validação nas mesmas regras do
 * servidor (`address-correction.validation.ts`) e o envio, com o erro do servidor ancorado de volta
 * no campo — os detalhes de `web.md` §11 (erro carregado, todos os campos juntos, rótulo impresso).
 */
export function useAddressCorrectionForm(input: UseAddressCorrectionFormInput) {
  const queryClient = useQueryClient()
  const client = createClient()
  const [fields, setFields] = useState<AddressCorrectionFields>(input.initial)
  const [fieldErrors, setFieldErrors] = useState<AddressCorrectionFieldErrors>({})
  /** Campo que o servidor recusou e que este formulário não sabe rotular — sai com o nome cru. */
  const [unlabelledErrors, setUnlabelledErrors] = useState<
    readonly Readonly<{ field: string; message: string }>[]
  >([])

  const save = useMutation({
    mutationFn: () =>
      client.saveAddressCorrection({ addressKey: input.addressKey, proposed: fields }),
    onError: (error) => {
      if (!(error instanceof AddressCorrectionRequestError)) return
      const serverFieldErrors = toFieldErrorMap(error)
      const known: { -readonly [K in keyof AddressCorrectionFieldErrors]?: string } = {}
      const unlabelled: { field: string; message: string }[] = []
      for (const [field, message] of Object.entries(serverFieldErrors)) {
        if (fieldLabelKey(field) === undefined) {
          unlabelled.push({ field, message })
        } else {
          known[field as keyof AddressCorrectionFieldErrors] = message
        }
      }
      setFieldErrors(known)
      setUnlabelledErrors(unlabelled)
    },
    onSuccess: (saved) => {
      setFieldErrors({})
      setUnlabelledErrors([])
      /**
       * Sem `await`: aguardar a releitura aqui prenderia o botão além do trabalho concluído —
       * `test/shared/mutation-pending-state.contract.ts` reprova `onSuccess` assíncrono.
       */
      void queryClient.invalidateQueries({ queryKey: [ADDRESS_REPORT_QUERY_KEY] })
      void queryClient.invalidateQueries({ queryKey: [ADDRESS_CORRECTION_REQUESTS_QUERY_KEY] })
      input.onSaved(saved)
    },
  })

  function patch(next: Partial<AddressCorrectionFields>): void {
    setFields((current) => ({ ...current, ...next }))
  }

  /** Editar o campo limpa o erro dele — servidor e validação local seguem a mesma regra. */
  function clearFieldError(field: keyof AddressCorrectionFieldErrors): void {
    setFieldErrors((current) => {
      if (current[field] === undefined) return current
      const next = { ...current }
      delete next[field]
      return next
    })
  }

  function submit(): void {
    const errors = validateAddressCorrectionFields(fields)
    setFieldErrors(errors)
    setUnlabelledErrors([])
    if (Object.keys(errors).length > 0) return
    save.mutate()
  }

  return {
    clearFieldError,
    fieldErrors,
    fields,
    isSaving: save.isPending,
    patch,
    submit,
    unlabelledErrors,
  }
}
