export interface HealthResponse {
  readonly status: 'ok' | 'degraded'
  readonly service: string
  readonly timestamp: string
  readonly dependencies?: Readonly<Record<string, 'up' | 'down'>>
}
