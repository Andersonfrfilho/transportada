/**
 * A diretiva é composta no **build**, não no runtime: a origem da API e a do Keycloak chegam por
 * `VITE_*`, que o Vite inlina no bundle e que não existem no contêiner que serve o `dist`. O plugin
 * do Vite grava o resultado ao lado do bundle e o `server.ts` o lê no boot, fail-closed.
 *
 * ⚠️ Este arquivo é **cópia por valor** do equivalente em `frontend-transportada` — as duas apps não
 * importam código uma da outra. A diferença não é acidental e é o ponto da separação (ADR-0050 §1):
 * **o portal do cliente não tem destino externo nenhum.** O painel tem quatro (BrasilAPI, Photon,
 * IBGE); aqui o `connect-src` é a própria origem, a API e o Keycloak, e ponto. O cliente não busca
 * CEP, não busca rua e não carrega mapa de terceiro — o mapa é desenhado por nós (ADR-0050 §5).
 */

const SELF = "'self'"
const NONE = "'none'"
const UNSAFE_INLINE = "'unsafe-inline'"

/** Nome do arquivo emitido no `dist`. O `server.ts` não importa daqui: ele é copiado sozinho. */
export const CONTENT_SECURITY_POLICY_FILE_NAME = 'content-security-policy.txt'

/**
 * **Vazia, e é o ponto.** Toda origem que entrasse aqui seria um terceiro sabendo que uma carga
 * daquele cliente está em trânsito. Se um dia alguma precisar entrar, entra nesta lista — nunca numa
 * segunda diretiva, que não soma (a primeira ocorrência vence).
 */
export const EXTERNAL_CONNECT_ORIGIN: readonly string[] = []

/** Origem que o bundle nomeia sem nunca buscar — o link do rodapé é navegação, não `fetch`. */
export const NON_FETCH_ORIGIN = ['https://adatechnology.com.br'] as const

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
  const configured = [toOrigin(apiBaseUrl), toOrigin(keycloakUrl)].filter(
    (origin): origin is string => origin !== undefined,
  )
  const connectSource = [
    SELF,
    ...[...new Set([...configured, ...EXTERNAL_CONNECT_ORIGIN])].sort(),
  ].join(' ')
  const scriptSource = allowsInlineScript ? `${SELF} ${UNSAFE_INLINE}` : SELF

  return [
    `default-src ${SELF}`,
    `base-uri ${SELF}`,
    `connect-src ${connectSource}`,
    `font-src ${SELF}`,
    `form-action ${SELF}`,
    `frame-ancestors ${NONE}`,
    `frame-src ${NONE}`,
    `img-src ${SELF}`,
    `manifest-src ${SELF}`,
    `object-src ${NONE}`,
    `script-src ${scriptSource}`,
    /**
     * `'unsafe-inline'` existe **só** em `style-src`, pelo atributo `style` do mapa — `style-src-attr`
     * é ignorado pelo Safari < 15.4, e o portal é aberto no celular do cliente antes de qualquer
     * outro lugar.
     */
    `style-src ${SELF} ${UNSAFE_INLINE}`,
    `worker-src ${SELF}`,
  ].join('; ')
}
