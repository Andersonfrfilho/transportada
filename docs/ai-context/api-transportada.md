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
(frontend) existe para travar a tabela estado→portão contra esta política. ⚠️ **`deliver` teve rota própria fora da máquina até 02/09/2026**, resíduo do fluxo da spec 027:
ela gravava `delivered_at` e **não** tocava em `separation_status`, então a nota ficava `pending`
com hora de entrega, a barra de progresso não saía de 0% e a viagem — derivada do estado das notas —
nunca chegava a `completed`. Medido em staging com doze notas. Hoje ela usa o mesmo
`tripDocumentActionRoute` das outras três, e por isso **herda o portão**: entregar exige viagem
despachada. O corpo da resposta mudou de `{deliveredAt}` para `{document, tripStatus}` nos dois
lados. `checkTripDocumentTransition`/`checkTripTransition`
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

**Cancelar devolve a carga, e o vínculo liberado não é vínculo** (spec 102). `markCancelled` só
trocava `trips.status`; quem decide se uma nota está disponível olha `released_at`, **nunca** o
status da viagem. Cancelar prendia a carga para sempre, e cancelar de novo não resolvia — o caso de
uso é idempotente e devolve `unchanged` sem escrever. Hoje ele marca `released_at` nas notas ainda
vinculadas **na mesma transação** do status.

⚠️ **Liberar é marcar, nunca apagar.** A linha de `trip_documents` permanece — é a única prova de
que aquela nota chegou a ser carregada naquela viagem, e é o histórico que o produto promete.
`test/cancel-releases-cargo/persistence.contract.ts` lê o fonte e reprova se um `.delete(` aparecer
ali. E **`stop_id` não é zerado**, ao contrário de `releaseTripDocument`: lá a nota sai de uma viagem
viva e a parada precisa ser reconciliada; aqui a viagem inteira morre, e manter a referência preserva
o roteiro como foi planejado — zerar daria paradas vazias na tela e todas as notas no balde "Sem
parada". Nota **entregue** não volta ao pool: ela chegou ao destino.

⚠️ **`findTripLinks` não filtrava `released_at`, e esse é o defeito que não se deduz de lugar
nenhum.** Ela é a consulta que diz à listagem de notas se a nota está em viagem
(`cte-batches/infrastructure/cte-batch-selection.query.ts`), e devolvia o vínculo mais recente —
liberado ou não. O cancelamento fazia a parte dele no banco, e a tela continuava recebendo `tripId`
preenchido; a montagem de roteiro, que filtra `document.tripId === null`, descartava a nota como "já
em viagem". Medido em 2026-09-08: **324 vínculos liberados ainda visíveis**, e o operador sem
conseguir selecionar nota nenhuma depois de cancelar as viagens. O filtro virou
`buildActiveTripLinkFilters`, no mesmo molde de `buildActiveNfseLinkFilters` — que fica **dez linhas
abaixo no mesmo arquivo** e sempre filtrou `cancelled_at is null` pelo mesmo motivo. Era a de viagem
que estava fora do padrão. Contrato em `test/cancel-releases-cargo/trip-link.contract.ts`.

⚠️ A migration `20260908220000_cancelled_trips_release_cargo` solta a carga das viagens **já**
canceladas, e o `rollback.sql` **não a desfaz** — nada distingue a linha que ela tocou da que já
tinha sido liberada à mão, e desfazer por carimbo apagaria a hora real de liberações legítimas.

⚠️ A tabela de viagens tem seleção em massa e cancelamento em lote, com a barra no **cabeçalho** —
embaixo da tabela ela ficava fora da vista com doze linhas na tela. `completed` e `cancelled` não
recebem caixa (oferecer o que dá `409` é atrito), e a marcação de viagem que sai da página é
descartada: paginação por cursor troca o conjunto, e manter id invisível faria o operador cancelar o
que não está vendo. Os cancelamentos vão **em sequência**, nunca em `Promise.all` — a primeira falha
esconderia quais dos outros aconteceram. ⚠️ `cancelled` tem cor **própria** (`--color-copper`): ela
dividia o verde com `completed`, e são estados opostos — a viagem que deu certo e a que não
aconteceu.

**A nota tem dois endereços de destino, e só um deles diz onde o caminhão para** (spec 073).
`<enderDest>` é onde o cliente está cadastrado; `<entrega>` é onde a carga tem de ser deixada, e o
emitente só o emite quando os dois divergem. O importador grava os dois desde a spec 013
(`resolvePartyByRole` → papel `delivery`), mas até a 073 **nenhum leitor conhecia o papel**.

A precedência é **desvio manual → `<entrega>` → `<enderDest>`**, e a decide
`resolvePhysicalDestination` (`nfe-documents/domain/physical-destination.policy.ts`), com **cópia por
valor** no worker (`routing/domain/physical-destination.policy.ts`) guardada por
`test/routing/physical-destination-parity.contract.ts`. `<entrega>` incompleto **cai para o
destinatário**: o critério de utilizável é o mesmo `buildStopAddressKey` da parada, nunca um segundo
critério ao lado dele — e é por isso que a escolha acontece **em memória**, sobre linhas que a
consulta já trouxe (`destinationRolesFilter`), e não por `coalesce` em SQL, que obrigaria a
reescrever `normalizePostalCode` como expressão do Postgres.

⚠️ **A linha divisória é ler ou não o endereço, nunca o nome do consumidor.** Quem decide _lugar_
segue o seam: a parada da viagem, a parada proposta pelo solver, a base do desvio, o `cMunDescarga`
do MDF-e e a população adiantada de geocodificação. Quem decide _quem_ continua no destinatário —
lote de CT-e, tomador de NFS-e, faturamento, regra de frete, portal do contratante, a listagem de
notas, e os **dois de `delivery-clients`**, que pareciam paradas e resolvem cadastro de cliente pelo
CNPJ. Convertê-los faria a busca casar pelo documento de quem recebe no galpão e sumiria a nota da
consulta que **impede o despacho** por agendamento pendente. Pela mesma razão o `recipientTaxId` da
sugestão de roteiro **não** acompanhou o endereço. `test/nfe-documents/physical-destination-boundary.contract.ts`
cobra isso por texto de fonte, e afirma que os dois de `delivery-clients` seguem sem ler
`nfe_addresses`.

⚠️ Medido em produção em 2026-09-01: **1628 notas, zero `<entrega>`** — e zero `pickup`. Não há
sintoma hoje, e o caminho de escrita nunca rodou contra nota real; é
`persists the delivery party and its own address` (worker, integração) que prova que a linha é
escrita. A população adiantada adianta os **dois** papéis, de propósito: o superconjunto nunca erra
por falta, e o excedente é grátis porque o degrau que resolve é o do CEP.

**O telefone do cliente já estava no banco, faltava o caminho até a tela.** O `<fone>` de
`<enderDest>` é importado desde sempre e vive em `nfe_addresses.phone` — com um backfill próprio no
worker (`nfe-party-contact-backfill.service.ts`) —, e a listagem não o publicava: quem monta a
viagem precisa ligar para o cliente antes de o caminhão sair e não tinha por onde. Hoje
`NfeDocumentSummary.recipientPhone` sai na listagem e no detalhe, e a linha da parada no mapa da
montagem o imprime ao lado de um `CopyButton` em variante `inline`.

⚠️ Ele é do **destinatário**, não do destino físico: é um "quem", e a linha divisória da spec 073
mantém "quem" no destinatário mesmo quando `<entrega>` manda no lugar da parada. E ele **não entra
na chave da parada** — duas notas do mesmo endereço com telefones diferentes continuam sendo uma
parada só.

⚠️ **O servidor serve o cru, e a máscara é de quem imprime.** `formatPhone` (frontend) é a máscara
de quem **digita** e sempre trata os dois primeiros dígitos como DDD — verdade num campo em
preenchimento, mentira no `<fone>` da nota, onde `39771234` é telefone local e viraria `(39) 771234`,
um DDD de Minas num número de Ribeirão Preto. Quem imprime valor guardado usa `formatStoredPhone`,
que só põe DDD em 10 ou 11 dígitos, quebra 8 e 9 sem DDD, e devolve **intacto** o que não cabe em
nenhuma das quatro formas. O botão copia o **cru**, não o mascarado: colar num discador não deve
obrigar ninguém a limpar pontuação. Contratos em `test/shared/stored-phone.contract.ts` e
`test/trip/assembly-stop-phone.contract.ts` (frontend) e
`test/nfe-documents/recipient-phone.contract.ts` (API).

⚠️ **O e-mail do destinatário chega em quase toda nota e era descartado na leitura.** Medido em
2026-09-05 sobre os XMLs arquivados desta base: **2337 de 2372** NF-e trazem `<email>` dentro de
`<dest>`, 98,5% — em `883649 · MINIMERCADO ABADE LTDA` ele vem literalmente ao lado do `<fone>` que
já importamos. A raiz era o pacote: `NfeXmlParty` do `@adatechnology/fiscal-provider` não tinha o
campo, então o valor era lido do XML e jogado fora. Corrigido em
`Andersonfrfilho/adatechnology-packages#105` (duas linhas: o campo no tipo e a leitura em
`parseParty`).

⚠️ **Ele é irmão de `<enderDest>`, não filho, e isso decide a tabela.** No layout o telefone mora no
**endereço** e o e-mail mora na **parte** — então o destino é `nfe_participants`, ao lado de
`tradeName`, e **não** `nfe_addresses` como o telefone. Repetir o caminho do telefone por analogia
guardaria o campo na tabela errada, e lê-lo do endereço devolveria `undefined` em toda nota sem erro
nenhum.

O que falta aqui depois de a versão sair: coluna em `nfe_participants` → persistir na importação →
preencher as já importadas por `nfe-party-contact-backfill.service.ts` (ele já relê os XMLs para
`phoneByAddressId` e `tradeNameByParticipantId`; e-mail é `emailByParticipantId`, irmão do segundo) →
`recipientEmail` na listagem → tela com botão de copiar, igual ao telefone. ⚠️ O bump não é pequeno:
as duas apps pinam `0.3.0-rc.7` e o `main` do pacote já está em `0.3.0` estável, então o upgrade
atravessa a estabilização e carrega o que mudou entre as duas linhas.

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

