/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * A API roda atrás de proxy (Railway/Cloudflare) — o socket que o Bun enxerga é o do proxy, não o
 * do cliente. `x-forwarded-for` carrega a cadeia inteira; o primeiro endereço é quem originou a
 * requisição. Sem o header (dev local direto), cai num identificador fixo — todo tráfego local
 * compartilha um único balde do limitador, que é exatamente o que se quer testando na máquina.
 */
export function resolveClientIp(request: Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for')
  if (forwardedFor !== null) {
    const first = forwardedFor.split(',')[0]?.trim()
    if (first !== undefined && first.length > 0) return first
  }

  const realIp = request.headers.get('x-real-ip')
  if (realIp !== null && realIp.trim().length > 0) return realIp.trim()

  return 'unknown'
}
