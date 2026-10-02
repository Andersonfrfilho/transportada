# Spec 234 — O ajudante é um perfil: papel em Acesso e opção no cadastro da frota

> 🤖 Modelo: `opus` 🧠 (modelo de dados, política de viagem, reconciliação de papéis) · `sonnet`
> (fiação API/painel, contratos) · `haiku` (documentação)

## Problema

A tela da viagem diz "Nenhum motorista ativo está marcado como ajudante na ficha." e **não há onde
marcar**. A spec 149 criou `fleet_drivers.can_act_as_helper` (D1) e a T12, que desenharia o controle na
ficha, nunca foi feita: o formulário só carrega o campo de ida e volta (`fleet.types.ts`: "sem controle
próprio na tela ainda").

Além do controle que falta, o desenho da 149 supõe que **todo ajudante é um motorista** que também
ajuda. Na operação o ajudante costuma ser só ajudante: não dirige, não tem CNH, e hoje o cadastro o trata
como condutor em potencial — nada impede escalá-lo como motorista da viagem e levá-lo ao MDF-e.

## Resultado

**Ajudante é um perfil**, igual a Motorista e Agregado:

- um papel `helper` no catálogo de Acesso (`COMPANY_ROLES`);
- uma terceira opção no seletor de perfil do cadastro de frota (`FLEET_DRIVER_PROFILES`);
- quem tem perfil `helper` não dirige: nunca entra como condutor de viagem, e a CNH deixa de ser pedida;
- o motorista que também ajuda continua existindo, pelo switch "Pode atuar como ajudante" na ficha.

Os dois caminhos — papel em Acesso e perfil/switch na frota — gravam os **mesmos campos** da ficha, então
o seletor de ajudantes da viagem tem uma única fonte.

## Fora do escopo

- Recomendação de ajudante pelo desempenho (a 149 fixou D11: ajudante é escolhido à mão).
- Aplicativo do ajudante. O papel `helper` lê a viagem em que está (`trip.read`) e nada mais; o que a
  `frontend-driver` mostra a ele é decisão de produto à parte.
- Mudar a fórmula da diária (149 D7) ou o score (149 D8).
- Reescrever a tripulação de viagens já gravadas: `trip_drivers.role` não muda.

## Decisões (padrões — o usuário pode mudar antes da Fase 1)

- **D1 — Revisão da D1 da 149.** "Ajudante é papel na tripulação, marcado no cadastro do motorista"
  passa a "ajudante é perfil do cadastro de frota **ou** marca na ficha de um motorista". As duas formas
  coexistem; a spec 149 segue valendo no resto.
- **D2 — Duas colunas dizem o que a pessoa faz.** `fleet_drivers.can_drive` (novo, `boolean not null
default true`) e `can_act_as_helper` (já existe). CHECK `can_drive or can_act_as_helper`: ficha que
  não faz nada não existe. Perfil `helper` ⇒ `can_drive = false`, `can_act_as_helper = true`.
  Perfil `driver`/`aggregate` ⇒ `can_drive = true`, e `can_act_as_helper` conforme o switch.
- **D3 — Perfil não é coluna.** Como hoje, o perfil é o **papel** em `membership_roles`; as colunas
  acima são o que a política de viagem lê (ela não consulta papel). Criar a ficha pelo convite grava o
  papel e as colunas na mesma transação.
- **D4 — Papel e colunas ficam em sintonia.** Mudar papéis de uma pessoa com ficha vinculada
  (`replace-company-user-roles` / `assign-company-user-roles`) reconcilia: `helper` presente ⇒
  `can_act_as_helper = true`; `driver` ou `aggregate` presente ⇒ `can_drive = true`; sem `driver` nem
  `aggregate` ⇒ `can_drive = false`. Tirar `helper` de quem **não** tem `driver`/`aggregate` bloqueia a
  troca (CHECK da D2); de quem dirige, só desmarca `can_act_as_helper`. O switch da ficha altera só
  `can_act_as_helper`, e a próxima troca de papéis reconcilia de novo — registrado, não escondido.
- **D5 — Ajudante não é condutor.** `resolveTripCrew` rejeita `can_drive = false` na lista de motoristas
  (`409 TRIP_DRIVER_CANNOT_DRIVE`), do mesmo jeito que rejeita ajudante sem a marca. Os seletores e a
  proposta de viagem filtram `can_drive` para motorista e `can_act_as_helper` para ajudante.
- **D6 — CNH só do que dirige.** Para o perfil `helper` o cadastro não pede número, categoria nem
  validade da CNH, e nenhum gate de vencimento o alcança. Os campos aparecem ocultos, não desabilitados.
- **D7 — Permissão do papel `helper`: `trip.read`.** Menos que `driver`/`aggregate` (que também têm
  `trip.report`): o ajudante acompanha a viagem, não reporta entrega nem comprovante.
- **D8 — O papel entra pelo convite.** `helper` entra em `FLEET_LINKED_ROLES`, e o convite casa a ficha
  pelo CPF como já faz com `driver` e `aggregate`; sem ficha, aparece o aviso "no-driver-record".

## Requisitos funcionais

- **RF-1** `helper` em `COMPANY_ROLES`, no CHECK de `membership_roles` e de `user_invitation_roles`, em
  `ROLE_PERMISSIONS` e nos rótulos de Acesso.
- **RF-2** `fleet_drivers.can_drive` e o CHECK da D2, com `rollback.sql`; as linhas existentes ficam
  `can_drive = true`.
- **RF-3** `POST/PATCH /fleet/drivers` aceita `profile: helper`, dispensa CNH para ele e devolve
  `canDrive`.
- **RF-4** Reconciliação papel → colunas (D4), coberta por teste de integração.
- **RF-5** `resolveTripCrew` e a consulta de motoristas da proposta respeitam `can_drive` (D5).
- **RF-6** Painel: opção "Ajudante" no seletor de perfil (ficha e criação rápida), CNH oculta para ele,
  switch "Pode atuar como ajudante" e campo "Diária própria" para quem pode ajudar, papel "Ajudante" no
  convite e na tabela de Acesso.
- **RF-7** O seletor de motoristas da viagem não lista quem não dirige; o de ajudantes lista quem pode
  ajudar. O texto "Nenhum motorista ativo está marcado como ajudante" passa a apontar onde marcar.

## Requisitos não funcionais

- Migration aditiva; nenhuma linha existente muda de comportamento.
- `companyId` do contexto autenticado; ficha de outra empresa nunca é reconciliada (contrato negativo).
- Nenhum PII em log; o CPF do convite segue o tratamento atual.
- Todo texto novo em `*.locale.json`; nenhum identificador novo em português.

## Casos extremos e falhas

- Pessoa com ficha `helper` escalada como motorista numa API direta: `409 TRIP_DRIVER_CANNOT_DRIVE`.
- Motorista com viagem aberta que perde `driver` e passa a só ajudar: a viagem existente **não** é
  alterada; só as futuras são bloqueadas. Registrar em `evidence.md` o que a tela mostra nesse caso.
- Troca de papéis que deixaria `can_drive = false` e `can_act_as_helper = false`: recusa
  `400 FLEET_DRIVER_PROFILE_EMPTY`, sem alteração parcial.
- Convite `helper` com CPF sem ficha: o convite sai e a resposta traz `fleetLink: 'no-driver-record'`.
- Ficha com `helper` e diária própria vazia: vale a geral da empresa (149 D2), sem lacuna nova.

## Critérios de aceite

1. Cadastrar uma ficha com perfil Ajudante, sem CNH, e vê-la no seletor de ajudantes da viagem.
2. A mesma ficha **não** aparece entre os motoristas da viagem, e a API recusa escalá-la como condutor.
3. Convidar alguém com papel Ajudante em Acesso marca a ficha de mesmo CPF; tirar o papel a desmarca.
4. Motorista com o switch ligado dirige numa viagem e ajuda em outra.
5. O papel `helper` lê a própria viagem e não consegue reportar entrega (`403`).
6. `make check` e `make migration-test` verdes, e a revisão de design com prints (375 px, claro e escuro).

## Dúvidas

Nenhuma bloqueante — D1 a D8 são padrões que o usuário pode mudar antes da Fase 1.
