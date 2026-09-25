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
