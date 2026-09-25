/* Copyright (c) 2026 Ada Technology. MIT License. */
export type TripViewStatus = 'error' | 'loading' | 'ready'

/**
 * Spec 189 T9.2 (A2): a releitura periódica que falha (subsolo, sinal fraco) deixa `isError` ligado
 * **com** o dado anterior em memória. Trocar a viagem pela tela de erro aí tirava do motorista a
 * única coisa que ele tinha; erro só quando não há dado nenhum para mostrar.
 */
export function resolveTripViewStatus(input: {
  readonly hasData: boolean
  readonly isError: boolean
  readonly isLoading: boolean
}): TripViewStatus {
  if (input.hasData) return 'ready'
  if (input.isError) return 'error'
  return input.isLoading ? 'loading' : 'ready'
}

/**
 * A hora da faixa "dados de HH:MM": no boot sem rede, a do snapshot guardado; com sessão viva e a
 * releitura falhando, a da última leitura que deu certo. Leitura em dia não tem faixa.
 */
export function resolveTripDataSavedAt(input: {
  readonly canSync: boolean
  readonly dataUpdatedAt: number
  readonly initialSavedAt: string | undefined
  readonly isRefetchError: boolean
}): string | undefined {
  if (!input.canSync) return input.initialSavedAt
  if (!input.isRefetchError || input.dataUpdatedAt <= 0) return undefined
  return new Date(input.dataUpdatedAt).toISOString()
}
