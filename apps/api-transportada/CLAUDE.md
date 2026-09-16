## api-transportada

Histórico completo, medições datadas e narrativas de defeitos: `docs/ai-context/api-transportada.md`
(referenciado abaixo como "docs/ai-context § <início da frase em negrito>" — use grep pelo trecho
citado para achar o parágrafo exato).

Módulo de domínio = até 4 camadas em `src/<modulo>/`:

- `presentation/` — `*.routes.ts` (`defineRoute`), `*.schema.ts` (Zod). Única camada que vê
  `Request`/`Response`.
- `application/` — `*.use-case.ts`, `*.service.ts`, `*.port.ts`.
- `domain/` — regras puras, `*.error.ts`, `*.policy.ts`. Sem I/O.
- `infrastructure/` — `drizzle-*.repository.ts`, `*.mapper.ts`, `*.gateway.ts`.

Módulos: `addresses`, `address-correction`, `billing`, `companies`, `contractor-mail`,
`contractor-portal`, `cte-batches`, `cte-issuance`, `cte-profiles`, `fleet`, `freight`,
`freight-calculations`, `freight-regions`, `freight-rules`, `identity`, `mdfe-manifests`,
`nfe-documents`, `nfe-imports`, `nfse-callbacks`, `nfse-invoices`, `nfse-profiles`, `notification`,
`operations`, `routing`, `storage`, `trips`, `view-preferences`, `whatsapp-commands`, `health`.
Transversais: `config`, `database`, `http`, `logging`, `observability`, `server`, `shared`.

⚠️ **O pedido de correção de endereço (`address-correction/`) nunca edita `nfe_addresses` nem o XML**
— é um registro à parte (`address_correction_requests`), e a contratante é sempre resolvida pelo CNPJ
do emitente dentro da `companyId` do token, nunca do payload (spec 150).

⚠️ **O envio de e-mail à contratante não depende de `contractor_mail_settings.status`** — depende de
`sending_verified_at` (lista de verificação) e de existir um `contractor_mail_templates` ativo do
tipo (spec 150 T401/T402, `resolveMailSendReadiness`). ⚠️ **Rota que dispara e-mail declara
`rateLimit: { store: 'postgres', scope, maxRequests, windowSeconds }`** e aparece em
`test/rate-limited-routes.contract.test.ts` — hoje só as duas de `contractor-mail` (spec 150 T406).

Fluxo de request: `src/main.ts` (composition root) → `server/server.service.ts` (`Bun.serve`, limite
2 MiB) → `http/request-handler.service.ts` (correlation-id, 1 MiB → 413, CORS) →
`http/router.service.ts`: autentica → `matchRoute` → `tenantContext.resolveCompany` → `authorize` →
`route.execute` → `parse` (Zod) → `handle` → use-case → repositório.

**Multi-tenant:** Bearer JWT (Keycloak/JWKS) → identidade externa por issuer+subject →
`tenantContext.resolveCompany` busca membership ativo; sem membership → 403. Todo repositório recebe
`context.companyId` e filtra por ele. Testes de isolamento em
`test/*-schema/tenant-safety.contract.ts` são **obrigatórios** em qualquer mudança de query.

## Banco

Schemas em `src/database/*.schema.ts`, agregados em `database.schema.ts`. Migrations SQL versionadas
em `drizzle/`. `bun run db:generate --name x` · `db:check` · `db:migrate` · `db:seed:local`. O
startup **não** roda migrations; rollback é manual, ao lado da migration.

**Migration à mão é permitida, sem snapshot não** (13/09/2026). Toda pasta nova de `drizzle/` leva
`snapshot.json` do schema TS; `db:generate` diffa contra o último, e dez migrations à mão sem ele
fizeram o gerado recriar tabelas já aplicadas. O `db:check` **não** pega isso — quem pega é
`test/database-migration/schema-snapshot.contract.ts`. Receita e histórico: docs/ai-context §
"Migration à mão é permitida".

**O banco falha rápido, e diz por quê** (spec 137, incidente 11/09/2026): `database-client.service.ts`
monta o Bun SQL com pool e prazos explícitos (`DATABASE_POOL_MAX`, `DATABASE_CONNECT_TIMEOUT_SECONDS`,
`DATABASE_QUERY_TIMEOUT_MS` abaixo do `REQUEST_TIMEOUT_SECONDS`); consulta que passa do prazo vira
**503 `DATABASE_UNAVAILABLE`** com log, nunca silêncio até o timeout do servidor. `prepare: false` é
correção de causa medida (instruções preparadas do Bun SQL travavam sob concorrência), não enfeite —
religar exige medir de novo numa versão nova do Bun. Detalhe completo (armadilhas de `idleTimeout` e
`cancel()`): docs/ai-context § "O banco falha rápido".