**O endereço se mede uma vez, e o que se mede vira coordenada** (ADR-0061, spec 084). A escada da
ADR-0044 só alcança o provedor pago **depois** que alguém tropeça numa entrega, e isso deixa um vão:
endereço em precisão de CEP parece bom e nenhum sinal grátis o distingue de um bom. A 0061 admite um
**terceiro gatilho** para o mesmo degrau 2 — _lote de medição, uma vez, por decisão explícita com
escopo e custo declarados antes_. ⚠️ **Não revoga o adendo da 0044:** a escalada automática em
runtime segue recusada, e `worker-transportada/test/routing/paid-provider-never-called.contract.ts`
continua intacto guardando o caminho de sugestão de roteiro. O gatilho é
`scripts/address-comparison-batch.ts`, e **sem `--confirm` ele imprime escopo e custo e sai sem
gastar** — uma rota HTTP no lugar dele seria a escalada com outro nome, porque qualquer coisa capaz
de chamá-la passaria a gastar.

⚠️ **São duas portas para o mesmo provedor, e a diferença é o filtro.** `GeocodingPort`
(`routing/`) filtra por `components=postal_code` de propósito: quer a coordenada mais fina daquele
CEP. `AddressLookupPort` (`addresses/`) **não pode** — o filtro obrigaria o provedor a concordar com
o nosso CEP, e a divergência de CEP é o achado de maior valor do relatório, porque devolve o endereço
ao degrau 1, que é grátis. Filtra o **lugar** (país e UF); o município fica de fora porque
`checkCityMatch` o confere pelo código IBGE, e filtrar por nome recusaria a grafia da nota justamente
quando ela está errada.

`address_comparisons` guarda a **observação** — o que a nota dizia, o que o provedor devolveu, o
nível e a distância —, e a **interpretação** vive em `address-finding.policy.ts`, recomputada a cada
leitura. Foi isso que permitiu a divergência de rua sair de 45 para 6 sem re-consultar nada. ⚠️ A
primeira versão do lote gravou a medição e **jogou fora a coordenada**: 118 endereços de porta
comprados e nenhum aplicado. A ADR-0044 §3 sempre autorizou guardar — foi descuido, e
`compare-addresses-batch.contract.ts` agora o tranca junto com os quatro portões da escrita (município
divergente, `place_id` vazio, `approximate` não é melhoria, e `shouldReplaceStored`).

⚠️ **`not_found` não passa pelo portão do município**, e rua vazia é `street_unknown` e não "você
escreveu a rua errada". Medido em 148: `not_found` deu **zero** e treze caíram em `approximate` — o
provedor achando só o município porque o logradouro não existe para ele.

**A separação grafia × lugar é o que faz o relatório ser lido** (`street-comparison.policy.ts`). Das
45 divergências de rua medidas, **seis** eram lugar diferente; as outras 39 eram `DR`/`Doutor`,
`7`/`Sete`, `MELLO`/`Melo`, `RUA RUA MINAS GERAIS`. Quatro camadas determinísticas — abreviação de
patente e título, número de data por extenso com dezena composta, tipo de via duplicado ou colado, e
inicial do nome do meio (que ora o cadastro abrevia, ora o provedor) — mais **uma** edição em palavra
de quatro letras ou mais. ⚠️ Distância de edição aqui é **classificação, não casamento**: o par já
veio formado do provedor, e a pergunta é só se vale incomodar alguém. É o oposto de
`client-address-key.ts`, onde ela escolheria qual rua é a certa entre candidatas e mediu 14% de
acerto com falsos positivos. `EXPEDITO`/`BENEDITO` são três edições, e continuam sendo ruas
diferentes. **Bairro nunca vira pedido**: diverge em 44 dos 148 e é palpite do provedor (`CENTRO` →
`Itobi`, que é cidade).

`GET /address-report` é `settings.manage`, não `addresses.read`: quem lê vê o cadastro de entrega de
todos os contratantes de uma vez, com nome, rua e número — varredura de carteira, não a consulta
pontual de um CEP. O pedido é atribuído a **quem emitiu** a nota (ADR-0057), nunca ao destinatário,
que recebe a carga e não tem acesso ao cadastro; um contrato por texto de fonte tranca isso porque a
troca compila igual (`legalName` existe nos dois lados). No frontend é a aba **Endereços** de
`nfe-workspace`, e o **denominador aparece sempre** — "24 de 148 medidos" é a diferença entre um
pedido e uma acusação, e quem recebe é um cliente.

Medido em 2026-09-04, nos 149 endereços em centroide de município: 118 `rooftop`, 17
`range_interpolated`, 13 `approximate`, zero `not_found`; 134 coordenadas novas, e a base caiu de 149
para **15** endereços em centroide. Os 147 de precisão de CEP ainda não foram medidos.

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

**A carga tem cubagem estimada, e o veículo tem capacidade em três degraus** (spec 075). A NF-e
**não traz cubagem nenhuma**: o grupo `<vol>` tem `qVol`, `esp`, `marca`, `nVol`, `pesoL` e `pesoB`,
e `nfe_volumes` guarda quantidade, espécie e pesos — nenhuma dimensão. Medido em produção em
2026-09-02: 1808 volumes, 1804 com peso, **zero com medida**.

`resolveCargoVolume` (`nfe-documents/domain/cargo-volume.policy.ts`) estima por
`quantidade × fator da espécie`, com `company_cargo_volume_factors` chaveada por
`(company_id, species)`. ⚠️ `species` está **vazio em 1808 de 1808** volumes: a linha de espécie
vazia é o padrão e responde por todo o dado de hoje — a chave por espécie é para o emitente que
preencher `esp`. Desligar a estimativa é **apagar a linha**, nunca gravar zero (o CHECK recusa), e
a origem tem **um valor só** (`estimated`), porque não existe cubagem declarada na NF-e — ao
contrário do peso, onde o `pesoB` vence a estimativa (ADR-0052).

A capacidade sai de `resolveVehicleCapacity` (`fleet/domain/`), nesta ordem: **dimensões da ficha**
(`cargo_length_m × cargo_width_m × cargo_height_m`) → **`capacity_m3` da ficha** → **referência do
tipo**, com a origem viajando junto para a tela distinguir medida de palpite.

⚠️ **A dimensão é o dado primitivo; o m³ é derivado.** O m³ publicado por aí erra contra as próprias
medidas (a carreta da tabela pesquisada destoa 3,1%), e a dispersão dentro de um tipo chega a **2×**
— um VUC existe de 13 e de 26 m³. Por isso a referência é piso, e a ficha vence sempre.

⚠️ `vehicle_volume_references` é a **segunda tabela do produto sem `company_id`**, ao lado de
`fuel_price_references`: é catálogo de mercado. A chave é `(vehicle_type, body_type)` porque
**carreta é o implemento, não o cavalo** — e implemento tem `vehicle_type` **vazio**, o tipo é de
quem traciona. `resolveVolumeReferenceKey` decide qual dos dois responde. O `tpCar` é `02`
fechada/baú e `05` sider (`03` é granelera e `04` é porta container — errar isso faz os veículos de
produção, todos `02`, não acharem referência nenhuma).

A ocupação da viagem (`trips/domain/trip-occupancy.policy.ts`) soma as notas e divide pela
capacidade. ⚠️ **Uma nota estimada torna o total estimado**, e a tela é obrigada a imprimir a marca
junto do número — `test/trip/occupancy.contract.ts` (frontend) reprova o componente se o percentual
aparecer sozinho, e proíbe segunda condição escondendo a marca. Denominador ausente é `null`,
**nunca 100% nem zero**: veículo sem capacidade conhecida com carga dentro é o caso em que um número
inventado faria alguém parar de carregar, ou continuar. Estouro acima de 100% sai como está.

⚠️ **Nada disso alimenta documento fiscal.** Nem CT-e, nem MDF-e: a cubagem estimada existe para a
tela de quem carrega o caminhão. E `VEHICLE_TYPE_ICONS` (frontend) é `Record<VehicleType, IconName>`
— tipo novo no catálogo **não compila** sem desenho.

**O `?url` do worker do pdf.js é `import` estático, e a diferença só aparece em dev.** Como
`import()` dinâmico o sufixo é ignorado pelo `vite dev`: o que volta é o módulo do worker
(`{ WorkerMessageHandler }`), sem `default`. O `workerSrc` recebia `undefined` e o pdf.js lançava
`Invalid workerSrc type` **antes de olhar o arquivo** — todo upload de documento falhava em
desenvolvimento, com qualquer PDF, sob a mensagem "confira se é um PDF e tente de novo". No bundle
construído a forma dinâmica funciona, e é por isso que **nenhum smoke pegava**: eles rodam contra o
`vite preview`. Medido em 06/09/2026 com um CRLV-e real de 80 kB, que depois da correção entrega
onze campos. ⚠️ `new URL(…, import.meta.url)` **não serve aqui** — ela não resolve especificador de
pacote, que é a mesma razão registrada no `AssemblyVectorMap`. Contrato em
`test/document-intake/pdfjs-worker.contract.ts`, sobre a **forma do import**, que é onde a
diferença mora.

⚠️ **`VEHICLE_DETAIL_KEYS` é contrato de duas pontas, e quebrar sozinho é silencioso.** O
`isVehicle` do frontend valida com `hasOnlyKeys` **e** `hasEveryKey`: campo novo na lista com a API
ainda servindo o corpo antigo faz toda linha ser recusada na validação, e a tabela de frota
renderiza **vazia** — 200 na rede, nada no console, nenhum erro na tela. Aconteceu ao acrescentar os
três campos de baú, com a API de desenvolvimento rodando código anterior. Num deploy com API e
frontend em serviços separados, a janela entre os dois é uma tela de frota vazia para o cliente:
sobe a API primeiro.

**A escala do baú sai da ficha, e medi-lo apaga o m³ digitado** (spec 088 R1). A ficha do veículo
nunca pediu as três medidas: as colunas existem desde a 075, `resolveVehicleCapacity` as prefere a
qualquer outra fonte, e o formulário perguntava só `Capacidade (m³)` — medido em 2026-09-06, **0 de
8** veículos com dimensão preenchida. Hoje ela pede comprimento, largura e altura, os três
opcionais, e `cargoLengthMeters`/`cargoWidthMeters`/`cargoHeightMeters` atravessam a rota de escrita
até `cargo_length_m` e as duas irmãs.

⚠️ **Preenchidas as três, o `capacityCubicMeters` submetido é zero** —
`resolveSubmittedCapacity` (`fleet/shared/vehicleCargoDimensions.service.ts`), e o campo da tela
vira somente-leitura mostrando o derivado. Travar o campo sem zerar o envio era o meio caminho que
não resolve nada: o m³ antigo continuava no banco, invisível enquanto as medidas existissem, e
voltava a valer sozinho no dia em que alguém as apagasse por troca de implemento — reafirmado por
ninguém, e justamente o número que a spec diz não merecer confiança. Zero é o vocabulário que o
resolvedor **já** lê como ausência (nunca como baú de volume zero), então apagar não inventa
sinalizador novo.

