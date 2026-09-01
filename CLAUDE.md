# CLAUDE.md

Contexto operacional do monorepo **TransportAdA**. Para regras de processo completas leia
`AGENTS.md`; para o produto e o domínio, `PROJECT.MD` e `docs/spec/constitution.md`.

## Produto

TMS para transportadoras: importa NF-e → organiza em lotes → calcula frete → emite CT-e 4.00 em lote
via `@adatechnology/fiscal-provider` → armazena XMLs fiscais → gera faturas. Genérico e
parametrizável — nenhuma regra ou CNPJ de transportadora específica no código.

**Distribuição é instalação dedicada: um deploy por transportadora** (ADR-0021). A empresa não é
criada em tempo de execução — ela é o ambiente. Não existe `POST /companies` nem ator de plataforma;
`companies.manage` segue reservada e sem consumidor. O isolamento multiempresa (`companyId`,
membership, contratos negativos) **continua invariável**: é capacidade do produto — uma transportadora
costuma ter mais de um CNPJ — e defesa em profundidade, não o modelo comercial.

## Estrutura

```
apps/api-transportada/       Bun.serve + Drizzle + Zod (sem framework HTTP)
apps/worker-transportada/    consumidor RabbitMQ + outbox relay
apps/cron-transportada/      processo one-shot agendado (NF-e, NFS-e, notificações, preço da ANP)
apps/frontend-transportada/  React 19 + Vite 7 (PWA)
apps/frontend-client/        portal do contratante — app separada por segurança (ADR-0050)
docs/spec/                   constitution, architecture, domain-model, fiscal-integration
docs/adr/                    NNNN-titulo.md (0001..0010)
specs/NNN-nome/              spec.md · plan.md · tasks.md · evidence.md
realm/                       contrato versionado do realm Keycloak
```

Não existe `packages/` aqui. Bibliotecas reutilizáveis vão para
`~/Documents/personal/adatechnology-packages`. **Nenhuma app importa código-fonte de outra.**

## Comandos

```bash
make bootstrap      # .env a partir do .env.example + bun install --frozen-lockfile
make config         # valida .env, schema de env, Bun 1.3.14, docker compose — pré-requisito
make up / down / ps # infra Docker (`up` cria o bucket do MinIO — idempotente)
make dev            # identity-bootstrap + up + API, worker e frontend em paralelo
make check          # format:check + lint + typecheck + test + build (gate completo)
make migration-test # migration + rollback em Postgres descartável
make smoke          # healthchecks da stack + smoke Playwright
make worker-integration
make e2e-up / e2e-down          # infra dedicada de E2E (.env.test)
bun run --cwd apps/<app> test   # testes de uma app só
```

Não há target isolado de lint/typecheck — use `bun run lint` / `bun run typecheck` na raiz.

Portas (bind em 127.0.0.1): postgres 55432 · rabbitmq 55672/55673 · minio 59000/59001 ·
mailpit 51025/58025 · keycloak 58080 · frontend 53000 · api 53001 · worker 53002.

## api-transportada

Módulo de domínio = até 4 camadas em `src/<modulo>/`:

- `presentation/` — `*.routes.ts` (`defineRoute`), `*.schema.ts` (Zod). Única camada que vê `Request`/`Response`.
- `application/` — `*.use-case.ts`, `*.service.ts`, `*.port.ts`.
- `domain/` — regras puras, `*.error.ts`, `*.policy.ts`. Sem I/O.
- `infrastructure/` — `drizzle-*.repository.ts`, `*.mapper.ts`, `*.gateway.ts`.

Módulos: `addresses`, `billing`, `companies`, `contractor-portal`, `cte-batches`, `cte-issuance`,
`cte-profiles`, `fleet`, `freight`, `freight-calculations`, `freight-regions`, `freight-rules`,
`identity`, `mdfe-manifests`, `nfe-documents`, `nfe-imports`, `nfse-callbacks`, `nfse-invoices`,
`nfse-profiles`, `notification`, `operations`, `routing`, `storage`, `trips`, `view-preferences`,
`health`.
Transversais: `config`, `database`, `http`, `logging`, `observability`, `server`, `shared`.

Fluxo de request: `src/main.ts` (composition root) → `server/server.service.ts` (`Bun.serve`, limite
2 MiB) → `http/request-handler.service.ts` (correlation-id, 1 MiB → 413, CORS) →
`http/router.service.ts`: autentica → `matchRoute` → `tenantContext.resolveCompany` → `authorize` →
`route.execute` → `parse` (Zod) → `handle` → use-case → repositório.

**Multi-tenant:** Bearer JWT (Keycloak/JWKS) → identidade externa por issuer+subject →
`tenantContext.resolveCompany` busca membership ativo; sem membership → 403. Todo repositório recebe
`context.companyId` e filtra por ele. Testes de isolamento em `test/*-schema/tenant-safety.contract.ts`
são obrigatórios em qualquer mudança de query.

**Recuperação de senha:** `POST /password-resets` e `POST /password-resets/confirm` são as **únicas
rotas anônimas** da API. A primeira responde `204` sempre — login inexistente, desabilitado e válido
são indistinguíveis, e é isso que impede a enumeração de usuários; o cliente do frontend engole
falha de rede pelo mesmo motivo. O código é de uso único, expira em 15 minutos e sai por
`password-reset-delivery.v1` no worker, com o envelope carregando só referência (`requestId`,
`userId`) e AAD `transportada:password-reset:v1:${companyId}:${requestId}` — amarrado ao **pedido**,
não ao usuário como no convite, porque a mesma pessoa abre vários pedidos. O Keycloak é só o
depósito da senha (admin SDK): `resetPasswordAllowed` segue `false`, e o link "Esqueci minha senha"
do tema de login aponta para `/recuperar-senha`, tela nossa. ⚠️ As duas rotas **não têm rate limit**
— não existe limitador nesta API; achado registrado em `docs/SECURITY.md`.

**O administrador define senha por rota própria, e o link continua existindo ao lado.**
`PUT /company-users/:id/password` (`users.manage`, escopo `company`) grava a senha no Keycloak pelo
admin SDK e responde **204** — nenhum eco do corpo, porque resposta com senha atravessa log de
proxy. `temporary` é campo obrigatório do corpo, não padrão escondido: senha definitiva serve a quem
está sem canal de e-mail funcionando (que é justamente quem não recebe o link), e a temporária
obriga a troca no primeiro acesso. O piso é `COMPANY_USER_PASSWORD_MIN_LENGTH` = 12, **mais alto**
que o do fluxo de recuperação, porque ali quem digita é o dono da conta e aqui é um terceiro — senha
curta escolhida por terceiro circula por recado ou papel antes de chegar a quem vai usá-la. Ela é
**cópia por valor** no frontend (`identity/shared/companyUsers.constant.ts`), guardada por
`test/identity/company-user-edit-dialog.contract.ts`. A senha nunca toca o banco daqui: o Keycloak é
o depósito, e a trilha guarda quem trocou a senha de quem, nunca o valor. ⚠️ A rota **não tem rate
limit** — não existe limitador nesta API, e o achado é o mesmo já registrado em `docs/SECURITY.md`.

**A comparação com o Keycloak tem duas divergências, e elas não somam num botão só.**
`summarizeReconciliation` (frontend, `identity/shared/reconciliationSummary.service.ts`) separa
`missingSomewhere` (existe de um lado só — o que `POST /reconciliation/sync` conserta) de
`withoutProfile` (existe dos dois lados sem ficha aqui — o que `POST /reconciliation/profiles`
conserta). Contar as duas juntas e alimentar com o total o botão de criar produzia o defeito que
não se explicava: com a única divergência sendo ficha vazia, a tela anunciava "criar 1 que falta" e
o clique mandava dois conjuntos vazios; a API respondia certo — nada a criar — e a tela ficava
idêntica. ⚠️ As duas rotas **sempre** devolveram `{filled|created…, skipped}` com a razão de cada
pulo, e o cliente do frontend descartava o corpo: preencher uma ficha e pular outra produzia a mesma
tela de antes do clique. Hoje o painel imprime o resultado, e razão nova na API precisa de rótulo em
`users.sync.skipReason` — sem ele o operador lê a chave crua.

**A pessoa e o vínculo dela são chaves diferentes:** `CompanyUserView.id` é o usuário e
`membershipId` é o `user_company_memberships.id` — e é o **vínculo** que o motorista da frota
referencia. As sete rotas de `/company-users` publicam os dois lado a lado (todas sob `users.manage`,
escopo `company`), porque sem o vínculo o operador só tinha o caminho de digitar o UUID de 36
caracteres no formulário de motorista. `toCompanyUserView` é o único ponto de conversão, e
`createInvitedUser` devolve `{ membershipId }` para o convite montar a view sem inventar chave —
tornar o campo opcional obrigaria o frontend a tratá-lo como ausente para sempre. No frontend o campo
é o select `DriverMembershipField`, alimentado por `identity/queries/useCompanyUsers.query.ts`
(`limit=100`, cursor até dez páginas): vínculo suspenso não é oferecido, o que já está gravado
continua escolhível, e sem `users.manage` o campo volta a ser digitável — quem cuida da frota sem
administrar usuários ainda precisa cadastrar motorista.

**O separador é papel próprio, e `trip.manage` nasceu para ele.** As rotas de escrita da viagem
pediam `fleet.manage` — quem montava a viagem ganhava de carona o cadastro da frota inteira. Hoje
elas pedem `trip.manage` (`TRIP_MANAGE_POLICY` em `trips/presentation/trip.routes.ts`), e o papel
`separator` recebe **quatro** permissões e nada mais: `invoices.read` para achar a nota que bipou,
`fleet.read` para escolher veículo e motorista, `trip.read` e `trip.manage` para montar a viagem. Ele
não cadastra frota, não fatura, não emite documento fiscal e **não reporta entrega** — `trip.report`
é do campo, não do galpão, e por isso o MDF-e da viagem que ele monta continua com quem responde por
ele. `admin` e `operator` ganharam `trip.manage` na mesma migration
(`20260824184702_separator_role`, que só acrescenta a sigla aos dois CHECKs de `membership_roles.role`
e `user_invitation_roles.role`). ⚠️ `trip.read` está no catálogo mas **nenhuma rota a pede**: a
leitura de viagem continua em `fleet.read` (`TRIP_READ_POLICY`), e quem migrar isso migra os três
papéis que a carregam (`driver`, `aggregate`, `separator`). ⚠️ O contrato `test/separator-role.contract.test.ts` lista as rotas
alcançáveis **por extenso**: rota nova de frota, faturamento ou CT-e reprova ali até alguém decidir,
por escrito, se o separador a alcança.

