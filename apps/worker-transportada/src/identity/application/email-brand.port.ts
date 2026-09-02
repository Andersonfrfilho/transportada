/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CodeEmailBrand } from '../domain/code-email-template.service.js'

/**
 * A marca do e-mail é **lida**, nunca configurada por env: quem a edita é o operador, na aba Site
 * do painel. Falha e ausência dão no mesmo — o template cai na marca do produto (ver
 * `installationBrand.service.ts` do frontend, que resolve a tela de entrar pela mesma regra).
 */
export type EmailBrandPort = Readonly<{
  read: () => Promise<CodeEmailBrand>
}>