**Perfil fiscal sem sequência de CT-e é leitura válida** (15/09/2026): o refresh de staging trunca
`fiscal_sequences` e mantém `company_fiscal_profiles`. `GET /company-settings` respondia 500 com
`Error` genérico, e a causa não chegava ao log. Hoje `findCompanySettings` devolve a linha que o
PATCH gravaria (ambiente do perfil, série 1, número 1, versão 1). Falha de persistência das
configurações é `CompanySettingsPersistenceError` (`DiagnosableError`), então a mensagem sai no
`http_request_failed`. ⚠️ `new Error` cru no caminho de uma rota perde o motivo no log.

## Identidade e permissões

- **Recuperação de senha** (`POST /password-resets`, `.../confirm`) são as únicas rotas anônimas;
  a primeira responde `204` sempre, para não permitir enumeração de usuário. Código de uso único,
  expira em 15 min, envelope no worker carrega só referência. ⚠️ Sem rate limit (`docs/SECURITY.md`).
- **Admin define senha por rota própria** (`PUT /company-users/:id/password`, `users.manage`) e
  responde `204` sem eco. `temporary` é campo obrigatório do corpo, não padrão escondido. Piso de 12
  caracteres (mais alto que o fluxo de recuperação, porque quem digita é um terceiro). Sem rate limit.
  ⚠️ Definir senha **não habilita** a conta: o convite nasce `enabled: false` no Keycloak.
- **Ativação manual** (`POST /company-users/:id/activation`, `users.manage`) é a saída quando o
  código do convite não chega: senha opcional (com ela, `temporary` obrigatório) → vínculo ativo →
  `setEnabled(true)` → convite `pending` vira `accepted` → trilha `company-user.activated` (sem a
  senha). Repetir converge. Botão "Ativar agora" na linha do convidado e no painel de senha da edição.
- **Reconciliação com o Keycloak** tem duas divergências que não somam num botão só —
  `missingSomewhere` (existe de um lado, `POST /reconciliation/sync` conserta) vs `withoutProfile`
  (existe dos dois lados sem ficha, `POST /reconciliation/profiles` conserta). As duas rotas sempre
  devolveram `{…, skipped}` com a razão de cada pulo — razão nova precisa de rótulo em
  `users.sync.skipReason` no frontend.
- **A pessoa e o vínculo dela são chaves diferentes**: `CompanyUserView.id` é o usuário,
  `membershipId` é `user_company_memberships.id` — é o **vínculo** que a frota referencia (motorista).
  `toCompanyUserView` é o único ponto de conversão.
- **O separador é papel próprio** (`trip.manage`, não `fleet.manage` de carona): quatro permissões —
  `invoices.read`, `fleet.read`, `trip.read`, `trip.manage`. Não cadastra frota, não fatura, não emite
  fiscal, não reporta entrega (`trip.report` é do campo). ⚠️ `trip.read` está no catálogo mas nenhuma
  rota o pede hoje — leitura de viagem segue em `fleet.read`; migrar isso migra `driver`, `aggregate`
  e `separator` juntos. `test/separator-role.contract.test.ts` lista as rotas alcançáveis por
  extenso — rota nova de frota/faturamento/CT-e reprova ali até decisão por escrito.

## Viagem (trips) — máquina de estados

`trips.status`: `draft → route_planned → separating → loading → dispatched → in_transit →
completed` (ou `cancelled`), **derivado** do estado das notas exceto em quatro transições manuais
(criar, `plan-route`, `dispatch`, `cancel`). `checkTripDocumentTransition`/`checkTripTransition`
(`trips/domain/trip-state.policy.ts`) são a única fonte da máquina; toda transição é idempotente por
desenho. `dispatched` é porta de não-retorno (bloqueia vincular/desvincular/reordenar, roteiro congela
em `trip_dispatch_snapshots`); só `cancel` sai dali. `TripStop` é **derivada** — nunca criada à
mão — via `reconcileStopOnLink`/`reconcileStopOnUnlink`, agrupando pelo endereço normalizado do
destinatário, nunca pelo CNPJ.

