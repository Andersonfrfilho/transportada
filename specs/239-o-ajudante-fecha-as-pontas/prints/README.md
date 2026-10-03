# Spec 239 — T7: prints da revisão de design (rodada 3, contra o HEAD `27064d544`)

Refeitos em 2026-10-03 no worktree `busy-jang-2057c9` (branch `work/spec-239-ajudante-pontas`), depois das
correções da revisão final. Na rodada 3 foram regenerados só as telas 15 a 18, 22 e 23 (correções D1 e N1). Todos os dados são fictícios. Substituem os 68 PNGs da rodada anterior.

Cada tela tem quatro arquivos: `375` (celular, `deviceScaleFactor` 2) e `1280` (desktop), cada um em `escuro`
e `claro`. Nomes: `NN-descricao-largura-tema.png`. São 23 telas e 92 PNGs.

## Como foram capturados

- **Painel** (`apps/frontend-transportada`): Vite da própria app (`./node_modules/.bin/vite --host localhost`) com
  `VITE_SMOKE_AUTH_BYPASS=true`, `VITE_API_URL` para uma API de mock em Bun (porta 53912), `VITE_APP_URL` e
  `VITE_KEYCLOAK_*`. Duas instâncias: 53010 (com `VITE_DRIVER_APP_URL=http://localhost:53112`) e 53011 (sem a
  variável, só para a tela 08). As permissões de cada conta vêm do `/auth/me` simulado.
- **App do motorista** (`apps/frontend-driver`): Vite da própria app em `localhost:53112` (única origem aceita pelo
  realm local), login real no Keycloak local com `local-user`. `GET /me/trips/current` simulado com `page.route`
  no envelope de `serializeTrip`.
- Chromium headless (Playwright), service worker bloqueado. Estado e medidas por localizador e `getComputedStyle`;
  o screenshot só fecha cada tela. Telas 10, 11, 12, 20 e 21 são recorte do formulário ou do diálogo; a 18 é recorte
  da barra de lote; a 13 é `fullPage` (a barra lateral fixa aparece deslocada: artefato da captura). As do app do
  motorista usam viewport alto (375×1500 e 1280×1100).
- Todos os servidores subidos foram parados no fim.

## Lista