⚠️ A medida **não se herda por marca**: `VEHICLE_BRAND_DEFAULT_FIELDS` copia doze campos entre
veículos da mesma marca — `capacityCubicMeters` incluído — e as três dimensões ficam de fora de
propósito, porque o baú é montado por um implementador depois do chassi e o catálogo FIPE devolve só
marca e modelo. O CRLV também não as traz: ele imprime **peso** (PBT, CMT, tara, lotação), nunca a
medida interna do compartimento. A fita é o único caminho, e `test/fleet/vehicle-cargo-dimensions.contract.ts`
tranca as duas metades — o zeramento e a ausência da herança.

**A ficha nasce preenchida, e diz de onde veio** (spec 093). Um dia depois de a 088 entrar, **3 de
12** veículos tinham o baú medido — e preencher doze fichas com fita não acontece antes da próxima
viagem. Hoje o formulário sugere comprimento, largura, altura e `capacity_kg` ao escolher o tipo, e
`resolveVehicleSuggestion` (`fleet/shared/vehicleSuggestion.service.ts`) decide a origem nesta ordem:
**veículo da frota com a mesma marca E o mesmo modelo, já medido → referência do tipo → ausência**.

⚠️ **Marca sozinha não herda medida**, ao contrário de `resolveVehicleBrandDefaults` ao lado, que
cai para a marca quando não acha o modelo: dois modelos da mesma marca não têm o mesmo baú, e ali o
erro vira metro na planta em vez de porcentagem na ocupação. ⚠️ A sugestão entra **só em campo
vazio**, por baixo da herança e dos padrões do tipo, e **digitar apaga a marca de origem** — a mesma
regra do campo vindo de documento. ⚠️ Ela **nunca alimenta a planta por baixo**: a 088 D2 recusou a
referência como escala, e a medição desta spec confirma o motivo — a van vai de **7,0 a 15,5 m³** na
mesma sigla. O que a torna aceitável é a origem impressa ao lado do campo e o salvamento: a partir
dele, é o que a ficha afirma.

`vehicle_volume_references` ganhou `max_payload_kg` (nulo é ausência de fonte, e o CHECK **recusa
zero** — o oposto do vocabulário da ficha, onde zero é "ninguém mediu") e as linhas de
`three_quarter` e `motorcycle`, que não existiam; `three_quarter` é o tipo do `RTD-5J78`, e é por
isso que ele não achava referência nenhuma. ⚠️ As dimensões das sete linhas antigas **não foram
tocadas**, embora a pesquisa devolva números maiores: a referência é **piso**, e subi-lo mudaria
calado a ocupação de todo veículo sem ficha. `car` e `tractor_unit` seguem sem linha — o carro de
passeio não tem compartimento publicado (porta-malas é outra grandeza) e o cavalo não tem baú
próprio. ⚠️ Ela é a **terceira** tabela sem `company_id`, e era a única das três cuja ausência não
estava assertada em `tenant-safety`. Serve por `GET /fleet/vehicle-references` sob `fleet.read` —
não `settings.manage`: quem cadastra veículo é quem precisa da sugestão. Catálogo fora do ar é ficha
sem sugestão, nunca ficha travada.

**O peso da carga ganhou teto, e ele sempre esteve no banco** (spec 093). `fleet_vehicles.capacity_kg`
é o `capKG` que o MDF-e exige e está preenchida em **10 dos 12** veículos; nenhuma tela a lia fora
da emissão fiscal, e por isso a montagem somava o peso sem comparar com nada. Hoje `cargoWeight`
publica `maxPayloadKg` e `payloadRatio` na prévia e no detalhe. ⚠️ O comentário de
`trip-cargo-weight.policy.ts` afirmava que a ficha **não guardava massa nenhuma** — era a premissa,
não a coluna, que faltava; criar um `max_payload_kg` ao lado teria posto dois campos de massa na
mesma ficha, e quem preenchesse o novo veria a rejeição no MDF-e. A conta vive num lugar só
(`withPayloadCeiling`), aplicada sobre a view já montada porque o peso e o veículo são lidos em
paralelo. Ausência é `null` nos dois campos — **nunca 0%, nunca 100%** —, e o estouro sai como está.
⚠️ `TRIP_CARGO_WEIGHT_KEYS` é `hasExactKeys`: **a API sobe antes do frontend**, senão a prévia de
carga é recusada na validação e o painel some com 200 na rede e nada no console — o mesmo defeito de
`VEHICLE_DETAIL_KEYS`.

**A caixa se mede uma vez, e o cadastro se popula do que roda** (ADR-0062, spec 085). A NF-e não
traz dimensão nenhuma — medido em 345 XMLs desta base: **345 de 345** sem medida no grupo `<vol>` —,
então a medida é trabalho humano, e a decisão da 085 é que ela mora em `nfe_package_boxes` **aqui**,
não no `catalog-module` que três produtos consomem.

A chave é `(company_id, emitter_tax_id, product_code, commercial_unit)`. ⚠️ **`uCom` entra na
chave**: o mesmo produto em `CX12` e `CX24` são duas caixas, e medido nesta base `CX12` cobre **151
produtos distintos** — o código diz quantas unidades vão dentro, nunca o tamanho da caixa. A
importação cria a linha **sem medida** (`onConflictDoNothing`, em
`worker/.../drizzle-nfe-import-consumer.repository.ts`), e o `doNothing` é o ponto inteiro: a linha
existente carrega a medição do conferente, e reescrevê-la a cada nota nova do mesmo produto apagaria
o trabalho dele. `nfe-package-box-backfill.main.ts` relê os XMLs arquivados no molde do backfill de
contatos, e varre **todas** as notas — a caixa é do par, não da nota, e não há filtro barato que
diga se uma nota ainda acrescenta linha.

⚠️ **`uCom` nem sempre é a caixa**, e por isso a linha guarda `units_per_box`. Em `CX24` a nota já
conta caixas e o valor é `1`; em `UN` ela conta unidades, e multiplicar 480 `UN` pela caixa master
dava dez vezes o volume real — número que, por vir marcado `measured`, **vencia** a estimativa e saía
da tela sem marca de palpite. A conta arredonda para cima: cinco unidades de um produto que vem de
doze ainda viajam dentro de uma caixa.

⚠️ **O peso só é deduzido da nota de item único** (`deriveBoxGrossWeightGrams`): com duas linhas o
`pesoB` é da carga inteira, e dividi-lo pelos volumes daria a **média** das caixas — número
plausível atribuído à caixa errada. Medido: 9% das notas, 18 de 663 caixas. `carton_gtin` fica nulo
até `NfeXmlProduct` do `@adatechnology/fiscal-provider` ganhar o campo de código de barras — mesma
lacuna de pacote do caso `<email>` —, e é por isso que o bipe casa **duas** colunas: `carton_gtin` e
`product_code`. Casar só pela primeira devolveria lista vazia em todo bipe; é comum o emitente usar
o próprio EAN como `cProd`, e é isso que sustenta a leitura enquanto o campo não existe.

**Medir é `cargo.measure`, e a permissão nasceu para não dar carona.** `settings.manage` entregaria
ao conferente o preço do combustível, a tabela de frete e a credencial da prefeitura. `separator`,
`operator` e `company-admin` a recebem; `driver`, `aggregate` e `contractor` não. `GET
/nfe-package-boxes` e `PUT /nfe-package-boxes/:id` são as duas rotas, e é `PUT` porque medir de novo
**substitui** — duas medidas para a mesma caixa seriam duas verdades. ⚠️ Ele responde **204**: a
linha gravada não tem `share`, `cumulativeShare` nem `withinCoverage`, que nascem da política de
ordenação da fila, e devolvê-la fazia o cliente validá-la com o guard da fila — toda medição
bem-sucedida virava erro na tela, com a medida já no banco, e o conferente remedia a mesma caixa. No frontend é a aba **Caixas**
de `nfe-workspace`, mobile-first, com o leitor da ADR-0042; ⚠️ quem chegou pela câmera **volta para
ela** depois de gravar (o conferente varre uma pilha inteira), e quem chegou digitando fica na busca.

⚠️ **Etiqueta que não vira código nenhum é busca vazia, nunca busca sem filtro** — tratá-la como
ausência de filtro mostrava as cinquenta primeiras caixas como se a leitura tivesse achado algo, e o
conferente media a primeira da lista. E a fila ordena por `coalesce(volumes, 0) desc`: em Postgres
`ORDER BY x DESC` é **NULLS FIRST**, e sem o `coalesce` a página abria com as caixas órfãs.

⚠️ **A etiqueta da caixa é DUN-14 e o cadastro casa pelo GTIN-13** — `reduceToGtin13` recalcula o
dígito GS1, e sem ela o leitor acha a etiqueta e a busca não acha o produto (90% dos casos medidos).
GTIN-8 e GTIN-12 passam intactos: existem na prateleira e não são DUN. A fila ordena pelo volume
transportado — `sum(nfe_products.quantity)` do par, e **não** um join a `nfe_volumes`, porque `qVol`
= Σ `qCom` em **100%** das 345 notas: cada volume da nota é uma caixa. Ela carrega o acumulado e diz
**até onde compensa**; sem essa marca a tela é uma lista de 663 itens sem lugar para parar de descer.

**A ocupação ganhou duas origens novas, e a pior manda** (spec 085 G006). `resolveMeasuredCargoVolume`
soma `qCom × caixa medida` por linha; item sem medida usa a **mediana** das caixas medidas da empresa
e a origem cai para `partial`. ⚠️ **Sem reserva, item sem medida devolve ausência** em vez de sair da
soma: um total que ignora linhas subestima a carga, e ocupação menor que a real é o número que faz
alguém continuar carregando um baú que já encheu. Mediana e não média — uma caixa de geladeira no
meio de mil caixas de refrigerante move a média e não move a mediana. No total da viagem
`estimated` vence `partial`, que vence `measured`, pela mesma razão da 075: quem carrega decide pelo
pior caso, e a tela é proibida de imprimir o percentual sem a marca.

