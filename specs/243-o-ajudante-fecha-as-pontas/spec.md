# Spec 243 — O ajudante fecha as pontas: cobrança fechada ao campo, diária geral na tela, login com destino

> 🤖 Modelo: `opus` 🧠 (autorização da cobrança, papel na resposta do motorista) · `sonnet` (painel, app do
> motorista, correções) · `haiku` (documentação)

## Problema

A spec 235 (ajudante é perfil) saiu em staging com cinco pontas abertas, todas medidas no código:

1. **A cobrança de entrega vaza para o campo.** `GET /delivery-charges` e `GET /delivery-clients/:id/charge-rules`
   pedem `trip.read` e devolvem as cobranças e as regras da **empresa inteira**. `trip.read` é de `driver`,
   `aggregate`, `separator` e, desde a 235, `helper`. Nenhuma tela do campo consome essas rotas; o único
   consumidor é o painel do escritório (`extraChargesClient.service.ts`). É um BOLA (API1:2023) registrado em
   `docs/SECURITY.md` desde 2026-09-18.
2. **A diária geral do ajudante não tem tela.** A API (`/company-crew-settings`, `fleet.read`/`fleet.manage`)
   existe desde a 149, mas o painel não tem cliente, query nem campo: sem a diária geral, todo ajudante sem
   diária própria vira lacuna `HELPER_DAILY_RATE_MISSING` na conta da viagem e o operador não tem onde
   resolver.
3. **O login só de ajudante cai num beco.** Com só `trip.read`, nenhum workspace do painel abre e a conta vê
   "nenhuma permissão foi atribuída" — falso, ela tem uma. E o app do motorista abre para o ajudante (não dá
   403), mostra os botões de ação do motorista, e cada toque enfileira e volta 403 da API, porque a
   resposta de `/me/trips/current` não diz o papel da pessoa na tripulação.
4. **Três achados de design da 235 ficaram pendentes** (README dos prints): A3 (promise de salvar sem
   tratamento vira `pageerror`), A6 (papel com ficha é link, sem ficha é selo, grafias diferentes), A7
   (perfil Ajudante ainda vê "Identificação do motorista" e "Endereço da empresa do agregado").

## Resultado

- A cobrança é leitura do **escritório**: o campo (driver, aggregate, separator, helper) recebe 403.
- O painel tem a **diária geral do ajudante** na aba de motoristas da frota.
- Quem só tem `trip.read` vê no painel para onde ir (o app do motorista), e o app do motorista sabe que a
  pessoa é **ajudante**: mostra a viagem, diz o papel e não oferece ações que a API recusaria.
- A3, A6 e A7 fechados.

## Fora do escopo

- Recortar a cobrança pelo vínculo do motorista (não há consumidor de campo; fechar a rota ao campo é mais
  barato e mais seguro — se um dia o campo precisar ler cobrança, nasce rota `/me` própria).
- Dar ao ajudante ações no app do motorista (reportar, dar baixa). Ele acompanha; não opera.
- Versão otimista da diária geral (a tabela é de uma linha por empresa, last-write-wins desde a 149).
- A8 e A9 da revisão de design (observações).

## Decisões (padrões — o usuário pode mudar antes da Fase 1)

- **D1 — Cobrança é do escritório: `trip.financials`.** `CHARGE_READ_POLICY` passa de `trip.read` para
  `trip.financials` (company-admin, finance, operator — os mesmos que abrem o workspace `extra-charges`).
  Escrita segue `trip.manage`. Contrato nos dois sentidos: o escritório lê; driver, aggregate, separator e
  helper recebem `403`. O contrato da 235 que pina as duas rotas como alcançáveis pelo helper é revisto.
- **D2 — A diária geral mora na aba de motoristas, sem entrar no registro de painéis de configuração.**
  Segue o `EnergySettingsPanel` (que também não está em `SETTINGS_PANEL_PLACEMENT`): a permissão é a da API
  (`fleet.read` vê, `fleet.manage` edita), não `settings.manage`, e o registro presumiria `settings.manage`.
  A divergência com a RF-2 da 149 fica registrada no ADR.
- **D3 — A resposta do motorista diz o papel.** `GET /me/trips/current` passa a devolver, por viagem,
  `crewRole: 'driver' | 'helper'` (já existe `findCrewRole`). Sem mudar nenhuma regra de quem lê o quê.