| Nº  | Arquivos                                          | O que prova                                                                                                                                                                                                                                                      |
| --- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01  | `01-frota-diaria-ajudante-com-valor-*`            | Painel "Diária do ajudante" com 120,00, dica e "Salvar diária".                                                                                                                                                                                                  |
| 02  | `02-frota-diaria-ajudante-vazia-*`                | Sem valor padrão: campo vazio e dica da lacuna.                                                                                                                                                                                                                  |
| 03  | `03-frota-diaria-ajudante-salva-*`                | Digitado 135,50 e salvo: "Diária do ajudante salva." (`role="status"`).                                                                                                                                                                                          |
| 04  | `04-frota-diaria-ajudante-somente-leitura-*`      | Só `fleet.read`: campo desabilitado, sem "Salvar diária" nem "Novo motorista".                                                                                                                                                                                   |
| 05  | `05-frota-diaria-ajudante-erro-ao-salvar-*`       | PUT 400: mensagem com o código longo, `role="alert"`, valor mantido. **Agora quebra linha** (B2).                                                                                                                                                                |
| 06  | `06-frota-diaria-ajudante-erro-ao-carregar-*`     | GET 500: alerta **e botão "Tentar de novo"**.                                                                                                                                                                                                                    |
| 07  | `07-sem-acesso-ajudante-com-botao-*`              | Só `trip.read`, com `VITE_DRIVER_APP_URL`: link "Abrir o app do motorista".                                                                                                                                                                                      |
| 08  | `08-sem-acesso-ajudante-sem-botao-*`              | Mesma conta, sem a variável: mesmo texto, sem link.                                                                                                                                                                                                              |
| 09  | `09-sem-acesso-comum-*`                           | Conta sem permissão: "Peça ao administrador…".                                                                                                                                                                                                                   |
| 10  | `10-ficha-ajudante-nova-*`                        | Ficha nova, perfil Ajudante: "Endereço do ajudante", sem "Nota do motorista" e sem "Regiões que o motorista atende".                                                                                                                                             |
| 11  | `11-ficha-ajudante-edicao-*`                      | Edição do ajudante puro (Bruno): as mesmas legendas.                                                                                                                                                                                                             |
| 12  | `12-ficha-motorista-nova-*`                       | Ficha nova, perfil Motorista: "Endereço da empresa do agregado", "Endereço do motorista" e "Regiões que o motorista atende".                                                                                                                                     |
| 13  | `13-acesso-papel-com-e-sem-ficha-*`               | Link "AJUDANTE" (com ficha) e selo "AJUDANTE" (sem ficha): mesma grafia.                                                                                                                                                                                         |
| 14  | `14-acesso-salvar-recusado-409-*`                 | Edição de papéis (diálogo): 409 vira mensagem `role="alert"`, diálogo aberto, 0 `pageerror` (A3).                                                                                                                                                                |
| 15  | `15-app-motorista-ajudante-acompanha-*`           | **Refeita.** Ajudante com uma nota entregue ("Entregue às 10:20"), uma devolvida ("Ausente") e uma pendente; só "Navegar" e "Ver chave".                                                                                                                         |
| 16  | `16-app-motorista-motorista-com-acoes-*`          | Motorista: sem aviso, com "Entreguei", "Não entreguei" e "Ocorrência".                                                                                                                                                                                           |
| 17  | `17-app-motorista-viagem-legada-sem-crewrole-*`   | Sem `crewRole`: igual ao motorista.                                                                                                                                                                                                                              |
| 18  | `18-acesso-lote-papeis-falha-na-barra-*`          | Dois usuários selecionados, papel aplicado em lote, mock responde 403: a barra mostra "Seu acesso não administra usuários desta empresa." (`role="alert"`). **N1:** fundo do alerta em `var(--color-graphite)`, contraste 4,87:1 (escuro) e 5,12:1 (claro).      |
| 19  | `19-frota-diaria-ajudante-edicao-apaga-salvo-*`   | **Nova.** Depois de "salva", editar o campo de novo: o "Salvo" some (valor 7.135,50 digitado por cima).                                                                                                                                                          |
| 20  | `20-ficha-motorista-que-ajuda-edicao-*`           | **Nova.** Marcos (motorista que também ajuda): mantém "Nota do motorista", "Endereço do motorista" e "Regiões que o motorista atende".                                                                                                                           |
| 21  | `21-ficha-rapida-ajudante-sem-regioes-*`          | **Nova.** Diálogo de criação rápida (Veículos › Novo veículo › Cadastrar novo motorista), perfil Ajudante: sem regiões, com "Endereço do ajudante".                                                                                                              |
| 22  | `22-app-motorista-ajudante-viagem-nao-iniciada-*` | Ajudante com viagem `route_planned`. **D1:** mostra "Aguardando o despacho — as ações de campo liberam depois de despachar a viagem.", sem "Despachar viagem" e sem nenhuma ação (só "Navegar" e "Ver chave"). O motorista na mesma viagem vê o texto e o botão. |
| 23  | `23-app-motorista-papel-desconhecido-trainee-*`   | **Nova.** `crewRole: 'trainee'`: abre em somente leitura, com o aviso de ajudante, sem erro de tela.                                                                                                                                                             |

## Medições

### Gerais (92 capturas)

- **Overflow horizontal:** `scrollWidth == innerWidth` em todas (375 e 1280).
- **`pageerror`: 0 em todas.**
- **Console, só os esperados:** 05 = o 400 simulado; 06 = dois 500 simulados (carga e nova tentativa); 14 = o 409
  simulado; 18 = o 403 e o 409 simulados; 15 a 17, 22 e 23 = três 404 (dois `POST /login-hints` sem dublê e o
  `landing-logo`, que responde 404 de propósito).
