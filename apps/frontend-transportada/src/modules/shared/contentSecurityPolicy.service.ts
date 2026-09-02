/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * A diretiva é composta no **build**, não no runtime: a origem da API e a do Keycloak chegam por
 * `VITE_*`, que o Vite inlina no bundle e que não existem no contêiner que serve o `dist`. O plugin
 * do Vite grava o resultado ao lado do bundle e o `server.ts` o lê no boot.
 */

const SELF = "'self'"
const NONE = "'none'"
const UNSAFE_INLINE = "'unsafe-inline'"
/**
 * O recorte de fundo compila WebAssembly no navegador, e `script-src` governa isso. Sem a palavra,
 * o runtime é **bloqueado na compilação** — não no carregamento —, e o erro sai como "falha ao
 * iniciar o modelo", longe da diretiva que o causou. Ela não permite script de terceiro: o `.wasm`
 * continua tendo de vir de `'self'`.
 */
const WASM_UNSAFE_EVAL = "'wasm-unsafe-eval'"

/** Nome do arquivo emitido no `dist`. O `server.ts` não importa daqui: ele é copiado sozinho. */
export const CONTENT_SECURITY_POLICY_FILE_NAME = 'content-security-policy.txt'

/** Destinos externos que o bundle consulta direto do navegador do operador. */
export const EXTERNAL_CONNECT_ORIGIN = [
  // O CEP saiu daqui e passou pela nossa API, mas a BrasilAPI fica: o cadastro por CNPJ e a lista de
  // municípios do IBGE continuam sendo buscados do navegador.
  'https://brasilapi.com.br',
  'https://photon.komoot.io',
  // Malha de município do IBGE, desenhada no mapa da zona. Diferente dos outros destinos, este não
  // leva dado pessoal: sai a sigla da UF e volta geometria pública.
  'https://servicodados.ibge.gov.br',
] as const

/**
 * Origem que o bundle nomeia sem nunca buscar: o link do rodapé é navegação, não `fetch`. Fica fora
 * do `connect-src` de propósito, e está declarada aqui para o contrato distinguir "destino esquecido
 * na diretiva" de "endereço que nunca foi destino".
 */
export const NON_FETCH_ORIGIN = [
  'https://adatechnology.com.br',
  /**
   * O botão "navegar" do motorista **abre** o mapa no app que ele já usa (ADR-0045 §8) — é
   * `window.open`, não `fetch`. Pô-lo em `connect-src` daria permissão de rede que a tela não usa.
   */
  'https://maps.google.com',
  /**
   * Spec 068: exemplo dentro do campo de perfil de rede social, para o operador ver a forma do
   * endereço. É texto de `placeholder` — o bundle nomeia a origem e nunca a busca.
   */
  'https://instagram.com',
] as const

type ContentSecurityPolicyParams = {
  readonly allowsInlineScript: boolean
  readonly apiBaseUrl: string | undefined
  readonly keycloakUrl: string | undefined
}

/**
 * Variável ausente não derruba o build: o job de qualidade do CI constrói sem `.env`, e um bundle
 * sem `VITE_API_URL` já morre no boot em `readTrustedUrl` — a diretiva mais estreita não acrescenta
 * modo de falha. Valor presente e impossível de ler, sim: aí `new URL` estoura, e é o que se quer.
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
  /**
   * Só a API, e não tudo o que está em `connect-src`: o provedor de identidade não serve imagem
   * nossa, e ampliar a diretiva com origem que ninguém usa é permissão dada de graça.
   */
  const imageOrigin = [toOrigin(apiBaseUrl)].filter(
    (origin): origin is string => origin !== undefined,
  )
  const connectSource = [
    SELF,
    ...[...new Set([...configured, ...EXTERNAL_CONNECT_ORIGIN])].sort(),
  ].join(' ')
  // O preâmbulo do react-refresh é script inline, e só existe no servidor de dev. Em preview e em
  // produção o bundle é arquivo, então `script-src 'self'` basta e é o que fica no `dist`.
  const scriptSource = [
    SELF,
    WASM_UNSAFE_EVAL,
    ...(allowsInlineScript ? [UNSAFE_INLINE] : []),
  ].join(' ')

  return [
    `default-src ${SELF}`,
    `base-uri ${SELF}`,
    `connect-src ${connectSource}`,
    `font-src ${SELF}`,
    `form-action ${SELF}`,
    `frame-ancestors ${NONE}`,
    // O `iframe` do mapa do endereço era o único do bundle, e saiu pela ADR-0037; o Keycloak roda
    // com `checkLoginIframe: false`, então não há um segundo.
    `frame-src ${NONE}`,
    /**
     * `blob:` é a foto de perfil. Ela desce por rota autenticada — `<img src>` não manda o token —,
     * então a tela busca os bytes e desenha uma URL de objeto. Sem esta palavra a imagem é
     * bloqueada **depois** de baixada, e a ficha mostra o ícone de imagem quebrada sem dizer por quê.
     */
    /**
     * A API entra aqui porque a tela de entrar mostra o logotipo da transportadora, servido pela
     * rota pública que o site institucional já usa — imagem de origem cruzada, e `connect-src` não
     * governa `<img>`.
     */
    `img-src ${[SELF, 'blob:', ...imageOrigin].join(' ')}`,
    `manifest-src ${SELF}`,
    `object-src ${NONE}`,
    `script-src ${scriptSource}`,
    // Camada flutuante e barra de progresso calculam posição e largura em tempo de execução, e isso
    // é atributo `style`, que nonce não cobre. Em script `unsafe-inline` seria execução de terceiro;
    // aqui é a folha que o próprio bundle escreve.
    `style-src ${SELF} ${UNSAFE_INLINE}`,
    `worker-src ${SELF}`,
  ].join('; ')
}
