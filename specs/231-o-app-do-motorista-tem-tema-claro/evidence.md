# Evidence — spec 231

Base: `origin/staging` em `8cba94b7b`. Branch `work/spec-231-tema-claro`.

## Vermelho antes (T1.1)

`test/shared/color-theme.contract.ts`: os módulos `colorTheme.constant`/`colorTheme.service` não
existiam.

## Prova por mutação (T1.4)

| #   | Mutação                                 | Contrato | Smoke   |
| --- | --------------------------------------- | -------- | ------- |
| 1   | o bloco do sistema diverge do explícito | 1 falha  | 1 falha |
| 2   | o botão não guarda a escolha            | —        | 1 falha |
| 3   | o tema não vai para o login             | 1 falha  | 1 falha |
| 4   | o boot não aplica a escolha guardada    | 1 falha  | 1 falha |
| 5   | a barra do navegador não acompanha      | —        | 1 falha |

## Revisão de design (T1.5)

`test/spec-231-prints.smoke.spec.ts`: `prints/{viagem,parada,viagem-com-aviso,fila,perfil}-{light,dark}.png`.
As telas de borda foram conferidas à parte: notificações e login do app em claro, e a tela de login do
Keycloak recebendo `transportada_theme=light|dark` (conferido na URL de autenticação e na tela).
Contraste do cobre como cor de texto (aviso, selo "na fila", botão primário) legível em papel.

## Gates

Sobre `origin/staging` em `8cba94b7b`: `format:check` limpo; typecheck e lint em exit 0 nas duas apps;
app do motorista 1048 pass / 0 fail; painel 6261 pass / 0 fail e `test:hooks` 248 / 0; smoke completo do
app do motorista 33 passed (rodando com o sistema em claro, que é o padrão do Playwright — o app agora
obedece).