**A viagem tem fases, e a nota tem as suas (ADR-0043, spec 056).** `trips.status` são nove estados
(`draft`, `route_planned`, `separating`, `loading`, `dispatched`, `in_transit`, `completed`,
`cancelled`), e o estado da viagem é **derivado** do de suas notas — exceto em quatro transições
manuais (criar em `draft`, `plan-route`, `dispatch`, `cancel`). `trip_documents.separation_status`
(`pending`, `separated`, `loaded`, `delivered`, `returned`) muda por `POST
/trips/:id/documents/:documentId/{separate,load,return}` ou em lote por `.../documents/batch-status`
— nunca por `UPDATE` direto. ⚠️ **`return` é trabalho de rua, não de barracão, e isso inverte o
portão:** `checkTripAcceptsDocumentWork` exige `isTripDispatched` para `return`/`deliver` e o
proíbe para `separate`/`load` — devolver só existe **depois** da saída (antes disso a nota se
desvincula, não se devolve), e `separate`/`load` ainda precisam de roteiro planejado (`draft` sai
`TRIP_ROUTE_NOT_PLANNED`). Quem tratar os três como um `isEditable` só oferece "Devolver"
exatamente quando ele dá `409` — foi o que aconteceu no T016, e `test/trip/state-gates.contract.ts`
(frontend) existe para travar a tabela estado→portão contra esta política. `checkTripDocumentTransition`/`checkTripTransition`
(`trips/domain/trip-state.policy.ts`) são a única fonte da máquina, e toda transição é idempotente
por desenho (repetir converge em `unchanged`, não erro — a rede do armazém cai, o separador toca
duas vezes). `dispatched` é a porta de não-retorno: `checkTripAcceptsLinkage` bloqueia vincular,
desvincular e reordenar parada a partir dali (`409 STATE_TRANSITION_NOT_ALLOWED`), o roteiro
congela em `trip_dispatch_snapshots` (append-only, mesmo padrão de `audit_logs`), e só `cancel`
sai desse estado — incidente, não fluxo. `TripStop` é **derivada**, nunca criada à mão: vincular
uma nota chama `reconcileStopOnLink` (`trips/application/reconcile-trip-stops.use-case.ts`), que
agrupa pelo endereço normalizado do destinatário (`(postal_code, number, city_code)` de
`nfe_addresses`, não pelo CNPJ — a mesma rede em cinco lojas é cinco paradas); desvincular chama
`reconcileStopOnUnlink`, que apaga a parada só quando a última nota sai — e **precisa** rodar depois
de a nota já ter perdido o `stop_id`, senão ela mesma se conta como razão para a parada continuar
ocupada. ⚠️ Essa ligação **não existia** até a implementação chegar no teste E2E do ciclo inteiro —
`linkDocument`/`releaseDocument` inseriam a nota sem nunca chamar o reconciliador, e toda viagem
ficava presa em `hasRoute: false` para sempre. Se uma nota vinculada por uma rota real aparecer sem
parada, é a wiring de `drizzle-trip.repository.ts` → `nfe-destination-address.support.ts` que
quebrou, não a lógica pura de `reconcile-trip-stops.use-case.ts` (essa tem teste próprio e nunca foi
o problema). Desvio de endereço (D9, `delivery_address_overrides`, também append-only) é ação em
menu, nunca edição em linha, e guarda **duas** identidades por vínculo: `requestedBy` (texto livre —
quem pediu o desvio quase nunca é usuário do sistema) e `actorUserId` (membership — quem executou).

**A chave de acesso é filtro de listagem, não rota nova.** `GET /nfe-documents?accessKey=` resolve os
44 caracteres que a câmera leu no identificador que o vínculo pede, dentro do `companyId` do contexto
— chave de outra empresa é ausência, não 403, e é
`test/nfe-schema/document-block-tenant-safety.contract.ts` que guarda isso. O padrão é o
alfanumérico (`^[0-9]{6}[A-Z0-9]{12}[0-9]{26}$`), nunca `\d{44}`: emitente com letra no CNPJ é o
caso normal desde 01/07/2026.

**A ficha do motorista guarda dado de pessoa física, e hoje ninguém lê.** `birth_date`,
`license_number`, `license_expires_at`, o endereço residencial e o trio do RG existem na tabela e no
formulário, mas **nenhum consumidor** — nem MDF-e, nem relatório, nem notificação. Quatro
consequências que ficam escritas para não serem redescobertas:

- A CNH é **única por empresa, mas só quando preenchida**: o índice
  `fleet_drivers_company_license_number_unique` é parcial (`where length(license_number) > 0`),
  porque o campo é opcional e string vazia não é colisão. `fleet_drivers_license_number_check` aceita
  vazio ou onze dígitos, e `fleet_drivers_dates_check` põe piso em `birth_date` e
  `license_expires_at` — data digitada errada por um século não entra.
- O aviso de CNH a vencer **não existe**: `NOTIFICATION_TEMPLATE_KEY` tem três chaves
  (`BILLING_INVOICE_DUE`, `CTE_BATCH_ISSUANCE_FAILED`, `NFSE_INVOICE_REJECTED`) e nenhuma é de
  habilitação. O texto de ajuda do campo prometia o aviso; hoje diz que a data fica registrada para
  consulta. Implementar o trilho é feature com spec própria (chave nova + agendamento + cron).
- **O RG é o trio impresso na CNH, e o órgão emissor é lista fechada.** `identity_document` ·
  `identity_document_issuer` · `identity_document_state`, na ordem que a carteira imprime — documento,
  órgão, UF —, e não na ordem UF-antes-de-cidade dos dois pares de município: a UF do RG não estreita
  lista nenhuma. O número **não tem formato nacional** (ponto, traço e letra entram como o estado
  imprime, até 20 caracteres); o órgão é `IDENTITY_DOCUMENT_ISSUERS`, dezessete siglas amarradas por
  `fleet_drivers_identity_document_issuer_check`, e é **cópia por valor** na API e no frontend, como
  `FUEL_TYPES` e `VEHICLE_TYPES` — cada lado restata a lista, em
  `api-transportada/test/fleet-domain/identity-document-issuer.contract.ts` e
  `frontend-transportada/test/fleet/identity-document.contract.ts`; mudou sigla ou ordem de um lado,
  mude do outro. Dentro da API não há cópia: o CHECK do banco e o `z.enum` da rota saem da mesma
  constante. Sigla fora da lista vira ausência, não erro. O trio aparece nas duas fichas (`DriverForm` e `DriverQuickCreateDialog`) porque as duas
  renderizam `DriverPersonalFields`.
- **A ADR-0039 já decidiu criptografar esses campos, e ainda não foi executada.** Envelope A256GCM
  único para `birth_date`, `license_number`, endereço e telefone — mais o trio do RG, pelo adendo de
  2026-08-23 —, AAD
  `transportada:fleet-driver:v1:${companyId}:${driverId}`, e índice cego com HMAC para a CNH seguir
  única por empresa — decidido **porque** não há leitor, que é o que torna a mudança barata. Quem for
  escrever leitor para um desses campos passa a ter de abrir envelope: confira a ADR antes.
  `tax_id`, `linked_tax_id`, `name` e `license_expires_at` ficam em claro por decisão registrada — o
  CPF porque `mdfe-payload.builder.ts:72` já o lê e ele está em claro no payload congelado
  (comprometido por `payload_sha256`) e no XML preservado, e os outros três porque são o que se
  consulta.

**O CEP vem de casa, e a busca textual é a que ainda sai do navegador.** O CEP passa por
`GET /postal-codes/{cep}` (`addresses.read`, escopo `company`), que consulta **primeiro as nossas
tabelas** — `nfe_addresses`, `fleet_drivers`, `company_fiscal_profiles` e os dois CEPs de
`mdfe_manifests`, cinco consultas em corrida com `company_id` no `where` de cada uma — e só chama a
BrasilAPI e, se ela falhar, o ViaCEP quando a base não sabe. `Promise.race` cru seria o erro: ele
resolve com a primeira consulta a terminar, que costuma ser a origem que não achou nada; quem vence é
a primeira sugestão **completa**, e as parciais (só UF, o que o CEP de município devolve) ficam
guardadas para o caso de o provedor também falhar. A sugestão tem quatro campos e **nunca** `number`
nem `complement` — com eles, quem tem `addresses.read` varreria a base de motoristas oito dígitos por
vez. Ninguém souber o CEP é `404`, e `404` não desabilita campo, não limpa o que está lá e não
bloqueia envio: **o operador digita**. O hook é `shared/usePostalCodeLookup.hook.ts`, e os três
formulários de CEP usam o mesmo — motorista, empresa e lotação do MDF-e. ADR-0040.

⚠️ A **busca textual** de rua continua saindo do navegador
(`fleet/shared/driverAddress.service.ts`): um provedor só, o Photon, por `Promise.allSettled` sobre
uma lista de um — provedor fora do ar entrega menos resultado, nunca erro. O Nominatim saiu pela
ADR-0037 (a política dele pede um `User-Agent` que o `fetch` do navegador não manda), e com ele saiu
o `iframe` do OpenStreetMap: hoje a CSP declara `frame-src 'none'`. Debounce de 400ms, mínimo de
cinco caracteres, `AbortSignal` por tecla. **O termo digitado ainda vai a terceiro sem contrato** —
achado em `docs/SECURITY.md` que encolheu três vezes e não fechou, junto do `birth_date` em claro.

**A cidade é lista do IBGE, não texto livre** (`fleet/shared/municipality.service.ts`, servida pela
BrasilAPI, e o destino externo do formulário que não leva dado pessoal — sai só a sigla do estado,
enquanto o Photon leva o termo digitado). Sem UF escolhida
o campo é digitável: município só é único dentro do estado, e um select com os 5.570 do país é pior
que o teclado. Duas grafias mandam em lugares diferentes, de propósito: `toMunicipalityLabel`
uniformiza a caixa (o IBGE devolve em caixa alta e o provedor de CEP em caixa mista, e sem uma
grafia só a mesma cidade viraria duas linhas), enquanto `buildMunicipalityChoices` deixa **o que já
está gravado** vencer a grafia do IBGE — ao contrário do catálogo de veículo, porque o gatilho do
select casa a opção pelo valor e trocar a grafia deixaria o campo mostrando o placeholder com cidade
preenchida. Provedor fora do ar devolve lista vazia e o campo volta a ser digitável; cadastro não
para por isso.

**Busca automática de notas:** `GET`/`PUT`/`DELETE /company-settings/scheduled-distribution`
(`settings.manage`, escopo `company`) leem e alternam o opt-in; o corpo é o mesmo
`ScheduledDistributionStatus` que `GET /nfe-imports/distribution` devolve em `scheduled`, para a aba
Remota e a tela de configurações não contarem histórias diferentes. A paridade é contrato
(`test/companies/scheduled-distribution-parity.contract.ts`). No frontend a configuração mora **na
aba Remota da tela de Notas**, junto do efeito, e não mais em configurações de empresa — ver
"Configuração perto do efeito" abaixo.

**O peso da carga tem duas fontes, e só o CT-e o exige** (ADR-0052, spec 067). O emitente omite
`pesoB` **por nota**, não por política — a Zaragoza mandou 883658 com 108,670 kg e 883663 com 0,000
no mesmo caminhão, mesmo lacre, mesmo minuto. Duas consequências:

- `checkSharedEligibility` é o que CT-e e NFS-e conferem em comum (autorizada, completa, valor,
  participantes, municípios). O **peso ficou só em `checkDocumentEligibility`**, e
  `NfseSelectionBlockReason` deixou de admitir `CTE_BATCH_DOCUMENT_MISSING_WEIGHT` **por tipo** — o
  RPS da Nota RP não tem campo de massa, e barrar por um campo que nunca sai no documento travava
  emissão real. A seleção de NFS-e também parou de consultar `nfe_volumes`; o contrato
  `test/nfse-schema/invoice-selection-query-tenant-safety.contract.ts` falha se a tabela reaparecer ali.
