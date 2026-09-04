# ADR-0060 — O tema escolhido no painel atravessa para a tela de login

- **Data:** 2026-09-03
- **Estado:** aceita
- **Contexto:** adendo à decisão registrada no commit `ddffd58f` e em `docs/frontend/login-theme.md`,
  que recusou um botão de sol/lua na tela de login.

## Contexto

O painel tem botão de tema, e a escolha dele mora em `localStorage['transportada:color-theme']`, na
origem da aplicação (`localhost:53000` em local, o domínio do painel em produção). A tela de login é
servida pelo Keycloak, em **outra origem** — e origem diferente não alcança esse armazenamento.

A decisão anterior aceitou a consequência: o login obedece só ao `prefers-color-scheme` do sistema.
O raciocínio era que um botão próprio na tela de login guardaria uma **segunda** preferência, e o
mesmo navegador entraria claro e sairia escuro.

O raciocínio continua certo sobre o **botão**. O que ele não pesou é o caso comum: quem põe o painel
no claro com o sistema no escuro — medido nesta máquina em 03/09/2026, `AppleInterfaceStyle=Dark`
com o painel em `light` — atravessa duas identidades visuais no mesmo gesto de entrar. A tela de
login é a primeira coisa que a pessoa vê do produto, e ela discorda da segunda.

## Decisão

A escolha do painel **viaja na URL de login**, e a tela de login a aplica. Ninguém escolhe nada do
lado do Keycloak.

1. O painel põe `transportada_theme=dark|light` na URL de autenticação. A costura é
   `keycloak.createLoginUrl`, não `login()`: `init({onLoad: 'login-required'})` redireciona por
   dentro do keycloak-js, e um decorador em volta do `login()` não veria o caminho de entrada mais
   comum. No keycloak-js o método é campo de instância e as chamadas internas são
   `this.createLoginUrl(...)`, então sobrescrever na instância cobre entrada, reautenticação e a
   etapa de identificação de uma vez.
2. O tema lê o parâmetro em `resources/js/color-theme.js` e escreve `data-theme` no `<html>`. O
   script entra **sem `defer` e antes da folha de estilo** — com `defer`, como o `theme.properties`
   carrega todo o resto, o atributo chegaria depois da primeira pintura e a tela piscaria no tema
   errado.
3. O `login.css` ganha a mesma forma de duas portas do painel: `:root[data-theme='light']` para a
   escolha que chegou, e `@media (prefers-color-scheme: light) { :root:not([data-theme='dark']) }`
   para quem chegou sem escolha nenhuma.
4. O valor é **espelhado** no `localStorage` da origem do Keycloak, porque só a primeira tela carrega
   o parâmetro: as seguintes (`/login-actions/…`, troca de senha obrigatória, sessão expirada) o
   perderam na navegação.

## O espelho não é a segunda preferência que a decisão anterior recusou

A objeção original era a duas **escolhas** independentes. Aqui não há escolha do lado do Keycloak: o
espelho é cópia da escolha do painel, reescrita a cada entrada. Trocar o tema no painel e entrar de
novo sobrescreve o espelho no mesmo gesto — ele não sobrevive a uma discordância.

O que sobrevive é o caso em que alguém abre a tela de login **sem passar pelo painel** (link direto,
sessão expirada numa aba antiga): aí o espelho responde com a última escolha conhecida, que é uma
resposta melhor do que o sistema operacional. Sem espelho, esse caminho piscaria de volta ao tema do
sistema no meio do fluxo.

## Consequências

- O parâmetro é visível na URL. Não é dado pessoal e não é segredo: é `dark` ou `light`.
- Valor desconhecido no parâmetro é **ausência**, não erro — cai no espelho, e depois no sistema.
- `localStorage` indisponível (aba anônima, armazenamento bloqueado) não quebra nada: o parâmetro
  ainda pinta a primeira tela, e as seguintes seguem o sistema.
- **O portal do contratante (`frontend-client`) não participa.** Ele não tem botão de tema, então não
  tem escolha a repassar; quem entrar por lá continua obedecendo ao sistema.
- Contrato em `apps/frontend-transportada/test/design-system/login-theme-handoff.contract.ts`: as
  duas pontas do repasse, o `createLoginUrl` como costura, a ordem do script no `template.ftl` e as
  duas portas do CSS.