⚠️ `return`/`deliver` só depois de `dispatched`; `separate`/`load` exigem roteiro planejado —
tratar os três como um `isEditable` só oferece o botão exatamente quando ele dá `409`. Guarda:
`test/trip/state-gates.contract.ts` (frontend).

**Cancelar devolve a carga** (spec 102): `markCancelled` marca `released_at` nas notas ainda
vinculadas na mesma transação do status — mas **libera é marcar, nunca apagar** a linha de
`trip_documents` (é a prova histórica do que aconteceu), e `stop_id` **não** é zerado. Nota entregue
não volta ao pool. ⚠️ Toda consulta que decide "nota disponível" filtra por `released_at`, nunca pelo
status da viagem — `findTripLinks` não filtrava isso e 324 vínculos liberados ficaram invisíveis para
a montagem de roteiro (medido 2026-09-08); o padrão correto é `buildActiveTripLinkFilters`.

**A nota que não coube vai para a fila de revisão, por botão** (spec 148 T7):
`trip_document_reviews` (`pending → moved | swapped_in | relinked`, sem ENUM), rotas em
`trip-document-review.routes.ts` — `POST /trips/:id/cargo-layouts/:layoutId/release-unplaced`,
`GET /trip-document-reviews`, `…/:id/swap-suggestions`, `…/move-preview`, `…/move`, `…/swap`.
Soltar marca `released_at`; `time_budget` e `notMeasured` nunca soltam (D11); planta com hash velho
é 409; a trava é só o despacho (`checkTripAcceptsLinkage`), CT-e não trava (D13). Mover/trocar
aplicam **a mesma mudança** na prévia (transação desfeita) e na ação — é isso que faz o hash bater.
⚠️ Todo vínculo novo (`linkDocument`, lote, aceite) fecha a entrada pendente como `relinked` (D12,
`closePendingReviewsOnLink`). O aceite da proposta leva `releaseUnplacedFromLayoutIds` (vincula e
solta na mesma transação). ⚠️ Teste contra Postgres usa `createDatabaseProvider` (`prepare: false`):
com `createDrizzleProvider` cru a transação da prévia parava ociosa para sempre (spec 137).

**A nota tem dois endereços de destino, só um diz onde o caminhão para** (spec 073):
`<enderDest>` é cadastro do cliente, `<entrega>` é onde a carga é deixada. Precedência **desvio
manual → `<entrega>` → `<enderDest>`**, decidida por `resolvePhysicalDestination`
(`nfe-documents/domain/physical-destination.policy.ts`, cópia por valor no worker, contrato de
paridade). ⚠️ A linha divisória é ler ou não o **endereço**, nunca o nome do consumidor: quem decide
_lugar_ segue esse seam (parada, solver, MDF-e, geocoding); quem decide _quem_ continua no
destinatário (CT-e, NFS-e, faturamento, regra de frete, portal do contratante — inclusive
`delivery-clients`, que **não** foi convertido de propósito).

**Sem barracão configurado, a rota parte do endereço fiscal da empresa** (spec 097 D7):
`resolveDepotOrigin` decide (configuração vence), com cópia por valor no worker e contrato de
paridade; a resposta de geometria diz a fonte em `depot.originSource`. Nada grava
`company_route_optimization_settings` hoje. Detalhe: docs/ai-context § "O barracão sem configuração".

**Chave de acesso é filtro de listagem, não rota nova** — `GET /nfe-documents?accessKey=` dentro do
`companyId` do contexto, padrão alfanumérico (`^[0-9]{6}[A-Z0-9]{12}[0-9]{26}$`, nunca `\d{44}`).

**A listagem de notas abre pela última atualização** (14/09/2026): `GET /nfe-documents` ordena por
`updated_at desc, issued_at desc, id desc`, servida por `nfe_documents_company_updated_issued_id_idx`.
O cursor é `<updated_at>::<issued_at>::<id>` com microssegundos (texto via `to_char`, nunca `Date`,
que truncaria e pularia nota); o cursor antigo `<iso>::<uuid>` é `400`. ⚠️ Nada atualiza
`nfe_documents.updated_at` depois do insert (reimportação é `onConflictDoNothing`; status, caixa,
viagem e CT-e gravam em outras tabelas) — na prática a ordem é a da importação. Evento fiscal que
muda status `authorized → cancelled` ou `unsigned → denied` **atualiza `updated_at` e sobe a nota ao
topo** (spec 149 D10), via `applyStatusChange` no worker sob lock por `(company_id, access_key)`.