- O peso efetivo é `XML → qVol × company_cargo_settings.default_volume_weight → ausência`, resolvido
  em `nfe-documents/domain/cargo-weight.policy.ts` e lido pela listagem de notas, pela seleção de
  lote e pelo payload de CT-e. Nulo é **estimativa desligada** e é o padrão; zero é recusado pelo
  CHECK (zero declararia que a carga não pesa nada). A estimativa entra **por volume**, para a soma
  de `composeCargoQuantities` continuar coerente com o `qVol`, e nota com **algum** volume pesado
  não é tocada. ⚠️ Não confundir com `company_route_optimization_settings.fallback_weight_kilograms`,
  que é peso **por parada** para o solver. ⚠️ **Nenhuma tela mostra peso hoje**, então não há marca
  de "estimado" por nota — quem expuser peso em qualquer superfície leva a origem junto.

**Cliente da fatura:** é o **tomador do frete**, quem paga — nunca um papel de participante da nota.
Quem é o tomador está configurado em `cte_emission_profiles.taker` (`0` remetente, `3` destinatário)
e a emissão grava o valor resolvido em `cte_issuance_payloads.taker_tax_id`/`taker_legal_name`; o
faturamento junta por `(company_id, attempt_id)` pelo seam `buildBillingTakerJoin()`. O relatório da
fatura continua mostrando o `recipient` por linha — ali o destinatário é o destino da carga, não o
cliente. ADR-0028.

**Cancelar fatura devolve o CT-e:** `billing_invoice_items.cancelled_at` marca a linha na mesma
transação que muda o status da fatura (`releaseInvoiceItems`), e a unicidade do documento é o índice
parcial `billing_invoice_items_active_cte_document_unique` — vale só para linha não cancelada. Todo
caminho de elegibilidade lê pelo mesmo recorte: `buildActiveInvoiceItemJoin()` na listagem e na
prévia, `cancelled_at is null` na reserva e nas duas expressões da coluna "Faturado" da tabela de
CT-es. A fatura cancelada continua com o detalhe dela no relatório.

**O R$/km do veículo é derivado, não digitado:** `costPerKilometer` sai de
`fleet/domain/vehicle-cost.policy.ts`, ao lado de `monthlyFixedCost` e com a mesma forma —
`preço do combustível ÷ consumo médio`, arredondado na quarta casa, **somado** a
`otherCostsPerKilometer`. A coluna homônima `cost_per_kilometer` **não existe mais** — a spec 038 a
removeu no único `drop column` do repositório, com `rollback.sql` que devolve a coluna mas não os
valores. O que o veículo persiste é `fuel_type` — do catálogo `FUEL_TYPES`, com a unidade como
atributo do produto (GNV em m³, os outros quatro em litro) — e `other_costs_per_kilometer`. `POST` e
`PUT` de veículo **recusam** `costPerKilometer` no corpo pelo `strict()`.

O preço efetivo é `ajuste da empresa ?? referência da ANP da UF`, por produto
(`companies/domain/fuel-price.policy.ts`), e `GET`/`PUT`/`DELETE
/company-settings/fuel-prices[/{produto}]` (`settings.manage`, escopo `company`) leem e alternam o
ajuste. ⚠️ `fuel_price_references` é a **única tabela do produto sem `company_id`**, de propósito: a
publicação semanal da ANP é dado público de mercado, idêntico para toda empresa da instalação, sem
PII e sem efeito fiscal. `test/fleet-schema/tenant-safety.contract.ts` a lista como exceção
declarada — se ela sumir da lista, o contrato passa a cobrar o tenant. A leitura do preço dentro da
listagem de veículos é **uma por empresa**, resolvida antes do `map` da página, nunca por linha.

**A região do motorista é o que a transportadora paga, não o que ela cobra:**
`freight_region_driver_rates.driver_amount` é custo — o valor do agregado por viagem naquela rota e
naquela classe de veículo. Ele não entra em `freight-rules`, `freight_calculations` nem no CT-e, e
misturar os dois faria a tabela do motorista virar preço de frete sem ninguém decidir isso.

A zona é **acumulativa dentro da família**: `parseRegionCode('1.002')` dá `{family: '1', zone: 3}`, e
quem cobre a zona 3 cobre a 1 e a 2 da mesma família; a matriz (`0.001`, zona 0) cobre só a si. A
cobertura do motorista mistura granularidade de propósito — `scope: 'region'` para a zona inteira e
`scope: 'city'` para a cidade solta —, e as duas metades do CHECK são ditas na fronteira
(`FLEET_DRIVER_REGION_CITY_REQUIRED` e `..._CITY_UNEXPECTED`).

⚠️ A unicidade da cidade é `(company_id, region_id, city, state)`, **nunca** `(company_id, city)`: na
planilha real do cliente `BARRINHA/SP` aparece em duas rotas, e a chave estreita mataria a
importação na primeira tentativa. Célula de valor zerada **não vira linha** — zero ali é ausência de
preço para aquela classe naquela rota, e `0.0000` diria que a transportadora paga zero.

**O veículo tem um tipo só, e os dois campos fiscais saem dele.** `fleet_vehicles.vehicle_type`
(catálogo `VEHICLE_TYPES`: `motorcycle · car · utility · van · vuc · three_quarter · toco · truck ·
tractor_unit · other`, na ordem das colunas da tabela de frete impressa, da mais leve para a mais
pesada) substituiu o par `wheel_type` + `freight_class`, e os dois CHECKs antigos caíram com eles.
Eram dois selects vizinhos perguntando a mesma coisa ao operador — e a moto e o carro da frota real
não cabiam em nenhum dos dois catálogos.

A derivação mora em `api-transportada/src/shared/vehicle-type.constant.ts`, um lugar só:
`resolveMdfeWheelType` dá o `tpRod` do MDF-e (`truck→01`, `toco→02`, `tractor_unit→03`, `van→04`,
`utility→05`, e **`car`/`motorcycle`/`other`/`three_quarter`/`vuc`→`06` — Outros**, porque o rodado da
SEFAZ não os nomeia) e `resolveVehicleFreightClass` dá a coluna da tabela (`car`, `motorcycle`,
`other` e `tractor_unit` mandam `''` — cavalo mecânico não é linha da planilha do cliente). O tipo é
de quem **traciona**: implemento manda `''`, e o CHECK
`fleet_vehicles_vehicle_type_check` amarra as duas metades (`(role = 'traction') = (vehicle_type in
(…))`), como o `wheel_type_check` fazia antes dele.

⚠️ `VEHICLE_TYPES` é **cópia por valor** na API e no frontend — o bundle não carrega código da API,
o mesmo caso de `FUEL_TYPES`. A ordem faz parte do contrato, e quem a guarda é
`api-transportada/test/fleet-domain/vehicle-type.contract.ts` de um lado e
`frontend-transportada/test/shared/vehicle-type-catalog.contract.ts` do outro. Mudou produto ou ordem
de um lado? mude dos dois.

Com um campo só não há o que sugerir: `vehicleFreightClass.service.ts` e a regra que corrigia a
classe a partir do rodado saíram inteiras. `fleet_vehicles.wheel_type` **não existe mais** — a
migration `20260821153330_fleet_vehicle_type` converte o dado antigo (a classe vence quando
preenchida; senão o rodado é traduzido) e derruba as duas colunas, com `rollback.sql` que as devolve
sem os valores. `freight_region_driver_rates.freight_class` é outra coisa e **continua**: ali a classe
é a chave da coluna da tabela de preço, não um campo do veículo.

A tabela do cliente entra por `POST /freight-regions/import` (`settings.manage`), **nunca** por seed
em `src/`: o produto é genérico (ADR-0021) e a planilha é de uma transportadora. Reimportar o mesmo
arquivo devolve `{0, 0, 0}`; rota ausente do arquivo vai a `inactive`, nunca é apagada; arquivo de
rotas vazio é recusado (`FREIGHT_REGION_IMPORT_EMPTY`), porque inativaria a tabela inteira à qual os
motoristas estão ligados. `scripts/freight-region-import.py` **deixou de ser o único caminho**: o
diálogo da aba Regiões manda os dois arquivos como texto para a mesma rota, byte a byte como o
cliente exportou — quem decide o que é linha válida continua sendo o parser da API, senão a tela e o
script discordariam de qual célula zerada vira preço. Ler região é `fleet.read`, não
`settings.manage`: a cobertura mora no formulário da frota, e é o `operator` quem cadastra motorista.
ADR-0038.

**O `{{periodo}}` da NFS-e é digitado, não derivado:** o domínio não calcula janela nenhuma a partir
das notas — `buildNfseDescription` recebe `period` e o repassa como veio, e em branco a variável sai
vazia. `nfse-period.service.ts` **não existe mais**. O campo entra no corpo de
`POST /nfse-service-invoices` (`period`, ≤ 60 caracteres) e na digital do pedido: corrigir o período
e repetir a chave é pedido novo, não replay. A ordem em que a regra automática pode nascer — escolher
a data-fonte, o recorte e o que fazer com a seleção que atravessa dois recortes — está no comentário
acima de `buildNfseDescription`, em `nfse-invoices/domain/nfse-description.service.ts`. No frontend o
campo "Período do serviço" abre vazio a cada emissão (`useNfseEmissionDialog.hook.ts`) e entra na
chave da prévia; em branco ele é **omitido** do corpo, porque ausente e `''` dizem a mesma coisa à API.

**O anexo da candidatura não é lido na requisição** (ADR-0053, spec 069). `POST
/public/aggregate-application-attachments` é anônima: quem passa pelo Turnstile escolheria quanto CPU
a API gasta, num runtime de um event loop só — e um PDF com geometria patológica travaria a emissão
de CT-e junto. A requisição grava o objeto e insere rascunho **e** evento de
`aggregate_attachment_outbox` na mesma transação, e responde `201` com `draftId` e nada mais.

⚠️ Não é o `processing_outbox`: lá `actor_user_id` é `not null`, e quem anexa é anônimo — inventar um
UUID de sistema para caber na tabela alheia seria mentir na trilha. O payload carrega **referência**
(bucket, chave), nunca os bytes: PDF numa fila é PII em repouso sem prazo de descarte.

Quem lê é o worker, e **a landing continua lendo no navegador**: as duas leituras existem por motivos
diferentes — a do navegador preenche o formulário na hora, a do servidor é o que o operador confere.
Aceitar a leitura do cliente anônimo como prova deixaria um atacante escolher o que o operador vê.

**O documento do agregado é lido por camada de texto quando ele tem uma.** `POST` de anexo passa
por `aggregate-document-text.gateway.ts`, o único lugar que sabe escolher: **PDF** sai por
`shared/pdf-text-layer.service.ts` (exato, sem rede, sem serviço) e **imagem** sai pelo OCR
self-hosted (palpite, com rede). Antes o host desviava todo PDF antes de tentar ler, e cartão CNPJ,
certificado RNTRC e CRLV-e digital passavam sem conferência nenhuma.

⚠️ A leitura de PDF usa `unpdf` — dependência nova, contra o instinto da ADR-0033 (a planilha da ANP
é lida por código nosso). O motivo está medido: estes documentos usam fonte `Type0` com `ToUnicode`,
onde o código do caractere **não é** o caractere, e um leitor ingênuo devolve a página inteira sem a
placa e sem o RENAVAM. XLSX é formato pequeno; PDF não é.

⚠️ **CNH-e e CDT não têm camada de texto útil**: o PDF deles é o invólucro do Serpro com o documento
como imagem embutida. A extração devolve ~400 caracteres de texto legal e nenhum campo — e isso é o
resultado **correto**, não uma falha: os parsers ancoram em rótulo, ausência vira campo vazio, e
campo vazio nunca vira divergência. Quem lê CNH continua sendo o OCR, com imagem.

