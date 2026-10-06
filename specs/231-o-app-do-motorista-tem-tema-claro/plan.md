# Plan — spec 231

Só front-end do app do motorista. Sem backend. O tema de login do Keycloak (`deploy/keycloak/theme/login`)
já lê `transportada_theme`; nada muda lá.

- `src/styles/index.css`: `:root[data-theme='light']` e `@media (prefers-color-scheme: light)`.
- `src/modules/shared/`: cópia por valor do painel (`colorTheme.constant`, `colorTheme.service`,
  `browserColorTheme.service`, `useColorTheme.hook`); `syncThemeColorMeta` é só do motorista.
- `KeycloakAuthProvider.provider.ts`: `shareColorThemeWithLoginScreen` ao criar o cliente.
- `main.tsx`: aplica a escolha e a cor da barra no início de `start()`.
- `DriverProfile.page.tsx`: seção "Aparência" com o botão; ícones `sun`/`moon` no registro de ícones.
- Locales `theme.*` (pt/en).

## Riscos

- Cor fixa em CSS que escape do tema: varredura achou só `#000` na impressão e a grade de recorte sobre
  a foto — independentes de tema. Prints das telas principais em claro e escuro revisados.
- O espelho do Keycloak é único para painel e motorista: vale a última entrada.