⚠️ **O desenho do baú é de volume, e o alerta de peso existe porque volume não conta essa história.**
`detectWeightConcentration` acusa a parada que carrega mais que a própria fatia — e o piso é **a
fatia igualitária**, nunca um limite fixo: com duas paradas, meio a meio é a carga mais equilibrada
que existe e passaria de 40%, fazendo o alerta disparar em toda viagem de duas paradas até virar
ruído que se aprende a ignorar. Viagem de uma parada não acusa nada: ali a concentração é 100% por
definição e não há o que fazer com o aviso.

**A grade põe várias entregas na porta ao mesmo tempo** (spec 113). Quando faixa por parada não cabe
— muitas paradas, ou peso acima de metade do teto —, `resolveStopArrangement` tenta `grid` antes de
`depth`: K faixas, as K primeiras entregas lado a lado na porta e as seguintes atrás delas, cada faixa
empacotada em profundidade. ⚠️ **A grade só vale se colocar o que a profundidade coloca** — a decisão
empacota os dois. ⚠️ **As fatias somam no máximo o comprimento do baú.** Um piso por parada ("a fatia
nunca é mais curta que a caixa mais funda") foi publicado e revertido no mesmo dia: com 85 paradas a
carga ia até 33,9 m num baú de 5,32 m, sobreposta e para fora. A sobra de parada pequena **sobe em
cima** das paradas entregues depois (Passo 6), e a busca dela não tem mais teto global de 40
tentativas — era esse teto que fazia paradas inteiras sumirem como "limite de detalhe". ⚠️ `STOP_ARRANGEMENTS` é
validado com lista fechada no frontend: **o frontend sobe junto ou antes**, senão o painel some.

**Em profundidade a carga é um bloco só, pela ordem de entrega** (spec 114). A fatia isolada por
parada da 095 deixava dezenas de paradas pequenas com pilha solta, cortada pela esbeltez em 0,75 m —
38 de 85 paradas fora do desenho num baú 30% cheio. Hoje a última entrega começa na testeira, cada
entrega seguinte continua ao lado ou em cima da anterior, e o bloco termina na porta. ⚠️ Entrega mais
cedo **pode** ficar em cima de uma mais tardia; o proibido é o contrário, ou a tardia entre a cedo e a
porta (`test/cargo-placement/delivery-block.contract.ts`). Sem fatia não há carga dividida em
profundidade — ela continua só em faixas.

**A carga inteira no baú** (spec 115). Três correções medidas em quatro viagens reais: a esbeltez rege
o trecho **acima da contenção** (a carga descia em escada por 2,9 m até a porta), a grade fica com a
maior quantidade de faixas **que coloca tudo** (`laneCount` viaja na decisão), e ⚠️ **o teto é de
desenho, nunca de empacotamento** — o antigo 600 cortava as primeiras entregas e sumia com 46
paradas do Atego. ⚠️ Spec 131: **nem de desenho** — `MAX_DRAWN_BOXES` saiu, toda caixa empacotada é
desenhada, e o redesenho de 6000 caixas cabe em 100 ms (`projectSolids` + `shadeHexColor` em
`components/ui/cargo-isometric.tsx`, sem `filter` no CSS). A entrega mais cedo também não senta atrás de carga mais
tardia mais alta que a base dela (`isShadowed`). Contrato sobre as cargas reais anonimizadas em
`test/cargo-placement/real-mixed-cargo.contract.ts`. ⚠️ Spec 116: o teto de tentativas por caixa
cresce com as fileiras do baú (64 fixas desistiam antes da porta, e a memória de formato derrubava as
gêmeas — 431 caixas no Atego), e **vão mais estreito que o giro da pilha (`3b/√10`) é apoio** — o de
7 cm até a parede lateral travava cada fileira em pirâmide. Atego: 982 → 1282 de 1417. ⚠️ Spec 117:
**a caixa pequena vai para onde a caixa da carga não cabe** — a medida de 10 cm entrava antes das
presumidas da parada, deslocava a fileira e fazia pirâmide de novo; hoje ela procura primeiro o topo
cuja folga até o teto é menor que a caixa dominante (`createDeadSpaceTracker`). Atego 1282 → 1347; as
70 que sobram são a escada da porta, que não se afrouxa (contratos em `dead-space.contract.ts`).

**A planta aguenta a descarga, entrega por entrega** (spec 118). `test/cargo-placement/unloading-simulation.ts`
tira as entregas na ordem e confere apoio de toda caixa que fica e acesso de pé no piso (corredor e mão de
0,6 m, `ACCESS_CORRIDOR_M`/`DELIVERY_REACH_M`). ⚠️ **A borda da faixa não é parede**: a grade e as faixas
contavam a vizinha, que sai antes, como apoio — 116 de 252 caixas sem apoio na Sprinter e 127 de 500 no
Accelo. ⚠️ Em profundidade a caixa só senta com a face ao alcance da mão a partir da frente do piso das
entregas posteriores (`isOutOfReach`), e o rendimento da orientação conta células. Custo medido: Daily
481 → 441, Atego 1347 → 1190; a grade não vence mais nas quatro viagens reais. O vocabulário de
`STOP_ARRANGEMENTS` não mudou — o frontend não precisa subir. ⚠️ **Spec 133: o juiz se escorava na
própria caixa** — carimbo pelo centro da célula de 1 cm e sonda a 0,5 mm da face. Hoje o apoio sai das
bordas reais (tolerância única `CONTACT_TOLERANCE_M` = 1e-6 m): a caixa não é vizinha dela mesma, a de
cima não a escora, o vazio não escora. Em `85cbb5fc` isso acha **15 caixas soltas na Sprinter e 15 no
Accelo** (a fileira do fundo, afastada da testeira pelo deslocamento para a porta). A spec 134 as zerou
(abaixo). A conferência "exata face a face" do scratchpad (Atego 84) foi recusada caso a caso em
`specs/133-juiz-sem-autoapoio/evidence.md`.

**Apoio de 80%, escora só pelo lado, e bordas reais** (spec 135). O relevo nasce das bordas das caixas
em milímetro (`cargo-edge-grid.ts`) — não há mais célula de 5 cm. A caixa senta com **80% da base
apoiada** (`MIN_SUPPORTED_BASE_FRACTION`, conta exata em `isBaseSupported`), e ⚠️ **escora é encosto
pelo lado**: a caixa embaixo dela no plano sustenta e nunca escora, e o encosto conta a partir de 1 cm
(`MIN_BRACE_CONTACT_M`; no juiz também `MIN_BRACE_HEIGHT_M`, contrato `brace-rule.contract.ts`). Na
linha `ce0a2d08` o degrau escorava 10/58/99/26 caixas das quatro viagens; hoje 0. ⚠️ **A pegada fora do
padrão da carga vai ao espaço morto e só balança sobre carga** (`isOffPattern`, `onlyOverLoad`): com as
bordas reais a 0,40 × 0,30 entre presumidas de 0,371 × 0,261 tirava a carga de fase, e o sintético de 85
paradas ia a 236 fora (teto 216; 26 na grade de 5 cm). Hoje 163. Atego real 1417/1417 (1320 no
recomendado, contra 1239 publicado). ⚠️ O teto de 50 ms está no fio: na forma do contrato a própria
`ce0a2d08` passa dele com a carga da máquina acima de 6.

⚠️ **Spec 142: a vizinha só escora se sobe ao lado da caixa.** O topo da célula podia ser o balanço de
uma caixa apoiada em 80% da base que começa **acima** da escorada, com vão embaixo — prateleira, não
parede (29 de 144 cargas mistas do banco da 139 com caixa sem apoio no juiz). Cada célula guarda a
própria pilha (`stackHeadOf`, lista persistente) e a escora é a caixa mais alta que começa abaixo do
topo da candidata menos 1 cm (`alongsideTopAt`). As quatro viagens e o Atego da fixture ficam
idênticos; o sintético de 85 paradas vai de 163 a 280 fora — 14 caixas daquela planta se escoravam
numa prateleira **na hora de carregar**, e o juiz, que confere a planta pronta, não as via. Contrato em
`brace-rises-alongside.contract.ts`.

**Cada caixa sabe de que nota veio, e a nota tem tom próprio** (spec 119). `PlacedBox` publica
`documentId` (`nfe_documents.id`) e `documentNumber` (o número impresso), carimbados por
`stampCargoNote` onde as caixas viram da parada — `buildCargoPreviewStops` e o repositório da viagem
—, e `null` quando a nota não é conhecida. ⚠️ **A nota é carona, nunca critério**: o empacotador só
copia os dois campos, e as quatro viagens reais saem com as mesmas coordenadas com e sem nota. No
desenho a nota decide a cor da caixa — o tom dentro da cor da parada que esta spec criou foi
substituído pela cor própria da spec 121, abaixo.

**Se tem espaço, a carga entra — e o desenho diz por onde ela entrou** (spec 120). A planta tem duas
camadas: o **mapa recomendado**, que é a varredura de sempre com todas as regras (118 inclusive), e o
**complemento**, que põe no espaço livre o que sobrou afrouxando só conveniência — `outOfReach` (funda
demais para a mão) e, por último, `needsRehandling` (fura a ordem de descarga). ⚠️ **Física não
afrouxa**: dentro do baú, sem cruzar ninguém, nada no ar, pilha de pé no carregamento **e em cada passo
da descarga** — a caixa do complemento só pousa e só se escora em entrega que sai depois dela, e nunca
em cima de caixa recomendada da própria entrega, que ficaria presa embaixo. Medido: Daily 441 → 481 de
481, Atego 1190 → 1269 de 1417 (as 148 que ficam só entram derrubando a pilha: sem esbeltez seriam 1388,
com 74 sem apoio). ⚠️ **O alcance é tentado na hora, a ordem no fim**: no fim as entregas anteriores já
estão no baú e a caixa não pode se apoiar nelas — 78 de 227 contra as 53 que a varredura coloca no lugar
que o empacotador pré-118 usaria. ⚠️ O mapa recomendado **não lê a nota** (a 119 D2 vale para ele);
quem procura lugar encostado na própria nota é só o complemento, e `splitNotes` publica as notas
divididas com quantos pedaços — pedaço é componente conexo por contato de face, com a folga de uma
célula. ⚠️ **Qualquer ordem de deploy funciona**: os dois motivos novos entram num `reasons` que o
frontend não valida por lista fechada, e `splitNotes` é lido como opcional. A presumida deixou de ser
o tom claro: é o **contorno pontilhado**. O frontend lê os dois campos como opcionais e `isPlacement`
não percorre as chaves da caixa — **qualquer ordem de deploy funciona**.

**A carga segue a cor da nota, e a parada se lê sem cor** (spec 121). A caixa é pintada pela **nota**
(`documentId`), não mais por um tom da cor da parada: `NOTE_COLORS`
(`trip/shared/noteColor.service.ts`) é uma lista de **128** cores ordenada das mais diferentes para as
menos — ponto mais distante em CIELab, como a paleta de paradas —, e a nota recebe a posição do id
dela entre os ids do desenho, ordenados. Viagem pequena usa só o topo, que é a parte bem separada.
⚠️ **A ordenação é por id, não por parada**: reordenar a proposta (spec 111) é um clique de seta, e
uma cor por posição de parada repintaria o baú inteiro a cada um. ⚠️ **Nenhuma coordenada mudou** —
esta spec não toca o empacotador; ela é cor e documentação.

⚠️ **A cor de nota não pode ser a cor de parada, e evitá-la custou separação.** `TripAssemblyMap` e
`TripCargoPanel` ficam **na mesma tela** na proposta e no diálogo de criação, e gerar a paleta só
contra o `MAP_SURFACE` devolvia **exatamente** a sequência de `stopColorOf`. A geração é semeada
também com as 96 primeiras cores de parada (a maior viagem real tem 85), com grade de candidatos mais
densa (2° de matiz, cinco saturações) para pagar a conta. Medido com 128 cores: sem semear, ΔE 9,28 e
**identidade** com as paradas; semeando na grade antiga, 6,61 — abaixo dos 6,2 que a 119 mediu como "a
mesma cor"; com a grade densa, **8,09**, e 8,21 até a cor de parada mais próxima. Contraste 3,09 no
tema escuro e 2,84 no claro, com a paleta **não redeclarada por tema**.

⚠️ **Acabando a lista, a nota 129 repete a cor da nota 1 e a tela diz quantas repetiram** — repetir
calado faz a cor deixar de identificar sem ninguém perceber. Nenhuma viagem real chega lá: medido em
2026-09-10, 22 · 27 · 30 · **94** notas nas quatro.

⚠️ **O disco de cor da parada saiu da ficha da carga**: ele afirmaria uma cor que o baú não tem. A
parada é identificada pelo número da entrega, pela **lista das notas dela** — que passou a ser
desenhada também para a parada de uma nota só, ao contrário da 119, porque é o único lugar em que a
cor desenhada é nomeada —, pela divisa entre fatias e pelo destaque ao clicar. `stopColorOf` continua
servindo a lista de paradas, o mapa e o disco da parada, que não desenham carga. Contrato em
`test/trip/note-color.contract.ts`, que substituiu `note-tone.contract.ts` com a razão escrita nele.

**Como as caixas são organizadas no baú está documentado por extenso em dois arquivos irmãos**
(spec 121): `docs/domain/cargo-placement.md` é **o algoritmo como ele é hoje**, de ponta a ponta —
entrada, arranjo em faixas/grade/profundidade, a fatia, a varredura com o mapa de alturas em células
de 5 cm, o assento nivelado, a esbeltez e a contenção, o alcance da mão, o complemento, a simulação
da descarga, e o vocabulário completo de `reasons`, `layoutNotes` e `splitNotes`. E
`docs/domain/cargo-placement-defects.md` é **por que cada regra é assim**: o defeito medido que a
produziu, com o número ao lado, e o que foi tentado e recusado. ⚠️ Mexer no empacotador sem ler o
segundo é refazer uma das correções que já custaram duas rodadas — inclusive a lição de método:
contrato sintético confirma a implementação, só rodar com números confere a premissa.

**A fileira virou metro, e a escala sai da ficha — de mais lugar nenhum** (spec 088). A fileira da
085 é proporção: ela não diz se a carga da terceira parada ocupa meio metro ou dois metros e meio de
baú. `resolveCargoLayout` passou a devolver `depthM` e `distanceFromDoorM` por faixa, mais
`bedLengthM`/`bedWidthM`/`freeDepthM`/`overflowDepthM`, e a tela desenha a **planta do baú vista de
cima**, em escala, na montagem da viagem.

A profundidade é `volume ÷ (largura × altura)` — a fatia transversal de verdade —, e **não** passa
pela capacidade: com o baú medido as duas contas coincidem, mas `capacity_m3` pode ser um número que
alguém digitou, e aí a faixa herdaria um denominador que não é deste baú.

⚠️ **A escala sai da FICHA, e `resolveBedDimensions` é o único lugar onde essa linha é traçada.**
`occupancy.capacityDimensions` chega preenchida também no degrau `reference`, porque a ocupação
aceita o palpite de mercado como piso de m³ (ADR da 075). A planta recusa: a dispersão dentro de um
tipo chega a 2× — um VUC existe de 13 e de 26 m³ —, e ali o erro deixa de ser porcentagem e vira
**metro** na tela de quem vai conferir com fita. Sem as três medidas não há planta: a tela mantém as
fileiras proporcionais da 085 e nomeia os três campos, com atalho para a ficha.

⚠️ **A ficha nunca tinha pedido as três medidas.** As colunas existem desde a 075 e
`resolveVehicleCapacity` já as preferia — medido em 2026-09-06: **0 de 12** veículos preenchidos, e
não por descuido do operador. O formulário da frota passou a pedir comprimento, largura e altura, com
o m³ derivado aparecendo ao lado e dizendo de onde veio. O CHECK é **um por dimensão**
(`fleet_vehicles_cargo_{length,width,height}_check`, zero é ausência, senão `between` piso e teto):
os três juntos dariam a mesma mensagem para quem digitou 40 m de comprimento e para quem digitou
2,5 cm de largura. ⚠️ O baú **não é herdado** por marca e modelo como o `capacity_m3` ao lado dele: o
m³ herdado alimenta uma porcentagem, e a medida do baú alimenta um desenho que diz "encoste a 4,20 m
da porta" — no caminhão brasileiro o chassi é do catálogo e o baú é de um implementador qualquer.

⚠️ **A camada só existe com toda a caixa da parada medida** (`cargo-plan.policy.ts`). Área da faixa ÷
pegada da caixa dá as caixas por camada; altura do baú ÷ altura da caixa dá as camadas. Uma medida
faltando e a conta inteira não acontece — "25 caixas por camada" é lido como instrução, e instrução
com palpite dentro é pior que nenhuma. Caixas diferentes na mesma parada saem pela **maior** pegada e
pela **mais alta**: subestimar faz parar de carregar cedo, superestimar faz a carga invadir a faixa
seguinte. As caixas viajam em `CargoLayoutStop.boxes`, montadas onde o agrupamento por endereço já
acontece (`buildCargoPreviewStops` e o repositório da viagem) — nunca num mapa ao lado, que precisaria
refazer o agrupamento e poderia discordar dele. Medido: 15 de 345 notas têm todas as linhas casadas a
caixa medida, e é esse o denominador da camada.

**A fatia é do tamanho da carga, e a carga encosta na porta** (spec 099). A fatia por parada de
`cargo-placement.policy.ts` era proporcional ao **baú inteiro** — as fatias somavam sempre o
comprimento todo por menor que fosse a carga —, e a varredura em fileiras só quebra para a fileira ao
lado quando o `x` estoura o fim da fatia: com fatia de 2,5 m e caixa de 30 cm ela nunca quebrava.
Medido na tela com 30 caixas em três paradas num baú de 7,4 m: uma fileira rasteira de **7,40 m** que
cabia em **0,90 m** encostada na porta. Hoje a proporção é **teto**, `sizeSlice` mede o que a carga
pede (piso volumétrico crescendo 1,35× até parar de transbordar) e o bloco é deslocado para terminar
na porta — o vão sobra na testeira, nunca entre paradas. ⚠️ **Spec 134 revê isso onde a testeira
escora:** o deslocamento (para a porta ou para o meio) para na folga que mantém a pilha escorada nela,
com 1 cm de sobra (`HEADBOARD_BRACE_MARGIN_M`), e a carga fica **encostada na cabeceira**, com o vão do
lado da porta — deslocada além do giro, a fileira do fundo ficava solta (15 caixas na Sprinter e 15 no
Accelo reais). Sem pilha escorada na testeira, a carga termina na porta como antes. Contrato em
`test/cargo-placement/headboard-brace.contract.ts`.

⚠️ **Acima de metade de `capacity_kg` a física vence a descarga**: `shouldBalanceLoad` põe o bloco no
meio do baú, com folga nas duas pontas, e carimba `weightBalanced` em toda caixa. Degrau e não rampa,
porque o operador precisa **prever** o desenho — posição que desliza a cada caixa não se confere
contra nada. `payloadRatio` nulo é ausência de denominador e **não equilibra**: mover carga por
palpite seria a invenção que a ausência do teto deveria impedir.

⚠️ **A caixa pousa no que está embaixo dela, e isso é absoluto.** O `z` vinha de `layerBottomM`, o
topo da **camada inteira** — caixa baixa sobre caixa baixa era erguida até o topo da caixa **alta**
vizinha (medido: 2 de 12 flutuando 0,6 m). Hoje a fatia mantém um relevo por célula e o `z` é o maior
da pegada. ⚠️ A conversão para célula leva **folga nas duas pontas**: `0.6 / 0.05` dá
`11.999999999999998`, e sem a folga duas caixas encostadas dividem uma célula, cada uma pousa sobre a
anterior e a fileira sobe em **escada** até o teto — defeito pior que o que a regra veio consertar.
⚠️ **Sem balanço: a caixa só senta onde o apoio é plano sob a pegada inteira** — nível, não fração de
base apoiada, porque todo percentual aqui seria inventado (ninguém mediu a massa dentro da caixa).
Resolve balanço e vão de uma vez: ela encosta na quina de quem já está lá. ⚠️ Recusar posição
**significa tentar a próxima** — a versão que mandava para `splitCargo` sem avançar o cursor fazia
toda caixa seguinte recusar no mesmo ponto e a carga voltava a se espalhar. ⚠️ E o laço **desiste**:
camada varrida inteira sem lugar encerra a busca, senão o cursor sobe de camada sem fim (o limite de
pilha é infinito para caixa empilhável) — medido, 58 buscas por caixa. ⚠️ Dimensionar a fatia e
empacotar são **a mesma passagem**: pacotes de teste descartados custavam 64 ms contra o teto de 50
da 094; hoje são 9,7 ms com 3600 caixas.

⚠️ **Por onde o veículo abre decide se existe porta a que encostar.** `loadingAccess` existia na
ficha e no layout, e o empacotador não o lia: hoje `open` (carroceria aberta ou sider) **equilibra
sempre**, sem olhar o peso — quem abre o comprimento inteiro já tem toda a carga à mão, e o
vocabulário de `LOADING_ACCESS_KINDS` já dizia isso na definição de `open`. `rear` e `rear_and_side`
encostam na porta e seguem o degrau de peso; ausente é `rear`, o mais restritivo. ⚠️ A **fatia** por
parada continua valendo nos três — a 095 a fez proibição, não preferência.

⚠️ **Nada disso confere eixo, e `axleNotChecked` continua no vocabulário.** Carga por eixo pede
entre-eixos, posição do eixo sob o baú e a **tara repartida** — `tare_weight_kg` é um número só, e o
CG da tara ninguém publica. Medido em ficha de fabricante: o entre-eixos do **mesmo modelo** (Atego 1719) varia de 3,571 a 5,409 m, então referência por tipo erraria por metros e a spec 098 a recusou —
a geometria só pode vir da ficha do veículo, e `fleet_vehicle_axles` (criada pela 094) está **vazia**.
⚠️ A norma é a **Res. CONTRAN 882/2021** (a 210/2006 está revogada pelo Art. 64, I), e o Art. 50 §1º
fiscaliza veículo até 50 t **só pelo PBT** — que é toda esta frota. A tolerância de 5%/12,5% do
Art. 50 **nunca** entra na conta mostrada a quem carrega (§3º), e o Art. 49 §3º não admite tolerância
alguma na fiscalização pelo peso **declarado em CT-e ou MDF-e**.

⚠️ O `<svg>` da planta mora em `src/components/ui/scale-plan.tsx`, não no módulo: `<svg>` cru é
proibido fora do design system, e ele entrou em `DATA_GEOMETRY_PATHS` ao lado de `vector-map` e
`barcode` — a geometria sai das medidas em tempo de execução. `buildScalePlanViewBox` é função pura
porque a razão do `viewBox` **é** a promessa de escala, e é a única parte conferível sem DOM. No
celular a planta rola no **próprio contêiner**: comprimi-la para caber destruiria a escala, que é a
única coisa que o desenho promete. Distância negativa da porta é legítima — é a carga que atravessou
a porta, e sai hachurada fora do contorno.

**Cada tela é um `import()` próprio, e isso não é otimização — é o que faz a aplicação compilar.**
As 22 telas de workspace de `src/main.tsx` são `lazy(async () => ({ default: (await import(...)).X }))`,
com um `<Suspense>` cujo `fallback` é o `PageTransitionSkeleton` que já servia à troca de tela — o
mesmo esqueleto nas duas esperas, como `docs/frontend/loading.md` manda.

⚠️ **As três telas de entrada ficam eager**: `FirstAccessPage`, `PasswordResetPage` e
`LoginIdentifierPage` renderizam **antes** da casca, em `bootstrapApplication`, e adiá-las trocaria
o custo por um piscar na primeira coisa que o usuário vê.

⚠️ O motivo é medido, não estético: com tudo num `index` só, o bundle chegou a **2.099,31 kB**
contra o teto de 2 MiB do precache do `vite-plugin-pwa`, e o **build falhava** — derrubando junto
`make check` e todo o `bun run smoke`, que precisa do `preview`. Depois da divisão o `index` é
**837,63 kB** (gzip 583,52 → 254,08). Tela nova entra por `import()`; um import estático de página
volta a empurrar o `index` para o teto, e a falha aparece longe de quem a causou.

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
  que é peso **por parada** para o solver. ⚠️ **A primeira tela a mostrar peso é a busca de notas do
  diálogo "Nova viagem"**, e ela leva a origem junto: `NfeDocumentSummary` publica
  `cargoGrossWeight` **e** `cargoWeightSource`, e a coluna imprime "estimado" ao lado do número
  quando a origem não é o XML. Os dois campos andam sempre em par — quem expuser peso em qualquer
  outra superfície leva a origem junto, pela mesma razão da ADR-0044 §1: número plausível sem aviso
  é o modo de falha. Ausência é `null` nos dois, nunca zero. O valor da nota (`totalAmount`) ganhou
  coluna na mesma tabela, e o `formatWeightKilograms` de
  `frontend-transportada/src/modules/shared/decimalAmount.service.ts` é separado do `formatAmount`
  de propósito: as duas grandezas são `numeric(_, 4)`, e reusar o de dinheiro imprimiria `R$ 108,67`
  numa coluna de massa sem o tipo acusar nada. Contratos em
  `test/nfe-documents/cargo-weight-listing.contract.ts` (API) e
  `test/trip/document-search-columns.contract.ts` (frontend). Medido em 2026-09-05: **344 das 345
  notas trazem `pesoB`**, e `company_cargo_settings` está vazia — a estimativa não roda hoje.

**O roteirizador passou a ler esse mesmo peso.** Até 2026-09-06 `readStops` e `readPoolStops`
(`worker-transportada/src/routing/infrastructure/drizzle-route-optimization.repository.ts`) gravavam
`weightEstimated: true` e `fallback_weight_kilograms` em **toda** parada — a média da empresa decidia
capacidade enquanto a massa medida estava no banco. Medido em 347 XMLs reais do cliente: **todos**
trazem `pesoB`, de 13,108 kg a 1.092,000 kg — uma faixa de 83× que um número só não representa.

Hoje a precedência é a de `resolveStopWeight`
(`worker-transportada/src/routing/domain/stop-weight.policy.ts`), e ela é **a mesma da listagem**:
`pesoB` declarado → `qVol × company_cargo_settings.default_volume_weight` → ausência. Duas ordens
diferentes fariam a tela e o roteirizador discordarem sobre a mesma nota.

⚠️ Onde as duas divergem é na ausência: a listagem publica `null` (e a coluna fica vazia), e o solver
**precisa de um número** — ignorar a nota mandaria carga a mais para um caminhão que ele acredita
vazio. Ali entra `fallback_weight_kilograms`, que deixou de ser peso **por parada** e passou a ser
peso **por nota sem medida**; com uma nota só, que era o caso de ontem, o resultado é idêntico.

⚠️ `weightEstimated` é do **pior caso da parada**: uma nota sem massa entre outras medidas marca a
parada inteira, porque é a marca que o conferente lê antes de aceitar (ADR-0044 §5). O worker ganhou
cópia por valor de `trip_documents` (em `routing.schema.ts`) e de `company_cargo_settings` (em
`nfe.schema.ts`) — migration continua sendo da API. Contrato em `test/routing/stop-weight.contract.ts`
e as duas pontas provadas contra Postgres em `test/route-optimization-trip-weight.integration.test.ts`
(a parada da viagem, que não tinha cobertura de integração nenhuma) e
`test/route-optimization-pool.integration.test.ts` (o pool).

**Serviço municipal é escolha do perfil, não premissa do produto** (spec do portão municipal).
Transporte que começa e termina no mesmo município é NFS-e, com ISS, e não CT-e, que é ICMS — mas
**medido em produção**: das notas de mesmo município, **0 de 920** tinham CT-e (um portão ligado por
padrão não barraria nada), e as **62 de 62** NFS-e emitidas eram **intermunicipais** (a leitura
inversa barraria a operação inteira). Nenhuma das duas descreve a operação, e o produto é genérico
(ADR-0021): a regra virou dado.

`cte_emission_profiles.municipal_service_policy` é `allow` (padrão, e o comportamento de sempre) ou
`block`. Em `allow` quem separa CT-e de NFS-e continua sendo o operador, pelos dois botões da tela;
em `block` a nota de mesmo município é recusada na seleção do lote com
`CTE_BATCH_DOCUMENT_MUNICIPAL_SERVICE`. A migration `20260906140000_cte_profile_municipal_service_policy`
é aditiva com default — **nenhuma instalação muda de comportamento ao aplicá-la**.

⚠️ **A comparação é pelo código do IBGE, nunca pelo nome** (`RIBEIRAO PRETO`, `Ribeirão Preto` e
`RIBEIRÃO PRETO` chegam das notas como três grafias), e são os municípios dos **participantes
fiscais** — não o destino físico da spec 073: onde o caminhão encosta é roteiro, quem figura no
documento define a competência do imposto. Código ausente de um dos lados **não barra nem com o
portão ligado**.

⚠️ **Dois consumidores perguntam qual perfil rege a nota**, e por isso a resposta mora num lugar só:
`resolveMunicipalServicePolicy` (`cte-profiles/domain/emission-profile-resolution.policy.ts`). Ela
usa `findEmissionProfile`, que é `resolveEmissionProfile` **sem lançar** — nota sem perfil, empate e
participante sem CNPJ viram ausência, e ausência vira `allow`. A versão que lança continua sendo a da
emissão, onde a falta de perfil é erro de verdade; usá-la na listagem derrubaria a tela inteira por
causa de uma linha. Na seleção do lote o perfil é resolvido **duas vezes** de propósito: o portão
roda antes de a nota ser considerada cobrável, e as duas leituras escolhem o mesmo perfil do mesmo
catálogo. Na listagem os perfis ativos são carregados **uma vez por página**, como as regras de frete.

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
ajuste. ⚠️ `fuel_price_references` é **uma das três tabelas do produto sem `company_id`** — ao lado de
`vehicle_volume_references` e `toll_booths` —, de propósito: a
publicação semanal da ANP é dado público de mercado, idêntico para toda empresa da instalação, sem
PII e sem efeito fiscal. `test/fleet-schema/tenant-safety.contract.ts` a lista como exceção
declarada — se ela sumir da lista, o contrato passa a cobrar o tenant. A leitura do preço dentro da
listagem de veículos é **uma por empresa**, resolvida antes do `map` da página, nunca por linha.

⚠️ **A conta da viagem lê esse mesmo preço efetivo, e não lia.** `trip-valuation.query.ts` e
`route-geometry-vehicle-axles.query.ts` consultavam **só** `company_fuel_prices`, o ajuste manual —
então numa instalação que deixa a ANP responder, que é o ponto da ADR-0033, a parcela de combustível
saía `missing` em **toda** viagem, com o preço publicado no banco e impresso na tela de frota ao
lado. O mesmo veículo tinha dois R$/km, e só o pior aparecia na margem. Hoje as duas passam por
`trips/infrastructure/effective-fuel-price.query.ts`, que reusa `resolveEffectiveFuelPrice` e o
repositório de preços — não é cópia por valor: as duas apps são a mesma, e dentro de uma app se
importa.

⚠️ **Consumo ausente e preço ausente são lacunas diferentes** (`NO_FUEL_CONSUMPTION` e
`NO_FUEL_PRICE`). Elas se cadastram em telas diferentes — a ficha do veículo e a aba Combustível da
frota —, e a lacuna única de antes ("consumo do veículo ou preço do combustível sem cadastro")
mandava o operador conferir as duas para descobrir qual faltava. `NO_FUEL_BASELINE` fica só para o
consumo declarado que **não produz conta** (zero, ou valor que não parseia).
`test/trip-financials/valuation-gap-labels.contract.ts` (frontend) lê `VALUATION_GAPS` do fonte da
API e reprova lacuna nova sem rótulo nas duas telas e nos dois idiomas.

⚠️ **A lacuna do agregado passou a dizer qual célula da planilha falta** (spec 123). `NO_DRIVER_RATE`
saía com `detail: null` — "rota do agregado sem valor cadastrado" numa tabela de **29 zonas × 6
colunas** é mandar conferir 174 células. O cálculo já sabia: `resolveTripDriverZone` tinha o destino
casado na mão quando negou a cobertura e o descartava, e `resolveCrew` não passava adiante a classe
nem o motorista. Hoje o detalhe é dado cru — `3.000 (CAJURU) · vuc · adalberto rocha` — com o mesmo
separador `·` de `ledger.driverBasis`, e a frase continua no `*.locale.json`.

⚠️ **São duas faltas, e elas se cadastram em telas diferentes:** `DRIVER_ZONE_NOT_COVERED` (a zona
existe, o motorista não a cobre — ficha do motorista) e `DRIVER_RATE_MISSING_FOR_CLASS` (a zona
existe, ele cobre, e a célula daquela classe está vazia — aba Regiões). ⚠️ Veículo **sem coluna** na
planilha (moto, carro, cavalo mecânico, onde `resolveVehicleFreightClass` manda `''`) **não** cai na
segunda: ali não há célula para preencher, e a lacuna honesta continua sendo `NO_DRIVER_RATE`.
⚠️ **A coluna só aparece acompanhada da linha** — `three_quarter` sozinho diria que o problema é a
classe quando o problema é não ter havido destino; e **o nome do motorista só entra com mais de um
condutor**, senão é ruído. Medido em 2026-09-10: 20 viagens com tripulação, 8 lacunas passam a
nomear zona e classe, 4 seguem secas (nenhuma parada com cidade), **0 valores alterados** — a coluna
`utility` está vazia nas 25 zonas que têm algum preço, e é ela o caso real da célula vazia. Contrato
em `test/trip-valuation/driver-rate-gap.contract.ts`; a ordem de deploy é indiferente (o `t()` cai no
`defaultValue`).

**Motorista sem a zona: a conta usa o preço da tabela, e avisa** (spec 124). Quando a zona do
destino existe, o motorista não a cobre e `freight_region_driver_rates` **tem** preço para
`(zona, classe)`, a parcela `driver` conta esse preço como `estimated`, com a lacuna-aviso
`DRIVER_ZONE_PRICED_FROM_TABLE` e o mesmo detalhe da 123. Sem preço nem na tabela, continua
`DRIVER_ZONE_NOT_COVERED` ausente. ⚠️ **Aviso não é lacuna:** `ADVISORY_GAPS`
(`trip-valuation.policy.ts`) lista as lacunas cujo número está completo, e `hasGaps` as ignora — o
total conta o valor, e a marca de estimado diz que é projeção. `TOLL_PARTIAL` **não** é aviso: lá o
total subestima. No frontend `ADVISORY_GAPS` é cópia por valor (contrato
`test/trip-financials/valuation-ledger-advisory.contract.ts` lê o fonte da API), e o razão passou a
mostrar o valor **e** o aviso na mesma linha, e a imprimir "estimado" ao lado de toda parcela
`estimated`. Cobrir a zona na ficha faz o mesmo preço sair `measured`, sem aviso. Medido em
2026-09-10: 13 das 20 viagens com tripulação saíram de ausente para estimado, +R$ 9.577,24 de custo
de motorista. ⚠️ **A 127 mudou a semântica:** a parcela sai `measured` coberta ou não, e
`DRIVER_ZONE_PRICED_FROM_TABLE` virou só lembrete (código mantido por causa do congelado).

**A rota do agregado é a que casa com mais cidades da viagem** (spec 127). `resolveTripDriverZone`
montava o catálogo como `Map<cidade, linha>`, e a cidade em duas rotas — legítimo, a unicidade é
`(company_id, region_id, city, state)` — era sobrescrita pela última linha do Postgres. Hoje o
catálogo é **lista por cidade**; cada cidade distinta da viagem vota em toda rota (família de
`parseRegionCode`) em que aparece, vence a de mais cidades, e a faixa é a mais alta alcançada dentro
dela. Empate real é `DRIVER_ROUTE_AMBIGUOUS` com as zonas no `detail`
(`1.003 (FRANCA) | 7.001 (FRANCA)`) — nunca escolha calada, e a ordem do roteiro **não** desempata.
⚠️ **A cobertura do motorista não decide preço nem origem** — decisão do usuário: ela serve ao
roteiro. O preço é o da tabela para `(zona, classe)`, `measured`; sem ficha, acende o lembrete
`DRIVER_ZONE_PRICED_FROM_TABLE`; sem preço, `DRIVER_RATE_MISSING_FOR_CLASS`.
`DRIVER_ZONE_NOT_COVERED` não é mais produzido e fica só por causa do congelado. Medido em
2026-09-10: 10 cidades da planilha em mais de uma rota (o SQL cru acha 6 — acento), 16 das 32
viagens mudam de zona, 6 empatam (uma delas só RIBEIRÃO PRETO, que está na matriz 0.001 e na 1.001),
e o custo de motorista das 20 com tripulação vai de R$ 10.717,24 para R$ 6.874,24. Contrato em
`test/trip-valuation/driver-route-vote.contract.ts`, que embaralha o catálogo em toda rotação.

**Empate de rota usa o maior valor, e a matriz só vale sozinha** (spec 128, decisões do usuário).
Rotas empatadas no número de cidades não deixam mais a parcela sem valor: `resolveTripDriverZone`
devolve as faixas empatadas (a mais alta de cada rota) com `regionId`, a consulta as precifica na
mesma leitura de `readRatesByRegion`, e `chooseTiedZone` (`trips/domain/trip-driver-tie.policy.ts`)
fica com o **maior** `driver_amount` da classe — comparado em inteiro escalado, e com o maior valor
também empatado caindo no **menor código de zona**, nunca na ordem das linhas. A parcela sai
`measured` com o aviso `DRIVER_ROUTE_TIE_HIGHEST_RATE`, que está em `ADVISORY_GAPS` (não marca a conta
incompleta) e vence o lembrete de ficha; o detalhe é
`4 cidades · 1.003 (FRANCA) R$ 480,00 | 2.001 (SÃO CARLOS) R$ 747,50 · vuc`. Faixa sem preço sai
`sem preço`; nenhuma com preço é `DRIVER_RATE_MISSING_FOR_CLASS` nomeando as zonas.
⚠️ `DRIVER_ROUTE_AMBIGUOUS` **não é mais produzido** e fica no vocabulário e nos rótulos por causa do
congelado. ⚠️ **A matriz só vale sozinha:** a família `HEAD_OFFICE_FAMILY` (`0`, pelo código — nunca
pelo nome da cidade) sai da votação quando qualquer outra rota casa com cidade da viagem; era ela que
fazia a viagem só para a cidade-sede empatar por construção (`157f1822`: 0.001 × 1.001). Medido em
2026-09-11: 5 viagens com motorista mudaram, 15 idênticas, custo de motorista das 20 de R$ 6.874,24
para R$ 10.573,13. Contrato em `test/trip-valuation/driver-route-tie.contract.ts`.

**O ICMS se projeta pelo perfil de emissão até o CT-e existir** (spec 125). A parcela `icms` só
existia com CT-e autorizado — na montagem, na prévia e na proposta ela nunca existia. Hoje
`resolveDocumentIcms` (`trips/domain/trip-icms-projection.policy.ts`) resolve **por nota**: CT-e
autorizado vence (`measured`); sem ele, o perfil que `findEmissionProfile` escolhe (o mesmo seam sem
lançar de `resolveMunicipalServicePolicy`, pelos CNPJs do remetente **e** do destinatário) projeta
sobre a receita **da nota** (`estimated`). ⚠️ **A regra de base é uma só:** `computeIcms`
(`cte-issuance/domain/cte-icms.policy.ts`) foi extraída de `composeIcms`, que hoje só a mapeia para o
XML — redução de base, arredondamento em duas casas e CST 90 sem alíquota não podem ter segunda
implementação. Isento (`40`/`41`/`51`, `90` sem alíquota) é **zero declarado** com o CST no `basis`
(`of: 'icms'`); CST `60` é ausência (`ICMS_CST_UNSUPPORTED`), porque o builder recusa emiti-lo; nenhum
perfil, empate ou participante sem CNPJ é `NO_EMISSION_PROFILE`; sem receita, `NO_FREIGHT_RULE`. A
parcela soma medido + projetado com o pior caso da origem, e `detail` é `ausentes/total`. Os dois
leitores de contexto carregam os perfis ativos uma vez (`readIcmsProfiles`). Medido em 2026-09-10:
1308 de 1308 vínculos projetados, todos a 0,00 porque o único perfil ativo é CST 90 sem alíquota.

**O pedágio da rota é calculado, não lançado à mão** (spec 090, ADR pendente). `toll_booths` é a
**terceira** tabela sem `company_id`, ao lado de `fuel_price_references` e `vehicle_volume_references`:
tarifa pública mapeada no OSM, carregada do mesmo `.osm.pbf` que alimenta o OSRM por
`scripts/toll-booth-extract.ts` e um seed idempotente por `osm_node_id`. Medido no extract real: 166
praças, 163 com tarifa, **162 com tarifa por eixo**.

⚠️ **A praça se casa por identidade de nó, nunca por proximidade.** A praça **é** um nó do OSM, então
`annotations=nodes` no `/route` do OSRM entrega a interseção exata — e o sentido sai resolvido por
construção. Medido: numa rota Ribeirão Preto → Limeira as cinco praças casadas são todas "(sentido
Sul)", com as gêmeas do sentido Norte a poucos metros no mapa e **nenhuma** entrando. Um raio teria
cobrado as duas. `resolveTollRouteCost` (`toll-booths/domain/`) é o **único** lugar que soma; o que
muda por consumidor é de qual rota vêm os nós.