Texto vazio é ausência e não conta como extração (`aggregate-document.use-case.ts`): seguir adiante
gravaria uma extração de campos todos nulos como se fosse leitura feita.

**Banco:** schemas em `src/database/*.schema.ts`, agregados em `database.schema.ts`. Migrations SQL
versionadas em `drizzle/`. `bun run db:generate --name x` · `db:check` · `db:migrate` · `db:seed:local`.
O startup **não** roda migrations; rollback é manual, ao lado da migration.

## worker-transportada

RabbitMQ via `@adatechnology/rabbitmq-provider` — **sem BullMQ/Redis**. Topologias em
`src/messaging/`, cada trilho com main/retry/dead: `nfe-import.v1`, `nfe-distribution.v1`,
`cte-issuance.v1`, `aggregate-attachment.v1` (+ `synthetic.v1`, proibido em production). Padrão de nome:
`${QUEUE_PREFIX}.<rota>.v1.{main,retry,dead}.{exchange,queue}`.

Envelopes Zod versionados (`*-envelope.schema.ts`), backoff por política, idempotência via tabela
`processed_messages`, outbox relay (polling 1s, lease 30s) sobre `processing_outbox` e
`cte_issuance_outbox`.

Entrypoint `src/main.ts` → `startWorkerRuntime`. Cada consumer é `start*Consumer` em `src/runtime/`,
recebe `{config, logger, provider}` e devolve `{cancel()}`; a lógica fica em `src/<contexto>/application/`.
Dependências injetáveis via `WorkerRuntimeDependencies` — é assim que os contract tests substituem
RabbitMQ e banco.

**As rotinas agendadas são um registro, e ele é parcial de propósito.** `startJobRunConsumer` recebe
`routines: JobRoutineRegistry` (`Partial<Record<ScheduledJob, JobRoutine>>`) e o consumidor reivindica
a linha de `job_executions`, corre a rotina e a encerra; job sem rotina registrada pousa em
`job_run_routine_missing` e fecha como `unexpected_error`. Hoje quatro estão registradas:

- `nfe.distribution.pull`, em `src/nfe-distribution-pull/` — ela **não** fala com a SEFAZ: seleciona
  empresa elegível e enfileira `source: 'distribution'` na `processing_outbox`, e daí em diante é o
  relay e o consumidor de `nfe-distribution.v1` que já existiam.
- `nfse.status.pull`, em `src/nfse-status-pull/` — aqui a rotina **processa**: consulta a prefeitura
  por nota pendente, arquiva XML e PDF no bucket na autorização e grava a rejeição com código e
  mensagem. Dentro de uma app não há fronteira que justifique cópia, então ela **importa** o cliente
  da Nota RP, o serviço de credencial e o schema de `nfse-issuance/` em vez de duplicá-los como o
  cron precisava fazer — o AAD continua sendo o mesmo
  `transportada:nfse-credential:v1:${companyId}:${credentialId}` que selou. O aviso de rejeição
  ainda **não** sai: a porta `notifier` é opcional e segue sem adaptador — `notification.schedules.run`
  já mora aqui, mas quem varre NFS-e rejeitada é o trilho `notification.v1`, não esta rotina. Sem
  `NFSE_PROVIDER_BASE_URL` a rotina não morre — cada nota é adiada como `provider_not_configured`, e
  o segredo nem chega a ser aberto.
- `notification.schedules.run`, em `src/notification-schedules/` — varre fatura a vencer e roda os
  dois schedules de `@adatechnology/notification-module`. Schedule que cai **não** derruba o
  seguinte, e a causa é tipada, nunca adivinhada por mensagem: `queue_unreachable` vem de
  `createGuardedNotificationQueue` (decorador sobre o `enqueue` da fila do módulo) e
  `template_missing` do código `NOTIFICATION_TEMPLATE_NOT_FOUND`; qualquer outra é
  `unexpected_error`. ⚠️ Aqui a **falha domina** o trabalho feito, ao contrário de `nfse.status.pull`:
  ciclo que avisou metade das faturas precisa dizer isso, porque a outra metade não tem segunda
  janela antes do vencimento.
- `fuel.price.pull`, em `src/fuel-price-pull/` — baixa o resumo semanal da ANP (XLSX lido por código
  nosso, ZIP + `inflateRawSync`, sem dependência nova — ADR-0033) e a tarifa homologada da ANEEL, e
  grava `fuel_price_references` e a tarifa por UF. A semana da ANP vai de domingo a sábado e **dá
  nome ao arquivo**, então a URL é derivada da última semana **completa** — a que contém hoje ainda
  não foi publicada e devolve 404. Reexecutar a mesma semana não duplica linha: a chave natural
  `(product, state, week_ending_on)` é a idempotência do ciclo. As duas metades correm na mesma
  execução e **falham em separado**, mas a linha fecha como falha se qualquer uma cair: meia série
  gravada é tela com preço sem dizer que está incompleta. Não há advisory lock — quem serializa é a
  linha de `job_executions`, com o unique de execução aberta e o lease. É a única rotina que roda
  sem chaveiro, sem bucket e sem tenant: a planilha é dado público de mercado. Sem `ANP_BASE_URL` e
  `ANEEL_BASE_URL` a rotina **não é registrada** e a janela dela pousa em `job_run_routine_missing`;
  declarar **uma só** derruba o boot.

⚠️ O worker passou a ter `FISCAL_ENVIRONMENT` (`homologation` | `production`, **padrão
`production`**), e quem o lê é só a reconciliação de NFS-e, para casar a linha de
`nfse_provider_credentials`. Instalação de homologação **declara a variável**: esquecê-la faz a
reconciliação procurar credencial de produção e não achar nota alguma. A distribuição de NF-e segue
sem ela — lá o ambiente é o de `company_fiscal_profiles`, por empresa.

⚠️ **A trava contra o `cStat 656` é `nfe_distribution_cursors.next_allowed_at`, por
`(company_id, environment)` — nunca a cadência do agendador.** A NT 2014.002 §3.11.4 bloqueia o
**CNPJ** por uma hora em consumo indevido, e quem sabe quando a janela reabre é a última resposta da
SEFAZ. Com batida de cinco minutos, onze de cada doze janelas são recusadas por `cooldown_active`
antes de qualquer chamada. O ambiente é o de `company_fiscal_profiles.environment`, por empresa: o
envelope de `job-run.v1` não carrega ambiente e o `FISCAL_ENVIRONMENT` do worker é da NFS-e, então a
junção do cursor é escopada pelo perfil — ler o do outro ambiente devolveria a espera errada. A distribuição
assina com o certificado de **CT-e** (`NFE_DISTRIBUTION_CERTIFICATE_PURPOSE` em
`src/shared/nfe-distribution.constant.ts`): quem pré-filtra a empresa e quem abre o envelope olham a
mesma linha de `digital_certificates`, senão a empresa é aprovada pelo certificado de MDF-e e falha ao
assinar.

**O anexo do agregado é lido em `worker_thread`, e só ele.** O trilho `aggregate-attachment.v1`
(relay próprio sobre `aggregate_attachment_outbox`) baixa o objeto do bucket e roda o pdf.js numa
thread — dentro do event loop do worker ele pararia CT-e, MDF-e e NFS-e junto, o que seria trocar de
vítima, não consertar (ADR-0053). Três coisas medidas que não se deduzem do código:

- `prefetch` é **1** neste consumidor, não o do resto do worker: cada mensagem sobe uma thread com
  pdf.js dentro, e uma rajada de anexos vinda de gente anônima viraria dezenas de parses
  concorrentes.
- `new Worker(url)` é **caminho de arquivo de verdade** — o runtime não reescreve `.js` para `.ts`
  como faz com `import`. A extensão sai do próprio `import.meta.url`, e `pdf-extraction.worker.ts` é
  entrypoint do `bun build`; `test/build-entrypoints.contract.test.ts` cobre `*.worker.ts` pelo mesmo
  motivo que cobre `*.main.ts`.
- O pdf.js **escreve avisos no console**, e do worker eles caíam no stdout do processo — que é log. O
  canal é silenciado dentro da thread antes do parse.

Leitura que não reconhece nada grava `null` e fecha: é resultado, não falha. Objeto apagado entre o
`201` e a leitura fecha sem escrever. Só falha de parse e de banco recicla.

⚠️ O schema Drizzle das tabelas consumidas é **duplicado por cópia** no worker — quatorze arquivos em
`src/database/` (`processing`, `cte-issuance-execution`, `mdfe-issuance-execution`,
`nfse-issuance-execution`, `nfe`, `identity`, `invitation-delivery`, `password-reset-delivery`,
`billing`, `company-distribution-settings`, `job-execution`, `energy-tariff`, `fuel-reference`, `aggregate-attachment`), e
outras oito no cron. Mudou tabela na API? confira as cópias — migrations só rodam na API.

## cron-transportada

Processo **one-shot**: um CronJob sobe `src/main.ts` a cada janela, ele roda um ciclo e sai —
não há loop nem agendador embutido. Sai com código 1 só quando alguma empresa falhou; não pegar o
advisory lock é no-op limpo. A conexão Postgres é pinada em **um socket** (`max: 1`) para o lock de
sessão valer por todas as transações do ciclo.

O processo é **uma batida só** (`src/tick/tick.job.ts`), agendada a cada cinco minutos: pega o
advisory lock, lê `job_schedules`, publica em `job-run.v1` cada rotina com `next_run_at <= now()` e
avança a janela dela. `CRON_JOB` e `src/job-registry.ts` **não existem mais** — quem escolhe a rotina
é o relógio no banco, não a variável do painel de hospedagem, e por isso os quatro serviços de cron
viraram um (spec 052). ⚠️ As rotinas chegam ao worker uma por vez, e enquanto a dela não chega o
`src/<rotina>/<rotina>.job.ts` continua no cron **sem chamador** — hoje só `nfe.distribution.pull`
está nesse estado, e a fatia dela fica aqui até a última pousar do outro lado. As outras três já
foram: com a de **NFS-e** saíram as cinco cópias por valor do cliente da Nota RP, o schema de
reconciliação e o bloco de configuração dele (chaveiro, bucket e endereço da prefeitura não são mais
lidos nesta app); com a de **notificação** saíram o bloco `NOTIFICATION_SUPPRESSION_HMAC_KEY` e as
duas dependências `@adatechnology/notification-*`; e com a de **combustível** saíram os dois blocos
de agência (`ANP_*`, `ANEEL_*`), os dois schemas Drizzle do preço e o catálogo `FUEL_TYPES`, que hoje
é cópia da API, do frontend e do **worker**.

A rotina que ainda vive aqui:

- `nfe.distribution.pull` — seleciona as empresas elegíveis e enfileira uma importação
  `source: 'distribution'`, `triggeredBy: 'automation'` na `processing_outbox`, reusando o relay e o
  consumidor de distribuição que já existiam.

Do cron restou **uma** obrigação de configuração, e ela é dura: o endereço do broker
(`RABBITMQ_URL`, `QUEUE_PREFIX`) é **sempre** obrigatório — a batida sempre publica, e um cron que
não alcança a fila não teria o que fazer. Quem escolhe a rotina por presença de variável agora é o
worker, não esta app.

