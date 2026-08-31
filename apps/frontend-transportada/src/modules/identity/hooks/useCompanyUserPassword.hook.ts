import { useState } from 'react'

import { COMPANY_USER_PASSWORD_MIN_LENGTH } from '../shared/companyUsers.constant'
import { getIdentityEnvironment } from '../shared/identityEnvironment.config'
import { createPasswordResetClient } from '../shared/passwordResetClient.service'
import type { CompanyUsersClient } from './useCompanyUsers.hook'
import { getCompanyUsersClient } from './useCompanyUsers.hook'

/** O que o último clique de senha produziu. `idle` é o estado em que o painel não diz nada. */
export type CompanyUserPasswordStatus = 'idle' | 'reset-sent' | 'saved'

export type CompanyUserPasswordState = Readonly<{
  errorCode: string | undefined
  isLongEnough: boolean
  isPending: boolean
  password: string
  status: CompanyUserPasswordStatus
  temporary: boolean
  clear: () => void
  requestReset: (username: string) => Promise<void>
  setPassword: (value: string) => void
  setTemporary: (value: boolean) => void
  submit: (userId: string) => Promise<void>
}>

/**
 * A senha vive fora do formulário do perfil e é salva por botão próprio: ela vai por outra rota, e
 * misturá-la no "Salvar" faria toda correção de telefone reenviar a senha digitada.
 *
 * Nada dela sobrevive ao diálogo — `clear` roda ao fechar. Guardar em estado de página deixaria a
 * senha em memória depois que a pessoa mudou de tela.
 */
export function useCompanyUserPassword(
  input: Readonly<{ client?: CompanyUsersClient }> = {},
): CompanyUserPasswordState {
  const client = input.client ?? getCompanyUsersClient()
  const [password, setPassword] = useState('')
  const [temporary, setTemporary] = useState(false)
  const [status, setStatus] = useState<CompanyUserPasswordStatus>('idle')
  const [errorCode, setErrorCode] = useState<string | undefined>(undefined)
  const [isPending, setPending] = useState(false)

  function clear(): void {
    setPassword('')
    setTemporary(false)
    setStatus('idle')
    setErrorCode(undefined)
  }

  return {
    clear,
    errorCode,
    isLongEnough: password.length >= COMPANY_USER_PASSWORD_MIN_LENGTH,
    isPending,
    password,
    /**
     * O primeiro passo da recuperação é silencioso por desenho (login inexistente e válido
     * respondem igual), então o retorno aqui não confirma entrega — só que o pedido saiu.
     */
    async requestReset(username) {
      setPending(true)
      setErrorCode(undefined)
      try {
        const resetClient = createPasswordResetClient({
          apiBaseUrl: getIdentityEnvironment().apiBaseUrl,
          fetch: (request) => fetch(request),
        })
        await resetClient.request({ username })
        setStatus('reset-sent')
      } catch (error) {
        setErrorCode(error instanceof Error ? error.message : 'UNKNOWN')
      } finally {
        setPending(false)
      }
    },
    setPassword: (value) => {
      setPassword(value)
      setStatus('idle')
      setErrorCode(undefined)
    },
    setTemporary,
    status,
    async submit(userId) {
      if (password.length < COMPANY_USER_PASSWORD_MIN_LENGTH) return
      setPending(true)
      setErrorCode(undefined)
      try {
        await client.setPassword({ password, temporary, userId })
        setPassword('')
        setStatus('saved')
      } catch (error) {
        setErrorCode(error instanceof Error ? error.message : 'UNKNOWN')
      } finally {
        setPending(false)
      }
    },
    temporary,
  }
}
