/* Cópia por valor de apps/frontend-client/src/modules/shared/contentSecurityPolicy.service.ts (ADR-0075 §7). */
/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * A diretiva é composta no **build**, não no runtime: a origem da API e a do Keycloak chegam por
 * `VITE_*`, que o Vite inlina no bundle e que não existem no contêiner que serve o `dist`. O plugin
 * do Vite grava o resultado ao lado do bundle e o `server.ts` o lê no boot, fail-closed.
 *
 * Diferenças para o portal (ADR-0075 §4): `img-src` leva `blob:` (a prévia da foto e do recorte) e a
 * origem da API (o logo da instalação). A origem do armazenamento entra com a spec 179.
 */

const SELF = "'self'"
const NONE = "'none'"
const BLOB = 'blob:'
const UNSAFE_INLINE = "'unsafe-inline'"

/** Nome do arquivo emitido no `dist`. O `server.ts` não importa daqui: ele é copiado sozinho. */
export const CONTENT_SECURITY_POLICY_FILE_NAME = 'content-security-policy.txt'

/**
 * **Vazia, e é o ponto.** O motorista fala com a própria origem, a API e o Keycloak. Se um dia outra
 * origem precisar entrar, entra nesta lista — nunca numa segunda diretiva, que não soma.
 */
export const EXTERNAL_CONNECT_ORIGIN: readonly string[] = []

/**
 * Origem que o bundle nomeia sem nunca buscar — `window.open`, não `fetch` (ADR-0075 §4).
 * `maps.google.com` é o mapa da parada (`DriverStopCard.component.tsx`); o XML do MDF-e por URL
 * assinada não nomeia origem fixa nenhuma no código — a URL vem inteira da API.
 */
export const NON_FETCH_ORIGIN: readonly string[] = ['https://maps.google.com']

type ContentSecurityPolicyParams = {
  readonly allowsInlineScript: boolean
  readonly apiBaseUrl: string | undefined
  readonly keycloakUrl: string | undefined
}

/**
 * Variável ausente não derruba o build: o job de qualidade do CI constrói sem `.env`, e um bundle
 * sem `VITE_API_URL` já morre no boot. Valor presente e impossível de ler, sim: aí `new URL` estoura.
 */
function toOrigin(value: string | undefined): string | undefined {
  const declared = value?.trim() ?? ''
  return declared === '' ? undefined : new URL(declared).origin
}

export function buildContentSecurityPolicy({
  allowsInlineScript,
  apiBaseUrl,
  keycloakUrl,
}: ContentSecurityPolicyParams): string {
  const apiOrigin = toOrigin(apiBaseUrl)
  const configured = [apiOrigin, toOrigin(keycloakUrl)].filter(
    (origin): origin is string => origin !== undefined,
  )
  const connectSource = [
    SELF,
    ...[...new Set([...configured, ...EXTERNAL_CONNECT_ORIGIN])].sort(),
  ].join(' ')
  const imageSource = [SELF, BLOB, ...(apiOrigin === undefined ? [] : [apiOrigin])].join(' ')
  const scriptSource = allowsInlineScript ? `${SELF} ${UNSAFE_INLINE}` : SELF

  return [
    `default-src ${SELF}`,
    `base-uri ${SELF}`,
    `connect-src ${connectSource}`,
    `font-src ${SELF}`,
    `form-action ${SELF}`,
    `frame-ancestors ${NONE}`,
    `frame-src ${NONE}`,
    `img-src ${imageSource}`,
    `manifest-src ${SELF}`,
    `object-src ${NONE}`,
    `script-src ${scriptSource}`,
    /** `style-src-attr` é ignorado pelo Safari < 15.4, e o motorista abre a app no celular. */
    `style-src ${SELF} ${UNSAFE_INLINE}`,
    `worker-src ${SELF}`,
  ].join('; ')
}