**O endereço da Nota RP é um só, e a NFS-e é trilho de produção** (ADR-0035). O provedor publica um
servidor (`https://www.notarp.com.br/api/v2`) e não tem homologação; quem separa uma instalação da
outra é a credencial selada por empresa, não a URL. Por isso `NFSE_PROVIDER_BASE_URL` substituiu o par
`_HOMOLOGATION`/`_PRODUCTION` — o teste que falha se os nomes voltarem é o do **worker**, única app
que ainda fala com a Nota RP — e `FISCAL_ENVIRONMENT` não escolhe mais endereço de NFS-e (segue
valendo para CT-e e MDF-e). `cron-nfse` não existe mais: a reconciliação é rotina do worker, que
publica nos dois ambientes.

**A Nota RP não autentica só pelo token, e não emite sem endereço de retorno** (spec 040). Toda
chamada leva **dois** cabeçalhos: `X-AUTH-USER-TOKEN` e `X-AUTH-IM`, a inscrição municipal do
prestador. Sem o segundo o provedor responde **200 com `cadastro: null`** — a credencial parece boa e
só se revela inválida na primeira emissão, longe de onde foi gravada. Por isso
`municipal_registration` é obrigatória em toda a fronteira: `.min(1)` no `saveCredentialSchema`, sem
`default` na coluna e com `check (length(...) > 0)`, e bloqueio na tela antes do 400 genérico
(`buildNfseCredentialSubmission`).

A emissão é **assíncrona** e o `CallbackUrl` https é **obrigatório** no corpo do `/emitir` — nota sem
ele não é aceita. A URL **não atravessa a porta de emissão**: ela é montada dentro do
`nfse-fiscal-gateway.ts` do worker, com `NFSE_CALLBACK_BASE_URL` mais o `callbackToken` opaco que sai
do envelope selado — quem abre o envelope é o gateway, uma vez por operação, e fazer o consumidor
montar a URL obrigaria o segredo a passar por dois lugares a mais. A variável vive na **api e no
worker**: o worker monta a URL, a api registra a rota. Do outro lado, `POST
/public/nfse-callbacks/{token}` é **gatilho, não fonte da verdade** — corpo não lido, 204 invariável,
e o estado real vem da consulta autenticada do cron. A Nota RP **não assina o postback** (achado
datado em `docs/SECURITY.md`).

**O cancelamento manda código, e o documento é conferido pela própria abertura.** `/cancelar-nota`
exige `motivo` como **código**: o catálogo oferece `2` (serviço não prestado) e `4` (nota duplicada)
— o `1` (erro na emissão) fica de fora porque o provedor o recusa pedindo substituição —, e o texto
do operador vira `cancellationReason`, que fica na nota e não atravessa a fronteira. Já `/xml` e
`/pdf` devolvem o documento **dentro de um envelope JSON** — medido em produção em 19/08/2026
(nota `5254907`): `application/json` com `{success:true, base64_file}`, e o corpo cru nunca aparece.
`readDocument` abre o envelope e entrega o `base64_file` a `resolveNfseDocumentBytes`
(`nfse-document-payload.policy.ts`, cópia por valor no worker e no cron), que confere a
**assinatura** — `<` abre XML, `%PDF` abre PDF, com espaço, quebra de linha e BOM tolerados antes —
e decodifica base64 quando ela não bate. Recusar o envelope inteiro, como antes, adiava para sempre
a nota **já autorizada**: o status liquidava e o download não. Corpo que não é o documento nem
base64 dele vira `malformed_response`, a causa que adia: sem o XML a nota não liquida.

**A consulta devolve `results[]`, e a alíquota viaja em percentual.** Duas coisas medidas em
produção em 18–19/08/2026, contra a nota `5253521`, que ficou presa em "Aguardando autorização":

- `GET /notas/?id_nota=` responde `{success:true, results:[nota]}`, e a nota traz `Status` (medido:
  `"Falha"`), `Nfse`, `DataEmissao` e uma lista `Erro[]` de `{Codigo, Correcao, Mensagem}`. O
  vocabulário anterior (`data`, `situacao`, `codigo_erro`) era **inferido e nunca existiu**: toda
  consulta caía em `malformed_response`, e **nenhuma NFS-e liquidava** — nem autorizada nem
  rejeitada, só adiada de meia em meia hora para sempre. Quem decide agora é o fato antes do rótulo:
  `Erro[]` preenchida é recusa mesmo com `Status` desconhecido, e autorização sem número, data e
  código de verificação continua sendo `malformed_response`. As chaves são lidas em caixa baixa
  (`normalizeKeys`) porque o corpo mistura `id_nota` com `Status` e `Nfse`. A recusa carrega **todos**
  os motivos, não só o primeiro — a 5253521 voltou com `E215` e `E227` juntos, e guardar um por vez
  custaria uma rodada de emissão fiscal por erro escondido; com mais de um, cada motivo leva o
  código dele na mensagem. **A autorização foi medida em 19/08/2026** (nota `5254907`, NFS-e nº 65):
  ela chega como `Status: "Sucesso"` — não "Autorizada" — e **sem `CodigoVerificacao`**; o código de
  verificação sai como último segmento de `Link`
  (`https://notarp.com.br/nota/{id}/{numero}/{codigo}`), a URL pública que a prefeitura publica.
  Sem os dois ajustes a nota autorizada caía em `malformed_response` de meia em meia hora, com a
  emissão já paga do outro lado. Autorização sem número, data **ou** código de verificação (nem no
  campo, nem no `Link`) continua sendo `malformed_response`: não há o que arquivar.
- `Aliquota` é **percentual** no fio (`2`), fração no domínio (`0.020000`, que é o que multiplica o
  valor do serviço). Mandar a fração fez a prefeitura recusar com `E227 — Alíquota Serviços fora do
intervalo de 2% e 5%`. A conversão é `toIssRatePercentage` no `nfse-fiscal-gateway.ts`, textual e
  não aritmética: `Number` traria erro binário para dentro de campo fiscal.

⚠️ `ItemListaServico` e `CodigoTributacaoMunicipio` são **cadastro**, não código: o par
`160201`/`160101` da mesma nota foi recusado com `E215 — Item da lista de serviço incompatível com o
código de tributação`. Quem corrige é o perfil de emissão, na aba **Configurações** de
`nfse-invoice`. **Quem diz o par válido é o próprio provedor**, não a tabela da LC 116:
`GET /dados-cadastrais` (com os dois cabeçalhos) devolve `cadastro.atividades`, a lista de
atividades que a prefeitura registrou para aquele prestador — medido em 19/08/2026 nesta conta:
`160101` "16.01.01 - Transporte de Natureza Municipal" e `160107` "16.02 - Transporte de Cargas".
`CodigoTributacaoMunicipio` é o **código** da atividade (`160107`) e `ItemListaServico` é o item da
LC 116 que a descrição dela anuncia, sem formatação (`1602`). Um `ItemListaServico` de seis dígitos
é sinal de que o código municipal foi digitado no campo errado.

**A prefeitura não emite sem o endereço do tomador.** O RPS leva `Cep · Endereco · Numero · Bairro ·
Cidade · Estado` (`Complemento` e `Telefone` só quando não vazios; `Cidade` é **nome** e `Estado` é
**sigla**, não códigos IBGE), montados por `buildTakerAddressFields` no `nfse-fiscal-gateway.ts` do
worker. Quem decide o que é endereço completo é
`api-transportada/src/nfse-invoices/domain/nfse-taker-address.policy.ts` — cidade, bairro, número, CEP
de oito dígitos, UF de duas letras e logradouro obrigatórios, e ela canonicaliza CEP e UF no caminho.
Falta de endereço é bloqueio de **prévia** (`NFSE_DOCUMENT_MISSING_TAKER_ADDRESS`), pelo participante
que o `taker` do perfil escolhe — não recusa da prefeitura com as NF-e já travadas. O endereço entra no
payload congelado e no `payloadSha256`; `taker.address` é opcional no `payloadSchema` do worker de
propósito, porque payload congelado antes da spec 043 precisa continuar sendo transmitido e recusado
pela prefeitura — a causa real — em vez de morrer como `invalid_payload`, defeito nosso. Consequência:
nota rejeitada nascida antes da 043 se **descarta e emite de novo**; reemitir retransmite o mesmo RPS
sem endereço.

⚠️ `nfe-distribution-pull/domain/distribution-eligibility.policy.ts` é **cópia** de
`api-transportada/src/companies/domain/distribution-eligibility.policy.ts` — mesma regra, mesmo
vocabulário de razões, duas apps que não importam código uma da outra. Mudou a regra de um lado?
mude do outro; `test/companies/scheduled-distribution-parity.contract.ts` guarda a paridade do corpo
servido pelas duas rotas, e `test/nfe-distribution-pull/eligibility-reasons.contract.ts` guarda o
vocabulário no cron.

🧾 **As cinco cópias por valor da NFS-e não existem mais** (spec 052, T7). Enquanto a reconciliação
morava aqui, o cliente da Nota RP, o gateway fiscal, a política de documento, o serviço de envelope
e o schema de reconciliação eram cópia do worker, e um contrato de paridade guardava o vocabulário
nos dois. Com a rotina virando `nfse.status.pull` do worker, a cópia deixou de ter fronteira que a
justifique: **dentro de uma app se importa**, e a reconciliação usa o mesmo cliente da emissão. O
que sobrou de contrato é `worker-transportada/test/nota-rp-v2-client.contract.test.ts`, e o AAD do
envelope segue idêntico ao que selou:
`transportada:nfse-credential:v1:${companyId}:${credentialId}`.

⚠️ O catálogo `FUEL_TYPES` é **cópia por valor** nas três apps que o usam —
`api-transportada/src/shared/fuel.constant.ts`,
`frontend-transportada/src/modules/shared/fuel.constant.ts` e
`worker-transportada/src/fuel-price-pull/domain/fuel.constant.ts` — com a mesma lista, na mesma ordem
e com a mesma unidade por produto (`gnv` em `cubic-metre`, os outros quatro em `litre`). A unidade é
atributo do produto, não coluna: guardá-la por linha abriria a porta para duas linhas do mesmo
produto discordarem. Quem guarda a paridade são os contratos `test/fuel-catalog/catalog.contract.ts`
(API), `test/shared/fuel-catalog.contract.ts` (frontend) e
`test/fuel-price-pull/catalog.contract.ts` (worker) — mudou produto ou unidade de um lado? mude dos
três. Uma linha de GNV lida como litro entra no banco sem reclamar de nada.

## frontend-transportada

React 19.2 + Vite 7.3 + TanStack Query 5 (`retry: false`, `staleTime` 30s). **Sem router**: navegação
manual em `src/main.tsx` (`pushState` + `popstate` + `sessionStorage`). **Sem Tailwind e sem zod** —
`tailwind-merge`/`clsx`/`cva` estão no package.json mas não são usados; `cn()` é reimplementado em
`src/lib/utils.ts`; validação é type guard manual em `*.validation.ts`.

Módulos em `src/modules/`: `billing`, `company-settings`, `cte-batch`, `cte-issuance`,
`cte-profiles`, `fleet`, `foundation`, `freight`, `identity`, `mdfe-manifest`, `nfe-workspace`,
`nfse-invoice`, `notification`, `operations`, `trip`, `shared`. `shared/` concentra client HTTP +
validação + view-model. Um client HTTP **por módulo** (`shared/<modulo>Client.service.ts`), com `fetch`
injetado por dependência. Auth via `KeycloakAuthProvider`.