⚠️ **O pedágio viaja na resposta da rota** (D4), nunca numa chamada própria: duas consultas para o
mesmo trajeto podem devolver caminhos diferentes, e aí a tela mostra um traço e cobra outro, os dois
plausíveis. Pela mesma razão a prévia da montagem tira **distância e pedágio da mesma chamada**.

⚠️ **A praça conta uma vez por rota.** Medido: numa rota de 89,4 km, 27 nós aparecem mais de uma vez
com 65 ocorrências extras — alça de trevo e retorno de rotatória, não segunda cancela.

⚠️ **`nodeIds` nulo é desconhecido; rota sem praça é zero.** As duas coisas são diferentes na conta, e
colapsá-las faria uma rota cuja anotação não veio parecer uma rota sem pedágio.

⚠️ **`0.00` é tarifa declarada em 4 das 166 praças e nem sempre significa isenção** — duas da SP-291
têm nome de praça de rodovia e zero em tudo, que é campo não mapeado. Por isso a tela é obrigada a
imprimir **quantas praças estão sem tarifa conhecida** ao lado do total, e a data da tarifa
(`observed_on`) junto: reajuste de pedágio é anual.

O eixo sai de `resolveVehicleAxles`: `axle_count > 0` → `declared`, senão a referência por
`vehicle_type` → `estimated`, e **um eixo estimado marca o total** — a tela é proibida de imprimir o
valor sem a marca. ⚠️ A referência é **constante**, não tabela: dez linhas que ninguém atualiza fora
do código não pagam migration, seed e exceção de isolamento. E `toco` é caminhão de **dois** eixos —
o `truck` é que tem três; nas três praças medidas isso é R$ 65,60, não R$ 98,40.