**Endpoint `GET /v1/nfe-documents/:id/events` (spec 149 D19):** permissão `invoices.read`, retorna
cursorpage de eventos e mudanças de status (`{ data: [...], page: { nextCursor } }`, mesmo padrão de
`GET /nfe-documents`). Origem
(`manual`/`automatic`), ator/solicitante e snapshot gravados. Acesso entre empresas (nota de outra
empresa) retorna **404**. Evento antigo (sem origem/ator/snapshot) aparece com "origem desconhecida"
e "status anterior não registrado". Ator sem membership ativa na empresa devolve `{ removed: true }`
sem id/nome. Nome e texto de CC-e nunca em log. Índice `(company_id, document_id, changed_at desc,
id desc)` suporta paginação eficiente.

**CHECK `nfe_documents_authorization_protocol_presence_check`** (migration H1b, spec 149 D4): exige
protocolo só da nota `authorized` (`("status" <> 'authorized') or ("authorization_protocol" is not null)`),
permitindo `unsigned`/`cancelled`/`denied` sem protocolo — para a nota `unsigned` poder ser cancelada
ou denegada no mesmo insert (evento que chega antes da nota).

⚠️ Telefone (`nfe_addresses.phone`) e e-mail (`nfe_participants`, tabela **diferente** — telefone é do
endereço, e-mail é da parte) do destinatário existem para a viagem ligar antes de sair; servidor
sempre serve o cru, máscara/cópia é do frontend (`formatStoredPhone`). Detalhe completo: docs/ai-context
§ "O telefone do cliente" e § "O e-mail do destinatário".

## Fleet — ficha do motorista e geocodificação

**A ficha do motorista guarda dado de pessoa física que hoje ninguém lê** (`birth_date`,
`license_number`, endereço residencial, trio do RG) — a ADR-0039 já decidiu criptografar esses campos
(A256GCM, AAD `transportada:fleet-driver:v1:${companyId}:${driverId}`) e a execução **ainda não
aconteceu**; quem for escrever leitor para um desses campos precisa abrir o envelope primeiro —
confira a ADR antes. CNH é única por empresa só quando preenchida (índice parcial). Órgão do RG é
lista fechada `IDENTITY_DOCUMENT_ISSUERS`, cópia por valor API/frontend.

**O endereço se mede uma vez** (ADR-0061, spec 084) — geocodificação em lote, por decisão explícita,
nunca recalculada a cada leitura. Separação grafia × lugar (`street-comparison.policy.ts`) é o que
torna o relatório de endereços legível. CEP vem de cadastro; a busca textual ainda sai do navegador
(Photon). **Cidade é lista do IBGE, não texto livre** (`fleet/shared/municipality.service.ts`),
casada por `normalizeVehicleCatalogName` para tolerar grafia divergente entre planilha e IBGE.

## Carga: cubagem, capacidade e cargo placement — ver a referência

**As regras de cubagem/capacidade do veículo e o algoritmo de arrumação de caixas no baú (specs 075,
085, 088, 093, 099, 113 a 121, 135, 144, ADR-0061/0062) são densas, medidas em viagens reais, e foram a
maior causa do CLAUDE.md de 184k — não as resuma aqui de novo.** Antes de tocar em
`fleet/*cargo*`, `*/cargo-placement/*` ou qualquer código de escala/planta do baú, leia a seção
correspondente em `docs/ai-context/api-transportada.md` (busque pelos números de spec acima).
Invariantes mais cotadas para não reimplementar por engano:

- A NF-e não traz cubagem — ela é **estimada** a partir de `<vol>` e de ficha de veículo medida; a
  ocupação **nunca** mostra 100% nem 0% sem marca de estimativa. Quando parte dos produtos da nota já
  tem ficha, o resíduo (`total − medido`) é dividido entre as caixas sem medida antes de cair na
  mediana da empresa (spec 144, `resolveDocumentCargoEstimate`).
- Implemento (carreta) é o que carrega, cavalo mecânico não entra na tabela de frete nem na conta de
  cubagem — `vehicle_type` do implemento é vazio de propósito.
