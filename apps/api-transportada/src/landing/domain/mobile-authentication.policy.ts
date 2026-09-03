/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 082 T0.1: o endereço de autenticação que o aplicativo do motorista precisa descobrir.
 *
 * O app não carrega endereço de Keycloak embutido, ao contrário do painel, que tem
 * `VITE_KEYCLOAK_URL` no próprio bundle: ele conhece **uma URL só**, a da instalação que o operador
 * digitou (ADR-0056 §6). Sem este bloco não há para onde mandar quem quer entrar.
 *
 * ⚠️ **`url` e `realm` são derivados de `KEYCLOAK_ISSUER`, nunca configurados ao lado dele.** Duas
 * variáveis para a mesma coisa divergem no primeiro deploy em que alguém troca só uma — e a
 * divergência seria silenciosa: o token continuaria validando pelo issuer, e o app mandaria a pessoa
 * autenticar no realm errado.
 *
 * Nada aqui é segredo: no fluxo de authorization code + PKCE o `clientId` é público por desenho, e o
 * endereço do realm é o que o navegador exibe na barra. É por isso que a rota que os serve pode
 * continuar anônima.
 */

export type MobileAuthenticationEndpoint = {
  readonly clientId: string
  readonly realm: string
  readonly url: string
}

/** `https://auth.exemplo.com.br/realms/transportada` → base e realm. */
const ISSUER_PATTERN = /^(?<url>https?:\/\/[^/]+(?:\/[^/]+)*?)\/realms\/(?<realm>[^/]+)\/?$/u

/**
 * Instalação que não declarou o cliente do aplicativo devolve `null`, e a rota omite o bloco. O app
 * então recusa a instalação — que é a verdade: aquela instalação não publica o aplicativo.
 *
 * Derrubar o boot seria pior: toda API já em produção pararia de subir no deploy seguinte por causa
 * de uma variável que só o aplicativo consome.
 */
export function resolveMobileAuthentication(input: {
  readonly clientId: string | undefined
  readonly issuer: string
}): MobileAuthenticationEndpoint | null {
  const clientId = input.clientId?.trim() ?? ''
  if (clientId === '') return null

  const groups = ISSUER_PATTERN.exec(input.issuer.trim())?.groups
  if (groups === undefined) return null

  const { realm, url } = groups
  if (realm === undefined || url === undefined) return null

  return { clientId, realm, url }
}