- **D4 — O app do motorista trata o ajudante como acompanhante.** Com `crewRole = 'helper'`: aviso fixo
  "Você acompanha esta viagem como ajudante", sem os botões de ação que exigem `trip.report`; a fila de
  envio nunca recebe ação de ajudante. Motorista não muda.
- **D5 — O painel manda quem só tem `trip.read` para o app do motorista.** A tela de "sem acesso" ganha
  uma variante para conta com `trip.read` e sem workspace: texto próprio ("Sua conta acompanha viagens pelo
  app do motorista") e, quando `VITE_DRIVER_APP_URL` existe, um botão para abri-lo. Sem permissão alguma,
  segue o texto atual.
- **D6 — A7 pelo predicado que já existe.** A legenda vira "Identificação do ajudante" e o bloco do
  endereço da empresa do agregado some quando `isHelperOnlyDriver`.
- **D7 — A6 por CSS.** O link do papel com ficha usa a mesma caixa e a mesma grafia do selo.
- **D8 — A3 por `try/catch` no hook.** O erro já está em `mutation.error` e a tela o mostra; o hook só deixa
  de rejeitar a promise, mantendo o diálogo aberto quando falha.

## Requisitos funcionais

- **RF-1** `CHARGE_READ_POLICY = trip.financials` nas duas rotas; contrato positivo (escritório) e negativo
  (quatro papéis de campo); `docs/SECURITY.md` fecha a entrada de 2026-09-18.
- **RF-2** Painel "Diária do ajudante": cliente, query e mutation de `/company-crew-settings`, campo
  monetário, "usa a padrão do sistema" quando vazio, texto de erro, locales pt/en, contrato no padrão de
  `test/fleet/`.
- **RF-3** `crewRole` na resposta de `/me/trips/current` e no cliente do app do motorista.
- **RF-4** App do motorista: aviso e ações escondidas para o ajudante, com contrato de componente.
- **RF-5** `NoWorkspaceAccess` com variante de acompanhamento e botão para o app do motorista.
- **RF-6** A3, A6 e A7.

## Requisitos não funcionais

- `companyId` sempre do contexto; nenhuma rota nova de campo.
- A diária geral nunca é logada com identificação de pessoa; valor decimal com quatro casas, como a API exige.
- Texto só em locale; identificadores em inglês; sem estilo inline; um componente por arquivo.

## Casos extremos e falhas

- Conta com `trip.read` **e** workspace visível: segue o fluxo normal, a variante de acompanhamento não aparece.
- `VITE_DRIVER_APP_URL` ausente: a variante mostra o texto sem botão.
- Ajudante sem ficha de frota: `/me/trips/current` devolve `isRegisteredDriver: false`, e o app mostra o
  aviso de sempre.
- Viagem com o mesmo CPF como motorista numa e ajudante noutra: `crewRole` é por viagem.
- Operador `finance` sem `trip.manage`: lê cobranças (`trip.financials`) mas não confirma nem descarta.
- Diária geral vazia e ajudante sem diária própria: a conta da viagem continua com a lacuna
  `HELPER_DAILY_RATE_MISSING`, agora com onde resolver.

## Critérios de aceite

1. `GET /delivery-charges` e `GET /delivery-clients/:id/charge-rules` respondem 403 a driver, aggregate,
   separator e helper, e 200 a company-admin, finance e operator.
2. O operador define a diária geral na aba de motoristas e a viagem seguinte a usa.
3. O ajudante abre o app do motorista, vê a viagem e o aviso, e não tem botão de ação.
4. A conta só com `trip.read` no painel vê o destino certo, não "nenhuma permissão".
5. A3 sem `pageerror`; A6 sem grafias diferentes; A7 sem os textos de motorista/agregado para o ajudante.
6. `make check`, `make migration-test` (sem migration nova, `db:generate` = `no_changes`) e revisão de
   design com prints, vistos pelo usuário antes de ir a staging.

## Dúvidas

Nenhuma bloqueante — D1 a D8 são padrões. As duas mais sensíveis: D1 (trocar a permissão da cobrança, que
tira o acesso de quem a lia por engano) e D4 (o ajudante acompanha, não opera).
