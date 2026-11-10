/* Copyright (c) 2026 Ada Technology. MIT License. */

const RECOVERY_STORAGE_KEY = 'transportada.session-recovery-at'
const RECOVERY_WINDOW_MS = 60_000

type RecoveryStorage = Pick<Storage, 'getItem' | 'setItem'>

export type RejectedSessionRecoveryDependencies = {
  readonly now: () => number
  readonly restartAuthentication: () => Promise<void>
  readonly storage: RecoveryStorage | undefined
}

function readLastAttempt(storage: RecoveryStorage | undefined): number | undefined {
  try {
    const raw = storage?.getItem(RECOVERY_STORAGE_KEY)
    const parsed = raw === null || raw === undefined ? Number.NaN : Number(raw)
    return Number.isFinite(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

function writeLastAttempt(storage: RecoveryStorage | undefined, value: number): void {
  try {
    storage?.setItem(RECOVERY_STORAGE_KEY, String(value))
  } catch {
    /* Sem armazenamento a trava não existe; o pior caso é uma tentativa a mais. */
  }
}

/**
 * ⚠️ A API disse 401 a um token que o navegador ainda considera válido (sessão encerrada no
 * Keycloak, chave trocada, token de outra época). Mostrar "Indisponível" prende a pessoa numa tela
 * que não se conserta sozinha: o certo é entrar de novo.
 *
 * Uma tentativa por minuto: se o login recém-feito também levar 401, o problema é do servidor, e
 * redirecionar em laço esconderia isso. Devolve `true` quando mandou reautenticar.
 */
export async function recoverFromRejectedToken(
  dependencies: RejectedSessionRecoveryDependencies,
): Promise<boolean> {
  const now = dependencies.now()
  const lastAttempt = readLastAttempt(dependencies.storage)
  if (lastAttempt !== undefined && now - lastAttempt < RECOVERY_WINDOW_MS) {
    return false
  }

  writeLastAttempt(dependencies.storage, now)
  await dependencies.restartAuthentication()
  return true
}