- **Alvos de toque:** nenhum controle abaixo de 44 px em `main` nas telas do app do motorista.

### Painel da diária (01 a 06, 19)

- **Tela 05, B2 corrigido a 375 px:** `sectionRight` 359, **margem direita 16 px**, `scrollWidth` 375 e alerta com
  `overflow-wrap: anywhere` (scroll interno igual ao client, 301 px). A 1280, margem de 24 px.
- **Tela 06, "Tentar de novo":** botão 191×48, foco visível (outline sólido de 2 px), contraste 5,87:1 no escuro e
  4,57:1 no claro. Clique com o mock ainda em 500: um GET a mais e o erro continua. Com o mock voltando a 200: outro
  GET, o campo aparece com 120,00 e o alerta e o botão somem. Igual nos 4 casos.
- **Tela 19:** `savedStatus` 1 antes da edição e 0 depois.
- Campo 265×48 a 375; "Salvar diária" 172×48; contraste do botão 5,87:1; do erro 4,87:1 (escuro) e 5,12:1 (claro).

### Sem acesso (07 a 09)

Link 248×48, "Sair" 91×48, `href=http://localhost:53112`, `rel="noopener noreferrer"`; foco visível no primeiro
controle. Sem diferença da rodada anterior.

### A6 (13)

Link e selo iguais em `text-transform`, `font-size` (11,52 px), família, borda e padding, nos dois temas.
Contraste 5,55:1 (escuro) e 5,27:1 (claro). Altura do link 44 px a 375 e 28 px a 1280; selo 24 px.

### Fichas (10, 11, 12, 20, 21)

| Tela | Legendas                                                                                                                                                                  |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 10   | Identificação do ajudante · Dados pessoais do ajudante · Endereço do ajudante · Veículos vinculados                                                                       |
| 11   | idem                                                                                                                                                                      |
| 21   | idem (diálogo)                                                                                                                                                            |
| 12   | Identificação do motorista · Endereço da empresa do agregado · Dados pessoais do motorista · Endereço do motorista · Veículos vinculados · Regiões que o motorista atende |
| 20   | Nota do motorista · as mesmas da 12 (com "Endereço da empresa do agregado" presente)                                                                                      |

Nas telas 10, 11 e 21: "Nota do motorista", "Regiões", "Endereço do motorista" e "Endereço da empresa do agregado"
**ausentes** do DOM.

### Lote de papéis (18)

- Primeira tentativa (403): um `role="alert"` com a mensagem de `COMPANY_USERS_FORBIDDEN`, barra aberta, 0 `pageerror`.
- Segunda (409): o alerta troca para a mensagem de `FLEET_DRIVER_PROFILE_EMPTY`, ainda um só.
- Terceira, com resposta lenta: **durante** a requisição 0 alertas e "Aplicar" desabilitado; no sucesso a barra some.
- Contraste do alerta (13,6 px), medido por `getComputedStyle` na rodada 3 (N1 corrigido): **4,87:1 no escuro** (texto `rgb(255, 95, 87)` sobre `28,43,51`) e **5,12:1 no claro** (`rgb(194, 56, 47)` sobre `251,249,245`), idêntico a 375 e 1280. Um `role="alert"`, 0 `pageerror`, sem overflow horizontal.

### App do motorista (15 a 17, 22, 23)

- **15:** aviso `role="status"`, 343 px a 375 e 608 px a 1280; contraste 14,48:1 (escuro) e 12,66:1 (claro); filete de
  4 px. Texto lido: "Entregue às 10:20" na nota 900123 e "Ausente" na 900125. Botões: só "Navegar" e "Ver chave".