**Configuração perto do efeito:** um painel de configuração mora na tela onde o efeito dele aparece,
não numa tela de configurações que cresce sem fim. O endereço de cada painel é declarado uma vez em
`company-settings/shared/companySettingsTabs.service.ts` — `SETTINGS_PANEL_PLACEMENT` mapeia painel →
`{module, source, tab}`, e `settingsPanelsOf`, `settingsTabsOf` (ordem de declaração = ordem das abas)
e `resolveSettingsDataScope` derivam dali. É esse registro que garante o campo **vir preenchido**:
a tela liga a consulta com `enabled: canManageSettings && settingsScope.<source>` — permissão **e**
aba aberta —, então abrir a aba busca o cadastro que já existe em vez de mostrar formulário em branco.
Contrato em `test/company-settings/tabs.contract.ts`.

- `company-settings` ficou com **Empresa** e **Certificados**, só.
- A busca automática de notas (opt-in + cursor) mora na aba **Remota** de `nfe-workspace`, guardada
  por `settings.manage`; sem a permissão a aba continua visível com o cartão somente-leitura, porque
  ali é informação de operação. Contrato em `test/nfe-workspace/distribution-settings.contract.ts`.
- O ajuste de preço de combustível mora na aba **Combustível** de `fleet` e a credencial da Nota RP
  mais os perfis de emissão na aba **Configurações** de `nfse-invoice` — as duas guardadas por
  `settings.manage`.
- A tabela de frete mora na aba **Regiões** de `fleet`, e ali a permissão guarda **a escrita, não a
  aba**: sem `settings.manage` sobram a tabela e o mapa, e nenhum botão. Ler região é `fleet.read`
  porque a cobertura é o que o formulário de motorista consulta, e quem cuida da frota sem
  administrar configuração ainda precisa ver em que zona a cidade caiu — aba escondida não mostraria
  nem uma coisa nem outra. Por isso a consulta desta aba liga só com `settingsScope.freightRegions`,
  sem o `canManageSettings` que as outras exigem. Contrato em `test/fleet/regions-tab.contract.ts`.
- Painel movido leva junto os rótulos: as chaves vão para o `*.locale.json` do módulo de destino, e o
  atalho que apontava para a tela de origem é retirado — atalho para tela que não hospeda mais o
  controle é caminho para lugar nenhum.

**O mapa da zona é desenho nosso, e a malha vem do IBGE** (`fleet/shared/ibgeMesh.service.ts`, o
quarto e último destino externo do módulo, ao lado do Photon e das duas rotas da BrasilAPI —
`https://servicodados.ibge.gov.br/api/v3/malhas/estados`, por UF, na qualidade mínima e recortada por
município). Aqui **não há `iframe` nem imagem remota** — como no endereço do motorista desde a
ADR-0037: o SVG é primitivo do design system e a cor da zona sai dos tokens, então
nada de terceiro renderiza dentro da nossa tela — e a malha não leva dado pessoal, só a sigla do
estado. Município com ilha ou enclave vira **um** caminho fechado: desenhar anel por anel pintaria a
mesma cidade em duas cores quando a zona mudasse. Cidade gravada sem polígono na malha (grafia que o
IBGE não reconhece, cidade de outra UF) é **nomeada fora do mapa**, nunca escondida — zona vista pela
metade é pior que zona vista inteira com um aviso ao lado —, e o casamento é pela dobra de
`normalizeVehicleCatalogName`, não pela grafia, para `BARRINHA/SP` da planilha casar com `Barrinha`
do IBGE. Com uma zona aberta no formulário, clicar no município acrescenta a cidade e clicar de novo
a retira, **pela grafia gravada**: pela do IBGE a cidade importada seria impossível de desmarcar.
Por isso `useFreightRegionForm` mora no `FreightRegionEditorDeck`, acima do formulário e do mapa —
os dois escrevem na mesma lista de cidades, e trocar a zona em edição é remontagem por `key`.

Tokens de design em `:root` de `src/styles/index.css` (`--color-*`, `--font-*`, `--space-1..16`), tema
escuro único. Design system caseiro em `src/components/ui/`. Estilos por módulo em `*.module.css`.

Todo container de tela usa `width: var(--layout-width)` — nenhum módulo declara largura própria, para
o cabeçalho da aplicação e os painéis fecharem na mesma borda. Detalhes em `docs/frontend/layout.md`,
contrato em `test/design-system/layout-width.contract.ts`.

Toda largura de tela sai dos quatro pontos de quebra do `web.md` §10 — base (sem consulta), `40rem`,
`64rem` e `80rem` —, sempre em `min-width`: `max-width` e `width <=` são **proibidos** em
`src/**/*.css` e o contrato `test/design-system/responsive.contract.ts` falha com qualquer um dos
dois, e com ponto de quebra fora dos quatro. Regra completa, com o alvo de toque de 44px e as três
larguras de conferência, em `docs/frontend/responsive.md`.

Todo campo (`input`, `textarea`, gatilho de select) tira altura, padding e corpo de texto dos tokens
`--field-height`/`--field-padding`/`--field-font-size` (e suas variantes `*-compact`) — nenhum módulo
inventa altura própria. Detalhes em `docs/frontend/fields.md`, contrato em
`test/design-system/field-metrics.contract.ts`.

Todo campo de data usa `@/components/ui/date-picker` (uma data) ou `@/components/ui/date-range-picker`
(período) — o campo de data nativo é **proibido** em `src/**/*.tsx` fora de `src/components/ui/` e o
contrato `test/design-system/date-picker.contract.ts` falha se algum reaparecer. Módulo com invólucro
próprio de campo publica o dele ao lado do de texto (`FleetDateField`, `ProfileDateField`) em vez de
aceitar um `type` que escolhe entre texto e data — era por esse `type` que o nativo entrava. Regra na
seção "Data é calendário" de `docs/frontend/fields.md`.

Toda leitura de etiqueta pela câmera usa `@/components/ui/barcode-scanner` — `BarcodeDetector`
quando o navegador tem (Chromium no Android) e o decodificador do `@zxing/library` num worker
empacotado pelo Vite quando não (Safari do iPhone, Firefox). O worker é referenciado por
`new URL(…, import.meta.url)`, **nunca** por `blob:`: a CSP declara `worker-src 'self'` e o leitor
não a afrouxa (ADR-0042). Câmera ausente ou permissão negada devolvem indisponibilidade, não
exceção — o campo digitado continua sendo o caminho. Regra em `docs/frontend/barcode-scanner.md`,
contrato em `test/design-system/barcode-scanner.contract.ts`.

Todo checkbox usa `@/components/ui/checkbox` — `<input type="checkbox">` cru é **proibido** em
`src/**/*.tsx` e o contrato `test/design-system/checkbox.contract.ts` falha se algum reaparecer.
Props, variante com/sem rótulo e estado indeterminado em `docs/frontend/checkboxes.md`.

Todo ícone vem de `@/components/ui/icon` — `<svg>` cru é **proibido** em `src/**/*.tsx` fora de
`src/components/ui/` e o contrato `test/design-system/icon.contract.ts` falha se algum reaparecer.
Tamanho por token (`--icon-size-sm`/`--icon-size-md`), cor por `currentColor`, botão só de ícone com
`aria-label` obrigatório. Nomes disponíveis e como criar um novo em `docs/frontend/icons.md`.

Todo botão que hospeda ícone alinha ícone e rótulo por **uma regra global** (`button:has(svg)` em
`src/styles/index.css`), nunca por CSS de módulo: classe de botão com ícone não declara `display`
(a especificidade venceria a regra e devolveria o ícone colado ao rótulo) nem `gap` fora da escala
`--space-*`. Regra completa em `docs/frontend/buttons.md`, contrato em
`test/design-system/button.contract.ts`.

Toda altura de controle sai de `--control-height` / `--control-height-compact` (derivados de
`--field-height*`): as duas classes de tamanho do botão e todo botão só de ícone, que é quadrado
nesse valor. Nenhum módulo declara controle quadrado com medida literal em `rem` — era assim que
"Novo veículo" (2,5rem), o botão de colunas (2,25rem) e a barra de filtro (2,4rem) davam três
alturas na mesma fileira. Contrato em `test/design-system/control-height.contract.ts`.

Todo campo de seleção usa `@/components/ui/select` — `<select>` nativo é **proibido** em
`src/**/*.tsx` e o contrato `test/design-system/select.contract.ts` falha se algum reaparecer.
Contrato de props, teclado e ARIA em `docs/frontend/selects.md`. Campo que aceita **vários**
valores usa `@/components/ui/multi-select` — gatilho com a contagem, painel buscável que não fecha a
cada escolha e o escolhido em pílulas abaixo; grade de caixas por opção empurrava o resto da ficha
para fora da tela (é o caso do vínculo de veículos do motorista). Contrato em
`test/design-system/multi-select.contract.ts`.

Todo painel que abre sobre a tela (lista do select, calendários) é renderizado em portal no
`document.body` e posicionado pelo hook `useFloatingLayer` — dentro de modal ou tabela rolável o
`position: absolute` era recortado pelo `overflow` do ancestral. Contrato em
`test/design-system/floating-layer.contract.ts`, regra na seção "Camada flutuante" de
`docs/frontend/selects.md`.

Tabelas com muitas informações seguem `docs/frontend/data-tables.md` (contrato obrigatório: ordenação,
filtros multi-valor, filtro simples + avançado com grupos E/OU aninhados, reordenação/visibilidade de
colunas persistida em `localStorage`, seleção em massa, teste de contrato). Duas referências vivas: o
módulo `nfe-workspace` (tabela "Notas") — hook `useNfeDocumentTable.hook.ts` +
`AdvancedFilterBuilder.component.tsx` — e o módulo `cte-batch` (tabela de CT-es) — hook
`useCteItemTable.hook.ts`, que acrescenta paginação por cursor, soma decimal da seleção entre páginas
e status escondido por padrão (`CTE_ITEM_DEFAULT_HIDDEN_STATUSES`).

Todo filtro ativo aparece como pílula removível vinda de `@/components/ui/filter-pills`
(`components/ui/filter-pills.tsx`) — nenhum módulo desenha a sua. Os descritores ficam em
`shared/<modulo>FilterPills.service.ts` (sem tradução, com `formatDay` injetado) e a remoção por campo
em `clearFilterField` do hook; no modo simples o badge do filtro usa `countFilterPills(pills)`, e a
pílula que resume vários filtros declara o próprio peso em `count`. Regra completa na
§ 8 de `docs/frontend/data-tables.md`, contrato em `test/design-system/filter-pills.contract.ts`.

Toda contagem de filtros ativos no botão de ícone vem de `@/components/ui/count-badge` — o badge fica
**ao lado do ícone, dentro do botão**, e a regra global `button:has([data-count-badge])` em
`src/styles/index.css` troca a largura fixa do botão por `width: auto` + `padding-inline`. No canto
(`position: absolute`) ele ficava pendurado por cima da borda e era recortado pelo `overflow` da barra
de ações. Regra na § 9 de `docs/frontend/data-tables.md`, contrato em
`test/design-system/count-badge.contract.ts`.

Todo estado de carregamento (`isLoading` de query, gate de página, tabela, painel, diálogo)
renderiza um esqueleto de `@/components/ui/skeleton` com a mesma forma do conteúdo real que ele
antecede — nunca texto solto ("Carregando…") nem `null`, que é o que causa o piscar da tela ao
trocar para o conteúdo. Regra completa e como compor por tipo de tela em `docs/frontend/loading.md`,
contrato em `test/design-system/skeleton.contract.ts`.