- Medir uma caixa é `cargo.measure`, permissão própria (não `settings.manage`), e **substitui** a
  medição anterior — nunca duas verdades para a mesma caixa. A medida grava `measurement_source`
  (`typed` | `camera` | `camera_adjusted`) e `measurement_margin_mm`, com histórico append-only
  em `nfe_package_box_measurements` incluindo a proposta da câmera, os motivos de aviso, o motor e o
  ator. Interruptor por empresa (`company_cargo_settings.camera_measurement_enabled`, padrão `false`)
  desliga a câmera sem deploy; com a função desligada, `PUT` com `source: camera|camera_adjusted`
  retorna **422** `PACKAGE_BOX_CAMERA_MEASUREMENT_DISABLED` (spec 152, ADR-0065).
- O desenho da carga é a vista em perspectiva por camada (`TripCargoLayers` sobre
  `cargo-isometric.tsx`, `<svg>` do design system, nunca cru), alimentada por `cargoLayout.placement`.
  A planta em escala (`scale-plan.tsx`) e a fileira da 085 saíram da tela em `453e0b1e`; sem as três
  medidas do baú não há desenho, só o aviso com atalho para a ficha.
- **A planta é calculada no worker** (ADR-0063, spec 145): o empacotador (`@adatechnology/cargo-placement`)
  roda em `new Worker()` com orçamento de tempo; a tabela `trip_cargo_layouts` guarda o resultado;
  a API enfileira por hash (eager em use cases que tocam parada/caixa, lazy em `readTripDetail`
  recalculando), lê quando pronto e nunca empacota na requisição. Sem baú: `unavailable`. Índices
  novos em `nfe_volumes`, `nfe_products`, `nfe_package_boxes`. Detalhe: docs/ai-context § "A planta
  sai do event loop", ADR-0063 §1–7.

## Peso da carga

**O peso tem duas fontes, e só o CT-e o exige** (ADR-0052, spec 067): `pesoB` declarado no XML →
`qVol × company_cargo_settings.default_volume_weight` → ausência (`null`, nunca zero). Resolvido em
`nfe-documents/domain/cargo-weight.policy.ts`, consumido pela listagem, seleção de lote e payload de
CT-e — todo lugar que expõe peso expõe a **origem** ao lado (`cargoWeightSource`), pela mesma razão
da ADR-0044 §1: número plausível sem aviso é o modo de falha.

**O roteirizador lê o mesmo peso** — `resolveStopWeight` (worker) segue a mesma precedência da
listagem; onde as duas divergem é na ausência: a listagem publica `null`, o solver precisa de um
número e usa `fallback_weight_kilograms` (por nota sem medida, não mais por parada).
`weightEstimated` marca o **pior caso da parada** inteira. Não confundir com
`company_route_optimization_settings.fallback_weight_kilograms` (isso é peso por parada para o
solver, coisa diferente).

## Fiscal: NFS-e municipal, ICMS, período

- **Serviço municipal é escolha do perfil, não premissa do produto** (spec do portão municipal):
  `cte_emission_profiles.municipal_service_policy` (`allow` padrão | `block`) decide se nota de mesmo
  município (ISS/NFS-e) é recusada na seleção de lote de CT-e. Comparação é pelo **código IBGE**,
  nunca pelo nome (grafias divergem). Migration aditiva, nenhuma instalação muda comportamento ao
  aplicá-la.
- **O ICMS se projeta pelo perfil de emissão até o CT-e existir** (spec 125) — projeção, não fato;
  perfil sem alíquota (CST 90) projeta zero.
- **`{{periodo}}` da NFS-e é digitado, não derivado** — `buildNfseDescription` repassa o que veio, e
  em branco a variável sai vazia. Corrigir o período e repetir a chave é pedido novo, não replay.

## Billing

- **Cliente da fatura é o tomador do frete, quem paga** — nunca um papel de participante da nota.
- **Cancelar fatura devolve o CT-e**: `billing_invoice_items.cancelled_at` marca a linha na mesma
  transação que libera o CT-e para entrar em outra fatura.

## Custo de frete, motoristas e pedágio

- **O R$/km do veículo é derivado, não digitado** (`costPerKilometer` sai do consumo e do preço do
  combustível — nunca campo livre no formulário).
- **Motorista sem a zona: a conta usa o preço da tabela, e avisa** (spec 124) — nunca falha
  silenciosa; **a rota do agregado é a que casa com mais cidades da viagem** (spec 127); empate de
  rota usa o maior valor, e a matriz só vale sozinha (spec 128).