- **16 e 17:** "Navegar", "Ver chave", "Entreguei", "Não entreguei", "Ocorrência", sem aviso.
- **22 (D1 corrigido, rodada 3):** o ajudante em `route_planned` lê "Aguardando o despacho" (`hasWaitingText` verdadeiro nos 4 casos), com aviso de ajudante e só "Navegar" e "Ver chave"; sem "Despachar viagem". O motorista na mesma viagem (sonda, não publicada) lê o texto e tem o botão "Despachar viagem". Nenhum `POST`/`PUT` para `/me/…`.
- **15 a 17 e 23 (rodada 3):** iguais à rodada 2 por texto e botões (15: "Entregue às 10:20"/"Ausente" presentes, só "Navegar" e "Ver chave"; 16 e 17: "Entreguei", "Não entreguei", "Ocorrência"; 23: aviso e só leitura), 0 `pageerror`, 0 controles abaixo de 44 px.
- **23:** `crewRole` desconhecido degrada para ajudante (aviso e só leitura), sem `pageerror`.
- **Nenhum `POST`/`PUT` para `/me/…`** em nenhuma das cinco variantes.

## Estado dos achados

| ID            | Estado                                                                                                                                                                   |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A3            | Verificado: telas 14 e 18, 0 `pageerror`; a barra de lote agora mostra a falha.                                                                                          |
| A6            | Verificado (tela 13).                                                                                                                                                    |
| A7            | Verificado (telas 10, 11, 21).                                                                                                                                           |
| B1            | Corrigido: ficha do ajudante sem "Nota do motorista" e sem regiões, com "Endereço do ajudante"; motorista mantém (12, 20).                                               |
| B2            | Corrigido: margem direita 16 px e sem alargar a aba (tela 05).                                                                                                           |
| D1            | **Corrigido e verificado** (tela 22, rodada 3): o ajudante vê o texto de espera e nenhuma ação; só quem reporta despacha.                                                |
| N1            | **Corrigido e verificado** (tela 18, rodada 3): 4,87:1 no escuro e 5,12:1 no claro.                                                                                      |
| Revisão final | Diária: leitura com "Tentar de novo" (06), "Salvo" some ao editar (19). App do motorista: selo e hora mantidos para o ajudante (15), papel desconhecido em leitura (23). |

## Novos achados

| ID  | Severidade        | Onde                                                                                                                                              | Achado                                                                                                                                                                                                                                                                                                                                                                              |
| --- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Média (corrigido) | `apps/frontend-driver/src/modules/driver-trip/pages/DriverTripWorkspace.page.tsx:669-670` e `:961`; `components/DriverStopCard.component.tsx:571` | O texto "Aguardando o despacho…" não aparece para o ajudante. `isTripAwaitingDispatch` inclui `canReportOnTrip(trip)`, que é falso para ajudante, e o cartão recebe esse valor em `isFieldWorkBlocked`. Medido: motorista em `route_planned` vê o texto e "Despachar viagem"; ajudante na mesma viagem não vê o texto (tela 22). Falta um valor de espera que não dependa do papel. |
| N1  | Baixa (corrigido) | `apps/frontend-transportada/src/modules/identity/styles/userAdministration.module.css:290-297` (`.feedback`)                                      | O alerta da barra de lote, no tema claro, tem contraste 4,19:1 (texto vermelho 13,6 px sobre fundo rosado), abaixo de 4,5:1. No escuro passa (5,01:1).                                                                                                                                                                                                                              |
| N2  | Informativo       | Mensagem de 409 na barra de lote                                                                                                                  | A barra só acrescenta papéis, então `FLEET_DRIVER_PROFILE_EMPTY` não deveria ocorrer ali; o 409 foi simulado para provar a exibição. O texto fala em tirar papéis, coisa que o lote não faz.                                                                                                                                                                                        |

## O que não foi fotografado

- Skeleton de carregamento do painel da diária (o mock responde na hora).
- Clique real em "Abrir o app do motorista" (muda de origem; conferidos `href` e `rel`).
- Os estados intermediários das telas 06 e 18 (nova tentativa) são medidos por texto, não fotografados.

**Ponto que o usuário deve decidir:**

- Aprovar os prints para a ida a staging.
