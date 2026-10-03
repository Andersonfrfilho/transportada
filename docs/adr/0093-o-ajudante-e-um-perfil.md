# ADR 0093 — O ajudante é um perfil

- Status: aceito
- Data: 2026-10-02
- Nasce da spec 235 (revisão da D1 da spec 149)
- Citações: spec 235 (D1 a D8), ADR-0065

## Contexto

A spec 149 criou `fleet_drivers.can_act_as_helper` e o conceito de ajudante, mas a política supunha que
todo ajudante era um motorista que também ajuda. Na operação real o ajudante costuma ser **só ajudante**:
não dirige, não tem CNH, e não deveria ser escalado como condutor de viagem nem estar em risco de entrar
num MDF-e avulso com `can_drive = false`.

Hoje o cadastro trata qualquer pessoa como condutor em potencial, e a tela de viagem não oferecia lugar
para marcar quem é ajudante (T12 da 149 nunca foi feita, e o formulário não tinha controle próprio).

## Decisão

### 1. Ajudante é um terceiro perfil, ao lado de Motorista e Agregado

Um papel `helper` (cadeia `'helper'`) entra no catálogo de Acesso (`COMPANY_ROLES`), nos CHECKs de
`membership_roles` e `user_invitation_roles` (D1 revisada). Dois perfis do cadastro de frota
(`FLEET_DRIVER_PROFILES`: `driver`, `aggregate`, `helper`) e um papel em Acesso (`FLEET_LINKED_ROLES`)
carregam o mesmo significado. As duas formas coexistem:

- criar a ficha com perfil `helper` marca o papel automaticamente;
- convidar alguém com papel `helper` em Acesso marca a ficha de mesmo CPF.

### 2. Ajudante não dirige: duas colunas carregam a capacidade

`fleet_drivers.can_drive` (novo, `boolean not null default true`) e `can_act_as_helper` (já existe)
caracterizam o que a pessoa **faz**. Um CHECK `can_drive or can_act_as_helper` garante que a ficha
não fica sem função:

- Perfil `helper` ⇒ `can_drive = false`, `can_act_as_helper = true`
- Perfis `driver`/`aggregate` ⇒ `can_drive = true`, `can_act_as_helper` conforme o switch da ficha

Nenhum gate de vencimento da CNH alcança o ajudante (ele não precisa ter CNH). A política de viagem
consulta as colunas, não o papel — assim papel e colunas são a mesma fonte para o seletor de ajudantes
(D2, D3).

### 3. Reconciliação papel → colunas: só quando a frota muda

Quando um papel `driver`, `aggregate` ou `helper` entra ou sai, a reconciliação (D4) roda dentro de
`replaceRoles`, transacional, com a ficha travada por `FOR UPDATE` e versão incrementada:

- `helper` entrou ⇒ `can_act_as_helper = true`
- `helper` saiu ⇒ `can_act_as_helper = false`
- `driver`/`aggregate` entrou ⇒ `can_drive = true`
- `driver`/`aggregate` saiu ⇒ `can_drive = false`

Se o resultado deixa `can_drive = false` **e** `can_act_as_helper = false`, a transação inteira é
recusada (`409 FLEET_DRIVER_PROFILE_EMPTY`) sem alteração parcial. Dar `fiscal` a alguém não mexe na
ficha.

Papéis herdados por **grupo** e a atribuição em lote (`assign`) **não** reconciliam — limite conhecido
(ADR-0065 aplicado: prova pela política pura, não por estado final). Pessoa sem ficha vinculada: nada a
reconciliar.

### 4. Ajudante não é condutor de viagem

`resolveTripCrew` e a proposta de viagem (`createMultiVehicleSuggestionUseCase`) recusam `can_drive = false`
como motorista (`409 TRIP_DRIVER_CANNOT_DRIVE`), filtrando o seletor por `can_drive` para motorista e
`can_act_as_helper` para ajudante. O MDF-e avulso (`POST /mdfe-manifests`) aplica a mesma regra: lista
de condutores **não** inclui quem não dirige (D5).

### 5. Permissão do ajudante é `trip.read`

O papel `helper` em `COMPANY_ROLE_PERMISSIONS` recebe só `['trip.read']` — menos que `driver`/`aggregate`
que têm `trip.report` (D7). No app do motorista ele lê a viagem, mas não reporta entrega nem comprovante.
Nenhum workspace do painel abre com `trip.read` isolada (decisão de produto fora da spec: qual app o
ajudante usa). **Ver ADR-0094 D1: a leitura de cobrança mudou de `trip.read` para `trip.financials`**
— o ajudante recebe `403` em `GET /delivery-charges` e `GET /delivery-clients/:id/charge-rules`.

### 6. Convite com ajudante: ficha pelo CPF

`helper` entra em `FLEET_LINKED_ROLES` (D8). O convite com esse papel casa a ficha órfã pelo CPF como
já faz com `driver` e `aggregate`; sem ficha, aparece o aviso `no-driver-record` e o convite sai. Ao
vincular, `linkFleetDriver` aplica a política `resolveInvitedFleetCrewCapabilities`: se `helper` nos
papéis, `can_act_as_helper = true` e `can_drive` sincroniza com a presença de `driver`/`aggregate`.

### 7. A política de viagem não consulta papel, só colunas

A política nunca chamou papel em Acesso — consulta `can_drive` e `can_act_as_helper` da ficha (D3). É
por isso que reconciliação transacional não é opcional: papel e colunas **têm** de estar em sintonia,
ou dois chamadores da mesma política (API e proposta) enxergam resultados divergentes.

## Consequências

- Tabela `fleet_drivers` e CHECKs de papel ganham uma coluna nova com `rollback.sql`; linhas existentes
  nascem `can_drive = true`.
- Dois caminhos para marcar ajudante (perfil + switch) gravam os mesmos campos, então há uma única fonte
  para o seletor e o validador de viagem.
- A política de frota é pura (sem I/O) e testável; a reconciliação se roda só ao tocar os papéis de
  frota, não a cada troca de qualquer papel.
- Motorista com viagem aberta que perde `driver` **não** muda a viagem (política da viagem: `trip_drivers.role`
  não muda). Futuras viagens o recusam como motorista; viagens dele que ainda abrir recusam ao gerar MDF-e.
- Ajudante-puro com diária própria vazia usa a diária geral da empresa (149 D2, sem lacuna).
- Limite conhecido: atribuição em lote (`addRoles`) não reconcilia. Papéis de grupo (herança de
  membership por grupo) não entram na conta.

## Alternativas descartadas

| Alternativa                                      | Por que não                                                                                                              |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Perfil como coluna (`fleet_drivers.profile`)     | Triplo de sincronização (papel + coluna + colunas de capacidade); a política já sabe ler só colunas.                     |
| Switch para todo motorista mudar de perfil       | Ajudante-puro não é um motorista com switch, é um perfil diferente — nenhuma CNH a esconder.                             |
| Reconciliação por **estado final** em toda troca | Acoplaria identidade a frota; todo papel não relacionado a frota causaria recompilação; teste de falha seria intratável. |
| `helper` sem coluna de capacidade                | Política de viagem teria de consultar papel a cada decisão (acoplamento); dois seletores diferentes para a mesma fonte.  |