- **A região do motorista é custo, não preço de frete** — `freight_region_driver_rates.driver_amount`
  não entra em `freight-rules`/`freight_calculations`/CT-e. Zona é acumulativa dentro da família
  (`1.002` cobre `1.001` e `1.000` também). Unicidade da cidade é `(company_id, region_id, city,
state)`, nunca `(company_id, city)` — a mesma cidade pode estar em duas rotas.
- **O veículo tem um tipo só** (`vehicle_type`, catálogo `VEHICLE_TYPES`, cópia por valor
  API/frontend), e os dois campos fiscais (MDF-e `tpRod`, classe de frete) são **derivados** dele —
  substituiu o antigo par `wheel_type`+`freight_class`.
- **Tabela de frete entra por `POST /freight-regions/import`, nunca por seed** (produto genérico,
  ADR-0021). Reimportar o mesmo arquivo é no-op; rota ausente vira `inactive`, nunca é apagada.
- **Pedágio é calculado a partir da rota, não lançado à mão** (spec 090) — praça casa por identidade
  de nó do OSM (`annotations=nodes`), nunca por proximidade; pedágio viaja **na mesma resposta** de
  rota que a distância (nunca chamada própria); manual sempre vence calculado. Viagem congela o
  pedágio no planejamento (`trips.planned_toll`). ⚠️ A rota mais barata pode ter mais pedágio — a
  eleição é por pedágio + combustível juntos, nunca só pedágio. Detalhe completo (o eixo do veículo
  que decide a tarifa, o radar por `maxspeed:hgv`): docs/ai-context § "O pedágio da rota".

## Agregado (aggregate) — pré-cadastro e OCR de documento

`POST /public/aggregate-application-attachments` é **anônima** e não lê o anexo na requisição
(ADR-0053, spec 070) — grava objeto + evento de outbox na mesma transação e responde `201` sem mais;
quem lê é o **worker**. `extracted_fields` guarda o que foi lido em texto puro, **sem prazo de
descarte** enquanto o rascunho não é decidido — aprovar/reprovar zera a coluna no mesmo `UPDATE` da
decisão. A landing continua lendo no navegador também, por motivo diferente (preencher o formulário
na hora) — aceitar a leitura do cliente como prova deixaria um atacante escolher o que o operador vê.
Pré-cadastro começa pelos **documentos**, antes de "Dados pessoais" (spec 071). Detalhe completo do
parser e da divisão PDF/OCR: veja o núcleo de `worker-transportada` e docs/ai-context §
"O anexo da candidatura".

## WhatsApp como canal de comando (whatsapp-commands)

Uma mensagem recebida executa ação de negócio — separar, despachar, entregar, registrar ocorrência,
emitir CT-e/NFS-e por seleção e faturar (spec 144, ADR-0063/ADR-0064). O despachante entra no hook
`onMessageReceived` de `@adatechnology/meta-whatsapp-module`, construído **uma vez por empresa**;
`createWhatsAppCommandHookFactory` separa o que é da instalação do que é da empresa. A instalação
fica na `0.1.0` dos pacotes por dívida de formato de migration do pacote, não por falta de recurso.

- **Toda `FlowAction` de negócio passa por `withAuthorizedActor`**, que re-resolve o ator a cada
  chamada contra o mesmo `AuthorizationService` do HTTP; `registerWhatsAppFlowActions` é o único
  caminho de registro.
- **Nada de ator, permissão ou PII no `context` da sessão** — só posição, contador e chaves opacas.
- **O grafo vive em código e o despachante lê a versão publicada no banco**:
  `scripts/whatsapp-flow-publish.ts --company <id>` (sem `--confirm` só imprime diff), com histórico
  append-only em `whatsapp_flow_graph_versions`.
- **`MembershipAuthorizationPolicy`** ("qualquer membership ativa") só existe sob `/me/` —
  `assertMembershipRoutesUnderMe` derruba o boot fora dali.
- Rotas (`cache-control: no-store`): `GET`/`DELETE /me/whatsapp-phone`,
  `POST /me/whatsapp-phone/verification` (201, 409 `WHATSAPP_CHANNEL_NUMBER_MISSING`),
  `DELETE /company-users/:id/whatsapp-phone` (`users.manage`) e
  `POST /whatsapp-command-requests/:id/settlement` (máquina, `whatsapp.settle`).

Detalhe completo: docs/ai-context § "O WhatsApp vira canal de comando".
