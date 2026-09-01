/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState, type FormEvent, type ReactNode } from 'react'

import {
  PortalRequestError,
  type PortalClient,
  type PortalSession,
} from '../shared/portalClient.service'
import styles from './Portal.module.css'

const MIN_PASSWORD_LENGTH = 8

type PortalAuthFormsProps = Readonly<{
  client: PortalClient
  onAuthenticated: (session: PortalSession) => void
}>

/**
 * Só login — a conta do agregado nasce por outro caminho (a decidir: operador cria manualmente,
 * convite por e-mail, etc.), não autocadastro aqui. `client.register`/`/public/aggregate-accounts`
 * continuam existindo no backend, só não têm tela enquanto essa decisão não é tomada.
 */
export function PortalAuthForms({ client, onAuthenticated }: PortalAuthFormsProps): ReactNode {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [state, setState] = useState<'error' | 'idle' | 'submitting'>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setState('submitting')
    try {
      const session = await client.login({ email, password })
      onAuthenticated(session)
    } catch (error) {
      setState('error')
      setErrorMessage(
        error instanceof PortalRequestError
          ? loginErrorMessage(error.code)
          : 'Não foi possível entrar agora.',
      )
      return
    }
    setState('idle')
  }

  return (
    <section className={styles.section}>
      <h1 className={styles.title}>Entrar</h1>
      <form className={styles.form} onSubmit={(event) => void handleSubmit(event)}>
        <label className={styles.field}>
          <span className={styles.label}>E-mail</span>
          <input
            className={styles.input}
            required
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Senha</span>
          <input
            className={styles.input}
            minLength={MIN_PASSWORD_LENGTH}
            required
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {state === 'error' ? (
          <div className={`${styles.feedback} ${styles.feedbackError}`} role="alert">
            {errorMessage}
          </div>
        ) : null}
        <button className={styles.submitButton} disabled={state === 'submitting'} type="submit">
          {state === 'submitting' ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </section>
  )
}

function loginErrorMessage(code: string): string {
  if (code === 'INVALID_CREDENTIALS') return 'E-mail ou senha incorretos.'
  return 'Não foi possível entrar agora. Tente novamente em instantes.'
}