⚠️ **A viagem criada carrega o pedágio dela, congelado no planejamento.** `planTripRoute` chama
`tollFreezer.freeze`, que pede a rota ao OSRM com nós e grava `trips.planned_toll` e
`planned_toll_frozen_at` — inclusive no caminho do aceite da proposta, e de novo a cada reordenar e
planejar. Medido em 2026-09-10: **16 de 32** viagens com pedágio congelado (a `3b2858a1`, RTD-5J78,
R$ 38,40 em 3 praças). Uma nota antiga dizia o contrário (T11) e estava errada. Quando o congelamento
**não** produz nada — OSRM ausente, falha engolida no `catch` de `plan-trip-route.use-case.ts`, eixo
desconhecido, viagem anterior à regra —, a conta cai em `NOT_RECORDED`, indistinguível de "ninguém
lançou"; dar a cada causa a sua lacuna é trabalho aberto. **O manual sempre vence o calculado**: ele é
pagamento registrado, o outro é projeção.

**A rota mais barata pode ser a que tem mais pedágio** (spec 096). `alternatives=true` funciona no
OSRM em MLD, mas só **uma de quatro** rotas medidas ofereceu segunda opção. Onde ofereceu — Ribeirão
Preto → Campinas — a alternativa economiza R$ 15,40 de pedágio e roda 18,1 km a mais, que num toco a
3,5 km/l custam ~R$ 32: ela é **~R$ 16 mais cara**. Por isso `rankRouteOptions`
(`toll-booths/domain/route-option.policy.ts`) elege a mais barata por **pedágio + combustível**, e um
contrato reprova a eleição feita só pelo pedágio. Sem consumo ou sem preço **não existe** rótulo de
mais barata; uma opção só não é escolha e a tela não desenha seletor.