Todo painel que nasce por clique do operador — os quatro editores inline: `FreightRegionForm`,
`VehicleForm`, `DriverForm` e `CteProfileForm` — chama `useRevealedPanel`
(`shared/useRevealedPanel.hook.ts`), que rola até ele (`block: 'start'`, instantâneo sob
`prefers-reduced-motion`) e foca o primeiro campo com `preventScroll`. Esses formulários são
renderizados **depois** da lista que os abre: com a tabela cheia o painel montava duas telas abaixo
do botão, e quem clicava em "Nova zona" concluía que nada tinha acontecido — o `<form>` estava no
DOM, que é por isso que a conferência por DOM não pegou. A margem do topo é a regra global
`[data-revealed-panel]` em `src/styles/index.css`, nunca CSS de módulo. Painel sempre visível e
formulário em diálogo (que já tem `useModalDialog`) ficam de fora. Regra em
`docs/frontend/panels.md`, contrato em `test/design-system/panel-reveal.contract.ts`.

Toda mutação que mexe num **vínculo** dispara um efeito de
`shared/mutationInvalidation.service.ts` (`invalidateMutationEffect`), nunca uma lista de chaves
montada à mão — e nenhum hook importa a chave de consulta de outro módulo para invalidá-la. O
alcance mora num lugar só porque era rederivado em dez hooks: todo caminho que _cria_ o vínculo
invalidava os dois lados, e todo caminho que o _solta_ nasceu invalidando só o seu — descartar a
NFS-e devolvia a nota no banco e a tabela seguia com o `cteBlockReason` da consulta anterior, nota
impossível de selecionar até recarregar a página. Dois efeitos hoje: `nfeDocumentLink` e
`billingInvoiceItem`. Regra e como acrescentar um efeito em `docs/frontend/mutations.md`, contrato
em `test/shared/mutation-invalidation.contract.ts`.

**O separador bipa em sequência, e a recusa fica na linha da nota.** A leitura não preenche o campo
digitável — cada chave lida vira uma linha em `TripScanQueue.component.tsx`, com esqueleto enquanto
resolve e o motivo impresso ao lado quando a nota é recusada; uma nota que não existe nesta empresa
não derruba as vizinhas nem interrompe o bipe seguinte. A fila é serviço puro
(`trip/shared/tripScanQueue.service.ts`): `acceptScannedText` extrai a chave e **descarta a
duplicata** (o separador passa a mesma etiqueta duas vezes o tempo todo), e `markScanEntry` **ignora
veredito de chave que não está mais na fila** — as respostas chegam fora de ordem e "Limpar leituras"
não pode ressuscitar linha nenhuma. O seam é puro porque o teste desta app não tem DOM: o
comportamento se prova na função, e o contrato `test/trip/scan-link.contract.ts` cobra a fiação por
texto de fonte. Vincular e desvincular disparam `MUTATION_EFFECT.nfeDocumentLink` além das chaves da
viagem; marcar entregue **não** — ali muda o estado da nota dentro da viagem, não o vínculo dela com
lote ou NFS-e.

**A viagem lista por parada, e toda mutação de estado mora no mesmo hook.** `TripDetail` agrupa
`trip.stops` (T014/T015), cada parada com arraste por `@dnd-kit` (`TripStopList.component.tsx` +
`useTripStopOrder.hook.ts`, escolhido em vez de HTML5 `draggable` nativo por acessibilidade de
teclado e pelo alvo de toque de 375px que `draggable` não cobre) — nota sem parada (CEP que não
normaliza, ou a lacuna de reconciliação do backend antes de ser corrigida) cai num balde "Sem
parada" via o mesmo componente de linha, nunca some da tela. **Nenhuma pasta `mutations/` existe no
módulo** apesar de três tasks da spec 056 sugerirem esse caminho de arquivo — toda mutação de
viagem (criar, fechar, vincular, liberar, reordenar parada, desviar endereço, separar/carregar/
devolver nota, lote, despachar, cancelar, planejar rota) entra em `useTripWorkspace.hook.ts`, ao
lado das demais; seguir o nome de arquivo sugerido teria fragmentado o mesmo padrão em dois
lugares. O diálogo de despacho forçado (`TripStateActions.component.tsx`) calcula as notas
pendentes **direto de `trip.documents`** (mesmo filtro `pending`/`separated` do backend) em vez de
decodificar `error.details` depois de uma tentativa recusada — evita o round-trip e é o mesmo dado.

**A câmera é permitida à própria origem, e só ela.** `server.ts` responde
`Permissions-Policy: camera=(self), geolocation=(), microphone=()` — `camera=()` negava a **própria**
origem e fazia `getUserMedia` falhar antes de qualquer diálogo do navegador. `(self)` não é `*`:
nenhum terceiro herda a câmera, e a CSP já declara `frame-src 'none'` desde a ADR-0037. O contrato
`test/shared/security-headers.contract.ts` guarda os dois sentidos — falha se `camera` voltar a `()`
e falha se `geolocation` ou `microphone` deixarem de ser `()`, que é a carona de capacidade de
dispositivo seis meses adiante. Achado datado em `docs/SECURITY.md`.

**Marca e modelo do veículo têm saída da lista, e a frota realimenta a lista.** O catálogo FIPE não
tem implemento, marca regional nem cavalo antigo: `VehicleCatalogField.component.tsx` acrescenta a
opção **"Outro — digitar"** (`VEHICLE_CATALOG_OTHER_VALUE`, sentinela que nunca é gravada — escolhê-la
limpa o campo e abre a digitação, com "Escolher da lista" para voltar). O que foi digitado à mão volta
como opção na próxima vez: `buildVehicleCatalogChoices` soma catálogo + marcas/modelos já cadastrados
na frota + o valor gravado na ficha aberta, deduplicados por `normalizeVehicleCatalogName` — a mesma
dobra que `vehicleBrandDefaults.service.ts` usa para herdar ficha técnica, senão a lista mostraria
"Randon" e "RANDON" separadas enquanto a herança as trataria como uma marca só. Lista vazia abre
digitável direto; carregando e bloqueado por falta do tipo do veículo seguem como select. Contrato em
`test/fleet/vehicle-catalog-other.contract.ts`.

Texto pt-BR nos `*.locale.json` vai **acentuado**. O contrato `test/shared/locale-accents.contract.ts`
varre por glob todo `src/modules/*/locales/*.locale.json` que não seja `.en.` e falha se achar palavra
de uma blocklist de formas que não existem sem acento (`nao`, `possivel`, `numero`, `pagina`, …).
Módulo novo entra na varredura sozinho; palavra nova que escapar se acrescenta à blocklist.

Fora de produção o ícone da aba troca para `public/icons/icon-work-in-progress.svg` — a marca fica
**do tamanho normal**, e o 🚧 entra como plaquinha sobreposta no canto inferior esquerdo, dentro do
próprio desenho, porque na aba o ícone é o que aparece antes do título; encolher a marca para abrir
espaço ao aviso tornava o ícone irreconhecível justamente onde ele é menor. O título fica só com o
nome, para não haver dois avisos lado a lado. A tela abre com uma faixa de
ambiente. Quem decide é
`VITE_APP_ENV` (`local` · `staging` · `production`), resolvido em
`shared/deploymentEnvironment.service.ts`: ausente ou desconhecido cai em `production` — variável
esquecida no painel não pode fazer a instalação do cliente pedir desculpas. Build de dev (`vite dev`)
cai em `local` sem configurar nada. Contrato em `test/shared/deployment-environment.contract.ts`,
que também guarda o `ARG VITE_APP_ENV` do `Dockerfile` — sem ele o valor não entra no bundle.

A tela de login **não é desta app**: é o tema Keycloak em `deploy/keycloak/theme/`, montado pelo
`compose.yaml` e copiado pelo `deploy/keycloak/Dockerfile` — o mesmo diretório nos dois caminhos.
Herda de `base` (não de `keycloak.v2`, que arrasta o PatternFly) e reescreve `template.ftl` e
`login.ftl`; os tokens de design são **cópia por valor** de `src/styles/index.css`, porque o tema
não importa código nosso. Mudou cor, fonte ou escala aqui? copie lá. Regra completa em
`docs/frontend/login-theme.md`.

**A CSP nasce no build, e o servidor não sobe sem ela.** `VITE_API_URL` e `VITE_KEYCLOAK_URL` são
inlinadas no bundle e **não existem** no contêiner que serve o `dist` — o estágio de runtime do
`Dockerfile` copia só `dist` e `server.ts`, e `server.ts` não pode importar de `src/`. Então a
diretiva tem fonte única em `shared/contentSecurityPolicy.service.ts`, o plugin
`transportada-content-security-policy` do `vite.config.ts` emite `dist/content-security-policy.txt`, e
o `server.ts` lê o arquivo **fail-closed** (`FRONTEND_MISSING_CONTENT_SECURITY_POLICY`): publicar sem
cabeçalho é a única falha que não quebra nada visível. Destino externo novo entra **nesse**
`connect-src` — nunca numa segunda diretiva, que não soma (a primeira ocorrência vence).
`'unsafe-inline'` existe **só** em `style-src`, pelo atributo `style` da camada flutuante que nonce
não cobre — `style-src-attr` é ignorado pelo Safari < 15.4 e quebraria todo select no iPhone —, e o
servidor de **dev** ganha `'unsafe-inline'` no `script-src` porque o `@vitejs/plugin-react` injeta o
preâmbulo do react-refresh inline. O contrato
`test/shared/content-security-policy.contract.ts` varre `src/**/*.{ts,tsx,css,json}` por origem
`https://` e falha se alguma não estiver no `connect-src` nem em `NON_FETCH_ORIGIN` (origem que o
bundle nomeia mas nunca busca, hoje só o link do rodapé).

Envs: `VITE_API_URL`, `VITE_APP_ENV`, `VITE_KEYCLOAK_URL`, `VITE_KEYCLOAK_REALM`,
`VITE_KEYCLOAK_CLIENT_ID`.

**A sugestão de roteiro tem duas portas, e a segunda não parte de viagem** (spec 058 P2). A de
sempre é `POST /trips/:id/route-suggestions`: a viagem existe, as paradas existem, e o solver só
reordena. A outra é **`POST /route-suggestions/multi-vehicle`**, fora da árvore `/trips/:id` de
propósito — ela recebe um **pool de notas** e uma **frota**, e é o aceite que cria as viagens. Todas
sob `trip.manage`; ler é `fleet.read`.

O que muda por dentro: `route_suggestions.trip_id` é nulo, `route_suggestion_documents` guarda o
pool, `route_suggestion_vehicles` guarda a frota **na ordem oferecida** (é ela que faz a mesma
semente distribuir igual), `route_suggestion_stops.vehicle_id` diz quem serve cada parada e
`route_suggestion_stop_documents` diz qual nota cai em qual parada proposta — sem essa última, o
aceite reagruparia as notas por endereço de novo, e o segundo agrupamento poderia discordar do
primeiro. Nota já em viagem e veículo que não traciona são recusados na criação (`409`), com o id no
`details`.

⚠️ **O aceite cria viagem, mas não escreve viagem**: ele chama os casos de uso da 056 — criar,
vincular, ordenar, planejar —, um por veículo, e as viagens saem em `route_planned`. As viagens
nascem **antes** de a sugestão virar `accepted`: falha no meio deixa a sugestão `ready` para repetir.
A viagem nasce **sem motorista** — o solver decide o veículo, não quem dirige.

