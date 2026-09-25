# Evidência — Spec 190

## Antes (Keycloak local em 58080, tema idêntico ao de `origin/staging`)

Entrada pelo app (`localhost:53000`) com `local-user`:

| Tela                                     | `[data-identity-restart]`               | `#reset-login` |
| ---------------------------------------- | --------------------------------------- | -------------- |
| `openid-connect/auth?…&login_hint=…`     | visível, `href=http://localhost:53000/` | não renderiza  |
| `login-actions/authenticate` (após erro) | **`hidden`, `href="#"`**                | não renderiza  |
| `login-actions/restart` (após erro)      | mesma tela, "Entrando como local-user"  | não renderiza  |

URL depois do erro: `…/login-actions/authenticate?execution=…&client_id=transportada-spa&tab_id=…&client_data=eyJydSI6…`.
O `client_data` decodificado traz `{"ru":"http://localhost:53000/auth/callback","rt":"code","rm":"fragment","st":…}`.

## Contrato (T1.1)

Antes da implementação, `bun test test/design-system.contract.test.ts -t "password only"`: **8 pass, 4 fail**
(rótulo, botão do tema, `client_data`, bundles). Depois: **12 pass, 0 fail**.

## Sonda com o tema novo (T1.3)

Container `quay.io/keycloak/keycloak:26.5.2` em `127.0.0.1:58081`, com o tema e o realm local montados.
Playwright, `reducedMotion: 'reduce'` (a entrada do painel é animada), senha errada e clique no botão:

```
desktop senha { url: '/realms/transportada-local/login-actions/authenticate', error: 'Usuário ou senha inválidos.',
                user: 'local-user', button: 'Trocar de usuário', href: 'http://localhost:53000/' }
desktop identificador { url: 'http://localhost:53000/auth/callback', field: '' }
mobile  senha { … mesmos valores … }
mobile  identificador { url: 'http://localhost:53000/auth/callback', field: '' }
```

Revisão de design: botão com 48px de altura, igual ao "Entrar"; mesma moldura de `action-quiet` do
"Tentar de outro jeito" (borda `slate 32%`, texto cobre, sem raio); ícone de seta em `currentColor`,
`aria-hidden`. Em 375px, `scrollWidth` = 375 com e sem o botão. O "Esqueci minha senha" do app, que
sumia depois do erro pela mesma causa, voltou.

Prints: `evidence/senha-desktop.png`, `evidence/senha-mobile.png`, `evidence/identificador-desktop.png`,
`evidence/identificador-mobile.png`.

## Gates

- `bun run --cwd apps/frontend-transportada test`: 5327 pass / 0 fail, mais 54 pass / 0 fail (hooks).
- `bun run lint`, `bun run typecheck`: limpos.
- `apps/api-transportada`, `bun test test/deploy.contract.test.ts`: 184 pass / 0 fail.
- `test/keycloak-realm.contract.test.ts` (raiz): 18 pass / 0 fail.
- `prettier --check` nos arquivos tocados: limpo.

## Fase 2 — Identificador lembrado e "Continuar conectado"

Contratos antes da implementação: `login-identifier-memory` sem o módulo (falha de import) e
`continuar conectado` com **1 pass, 3 fail**. Depois: `test/identity.contract.test.ts` 244 pass /
0 fail, e `test/deploy.contract.test.ts` da API 188 pass / 0 fail.

Sonda do Keycloak 26.5.2 com o realm novo (mais o callback da porta 53010), Vite deste worktree em
`localhost:53010`, Playwright com `reducedMotion: 'reduce'`:

```
desktop senha { rememberMeLabel: 'Continuar conectado', rememberMeVisible: true }
desktop identificador { url: 'http://localhost:53010/auth/callback', value: 'local-user', selected: 10 }
mobile  senha { rememberMeLabel: 'Continuar conectado', rememberMeVisible: true }
mobile  identificador { url: 'http://localhost:53010/auth/callback', value: 'local-user', selected: 10 }
```

Login com a senha certa e o navegador "reaberto" (novo contexto só com os cookies que têm validade):

```
sem continuar conectado  → reaberto em /auth/callback, tela "Digite como você é conhecido no sistema."
                            identificador na aba após o login: null
                            cookies persistentes: KC_AUTH_SESSION_HASH, KEYCLOAK_SESSION
com continuar conectado  → reaberto em /, painel "NF-e Workspace … Local User", sem identificação nem senha
                            identificador na aba após o login: null
                            cookies persistentes: + KEYCLOAK_IDENTITY, KEYCLOAK_REMEMBER_ME
```

Revisão de design: a caixa é o `.field-inline` do tema (marcação em cobre, texto `slate`), entre o erro
e o "Entrar"; o campo da identificação volta com o valor selecionado. Prints:
`evidence/senha-lembrar-{desktop,mobile}.png`, `evidence/identificador-preenchido-{desktop,mobile}.png`.