**O radar mostra a velocidade que o mapa souber.** O `overlay.yml` carrega `maxspeed`,
`maxspeed:hgv` e `direction`; medido: 527 radares, 438 com velocidade, 12 com limite próprio de
caminhão — e ⚠️ **`maxspeed:hgv` vence**, porque em rodovia brasileira o limite do caminhão é menor e
quem lê este mapa opera frota. Os 89 sem a tag ficam **só com o triângulo**: inventar "60" porque é o
valor mais comum seria inventar o número que o motorista obedece.

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

**O anexo da candidatura não é lido na requisição** (ADR-0053, spec 070). `POST
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

**A decisão da revisão descarta a leitura.** `extracted_fields` guarda o que o servidor leu do
anexo — o CPF do proprietário no CRLV, o número de registro e o nome na CNH —, em texto puro e numa
tabela **sem prazo de descarte** (a 070 decidiu não ter `expires_at`, porque o rascunho é o
comprovante). Aprovar ou reprovar zera a coluna no **mesmo `UPDATE`** da decisão: em duas escritas,
uma falha no meio deixaria a PII para trás no caminho de erro. O arquivo continua no bucket, então
nada se perde — sai a cópia, não o documento. ⚠️ Isso alcança só o anexo **revisado**: rascunho
abandonado segue sem prazo, e fechá-lo é job agendado com spec própria (`docs/SECURITY.md`,
02/09/2026).

⚠️ Na tela são **três** estados, não dois: "não consegui ler" e "descartei depois de revisar" chegam
os dois como `null`, e o painel os separa pelo `status` — dizer que falhou em ler um documento que
foi lido manda o operador abrir o arquivo à toa.

**O pré-cadastro do agregado começa pelos documentos** (spec 071). A etapa de documentos é a
**primeira** da landing, antes de "Dados pessoais": ter os dados antes de preencher é o ponto
inteiro, e com o campo de arquivo no meio da página quem chegava só descobria que podia ter anexado
depois de digitar tudo à mão. Quatro campos, todos opcionais — CRLV, documento da empresa, CNH e
comprovante de endereço —, declarados em `application/shared/preRegistration.service.ts`, que também
guarda a ordem dos blocos (`PRE_REGISTRATION_BLOCKS`) porque é ela que o contrato percorre.

**Todo dado que o documento entrega preenche o campo dele, mesmo em outro bloco.** O CRLV traz nome e
CPF do proprietário e o município/UF: eles não são dados do veículo, são "Nome completo", "CPF ou
CNPJ" e a cidade do bloco Endereço. Parar no bloco Veículo jogaria fora metade da leitura por causa
de onde o campo mora na tela. Três guardas que não afrouxam por isso: **só campo vazio**;
**divergência avisa, não corrige** (agregado que roda com veículo de terceiro é caso normal, e ali o
proprietário diverge de propósito); e **documento não identificado não preenche nada** — quem manda é
o documento, não o campo em que ele foi solto.

⚠️ **O bloco Empresa aparece pelo CNPJ lido ou digitado**, o que vier primeiro: com a etapa de
documentos no topo não há CNPJ digitado ainda quando o CCMEI chega, e o campo do documento da empresa
deixou de depender dele. O campo é **um só** e aceita CCMEI, contrato social ou cartão CNPJ — só o
CCMEI preenche, e quem decide isso é `identifyDocumentKind`, não o campo. Cartão CNPJ não ganha
parser porque leria o que `GET /public/cnpj-info` já devolve; contrato social não tem forma para
ancorar. O comprovante de endereço é **anexo puro, qualquer tipo e qualquer data**: conta de luz,
água, telefone e internet não têm layout, e um parser genérico para elas é palpite com aparência de
leitura. ⚠️ Na landing o CEP **não** é consultado (a rota exige `addresses.read` — ADR-0040), então
o bloco Endereço continua digitado do começo ao fim.

**O parser do documento é biblioteca, e ela devolve o que o documento diz** (ADR-0054, spec 071).
`readCrlv`, `extractCnhFields` e `createTesseractOcrClient` subiram para
`@adatechnology/document-intake`, onde `readCcmei` e `identifyDocumentKind` já viviam: os três eram
código de uma app que uma segunda passou a precisar, e nenhuma app importa código-fonte de outra.
Não é cópia por valor como `FUEL_TYPES` — uma lista de cinco produtos se confere de olho, um parser
de 249 linhas com tabelas de tradução e três dígitos verificadores **diverge calado**.

⚠️ O pacote devolve o **impresso**, canonicalizado (`bodyType: 'FURGAO'`, nunca `'02'`); a tradução
para `MdfeBodyType`, `FuelProduct` e `VehicleColor` ficou em
`frontend-transportada/.../crlvVehicle.service.ts`, que virou mapeador de catálogo. A landing não
ganha cópia dessas tabelas porque a ficha dela não tem carroceria, combustível nem cor. A linha
decide quem quebra quando: o Detran mudar o layout quebra o pacote; o nosso catálogo mudar quebra o
app. Os `remarks` se dividem pelo mesmo corte — `checkDigitFailed`, `notInformed` e `notReadable` são
do documento; `notInCatalog` e `ambiguousDiesel` são do catálogo.

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

**O banco falha rápido, e diz por quê** (spec 137). A API não usa mais `createDrizzleProvider`
direto: `src/database/database-client.service.ts` monta o Bun SQL com pool e prazos explícitos
(`DATABASE_POOL_MAX` 10, `DATABASE_CONNECT_TIMEOUT_SECONDS` 5, `DATABASE_QUERY_TIMEOUT_MS` 8000 —
abaixo dos 10 s de `REQUEST_TIMEOUT_SECONDS`) e entrega ao drizzle um cliente guardado: consulta que
passa do prazo (a espera por conexão conta dentro dele) vira **503 `DATABASE_UNAVAILABLE`** com log
`database_unavailable` e `reason`, e o mesmo prazo vai ao servidor como `statement_timeout`. Antes, o
Bun esperava conexão para sempre e o pedido morria nos 10 s do `server.timeout` **sem resposta e sem
log** — foi o incidente de 11/09/2026. `/health/ready` dá 2 s a cada dependência e responde 503.

⚠️ **`prepare: false` é a correção da causa, não enfeite.** Com as instruções preparadas do Bun SQL
1.3.14, 35 `loadTripOccupancy` concorrentes deixavam consultas sem resolver para sempre (3 de 3), com
o Postgres vendo as conexões ociosas; sem elas, 15 de 15 terminaram até 150 concorrentes. Religar
exige medir de novo numa versão nova do Bun. ⚠️ **O `idleTimeout` do Bun não é prazo de espera por
conexão**, embora a documentação diga que é: medido, ele recusou uma consulta que já rodava. ⚠️ O
`cancel()` do Bun só tira da fila o que ainda não saiu; consulta em execução só para no
`statement_timeout`. O pedido abortado solta quem espera na hora (`AsyncLocalStorage` em
`shared/request-scope.service.ts`, aberto pelo `request-handler`), e **consulta disparada fora desse
escopo não é cancelada pelo aborto**. Contratos em `test/database-availability.contract.test.ts` e
`test/integration/database-availability.integration.ts`.