⚠️ A chave de parada do pool (`worker-transportada/src/routing/domain/pool-address-key.ts`) é
**cópia por valor** de `api-transportada/src/trips/domain/stop-address-key.ts`, com contrato que
compara os dois arquivos linha a linha: se divergirem, a parada que o worker propõe e a parada que o
aceite cria deixam de casar, e o roteiro aceito fica com duas paradas no mesmo portão.

## frontend-client

O **portal do contratante** — quem paga o frete acompanha a carga dele. App própria (ADR-0050 §1):
build, bundle, domínio e `Dockerfile` separados, porta 53100. Servir o bundle do painel a um usuário
externo seria depender de que toda condicional de permissão no cliente esteja certa, para sempre, em
todo deploy; bundles separados transformam isso num erro **impossível** em vez de improvável.

**O contratante é usuário, e o vínculo é o recorte.** Ele entra pelo mesmo Keycloak, com o mesmo
convite, com o papel `contractor` e **duas** permissões: `deliveries.track` (acompanhar) e
`charges.decide` (decidir repasse — dinheiro não sai de carona com acompanhar entrega). O que ele
enxerga **não vem do papel**: vem de `contractor_portal_bindings`, que amarra a membership dele a
linhas de `contractors` — e é `contractors` que carrega o documento, desde a 060. As duas FKs do
vínculo levam `company_id` junto: a FK simples aceitaria amarrar conta de uma empresa ao contratante
de outra. Administrar o vínculo é `users.manage` (`/contractors/:id/portal-users`), não
`settings.manage`: uma decisão é para quem se cobra, a outra é quem enxerga a operação. ⚠️ Amarrar
membership **sem** o papel `contractor` é `409` — sem isso quem tentou acreditaria ter concedido
acesso, e ninguém descobriria até o cliente ligar.

**Nenhuma rota do portal recebe id interno.** `/client/me/deliveries` não aceita nem query; a nota é
nomeada pela **chave de acesso** (`.../:accessKey/schedule` e `.../:accessKey/location`), e o
servidor descobre a parada e a viagem. `resolveContractorScope` é a única fonte do recorte e recebe
vínculo, não filtro — e um contrato confere isso **por texto de fonte**, porque uma assinatura que
aceitasse `taxId` compilaria e passaria em todo teste de caminho feliz. Conta sem vínculo é `403`,
nunca lista vazia. Chave que não é dele, chave que não existe e nota sem viagem respondem **igual**.

**O rastro ao vivo tem três guardas** (ADR-0050 §5): o motorista consente (`fleet_drivers.
location_sharing_consent_at`, nulo por padrão, e retirá-lo apaga o rastro na mesma transação); o
rastro morre com a viagem (`purgeByTrip` no fechamento e no cancelamento, fora da transição); e o
cliente vê `latitude`/`longitude`/`recordedAt`, nunca quem dirige. Sem consentimento e fora de viagem
respondem igual ao celular (`202`, contra `201` do gravado). ⚠️ **Nada expira o rastro de viagem que
nunca fecha**, e não há limite de frequência de ping.

**A app não fala com terceiro nenhum**: `connect-src` é a própria origem, a API e o Keycloak — o
painel tem quatro destinos externos, aqui são zero, e um contrato varre `https://` no código. Câmera,
posição e microfone são **todos negados** na `Permissions-Policy` (o painel abre a câmera para o
separador). O provedor de autenticação é cópia do painel **menos** o bypass de fumaça, e o contrato
falha por nome se ele voltar. O mapa é desenho nosso em SVG (projeção equirretangular corrigida pelo
cosseno da latitude, janela de meio grau) — ⚠️ **sem a malha do IBGE que a ADR previa**: o payload
mínimo não carrega cidade nem UF, e alargá-lo para desenhar contorno trocaria privacidade por
enfeite.

⚠️ Esta app **não tem design system nem Playwright**: CSS próprio curto com os tokens copiados por
valor, campos nativos (inclusive `datetime-local`, que o painel proíbe), e nenhum teste de tela — o
que se prova é serviço puro e texto de fonte. Crescer a app é decidir isso de novo, por escrito.
Envs: `VITE_API_URL`, `VITE_CLIENT_APP_URL`, `VITE_KEYCLOAK_*`.

## Documento fiscal: o CNPJ tem letra

CNPJ alfanumérico (IN RFB 2229/2024, NT Conjunta DF-e 2025.001, em produção desde 01/07/2026):
**`[A-Z0-9]{12}[0-9]{2}`** — letra só nas doze posições da base, os dois dígitos verificadores
continuam numéricos. **O CPF não mudou**: onze dígitos, sempre. A chave de acesso herda o documento
nas posições 7 a 20, então o padrão dela é `^[0-9]{6}[A-Z0-9]{12}[0-9]{26}$` (cUF+AAMM, o CNPJ do
emitente, e daí em diante só dígito). Todo CHECK de chave no banco é esse — `nfe`, `cte-issuance`,
`billing`, `mdfe`, `nfse`, `fleet`, `digital-certificate`.

**A forma canônica é sem máscara e em CAIXA ALTA.** Canonicalizar é `normalizeTaxId`: tira `.`, `/`,
`-` e espaço, e sobe a caixa. Onde ela mora:

- `api-transportada/src/shared/tax-id.service.ts` — **único** ponto da API que importa
  `CNPJ_PATTERN`/`CHAVE_PATTERN`/`normalizeTaxId` de `@adatechnology/fiscal-provider`, para o `~` do
  Postgres, o `regex` do Zod e o XML não divergirem. Ali também ficam `CPF_PATTERN`,
  `CNPJ_ROOT_PATTERN` (a raiz alfanumeriza junto — é prefixo do documento), `TAX_ID_PATTERN`,
  `DOCUMENT_FILTER_PATTERN` e `parseTaxIdValue` para fronteira que não é Zod (query string, rota).
- `api-transportada/src/shared/tax-id.schema.ts` — `buildTaxIdSchema` / `buildOptionalTaxIdSchema`.
  A ordem importa: `.transform(normalizeTaxId)` **antes** do `.refine(pattern)`, senão a minúscula
  vinda do formulário é recusada antes de ter chance de subir a caixa.
- `worker-transportada/src/shared/tax-id.service.ts` — reexporta do mesmo pacote fiscal.
- `frontend-transportada/src/modules/shared/taxId.service.ts` — aqui a regra é **reescrita**, porque
  o bundle não carrega o pacote fiscal; `test/shared/alphanumeric-tax-id.contract.ts` é o que
  garante que as duas dizem a mesma coisa. Campo de CNPJ **nunca** leva `inputMode="numeric"` — o
  teclado do celular não tem letra — e o `onChange` canonicaliza enquanto se digita.

**O que continua sendo por comprimento, e está certo:** `toParticipante`
(`cte-issuance/domain/cte-payload.builder.ts`) escolhe `cnpj` em 14 caracteres e `cpf` em 11. O CNPJ
alfanumérico continua tendo 14 — a discriminação sobrevive à IN, e trocá-la por padrão seria
mudança sem ganho.

**O que precisou virar guarda de conjunto:** `formatDacteDocumentNumber`
(`cte-issuance/domain/dacte-format.policy.ts`) canonicaliza e testa `CNPJ_PATTERN` **antes** de
`CPF_PATTERN`. Filtrar por dígito, como antes, deixava onze dígitos num CNPJ de três letras e
imprimia o documento sob a máscara de CPF.

Cobertura ponta a ponta em
`api-transportada/test/integration/alphanumeric-cnpj-end-to-end.integration.ts`: nota de emitente
alfanumérico → lote → frete → payload de CT-e → DACTE → fatura. Ele **não** cobre assinatura e
transmissão (o XML nasce no worker, com certificado e rede).

## Convenções

Sufixos em uso: `.use-case.ts` · `.service.ts` · `.schema.ts` · `.repository.ts` (sempre prefixo
`drizzle-`) · `.routes.ts` · `.port.ts` · `.gateway.ts` · `.error.ts` · `.policy.ts` · `.mapper.ts` ·
`.persistence.ts` · `.types.ts` · `.constant.ts`. Frontend: `.page.tsx` · `.component.tsx` · `.hook.ts` ·
`.query.ts` · `.validation.ts` · `.locale.json` · `.module.css`.

Testes ficam em `test/`, sem colocation: entrypoint fino `test/<area>.contract.test.ts` importando
suítes `test/<area>/*.contract.ts`; `test/fixtures/*.fixture.ts`; `test/integration/*.integration.ts`.
⚠️ A lista de arquivos de teste é **explícita** no `package.json` de cada app — teste novo não roda se
não for adicionado ali.

Use cases e rotas são factories `create*`; classes de repositório são `PascalCase`
(`DrizzleBillingRepository`). Imports ESM sempre com extensão `.js`. TS `NodeNext`, `strict` +
`exactOptionalPropertyTypes`.

## Regras que não se negociam

- Uma task por vez, tirada do `tasks.md` da feature. Nada de implementar com `[NEEDS CLARIFICATION]`
  aberto. Task só fecha com evidência de teste em `evidence.md`.
- Teste de aceite/contrato **antes** da implementação.
- API HTTP usa `Bun.serve`. Importar o addon V8 `uWebSockets.js` é proibido.
- Dinheiro é `Decimal`/`numeric` — nunca float binário.
- `companyId` vem do contexto autenticado, nunca do payload do cliente.
- XML fiscal original é preservado. Nunca logar certificado, senha ou XML sensível.
- Não importar internals `src/sefaz/*` do pacote fiscal — encapsular em gateway da aplicação. Não
  inventar regra legal nem método que o pacote não expõe.
- Frontend é PWA e usa `shadcn/ui`; UI paralela ao design system exige ADR.
- Proibido: deploy em production sem gates e aprovação humana, migration destrutiva automática,
  misturar tenants / ambientes fiscais / buckets.
- `.env` e `.env.test` nunca são commitados nem têm conteúdo exposto.

## Duas sessões, duas árvores

**Sessão que vai escrever código nesta base cria o próprio worktree.** Duas sessões no mesmo
checkout produzem uma família inteira de atrito que não tem nada a ver com o produto: formatação
cruzada, `git add` amplo levando trabalho alheio pela metade, teste sumindo da lista do
`package.json` quando alguém reescreve a linha a partir de cópia antiga, e commit de uma entrando no
push da outra.

```bash
make worktree NAME=spec-066
```

Ele cria `../transportada-wt/<NAME>` na branch `work/<NAME>` a partir de `origin/staging`, liga
`.env` e `.env.test` por **link simbólico** (cópia envelheceria) e instala as dependências. Verificado
que dali rodam os 3611 contratos da API e os 54 de migration contra Postgres.

Publicar de um worktree não passa por checkout de `staging` — ela está ocupada pela árvore principal:

```bash
git fetch && git rebase origin/staging && git push origin HEAD:staging
```

⚠️ `git worktree prune` de vez em quando: worktree apagado à mão deixa registro órfão, e três deles
estavam pendurados aqui de sessões antigas.

## Explorando este repo sem estourar contexto

652 arquivos versionados, 509 `.ts`/`.tsx`, ~67k linhas. Ler tudo direto estoura a janela. Delegue a
exploração para subagentes `Explore` escopados por app — eles leem no contexto deles e devolvem só a
conclusão. Ignore `graphify-out/` (1.9M), `specs/` (672K), `example/`, `realm/`, `tmp/`, `.history/`.
