/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { AsyncLocalStorage } from 'node:async_hooks'

export type RequestScope = {
  /** Aborta quando o cliente desiste: a consulta do pedido é cancelada e a conexão devolvida. */
  readonly signal: AbortSignal
}

const storage = new AsyncLocalStorage<RequestScope>()

export function runInRequestScope<TResult>(scope: RequestScope, run: () => TResult): TResult {
  return storage.run(scope, run)
}

export function readRequestScope(): RequestScope | undefined {
  return storage.getStore()
}
