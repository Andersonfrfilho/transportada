/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery } from '@tanstack/react-query'

const HEALTH_QUERY_KEY = ['foundation', 'health'] as const
const HEALTH_PATH = '/health/live'

type FoundationHealth = {
  readonly status: string
}

function isFoundationHealth(value: unknown): value is FoundationHealth {
  return (
    typeof value === 'object' &&
    value !== null &&
    'status' in value &&
    typeof value.status === 'string'
  )
}

async function fetchFoundationHealth(): Promise<FoundationHealth> {
  const apiBaseUrl = import.meta.env.VITE_API_URL
  const response = await fetch(`${apiBaseUrl}${HEALTH_PATH}`)

  if (!response.ok) {
    throw new Error('FOUNDATION_HEALTH_UNAVAILABLE')
  }

  const responseBody: unknown = JSON.parse(await response.text())

  if (!isFoundationHealth(responseBody)) {
    throw new Error('FOUNDATION_HEALTH_INVALID')
  }

  return responseBody
}

export function useFoundationHealthQuery() {
  const apiBaseUrl = import.meta.env.VITE_API_URL

  return useQuery({
    enabled: apiBaseUrl !== undefined && apiBaseUrl !== '',
    queryFn: fetchFoundationHealth,
    queryKey: HEALTH_QUERY_KEY,
  })
}
