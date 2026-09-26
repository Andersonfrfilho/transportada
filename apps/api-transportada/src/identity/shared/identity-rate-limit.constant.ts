/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
/**
 * Spec 191 RF12: os padrões do teto das rotas anônimas de identidade, sobrescritos por env
 * (`RATE_LIMIT_*`). O `login-hints` é mais largo porque um escritório atrás de um NAT só entra pela
 * mesma porta no começo do turno; a recuperação tem alvo, porque ela dispara envio.
 */
export const IDENTITY_RATE_LIMIT_DEFAULTS = {
  loginHintsIp: { maxRequests: 60, windowSeconds: 600 },
  passwordResetConfirmIp: { maxRequests: 20, windowSeconds: 900 },
  passwordResetsIp: { maxRequests: 10, windowSeconds: 900 },
  passwordResetsTarget: { maxRequests: 3, windowSeconds: 3_600 },
  userActivationIp: { maxRequests: 20, windowSeconds: 900 },
} as const

/**
 * O formato do `RateLimitCeiling` do limitador, sem importá-lo: o schema de ambiente lê este arquivo,
 * e o pre-deploy carrega o schema na imagem de runtime, que não copia `src/http`.
 */
export type IdentityRateLimits = {
  readonly [Key in keyof typeof IDENTITY_RATE_LIMIT_DEFAULTS]: {
    readonly maxRequests: number
    readonly windowSeconds: number
  }
}
