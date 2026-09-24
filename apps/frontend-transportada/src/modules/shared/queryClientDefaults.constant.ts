/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { DefaultOptions } from '@tanstack/react-query'

/**
 * O prazo em que um dado já buscado continua valendo sem ir à rede de novo. É ele que faz duas
 * telas que leem a mesma chave dividirem uma busca, e não duas.
 */
export const QUERY_STALE_TIME_MS = 30_000

/**
 * As mesmas opções para o cliente do navegador e para o dos testes de hook. ⚠️ Enquanto o teste
 * montava o próprio cliente, ele rodava sem `staleTime`: cada observador novo refazia a busca, e
 * um teste passava (ou falhava) por um comportamento que o produto não tem.
 */
export const QUERY_CLIENT_DEFAULT_OPTIONS: DefaultOptions = {
  queries: { retry: false, staleTime: QUERY_STALE_TIME_MS },
}
