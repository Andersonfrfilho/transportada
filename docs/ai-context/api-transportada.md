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
`cancelled`), e o estado da viagem é **derivado** do de suas notas — exceto em três transições
manuais (criar em `draft`, `plan-route`, `cancel`). ⚠️ **`dispatch` deixou de ser só manual** (spec
185, ADR-0074): a escrita que fecha a carga (carregar a última nota, em lote ou pelo WhatsApp, ou a
ocorrência que libera a última pendente) despacha a viagem sozinha, com o ator e o canal de quem
carregou — o botão "Despachar" segue existindo para quando um gate recusa o automático.
`trip_documents.separation_status`
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
sai desse estado — incidente, não fluxo. ⚠️ **`dispatched` passa a significar "carga fechada"**
(spec 185, ADR-0074 §6): o que já contava do despacho — congelamento do ETA, "A caminho" no
portal, início do rastreamento, janela de 36h — continua contando do despacho, esteja ele derivado
ou pelo botão; o ETA pode nascer adiantado quando o caminhão demora no pátio depois de carregado,
custo aceito da simplicidade. `TripStop` é **derivada**, nunca criada à mão: vincular
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
regra do campo vindo de documento. ⚠️ **A ficha sem sugestão recorre à referência (commit `c02325b6`)**:
quem nasce sem medida e sem catálogo depara com planta em branco ou planta à escala do catálogo,
marcada como tal (`bedSource: 'reference'`) — é palpite, mas com aviso. O que torna a sugestão
aceitável é a origem impressa junto do campo e o salvamento: a partir dele, é o que a ficha afirma.

`vehicle_volume_references` ganhou `max_payload_kg` (nulo é ausência de fonte, e o CHECK **recusa
zero** — o oposto do vocabulário da ficha, onde zero é "ninguém mediu") e as linhas de
`three_quarter` e `motorcycle`, que não existiam; `three_quarter` é o tipo do `RTD-5J78`, e é por
isso que ele não achava referência nenhuma. ⚠️ As dimensões das sete linhas antigas **não foram
tocadas**, embora a pesquisa devolva números maiores: a referência é **piso**, e subi-lo mudaria
calado a ocupação de todo veículo sem ficha. `tractor_unit` segue sem linha — o cavalo não tem baú
próprio, é o implemento que carrega. `car` **ganhou** duas linhas depois (`02`/`05`, 1,000 × 0,900 ×
0,500 m, 80 kg — o porta-malas em serviço de entrega, não o compartimento de um caminhão). ⚠️ Ela é a
**terceira** tabela sem `company_id`, e era a única das três cuja ausência não estava assertada em
`tenant-safety`. Serve por `GET /fleet/vehicle-references` sob `fleet.read` — não `settings.manage`:
quem cadastra veículo é quem precisa da sugestão. Catálogo fora do ar é ficha sem sugestão, nunca
ficha travada.

**A carroceria `00` deixou de ser valor neutro, e virou obrigação para quem carrega** (spec 147 D1).
`00` nasceu como default da coluna e servia para duas coisas ao mesmo tempo: "não aplicável" no
cavalo mecânico e "não informado" em todo o resto — o mesmo valor escondendo cadastro incompleto
atrás de cadastro correto. Hoje `checkVehicleBodyType` (`fleet/domain/vehicle-body-type.policy.ts`),
chamada nos dois parsers de fronteira (`parseCreateVehicleRequest`/`parseUpdateVehicleRequest` em
`fleet/presentation/fleet.schema.ts`, não dentro do caso de uso — o contrato HTTP roda contra stubs
que nunca o invocam), recusa `00` em qualquer veículo que não seja `tractor_unit`
(`FLEET_VEHICLE_BODY_TYPE_REQUIRED`, 400) e recusa **qualquer outro valor** no próprio cavalo
(`FLEET_VEHICLE_BODY_TYPE_NOT_APPLICABLE`) — carreta incluída, porque ela é `role: 'trailer'`, não
`tractor_unit`, e cai do lado que exige escolha. ⚠️ **Sem CHECK retroativo**: apertar o CHECK do banco
recusaria as linhas que já existem, e nenhuma migration faz `UPDATE` em `body_type`. Cadastro antigo
com `00` num tipo que carrega continua existindo — só passa a aparecer nomeado, na página de
pendências.

**O nome do que falta é `capacityUnknownReason`, e ele decide o link do painel**
(`trips/domain/capacity-unknown-reason.policy.ts`, `resolveCapacityUnknownReason`). Três motivos, na
mesma ordem que `resolveVolumeReferenceKey` decide quem carrega — a carreta quando existe, senão o
próprio veículo de tração: `bodyTypeMissing` (o carregador tem `00` e não é cavalo — carreta velha
inclusive), `trailerMissing` (`tractor_unit` sem carreta) e `referenceMissing` (tipo sem linha de
catálogo, como `other`). `capacityM3` não nulo zera o motivo antes de qualquer outra checagem. A
prévia de carga (`POST /trips/cargo-preview`, antes de a viagem existir) resolve a carreta **padrão**
do cavalo pela mesma regra da criação (T18, revisão — livre, ativa, `role: 'trailer'`) em vez de
sempre assumir `trailer: null`; mostrar "sem carreta" na prévia e "carreta X" um clique depois, na
viagem já criada, confundia mais do que ajudava. `capacityUnknownReason` (detalhe e prévia) vem
acompanhado de `capacityUnknownVehicleId` — a carreta em `bodyTypeMissing`, o veículo da viagem nos
outros dois motivos — para o link do painel apontar à ficha de quem realmente falta preencher, e não
sempre à do cavalo.

**O cavalo tem uma carreta, e a ocupação passa a ler a ficha dela** (spec 147 D3/D4).
`trips.trailer_vehicle_id` e `fleet_vehicles.default_trailer_vehicle_id` (a segunda é só sugestão)
nasceram na migration à mão `20260913120000_trip_trailer_vehicle` — à mão porque as últimas 35
migrations do repositório já não têm `snapshot.json` (o `drizzle/meta/` não existe mais aqui), e
rodar `db:generate` reintroduziria como "novas" migrations já aplicadas. FK composta `(company_id,
*) → fleet_vehicles(company_id, id)` nos dois campos (nunca `SET NULL`, que anularia `company_id`,
que é `NOT NULL`), CHECKs contra autorreferência e contra carreta padrão fora de `tractor_unit`, e o
índice único parcial `trips_company_trailer_open_unique` — a mesma carreta não entra em duas viagens
com `status not in ('completed','cancelled')`. `PUT /trips/:id/trailer` (`trip.manage` — o separador
alcança, pelo mesmo raciocínio já registrado acima para o resto da montagem) escreve o vínculo por
`checkTripAcceptsTrailer` (`trips/domain/trip-trailer.policy.ts`), que reusa
`checkTripAcceptsLinkage` para o portão de estado (bloqueia depois de `dispatched`) antes de checar
que só o cavalo aceita carreta; a corrida entre duas escritas é fechada pelo índice único, traduzido
em `409 TRIP_TRAILER_IN_USE`. Criar a viagem de um cavalo copia a carreta padrão **só como
sugestão**: se ela já estiver em viagem aberta, a viagem nasce sem carreta, nunca com erro. ⚠️ **O
cavalo não carrega sozinho**: `checkDispatch` (`trip-state.policy.ts`) recebe `requiresTrailer` e
barra o despacho com `409 TRIP_TRAILER_REQUIRED` — código de topo dedicado, não
`STATE_TRANSITION_NOT_ALLOWED` com motivo em `details` — depois do portão de roteiro e antes de
aplicar a transição. **A leitura de fora acontece antes da transação de despacho**, e por isso
`dispatch()` reconfere sozinho, com `SELECT … FOR UPDATE` da viagem (o mesmo padrão de `setTrailer`):
sem essa segunda checagem, um `setTrailer` concorrente que solte a carreta entre a leitura e a
escrita despacharia um cavalo sozinho (T18, revisão). O snapshot de despacho congela `trailer:
{vehicleId, plate} | null`; nenhum leitor de produção decodifica essa chave hoje, então o campo
nasce tipado sem exigir migração de leitor nenhum. A ocupação (`trip-occupancy.support.ts`) faz uma
quinta consulta **só quando existe carreta** e usa `carrier = trailer ?? vehicle` como o único ponto
que decide de quem é a ficha — `loadingAccess` e `maxPayloadKg` também vêm do `carrier` (T18,
revisão: antes liam sempre o veículo de tração, e uma carreta com capacidade diferente da dele fazia
o teto de peso e o acesso de carga mentirem). ⚠️ `fleet_vehicles.capacity_kg` é `NOT NULL DEFAULT
'0'`: uma carreta sem teto conhecido devolve o zero cru da coluna neste nível (nunca `null`, e nunca
o teto do cavalo) — só na borda de exibição (`resolvePayloadCeiling`, `trip-cargo-weight.policy.ts`)
zero e ausência viram a mesma coisa.

**T18 (revisão desta spec) corrigiu mais três corridas na criação/edição.** Duas viagens criadas ao
mesmo tempo para cavalos que compartilham a mesma carreta padrão disputam
`trips_company_trailer_open_unique` no `INSERT`; a segunda tentativa roda num `SAVEPOINT`
(`transaction.transaction`), e quem perde a corrida nasce **sem** carreta em vez de 500 genérico —
`resolveDefaultTrailerForCreation` também passou a exigir que a padrão ainda exista na empresa, seja
`role: 'trailer'`/`status: 'active'` e não esteja em viagem aberta, antes de copiá-la. Os dois CHECKs
de autorreferência (`trips_trailer_not_vehicle`, `fleet_vehicles_default_trailer_not_self`) e o de
tipo (`fleet_vehicles_default_trailer_tractor_only`) agora traduzem para 400 de domínio
(`TRIP_TRAILER_NOT_VEHICLE_ITSELF`, `FLEET_VEHICLE_DEFAULT_TRAILER_SELF_REFERENCE`,
`FLEET_VEHICLE_DEFAULT_TRAILER_REQUIRES_TRACTOR`) no ponto de escrita, no mesmo padrão de
`runTrailerGuarded` para a unicidade — nunca mais um 500 cru por violação de CHECK. `GET
/pending-items` entrou na lista exaustiva de `test/separator-role.contract.test.ts`: o separador tem
`fleet.read` e a alcança, decisão registrada ali. ⚠️ **Ordem de deploy: a API sobe antes do
frontend.** `VEHICLE_DETAIL_KEYS` (frontend) já exigia `defaultTrailerVehicleId` como chave
**obrigatória** desde a T10 original — não uma correção desta revisão, mas nunca registrado por
extenso: bundle novo contra API antiga (sem o campo) reproduz o defeito de sempre,
`hasEveryKey`/`hasOnlyKeys` recusando a linha inteira e a tabela de frota renderizando vazia com 200
na rede e nada no console (o mesmo caso já descrito acima para os campos de baú).

**O catálogo ganhou `01` e `04`, nunca `00` nem `03`** (spec 147 D5, migration
`20260913130000_vehicle_reference_open_and_container`). `('toco','01')` — carroceria aberta, 7,000 ×
2,500 × **2,500** m, 10.685 kg — usa comprimento, largura e carga da SINAPI 89265, e a altura é
**convenção**, porque não existe norma de altura de carga para caçamba sem teto; o comentário da
migration documenta os três apoios (anúncio de mercado, folga contra o teto legal do CONTRAN
882/2021, dois paletes PBR empilhados). `('','04')` e `('truck','04')` são contêiner dry 40' e 20'
(DSV, conferido na Guia Log) — o cavalo nunca carrega o contêiner, é a carreta (`vehicle_type` vazio)
quem responde. Granelera (`03`) e carroceria aberta fora do toco ficaram de fora por falta de medida
de fabricante publicada — decisão do usuário, registrada em `evidence.md`. ⚠️ **O `rollback.sql`
apaga as três chaves por valor** (`('toco','01')`, `('','04')`, `('truck','04')`), não por origem —
se uma instalação tiver inserido linha idêntica à mão antes de aplicar esta migration, o rollback a
leva junto. Risco baixo (o catálogo é de mercado, sem `company_id`), mas confira antes de rodar
rollback em ambiente com linhas manuais.

⚠️ **A sugestão da ficha (093) passou a casar por `(vehicleType, bodyType)`, nunca só por tipo**
(spec 147 T16b). Com `('toco','01')` no catálogo, casar só por `vehicleType` faria `fromReference`
pegar a primeira linha em ordem de `body_type` — todo toco novo teria recebido a carroceria aberta em
vez do baú. Hoje `resolveVehicleSuggestion`/`fromReference` (`vehicleSuggestion.service.ts`) recebem
`bodyType`, e sem carroceria escolhida (`''`) ou com `'00'` (só o cavalo) devolvem `null` sem
consultar o catálogo — a carroceria é obrigatória fora do cavalo (D1), e sem ela qualquer linha seria
palpite. A precedência de sempre continua intacta: ficha da frota com mesma marca e modelo já medido
vence a referência, que vence a ausência.

**As pendências ficam num lugar só, e o primeiro tipo é a carroceria que ninguém escolheu** (spec 147
D2/RF9). `GET /pending-items` (módulo `pending-items/`, sem `domain/` — a consulta já é a regra)
delega para a primeira fonte (`PendingItemSourcePort`) cuja permissão o chamador tem; sem fonte
permitida devolve página vazia, nunca `403` — a política de "quem pode ver" mora na fonte, não na
rota. Hoje só existe `fleet-body-type` (`drizzle-fleet-body-type-pending-item.source.ts`): filtra
`vehicle_type <> 'tractor_unit'` (alcança a carreta de propósito, sem nomeá-la — o `vehicle_type`
dela já é vazio), `body_type = '00'` e **`status = 'active'`** — pendência de veículo inativo não é
trabalho para ninguém corrigir agora, decisão tomada dentro da task, sem linha correspondente na
spec. ⚠️ A rota exige `fleet.read` na borda, mesma permissão da única fonte de hoje — a infraestrutura
de rotas não tem o modo "autenticado sem permissão específica" que a spec pedia, e a diferença só vai
aparecer no dia em que existir uma segunda fonte com outra permissão. `test/separator-role.contract.test.ts`
não cobre `pending-items` (é módulo novo, fora da lista exaustiva de `trip`/`fleet`/`billing`/…), mas
o separador tem `fleet.read` e alcança a rota. No frontend, `/pendencias` é aba nova em "Cadastros",
com esqueleto de carregamento e uma linha por pendência levando à ficha do veículo.

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
plausível atribuído à caixa errada. Medido: 9% das notas, 18 de 663 caixas. `carton_gtin`
passou a vir do `cEAN` (fiscal-provider 0.3.2, 15/09/2026): o worker grava na importação, com dígito
GS1 conferido e DUN-14 reduzido a GTIN-13 pela mesma `reduceToGtin13` (cópia por valor, contrato de
paridade); `cEANTrib` só com o `cEAN` ausente; inválido ou "SEM GTIN" fica nulo, e linha existente
só ganha GTIN onde é nulo. As caixas antigas se preenchem por `backfill:nfe-package-box-gtin`
(worker, dry-run padrão, `--confirm` grava). O bipe continua casando **duas** colunas,
`carton_gtin` e `product_code`: a nota sem GTIN deixa a primeira nula, e é comum o emitente usar o
próprio EAN como `cProd`.

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

**Medida pela câmera (experimental, spec 152, ADR-0065):** `PUT /nfe-package-boxes/:id` aceita
`source: "camera" | "camera_adjusted"` (além do padrão `typed`) com um bloco `camera` contendo
`margins` (±mm por dimensão), `motivos` (dos 7 códigos fechados de D9), `impreciseConfirmed` (quando a
margem está entre 10–30 mm) e `engine` (motor da medida, ex. `aruco-homography-v1`). A caixa grava
`measurement_source` e `measurement_margin_mm` (a maior das três margens, nulo quando `typed`).
Histórico append-only em `nfe_package_box_measurements` guarda as três medidas, as três margens, os
motivos, a proposta da câmera por dimensão (`proposed_*_mm`), confirmação de imprecisão, o motor, o
ator do token e o timestamp. Editar um valor que veio da câmera muda a origem para `camera_adjusted`.
O interruptor `company_cargo_settings.camera_measurement_enabled` (`default false`, por empresa)
controla se a câmera está ligada na aba **Caixas** — com a função desligada, `PUT` com `source`
`camera`/`camera_adjusted` retorna **422** `PACKAGE_BOX_CAMERA_MEASUREMENT_DISABLED`. Rota de leitura
`GET /nfe-package-boxes/measurement-settings` (`cargo.measure`, por porta) devolve o estado do
interruptor. Export do histórico por período: `GET /nfe-package-box-measurements?from=&to=&cursor=`
(`settings.manage`, `perPage ≤ 100`) para validação com caixas reais (spec 152 T15).

**Exportar o que falta medir:** `GET /nfe-package-boxes/pending-export` (`cargo.measure`, sem
parâmetro nenhum) devolve `{ data: { items, truncated } }` — **todas** as caixas pendentes da empresa
do token, com os mesmos campos de `GET /nfe-package-boxes`. É a mesma fila: o use case
`export-pending-package-boxes` chama `createListPackageBoxes` com `status: pending`, então a ordem
(o que mais roda, desempate pelo id — também no `ORDER BY` do SQL, para o corte do `LIMIT` ser o
começo da fila) não tem segunda implementação. Teto de segurança do servidor
`PACKAGE_BOX_PENDING_EXPORT_MAX_ITEMS` (10 000, `domain/package-box-measurement.constant.ts`), sem
parâmetro do cliente para afrouxá-lo: busca teto + 1 e `truncated` só é `true` quando havia mais que
o teto. Consultas fixas (a fila e as caixas da empresa para o contador de família), sem N+1. Teto de
requisição por usuário em memória (`package-box-pending-export.rate-limit.ts`, 10 a cada 5 min). No
frontend é o "Baixar Excel/CSV" da aba **Caixas**, e ⚠️ a busca acontece **só no clique**
(`useMutation` em `usePackageBoxPendingExport`) — consulta automática ao abrir a aba gastava o teto
de requisições e baixava a empresa inteira sem ninguém pedir. O botão clicado mostra "Preparando…";
o aviso de arquivo cortado vem de `truncated` (nunca da contagem de itens), e o 429 tem mensagem
própria ("muitas exportações seguidas"). O limitador em memória (`rate-limiter.service.ts`) varre
cada balde pela janela **dele** (`Bucket.windowMs`): antes, a varredura disparada por uma rota de
janela curta apagava os baldes das rotas de janela longa e zerava o teto delas.

**Replicar medida entre variações da mesma caixa (spec 155):** `GET /nfe-package-boxes/:id/siblings`
(`cargo.measure`) lista irmãs por família — `(emitente, prefixo da descrição até o último dígito, uCom)`
é replicável (sabores diferentes da mesma caixa física). Mesmo emitente + cProd são agrupadas só na tela
como grupo de embalagem e **nunca** replicam (unidades diferentes = caixas de tamanho diferente, D3).
Irmãs já medidas são filtradas na tela (D4). `POST /nfe-package-boxes/:id/replicate` com `{ targetIds }`
grava comprimento, largura, altura, peso, contagem de unidades e `measurement_source = 'replicated'`
(nunca conferida, apenas informativa) no histórico com `replicated_from_box_id`. Status 422 se origem
sem medida, alvo fora da família ou família assimétrica marcada (`isLowConfidenceFamily`, quando sabor
e formato se misturam — ex.: vácuo e sachê). Status 409 se alvo já medido — **invariante que não se
negocia**: replicar nunca sobrescreve medida existente, nem por concorrência. Respostas com código
específico permitem a tela oferecer diálogo pré-marcado só em família confiável (D5).

**"Aplicar a todos" (spec 155 D12/G012):** `PackageBoxSiblingView` traz `measurementSource` de cada
irmã — a tela usa isso para preferir uma origem conferida (`typed`/`camera*`) a uma `replicated` na
hora de copiar de novo; réplica conta como medida e pode ser origem de outra réplica quando é a
única da família (decisão do usuário 2026-09-17).

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

**A caixa presumida agora tem um segundo degrau antes da mediana** (spec 144). `resolveDocumentCargoEstimate`
resolve por nota, nesta ordem: medida do conferente → resíduo da própria nota → mediana da empresa →
`notMeasured`. A conta do resíduo é `resíduo = total − medido`, e cada caixa sem ficha recebe
`resíduo ÷ restantes`; só cai para a mediana quando a nota não tem `<vol>`/fator ou o medido já
passou do total. A caixa continua saindo `source: 'estimated'` (D3) — o degrau novo troca o
**tamanho** da presumida, nunca a regra física do empacotador. A viagem devolve `pendingMeasurements`,
uma linha por produto sem ficha (produto, nota, parada, quantas caixas), para a fila de medição da
085 saber por onde começar. E a conservação (D5) fecha exato: quando toda caixa da parada é medida ou
presumida pela nota, o m³ desenhado bate com o `volumeM3` da fatia. Ver
`test/cargo-volume/document-box-estimate.contract.ts`.

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

**A fileira virou metro, e a escala sai da ficha — de mais lugar nenhum** (spec 088; o desenho
descrito aqui foi substituído pela vista em perspectiva por camada em `453e0b1e` — a regra da escala
pela ficha continua valendo para o `placement`). A fileira da
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
**metro** na tela de quem vai conferir com fita. Sem as três medidas não há planta: a tela mantinha as
fileiras proporcionais da 085 e nomeava os três campos, com atalho para a ficha. (Substituído em
`453e0b1e`: planta e fileiras saíram; hoje sem as três medidas não há desenho nenhum, só o aviso
`cargoLayers.missingBed` com o atalho.)

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

⚠️ **Substituído em `453e0b1e` (2026-09-07).** A planta vista de cima (`src/components/ui/scale-plan.tsx`,
`buildScalePlanViewBox`) e a fileira proporcional da 085 **saíram da tela**: o desenho da carga hoje é
a **vista em perspectiva por camada** (`TripCargoLayers.component.tsx` sobre
`src/components/ui/cargo-isometric.tsx`, `role="img"` "Carga da camada N, vista em perspectiva"),
alimentada por `cargoLayout.placement`. Sem as três medidas do baú não há desenho, e a tela diz isso
com atalho para a ficha (`cargoLayers.missingBed`). O `scale-plan.tsx` e as chaves `cargoPlan.*` do
locale ficaram no repositório sem consumidor na tela. Registro histórico da 088: o `<svg>` morava no
design system por ser geometria de tempo de execução, a razão do `viewBox` era a promessa de escala,
e no celular o desenho rolava no próprio contêiner.

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

**Migration à mão é permitida, sem snapshot não.** O `drizzle-kit generate` não lê o banco nem os
`migration.sql`: ele diffa o schema TS contra o `snapshot.json` mais recente da pasta. Medido em
2026-09-13: das 173 pastas, as 35 a partir de `20260902140000_cargo_volume_factors` tinham só
`migration.sql` + `rollback.sql`, escritas à mão. As 25 anteriores a `20260907182129_toll_booths`
não faziam mal, porque o snapshot dela saiu do schema e as absorveu. As **dez posteriores** faziam: o
`db:generate` recriava 32 statements já aplicados (`company_toll_booth_charges`,
`fleet_vehicle_axles`, `trips.planned_toll`, `fleet_drivers.secures_cargo`…). E o `db:check`
respondia "Everything's fine", porque só confere os snapshots entre si.

A correção pôs o snapshot gerado do schema TS dentro da pasta de
`20260910120000_vehicle_reference_every_type`, encadeado no de `toll_booths`, sem `migration.sql`
novo. O migrator do drizzle-orm só lê `migration.sql`, então o banco não percebe a mudança. Um
`db:generate` logo depois responde `no_changes`.

A receita para migration à mão: escreva `migration.sql` + `rollback.sql` numa pasta nova, com o
schema TS já atualizado. Depois rode `bun run db:generate --name tmp`, mova o `snapshot.json` gerado
para a sua pasta e apague a pasta `tmp`. Se o `migration.sql` gerado não sair equivalente ao seu, é
o schema TS que está diferente do SQL: conserte antes de mover o snapshot. Quem cobra isso é
`test/database-migration/schema-snapshot.contract.ts`: toda pasta a partir de `20260910120000` tem
snapshot, o último encadeia no anterior, e `generateMigration(último snapshot, schema TS)` é vazio.
⚠️ O contrato compara o TS com o snapshot, **não** com o banco: SQL à mão que diverge do schema TS
continua passando. Quem pega isso é o `make migration-test`, e só para o que ele cobre.

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

**O pre-deploy reprova quando sobra migration pendente.** Medido em staging 19/09/2026: o
`preDeployCommand` (`bun src/database/pre-deploy.service.ts`) rodou `migrate()` em menos de um
segundo, imprimiu `{"migrated":true,...}` e **não aplicou 22 migrations que estavam na imagem** — o
banco ficou com 193 de 215 aplicadas por dias, e rotas de viagem, frota, caixa e webhook respondiam
500 com SQLSTATE 42703 (coluna inexistente). O passo só sabia dizer "eu rodei", nunca "não sobrou
nada". `assertMigrationsAreComplete` (`src/database/migration-completeness.service.ts`) fecha essa
lacuna: lê a mesma pasta que o drizzle lista (subpasta com `migration.sql`) e o journal
`drizzle.__drizzle_migrations` (tabela ausente conta como nenhuma migration aplicada, banco recém
criado não é erro), compara pela função pura já existente `listPendingMigrations`
(`migration-status.policy.ts` — a mesma que sustenta a readiness de `/health/ready`, reaproveitada em
vez de duplicada) e lança `MigrationsPendingError` (`migration-completeness.error.ts`, com a
contagem e os nomes) quando sobra pendência. `runPreDeploy` chama isso logo depois de `migrate()` e
antes de provisionar e de semear templates (`pre-deploy.service.ts`): migration pendente aborta o
deploy inteiro, nunca deixa os passos seguintes rodarem contra um schema incompleto. Contratos em
`test/database-migration/pre-deploy.contract.ts` (com fakes, sem banco) e
`test/integration/migration-completeness.integration.ts` (Postgres de verdade, reproduzindo o
journal pela metade).

**O WhatsApp vira canal de comando** (spec 144, `whatsapp-commands`, ADR-0063/ADR-0064). Até aqui o
WhatsApp só recebia e mostrava mensagem na inbox (spec 062); agora uma mensagem recebida executa
ação de negócio — separar nota, despachar viagem, registrar entrega ou ocorrência, emitir CT-e/NFS-e
por seleção e faturar. O módulo é `whatsapp-commands`, nas quatro camadas de sempre.

**O despachante entra no hook `onMessageReceived`, e os hooks são por instância do módulo, não por
instalação.** `@adatechnology/meta-whatsapp-module` é construído **uma vez por empresa** — cada
empresa tem seu próprio canal, token e número —, e `hooks.onMessageReceived` é lido a cada mensagem
por essa instância. `createWhatsAppCommandHookFactory` separa o que é da **instalação** (o ator
autorizado, o grafo, o limitador, o log, `withAuthorizedActor`, montados uma vez) do que é da
**empresa** (canal, interpretador, sessões, o `WhatsAppMessageProvider` dos botões — recriado sempre
que o token muda). O resolver por empresa passa um objeto `hooks` vazio a `createMetaWhatsAppModule`
e o preenche depois, porque o despachante precisa do `channel`/`flows.interpreter`/
`conversations.repository` **da própria instância** — sem `buildMessageHook` o módulo se comporta
como na spec 062.

**A instalação está em `meta-whatsapp-module@0.7.0`, `-contracts@0.6.0` e `-provider@0.3.1`** (subida
de 2026-10-03, spec 196 T3.6; antes ficava na `0.1.0` porque a linha 0.2.x/0.3.x publicava as migrations no
formato antigo "por journal", que o `drizzle-orm` `1.0.0-rc.4` recusa de propósito). A `0.7.0` publica as migrations em
**pasta** (`dist/migrations/<nome>/migration.sql`): as quatro originais mantêm o nome e as sete aditivas
(`0004`–`0010`) entram por cima. ⚠️ O migrator decide pelo **nome**, então nos bancos existentes só as aditivas rodam
(provado em `test/whatsapp/module-migration.contract.ts`). `runMetaWhatsAppMigrations({ db, migrate })` recebe o
`migrate` injetado (`drizzle-orm/bun-sql/migrator`), como o `notification-module`; o runner do pacote **descarta o
retorno** do `migrate`, que no rc.4 pode devolver `MigratorInitFailResponse` em vez de lançar — por isso o
`meta-whatsapp-migration.service.ts` injeta um invólucro que transforma esse retorno em erro. O
`assertMigrationsAreComplete` do pre-deploy lê só o journal do `public`: **não cobre** `meta_whatsapp`. O
`NonceStoreInterface` ganhou `confirm?` (implementado no `drizzle-webhook-nonce.store.ts`: o claim curto vira a
janela cheia). O pacote **persiste** `messages[].location` crua em `meta_whatsapp.messages.payload` (e o rótulo
`name`/`address` em `content`); ele não loga.

**O interpretador não valida a resposta nem envia mensagem — o driver faz as duas
coisas.** `FlowInterpreter.run` trata qualquer texto de nó de escolha como o id de uma opção e cai no
`byAnswer.default`, então texto livre avançaria sem essa guarda — `isOfferedOption`
(`domain/whatsapp-answer.policy.ts`) é quem recusa resposta fora do menu antes de chamar o
interpretador. A mensagem de encerramento também não sai do pacote: é o `directMessage` do último nó
de `visited`, montado e enviado pelo próprio despachante (`whatsapp-flow-step.service.ts`).

**A `0.1.0` não tem `actionParams`, e os botões só saem pelo provider.** Sem parâmetro de ação no
grafo, tudo que uma `FlowAction` precisa vem de `context` (jsonb persistido, nunca PII — ver
abaixo) ou é resolvido de novo a cada chamada. `ChannelAdapterInterface` da `0.1.0` não tem
`sendInteractiveButtons`, então todo botão (o menu raiz, listas curtas) sai por
`WhatsAppMessageProvider` direto, não pelo adaptador do canal — e lista **dinâmica** (a de uma
`FlowAction`, como notas ou viagens) sai sempre como **lista**, nunca como botão, mesmo com ≤3
opções, porque a porta do despachante só sabe montar lista para dado dinâmico.

**Toda `FlowAction` de negócio passa por `withAuthorizedActor`, que re-resolve o ator a cada
chamada.** Ele confere `session.companyId` + `session.whatsappNumber` contra o mesmo
`AuthorizationService` do HTTP — nunca confia em quem a sessão dizia ser há dois passos. Recusa vira
`WhatsAppCommandDeniedError`, que o despachante converte na mesma resposta neutra de D1, com posição
limpa. `registerWhatsAppFlowActions` é o **único** caminho de registro: nenhuma ação de negócio entra
no interpretador sem passar por essa guarda.

**Nada de ator, permissão ou PII entra no `context` da sessão.** `context` é jsonb persistido, e só
guarda posição no grafo, contador de tentativas e chaves **opacas** (`em_` + hex do SHA-256 do
documento, ids de viagem/nota/motivo) — nunca nome, telefone, CPF ou título de lista. O padrão para
lista dinâmica é "roteador": o nó de ação busca os dados e manda a mensagem **ele mesmo**, direto por
`channel.sendInteractiveList`, e só o `id` da linha tocada (um identificador opaco) volta como
resposta capturada — o título "número · destinatário" nunca toca o banco de sessão. Log do
despachante carrega `companyId` e telefone só por `maskPhone`, nunca corpo de mensagem nem razão de
negócio.

**O grafo vive em código, e a republicação é versionada com histórico próprio, append-only.**
`whatsapp-commands/infrastructure/whatsapp-flow-graph.constant.ts` (`WHATSAPP_ROOT_FLOW_GRAPH`,
chave `transportada_root`) é a fonte — mas **o despachante lê a versão publicada no banco**, nunca a
constante direto: editar o arquivo não muda o que o usuário recebe até alguém rodar
`scripts/whatsapp-flow-publish.ts --company <id>` (sem `--confirm` só imprime diff e validação, no
molde de `scripts/address-comparison-batch.ts`). A republicação grava a versão anterior em
`whatsapp_flow_graph_versions` (trigger `BEFORE UPDATE OR DELETE`, mesmo padrão de `audit_logs`) na
**mesma transação** do `save` — `create` **não** grava histórico, porque grafo novo não tem "versão
atual" para guardar. O diff entre versões é sobre `canonicalStringify` (chaves ordenadas
recursivamente), nunca `JSON.stringify` cru: o `jsonb` do Postgres não promete a mesma ordem de
chave de quem inseriu, e comparar sem canonicalizar acusava mudança onde não havia. O menu raiz é
filtrado por permissão (D2) em `domain/whatsapp-root-menu.policy.ts` — opção sem nenhuma das
permissões que ela exige some do menu, e o ator é resolvido de novo depois de qualquer verificação de
telefone, porque só assim a permissão está disponível para filtrar o primeiro menu depois de
vincular o número.

**`MembershipAuthorizationPolicy` é conceito novo do router: "qualquer membership ativa", sem
permissão do catálogo.** `route.policy?: { membership: 'active'; permission?: never; scope:
'company' }` — o `permission?: never` existe só para os contratos que leem `route.policy?.permission`
de listas de rota (`me-routes`, `aggregate-attachment-review`) seguirem compilando sem edição. Ela
serve rota que devolve dado do **próprio** usuário (hoje só `/me/whatsapp-phone*`), onde nenhuma
permissão do catálogo cobre todos os papéis que precisam chegar lá — motorista só tem
`trip.read`/`trip.report`, contratante só `deliveries.track`/`charges.decide`. A membership ativa já
é exigida pelo `tenant-context` antes da política ser lida; aqui só se recusa o **escopo de
plataforma**. `assertMembershipRoutesUnderMe` (`router.service.ts`) é a trava: toda rota passa por
`createRouter`, e qualquer rota com essa política fora do prefixo `/me/` **derruba o boot** — não é
uma permissão que alguém esqueceu de checar, é um caminho que não existe para nascer fora dali.

**Rotas do módulo**, todas com `cache-control: no-store`:

- `GET /me/whatsapp-phone` — estado do vínculo (`none|pending|verified|expired`), número mascarado,
  pedido pendente **sem** o código (`MembershipAuthorizationPolicy`).
- `POST /me/whatsapp-phone/verification` — abre pedido de verificação, autenticado; responde **201**
  `{code, companyNumber, expiresAt}`; canal ausente, desativado ou sem número → **409
  `WHATSAPP_CHANNEL_NUMBER_MISSING`**, sem abrir pedido; rate limit de 5 pedidos por 10 min
  (`MembershipAuthorizationPolicy`).
- `DELETE /me/whatsapp-phone` — desvincula o próprio número, 204 idempotente
  (`MembershipAuthorizationPolicy`).
- `DELETE /company-users/:id/whatsapp-phone` — administrador desvincula o número de outra pessoa da
  empresa (`users.manage`).
- `POST /whatsapp-command-requests/:id/settlement` — a procuração da liquidação (ADR-0064): token de
  máquina, papel `automation`, permissão `whatsapp.settle`.

A confirmação do número (a mensagem que chega com o código) é **pré-passo do despachante**, não
`FlowAction` — ela roda antes de existir ator, então não há como registrá-la como ação autorizada.

## A planta sai do event loop — spec 145 e ADR-0063

**O empacotador é computação pura custosa.** `resolveCargoLayout(...)` com 51 paradas e 993 caixas
mede **16,9 s de CPU em 18 s de parede**, o suficiente para bloquear o event loop e derrubar rotas
vizinhas em 503 (incidente medido 2026-09-10, viagem `5715dd82`). Não é possível otimizar dentro
do `packSlice` sem perder qualidade — a grade de busca é o que o torna exato —, e guardar a planta
significa o SQL cria `trip_cargo_layouts` com ciclo de vida próprio.

**A decisão é ADR-0063, estendendo ADR-0044 §7:** a planta é calculada no worker, nunca na API
síncrona. A API enfileira por hash e lê quando pronto. Hash é `sha256(canonicalJson({
policyVersion, capacityM3, bed{l,w,h,source}, loadingAccess, securesCargo, payloadRatio,
fallbackBoxVolumeM3, measuredShapes, stops[ordered by sequence]{ sequence, boxes[]{ documentId,
dims, qty, measured } } }))` — estável sob rótulo/clientName/noteNumbers, muda com reorder/troca
de caixa/troca de baú/`loadingAccess`/`securesCargo`/`policyVersion`.

**Gatilho eager (D7).** Use cases que tocam parada ou caixa (`trip.use-case.ts:create`,
`linkDocument`/`releaseDocument`/`linkDocumentsBatch`, `reorder-trip-stops`, `override-delivery-address`,
`reconcile-trip-stops`) chamam `requestCargoLayoutForTrip(transaction, { companyId, tripId })` como
último passo, enfileirando `'queued'` na tabela com evento de outbox — transação única, no-op
idempotente se o registro já existe com mesmo hash e status `queued`/`running`/`ready`.

**Gatilho lazy (D10).** `readTripDetail` recalcula o hash com dado já carregado (é barato — está em
memória) e compara com guardado. Não bate (mudança de baú, `loadingAccess`, ou `company_cargo_settings`
novo)? Enfileira em transação curta separada, idempotente por hash, sem que a leitura fique mais lenta.
A leitura mesmo com `ready` + hash igual devolve a planta guardada.

**Worker (T7–T9).** Consumidor `CargoLayoutConsumer` (prefetch 1) reclama pedidos por hash
(`UPDATE ... SET status='running' WHERE status='queued' AND input_hash=$hash`); nula ou hash superado
→ ack sem calcular. Executa `@adatechnology/cargo-placement` em `new Worker()` de thread com orçamento
de tempo: tentativa N = base × 2^(N−1), padrão 60 s → 120 s → 240 s nos três retries da topologia
(retry 30 s). Vencido o prazo: caixas ainda não visitadas voltam em `unplaced` com `reason:
'time_budget'`; na última tentativa, grava `ready` com essas caixas em `unplaced`. Exceção ou thread
morta vira `failed`. Sem capacidade (D15) vira `failed` com código `CARGO_LAYOUT_UNAVAILABLE`, ack
(não retry).

**Lease (D14).** O claim também aceita `running` com `updated_at` mais velho que lease ≈ 280 s
(maior orçamento + 10 s margem + 30 s folga). Worker parado? Linha fica presa, até que o gatilho lazy
da API a reabre e o próximo claim a reclama. Falha de escrita depois da reivindicação → `release` +
`retry`.

**Reuso entre prévia e viagem (D3).** Prévia é um pedido sem `trip_id`. Viagem criada com mesmo hash
reutiliza a planta já calculada, sem novo cálculo — duas entidades (`CargoLayoutInput` do retrato,
`StoredCargoLayoutInput` guardado) e uma chave (`input_hash`).

**Schema:** tabela `trip_cargo_layouts` com `id uuid`, `company_id` FK, `trip_id` opcional FK
composta `(company_id, trip_id)`, `status` CHECK em `CARGO_LAYOUT_STATUSES = ['queued','running',
'ready','failed']` (sem pgEnum), `input_hash`, `policy_version`, `input jsonb` (retrato inteiro com
rótulo/clientName/noteNumbers para o worker empacotar sem reler), `layout jsonb` opcional, `error_code`,
`attempt`, `duration_ms`, `computed_at`, `created_at`, `updated_at`. Invariantes no banco: `layout_check`
(ready ⇔ layout not null), `error_code_check` (failed ⇔ error_code não vazio), `counters_check`
(attempt ≥ 0). `unique(company_id, input_hash)` (um cálculo por entrada por empresa), índice
`(company_id, trip_id)` para leitura de D10.

**Armadilhas.** O pacote `@adatechnology/cargo-placement` roda em link local (`:link`); publicação além
disso é fora desta spec (não é commit aqui). Campo novo na API sem atualizar `StoredCargoLayoutInput`
do worker vira `failed` no decode Zod (schema estrito da coluna `input`, teste de paridade
`cargo-layout-schema.contract.ts`). Lease padrão 280 s em construtores dos repositórios — mudança
exigiria audit de callers. Ausência de teste isolado do worker contra Postgres real para reivindicação
por lease (testado em contrato de composição com fake, não integração). Revalidação em massa quando
`policyVersion` muda não existe — cada viagem recalcula sob demanda (lazy).

**Frontend (D4, D12, D13).** `TripCargoLayers.component.tsx` mostra esqueleto do baú + layout anterior
como fantasma translúcido + selo "reorganizando a carga" enquanto `pending`, anima suavemente para
novo layout quando chega. Polling `GET /trips/cargo-layouts/:layoutId` enquanto `pending`, teto de 10
min (soma 60+120+240 s das escalas + 30 s por retry ×2, com folga), depois "não foi possível calcular
agora". Tipo `cargoLayoutState: { status, computedAt, errorCode, stale, truncated? }` opcional
(janela de deploy: front novo com API velha), ausência significa `unavailable`. Truncado é derivado na
leitura (T10) de `unplaced[].reason === 'time_budget'`, sem `truncated: true` gravado.

**A fila de revisão das notas que não couberam — spec 148 (T7).**

Depois que a montagem em parede (D1), reorganização (D4), passada final (D5) e escolha pelo vão (D6) tentam colocar as caixas, se alguma nota ainda tiver caixa sem lugar, a **nota inteira** sai da viagem (marcação `released_at`, nunca exclusão) e entra em `trip_document_reviews` com o motivo em `reason` (do `classify.ts`: `UNPLACED_REASONS`). A linha fica `pending` até resolução.

Tabela `trip_document_reviews`: `id uuid`, `company_id`, `nfe_document_id`, `source_trip_id`, `source_trip_document_id`, `reason varchar`, `layout_id`, `input_hash`, `status varchar` (`pending → moved|swapped_in|relinked`), `resolution_trip_id`, `resolution_trip_document_id`, `swapped_review_id`, `created_by`, `resolved_by`, `created_at`, `resolved_at`. Único parcial `(company_id, nfe_document_id) where status='pending'` — uma nota só tem uma entrada pendente; resolver já na mesma transação do linkage (D12, `closePendingReviewsOnLink`) fecha a entrada como `relinked`. A fila não trava CT-e autorizado (D13): viagens são independentes do documento fiscal.

Rotas sob `trip.manage`, todo request trava se viagem despachada:

- `POST /trips/:id/cargo-layouts/:layoutId/release-unplaced` — solta as notas de fora para a fila com o motivo, valida o `inputHash` contra a planta gravada (409 se divergir).
- `GET /trip-document-reviews?status=pending&tripId=` — lista da fila.
- `GET /trip-document-reviews/:id/swap-suggestions` — candidatas do caminhão com Δ% peso (NF-e) e de volume (caixas).
- `POST /trip-document-reviews/:id/move-preview {targetTripId}` → `{layoutId}` — simula mover para outro caminhão, retorna a planta do destino se aceita, 409 se não cabe ou destino despachado.
- `POST /trip-document-reviews/:id/move {targetTripId, validatedLayoutId}` — aplica a mudança, idempotente por corpo (mesmo corpo 200, outro corpo 409), vincula no destino e marca `moved`.
- `POST /trip-document-reviews/:id/swap {outTripDocumentId, validatedLayoutId}` — troca de lugar, a nota que sai volta à fila como `pending` em `swapped_out`.

Trilha em `audit_logs`: ator, nota, viagem de origem e destino. `CARGO_LAYOUT_POLICY_VERSION` '6'.

## Histórico fiscal de cada nota (spec 149, D13–D20)

`GET /v1/nfe-documents/:id/events` (permissão `invoices.read`): retorna cursorpage `{ data: [...], page: { nextCursor } }` (mesmo padrão de `GET /nfe-documents`) de eventos e mudanças de status com origem (`manual`|`automatic`), ator/solicitante (id + nome resolvido por membership), snapshot anterior/novo, protocolo, `cStat`, texto da CC-e, timestamps. Acesso 404 entre empresas. Ator removido (sem membership ativa) devolve `{ removed: true }` sem id/nome. Paginado por cursor `(registered_at, id)` com microssegundos, limite padrão 20, teto 100. Evento antigo (sem origem/ator/snapshot) aparece com "origem desconhecida" e "status anterior não registrado" — snapshots nunca são recalculados. Detalhe: spec 149 (D13–D20), `h1-parecer-architect.md` (§3 índice, §9 ator removido).

## O barracão sem configuração é o endereço da empresa (spec 097 D7, 2026-09-15)

Staging tinha `company_route_optimization_settings` vazia — nada grava essa tabela — e a montagem
avisava "nenhuma origem cadastrada" para empresa com endereço fiscal completo. `readDepot`
(`trips/infrastructure/route-depot.query.ts`) passou a resolver a origem por `resolveDepotOrigin`
(`trips/domain/depot-origin.policy.ts`): configuração vence; sem ela, a chave de parada do perfil
fiscal. A política de fim sem linha é `DEFAULT_ROUTE_END_POLICY` (padrão da coluna). ⚠️ A regra tem
cópia por valor no worker com contrato de paridade — mudou aqui, mude lá. A resposta de geometria
publica `depot.originSource`; a coordenada vem do `geocoding.backfill` do worker, então até ele
rodar a tela mostra `not_geocoded` com o texto próprio do endereço da empresa.

## Pedido de correção de endereço à contratante (spec 150, realiza a 084 T20)

**A correção é um pedido, nunca uma edição da nota.** Módulo novo `address-correction/`: tabela
`address_correction_requests` (aditiva, `company_id` + `contractor_id` FK composta, `address_key`,
`reported_*` copiado do relatório — nunca do cliente —, `proposed_*` do operador,
`reason_match_level`/`reason_distance_metres`, `status` `draft`·`sent` sem ENUM nativo, `thread_id`
opcional), com unique parcial `(company_id, address_key) where status = 'draft'`: um rascunho por
endereço, e salvar de novo faz `upsertDraft` (`on conflict … where status = 'draft'`) atualizar a
mesma linha — um pedido `sent` fica fora do alvo do conflito e o próximo `PUT` cria linha nova.
`nfe_addresses` e o XML fiscal permanecem intactos.

- **`PUT /address-correction-requests/:addressKey`** (`address-correction.routes.ts`, `settings.manage`,
  corpo `.strict()` — mandar `reported`/`reason*` é `400`, a fronteira só aceita `proposed`): o "como
  veio" e o motivo são sempre lidos do `AddressReportRepository.read({companyId})` já existente
  (reaproveitado, sem SQL nova), nunca do body. A contratante é resolvida pelo CNPJ do emitente
  daquela linha do relatório, dentro da `companyId` do token — sem cadastro, `404
ADDRESS_CORRECTION_CONTRACTOR_NOT_FOUND` (não `409`: é "procurei o cadastro pelo documento e ele não
  existe", o mesmo caso de `ContractorNotFoundError`, `409` fica para pré-condição de um recurso que o
  cliente já sabe que existe).
- **`GET /address-correction-requests`** devolve o estado por `addressKey` da empresa
  (`listByCompany`, novo método do port — nenhum método existente listava todo status sem filtrar por
  contratante).
- **`POST /address-correction-requests/mail`** (`202 { data: { threadId, messageId, sentRequestIds,
recipientCount } }`, `Idempotency-Key` obrigatório): body `{ contractorTaxId, contactIds[] (1..50),
requestIds? }` — sem `requestIds` é o envio **completo** (todos os rascunhos da contratante), com
  ids é o **unitário**; id de outra contratante ou já `sent` responde `409
ADDRESS_CORRECTION_REQUEST_NOT_SENDABLE`. `executeSend` roda inteira dentro de
  `unitOfWork.execute` — uma única transação Postgres, igual a `nfe-imports`, ao contrário do
  `test-email` que abre duas. Idempotência reaproveita a tabela genérica `idempotency_records`
  (mesma usada por `nfe-imports`/`freight-rules`/`cte-batches`/`company-settings`), com
  `pg_advisory_xact_lock` sobre `['address-correction-mail', companyId, idempotencyKey]`. Cada envio
  cria uma `contractor_mail_threads` **nova**, com `subject_id = threadId` (não há um segundo objeto
  de negócio natural para apontar, ao contrário do `setup_test`, que usa `subject_id = companyId`) —
  o CHECK de `subject_type` ganhou `address_correction`. `carrierName` vem de
  `company_fiscal_profiles.tradeName` (fallback `legalName`); sem perfil fiscal cadastrado sai `''`,
  leitura válida (mesma decisão do "perfil fiscal sem sequência de CT-e" acima). `operatorName` vem de
  `identityUserProfiles.name` join `userCompanyMemberships` ativo — sem perfil ativo, `''`.
- **Contatos ativos**: `ADDRESS_CORRECTION_NO_ACTIVE_CONTACT` (422) cobre `contactId` inexistente,
  inativo **ou de outra contratante** com a mesma resposta — por desenho, para não vazar a qual
  contratante um id pertence.
- **`recipientName` no relatório** (RF11): `drizzle-address-report.repository.ts` ganhou uma terceira
  junção (`recipientParticipant`, `left join` por `role = 'recipient'`, nunca `delivery` — o endereço
  físico pode vir do participante `delivery`, que não é quem a nota chama de destinatário), ainda numa
  consulta só. `null` quando a nota não tem linha `recipient`.
- **`buildAddressCorrectionMail`** (`address-correction/domain/address-correction-mail.template.ts`),
  função pura sem I/O: devolve `{ subject, html, text }` a partir dos mesmos dados, com `escapeHtml`
  próprio (nome/endereço vêm de XML de terceiro). Regra do motivo: `distanceMetres === null` →
  "endereço não localizado"; `< 1000` m → metros inteiros; `>= 1000` m → km com 1 casa.
- **CRUD de `contractor_contacts`** (`contractor-mail/…/contractor-contacts.routes.ts`, `GET`/`POST`
  `/contractors/:id/contacts`, `PATCH /contractors/:id/contacts/:contactId`, `settings.manage`,
  sem `DELETE` físico — desativar é `PATCH { status: 'inactive' }`, porque
  `contractor_mail_messages` referencia o contato): as três rotas resolvem a contratante primeiro por
  `getContractor.execute` — contratante de outra empresa é `404` antes de tocar em
  `contractor_contacts`. Fecha a spec 143 T013/T017.
- **`contractor_mail_messages.body_html`** (coluna nova, `text NULL`, CHECK `direction = 'outbound'`
  e teto 512 KiB) — decisão da T302 (parecer do architect, `plan.md` § E-mail): **um e-mail só**, com
  todos os contatos marcados no `to` (nunca um envio por contato), `Reply-To` da conversa. O HTML é
  **gravado pela API**, nunca montado no worker. `CONTRACTOR_MAIL_MAX_RECIPIENTS = 50`
  (`contractor-mail/domain/contractor-mail.constant.ts`) cobrado no Zod da rota (`contactIds.max(50)`)
  — o worker tem cópia por valor da mesma constante, com contrato de paridade (ver
  `docs/ai-context/worker-transportada.md`). A fila continua levando só `{ messageId }` —
  retrocompatível, mensagem antiga sem `body_html` sai só em texto.
- Nenhuma rota deste módulo aparece em documentação de OpenAPI/Scalar: não existe geração desse tipo
  neste repo (confirmado por busca) — nenhuma ação pendente aqui.
- Sem endereço, CEP ou e-mail em log, em nenhum dos módulos acima.

Detalhe completo (idempotência, `subject_id`, formato do endereço no e-mail, decisão de seleção
inicial de contatos): `specs/150-pedido-de-correcao-de-endereco/evidence.md` (T101–T305).

### Fase 4 — modelos de e-mail, liberação do envio e limitador (spec 150 T401–T406, RF13–RF19)

**A liberação do envio deixou de olhar `contractor_mail_settings.status`.** A revisão final achou que
o envio exigia `status = 'active'` e nada no sistema grava esse valor — todo envio era recusado. A
coluna nova `sending_verified_at timestamptz NULL` é gravada pela lista de verificação
(`runChecks`) quando `api_key` **e** `sender_domain` saem `ok`, e zerada quando a chave ou o
remetente mudam (`saveSettings`, comparando a chave selada anterior). A política pura
`resolveMailSendReadiness({ settings, template? })` (`contractor-mail/domain/mail-send-readiness.policy.ts`)
devolve `ready` ou o motivo (`not_configured` · `sending_not_verified` · `template_missing`,
`template` omitido = envio ainda não exige modelo). `status` da 143 continua existindo com o mesmo
significado de "ida e volta completa" e **não bloqueia mais** o envio.

**Modelos de e-mail** (`contractor_mail_templates`, aditiva): nome, assunto, abertura (`intro`), texto
de cada item (`item_text`, o único que aceita variável de item, repetido por endereço) e assinatura
(`closing`), único `(company_id, mail_type, lower(name))` entre os ativos, único parcial
`(company_id, mail_type) where is_default and status = 'active'` — a troca de padrão é atômica, sob
advisory lock de `(empresa, tipo)`. Arquivado nunca volta a ativo e nunca é padrão; nunca é apagado,
porque `contractor_mail_messages.template_id` aponta para ele. Catálogo de tipos e variáveis em
`contractor-mail/domain/mail-template-catalog.constant.ts` — hoje só `address_correction`, variáveis
do e-mail (`{contratante}`, `{quantidade}`, `{clientes}`, `{transportadora}`, `{operador}`) e de item
(`{cliente}`, `{endereco_como_veio}`, `{endereco_correto}`, `{motivo}`, `{cep_como_veio}`,
`{cep_correto}`, `{municipio}`, `{uf}`). `mail-template-render.policy.ts` valida (lista fechada,
variável de item fora de `item_text` é recusada) e renderiza com escape sempre aplicado depois da
substituição. Nenhum modelo nasce por migration ou seed (ADR-0021) — só quando o operador salva.
`POST /contractor-mail-templates/preview` renderiza sem gravar nem enviar. O envio usa o modelo
padrão ou `templateId?` do body; sem modelo ativo do tipo, `409 CONTRACTOR_MAIL_TEMPLATE_MISSING`;
`templateId` arquivado/de outro tipo/de outra empresa/inexistente, `409
CONTRACTOR_MAIL_TEMPLATE_NOT_USABLE` (resposta única, não revela qual dos quatro casos foi).

**Limitador de taxa** (RF18, M1 do `docs/SECURITY.md`, fechado pela T406): a API já tinha limitador em
memória por processo (`http/rate-limiter.service.ts`); a T406 estendeu esse caminho, sem criar um
paralelo. `rateLimit` de rota virou união discriminada — `{ store: 'memory', … }` (o de antes) ou
`{ store: 'postgres', scope, maxRequests, windowSeconds }`. Aplicado a
`POST /address-correction-requests/mail` e `POST /contractor-mail-settings/test-email`
(`CONTRACTOR_MAIL_RATE_LIMIT_SCOPE`, mesmo balde para as duas), no mesmo ponto de hoje — depois de
`authorize`, antes de `parse`/idempotência. `DrizzleRateLimiterRepository`
(`http/drizzle-rate-limiter.repository.ts`): um upsert em autocommit sobre `rate_limit_windows
(scope, subject_key, window_start, hits)`, `window_start` e "agora" pelo relógio do **banco**,
`Retry-After` arredondado para cima com piso 1. Fail-closed, sem `try/catch` — erro do limitador
propaga e vira 500. Chave `scope:companyId:userId`, nunca PII. Tetos por env
(`RATE_LIMIT_CONTRACTOR_MAIL_MAX`/`RATE_LIMIT_CONTRACTOR_MAIL_WINDOW_SECONDS`, padrão 20/h). Limpeza
pela rotina `rate-limit.window.purge` do **worker** (não o cron, que só publica a batida), corte em
janelas com mais de 48 h. Detalhe: `docs/SECURITY.md` § "envio de e-mail à contratante sem teto de
requisição (M1)".

Detalhe completo (contratos vermelho→verde, arquivos tocados, decisões de encaixe do `item_text` e
singular/plural de `{clientes}`): `specs/150-pedido-de-correcao-de-endereco/evidence.md` (T401–T406).

## Catálogo de praças e recarregamento (spec 154)

A aba de pedágio em Frota deixou de listar só as praças que a operação já cruzou (spec 095) e passou
a ler o **catálogo inteiro** com busca e paginação do servidor. O catálogo nasce da extração de um
`.pbf` (mesmo arquivo do OSRM, spec 090) e é recarregado pelo operador (permissão `settings.manage`)
quando um novo `.pbf` é processado — a recarga é idempotente e não apaga praça nenhuma.

**T101–T102: dados.** Migration aditiva `toll_booth_extracts` (chave natural `(dataset, observed_on)`):
quem subiu, quando, contagens, sha256, URI do objeto no bucket. As colunas `source_url`/`extracted_at`
(procedência do `.pbf`: URL e data do Geofabrik) existem no schema, mas **nenhum caminho de produção
as grava** ainda (T503, defeito 7) — `POST /v1/toll-booths/extracts` não as aceita, e nem a aplicação
nem a serialização da resposta as conhecem; reserva de esquema para o dia em que a rota passar a
aceitá-las. `toll_booths` continua sem `company_id` — catálogo é da instalação, uma transportadora por
deploy (ADR-0021). Duas colunas de ator (`uploaded_by_user_id` para a subida original,
`reloaded_by_user_id` para cada recarga) **sem FK** — `removeMembership` (spec 149) apaga o usuário
e uma FK `RESTRICT` travaria a remoção, `SET NULL`/`CASCADE` apagaria o ator histórico. Coluna
`missing_object_observed_at` observa quando um `head()` falha (objeto sumiu do bucket após a linha ser
gravada) — é **timestamp, de propósito nunca um booleano** (comentário do schema): um sinalizador
`true`/`false` mentiria para sempre, porque o `put` é `create-only` e a ressubida dos mesmos bytes
responde `replayed`, então o objeto pode voltar sem que ninguém intervenha para "desligar a flag". A
coluna registra a data da última observação, não um estado estável, e zera no primeiro `get()` que
funciona.

**T201–T204: catálogo em leitura.** `TollBoothCatalogPort.listCatalog` (novo repositório
`drizzle-toll-booth-catalog.repository.ts`) entrega o catálogo paginado com busca (`ilike` por nome
e operador), mostrando para a empresa do contexto o ajuste manual de cada praça (especialmente o
ajuste "órfão" — praça sem catálogo porque sumiu de um `.pbf` novo, marcada `catalogKnown: false`).
O valor efetivo (ajuste manual vence catálogo) sai da política `resolveEffectiveTollBoothCharge`
(spec 086), nunca do SQL. `GET /v1/toll-booths` (RF1, `fleet.read`) devolve o catálogo com resumo
(RF2): contagem total, data `observed_on`, estado `empty | stale | current` (da política
`resolveTollCatalogStatus`, reutilizada do mapa da viagem spec 090), e contagem de praças que
resolverão `null` em `chargePerAxle` após aplicar ajuste da empresa — essa contagem exigiu leitura
separada do catálogo inteiro (~600 linhas em staging), mapeada em memória contra os ajustes reais
(`countBoothsWithoutKnownAxleCharge` na policy), para respeitar RNF2 (nunca ler a tabela inteira no
`SELECT` paginado, só em agregados pontuais). T203 reaproveitou `listCatalog` com filtro
`seenFilter: 'only'` para alimentar a rota existente `GET /company-settings/toll-booth-charges` (spec
095), deixando-a intacta enquanto a fonte de dados mudou — as duas concordam praça a praça (contrato
novo de paridade). **Divergência registrada na T402 item 5:** `list-toll-booth-catalog.use-case.ts`
(226 linhas) passou de 200 — a ordenação pura (vistas sem tarifa primeiro, depois com tarifa) saiu
para `domain/toll-booth-catalog-entry.policy.ts` e a resolução de vistas (que chama portas) para
`application/list-toll-booth-catalog-seen-rows.service.ts`, deixando o use case com só orquestração.

**T301–T302: extrato e recarga.** `POST /v1/toll-booths/extracts?dataset=<dataset>&observedOn=<AAAA-MM-DD>`
(RF3b, `settings.manage`) recebe o JSON do extrator como corpo (array puro, sem envelope), valida
forma com Zod (todas as colunas obrigatórias, `osmNodeId` único, coordenadas na faixa de latitude/longitude,
dinheiro em padrão de quatro casas), calcula sha256 dos **bytes crus** (não do JSON reserializado, que
diverge por espaço/ordem), e sobe para o bucket em modo `create-only` — resubida de bytes idênticos
responde `replayed` (não é conflito), objeto diferente responde `objectConflict` (409 mapeado
`TollBoothExtractObjectConflictError`). Linha duplicada `(dataset, observedOn)` responde `409` da
chave natural. O objeto é gravado **antes** da linha, evitando estado órfão. `GET /v1/toll-booths/extracts`
(RF3, `settings.manage`) lista do mais novo para o mais antigo, com contagens de praças por tarifa e
quem/quando recarregou. `POST /v1/toll-booths/reload` (RF4, `settings.manage`) — _forma idempotente
de transação global mais interessante desta feature_ — roda com advisory lock sobre id constante
`TOLL_BOOTH_CATALOG_RELOAD_LOCK_ID = 14_154`, false responde `409 TOLL_BOOTH_CATALOG_RELOAD_IN_PROGRESS`;
lê a linha por `(dataset, observedOn)` ou 404, `head()` o objeto (ausente: marca
`missing_object_observed_at` fora da transação, responde 409) ou baixa cuidado com teto
(`contentLength` > `APPLICATION_MAX_REQUEST_BODY_SIZE_BYTES` = 1 MiB é 409 sem `get()`), valida
sha256 (divergente: 409 com log de dataset, data e dois hashes em texto — **sem revelar os bytes**),
reprocessa o JSON pelo mesmo Zod (nó repetido: 409 `TOLL_BOOTH_EXTRACT_INTEGRITY_MISMATCH`), executa
o seed existente (`createSeedTollBoothsUseCase`) **dentro da transação** (seed que antes recebia
repositório sem transação ganhou a transação no `TollBoothCatalogReloadPort.runExclusive`), grava
ator/data/contagens em `reloaded_*`, zera `missing_object_observed_at`, registra ação em `audit_logs`
com `action: 'toll_booth_catalog.reloaded'`. **Idempotência:** o upsert do seed ganhou `setWhere`
(nenhuma das sete colunas observáveis mudou desde a anterior) — rodar de novo com o mesmo extrato
deixa `toll_booths` idêntico, nem `updated_at` muda. Resposta `200 { data: { dataset, observedOn,
savedBoothCount, catalogBoothCount, boothsMissingFromExtract, reloadedAt, reloadedByUserId } }` —
`boothsMissingFromExtract` é o catálogo que ficou de fora deste extrato (praça que o banco conhece
mas o extrato novo não trouxe), a reação esperada é "escolher extrato maior ou trazer de arquivo
antigo se você quiser preenchê-la com tarifa manual".

**T303: interface no frontend.** A aba de pedágio (Frota) ganhou um segundo bloco abaixo da lista de
praças — seletor de extratos (lista do mais novo), botão "Recarregar catálogo", diálogo de
confirmação (informa "a recarga afeta o catálogo de todas as empresas desta instalação", mesmo deploy
= uma transportadora) e resultado (praças salvas, data do extrato recarregado, praças do catálogo que
ficaram de fora). Dois casos extremos:

- Catálogo vazio (nunca carregado): frase "nenhum extrato registrado ainda — não há o que recarregar".
- Catálogo populado mas sem extrato registrado (staging 15/09): frase com link ao runbook (caso de
  "manual para este ambiente, quero começar a usar pelo botão daqui para frente").

**T401: navegação de rota para ajuste.** Praça sem tarifa conhecida no extrato da viagem (RouteTollSummary)
ganhou botão `>` (ícone `edit`) que abre `/fleet?tollBoothSearch=<nome ou operador da praça>` — a aba
de pedágio (T204) já lê `initialSearch` e filtra o catálogo de primeira, deixando a praça pronta para
o operador ajustar valor e data. O botão só aparece com `settings.manage`. Sem nome nem operador (caso
raro), abre a aba mesmo assim só sem termo.

**T402: pendências e testes fracos corrigidos.** Seis itens:

1. Upload de extrato com `osmNodeId` repetido é rejeitado (antes passava no upload e só falhava na
   recarga com 500). `hasRepeatedOsmNodeId` virou `.refine()` do schema.
2. Coordenada fora da faixa (`±90` latitude, `±180` longitude) era rejeitada só no seed com 500.
   `coordinateSchema(bound)` virou `.refine()` do schema — upload e recarga agora recusam com 409
   (integridade, mesmo código do sha256 divergente).
3. Storage indisponível (`ObjectStorageError('OBJECT_STORAGE_UNAVAILABLE')`) respondia 500 genérico.
   Mapeado em `http/response.service.ts` para 503 `STORAGE_UNAVAILABLE` (nova constante em
   `HTTP_ERROR`), operando para todos os consumidores de storage (`nfe-imports`, billing, etc.).
4. Comentário desatualizado em `toll-booth-extract.schema.ts` sobre "API não ter auditoria" — corrigido
   (auditoria existe em `audit_logs`, consumida por `contractor-mail`).
5. Arquivos acima de 200 linhas: `list-toll-booth-catalog.use-case.ts` (ordenação pura extraída),
   `drizzle-toll-booth-catalog.repository.ts` (mapeamento extraído).
6. Contrato fraco em `toll-booth-charge-tab.contract.ts` (T303) verificava só "string existe no
   arquivo" — extraído `TollBoothCatalogReloadGate` componente próprio, novo contrato usa
   `renderToStaticMarkup` com i18n real (padrão de `route-toll-adjustment.contract.tsx` da T401).

Detalhe completo (vermelho→verde, contratos de repositório/use-case/HTTP, integração MinIO/Postgres,
decisão da contagem de praças sem tarifa estar vinculada à empresa): `specs/154-a-lista-de-pracas-e-a-data-do-catalogo/evidence.md`
(T001, T101–T102, T201–T204, T301–T303, T401, T402).

## Spec 164 — a tratativa da ocorrência (T27/T29, 22/09/2026)

**A prova do dinheiro ponta a ponta.** `test/integration/occurrence-charge.integration.ts` (T27) é o
único teste que exercita o fluxo inteiro contra Postgres real, sobre as mesmas linhas: acerto por
item (`DrizzleOccurrenceSettlementRepository.recordSettlement`) grava `trip_occurrence_item_settlements`
e, na mesma transação, cria a linha de `delivery_charges` (`origin: 'occurrence'`, `charge_type:
'returned_goods'`); regravar o mesmo acerto **converge** — mesma linha, valor atualizado, nunca uma
segunda (`count = 1` verificado por consulta); o lote (`extra_charge_batches`) fecha **pela seleção
explícita** (`chargeIds`), não por "tudo do período"; o demonstrativo é gerado no fechamento e servido
de volta byte a byte igual na leitura; e regravar o acerto depois que a cobrança virou `submitted`
(fechada no lote) é recusado com 409 `DELIVERY_CHARGE_TRANSITION_NOT_ALLOWED`, sem mudar o valor
gravado. Uma contagem de `billing_*`/`cte_*`/`nfse_*`/`fiscal_sequences` lida **antes do primeiro
passo e depois do último** prova que nenhuma dessas oito tabelas ganhou linha — é a mesma técnica de
`extra-charge-batch-statement.integration.ts` (T20), estendida ao caminho completo em vez de só ao
fechamento isolado.

**T29 — segurança e contexto.** Achado registrado em `docs/SECURITY.md` (22/09/2026): a superfície
externa nova do portal (segunda decisão do contratante, depois de `charges.decide`), as duas
permissões (`occurrences.decide` só em `contractor`; `occurrences.resolve` nunca em `separator`, por
causa da autoaprovação que a ADR-0067 já fechou), e o PDF do demonstrativo que vira cópia sem prazo de
descarte assim que alguém baixa — mesmo risco que já existe para `invoice-pdf.gateway.ts`, sem
controle novo. A retenção de cinco anos das fotos (spec 161 D9) ganhou o segundo motivo que a D15
previu: a foto é anexo de uma cobrança agora, então o prazo cobre os dois motivos ao mesmo tempo, sem
prazo próprio para a cobrança correndo em paralelo. `grep -rn "logger\.\|console\."` sobre os 77
arquivos que a spec tocou não bate em nenhum — nenhum caso de uso, rota ou repositório novo loga nota,
observação, nome de produto ou dado de motorista; o mesmo grep por `note|observ|driver|motorista|
product|payer` dentro de `message:` de erro de domínio também não bate — o que chega ao
`http_request_failed` é código e status, nunca o conteúdo.

`apps/api-transportada/CLAUDE.md` § "Ocorrência da nota — tratativa e cobrança (spec 164)" tem o
núcleo operacional (máquina de estados, os dois escritores, a fronteira de visibilidade do portal, o
discriminador da cobrança); este parágrafo é só o registro datado da prova e da revisão.

## A ocorrência tem duas conversas (spec 183, 24–25/09/2026)

O núcleo operacional está em `apps/api-transportada/CLAUDE.md`, na seção do mesmo nome. Aqui fica o
registro datado: o que se decidiu, o que se mediu e os defeitos achados no caminho.

- **Por que duas conversas, e não uma por canal.** A contratante escreve por e-mail, WhatsApp ou
  portal, e o motorista pelo app. O fio é **da parte**, não do canal: a operação responde no canal
  que quiser, e o selo de canal fica em cada mensagem. A unique de
  `(company_id, occurrence_kind, occurrence_id, participant)` garante uma conversa por parte.
- **O e-mail reaproveita a 143.** Thread por ocorrência, token de resposta no endereço e outbox. A
  mensagem da conversa só aponta para `contractor_mail_messages` (`mail_message_id`). A exceção à
  143 que o usuário autorizou (T702e) foi o **anexo no e-mail**.
- **Anexo pela URL assinada (T702a).** O arquivo nunca passa pela API na subida.
  - Na revisão (S1), o PUT tardio trocava o arquivo já conferido. Foi **medido contra o S3 local**:
    a integração falha sem a correção.
  - A correção copia os bytes conferidos para uma chave final nova e apaga a da subida.
  - O upload direto da spec 179 tem o mesmo padrão e ficou para tarefa própria.
- **DKIM decide a identidade (S2).** O worker já gravava o `dkim_result` desde a 143, mas a leitura
  casava o `From` com o cadastro só pelo texto. Qualquer um com o token de resposta aparecia como o
  contato, com o selo "aprova cobranças". Agora só `aligned` identifica.
- **A conversa do motorista (C1).** A tripulação troca até `route_planned` (spec 217) e, com a viagem
  na rua, pela transferência da spec 249 (`trip_drivers.position` muda de dono; a conversa é
  reapontada). Além disso, muda a **conta** por trás da ficha (`fleet_drivers.membership_id`).
  - Antes, a conversa ficava presa ao usuário do primeiro envio: o aviso ia à conta nova, que não
    via nada, e o co-motorista respondia numa conversa que não era dele.
  - Agora o envio da operação e a resposta do motorista principal assumem a conversa, e o resto
    recebe 409.
- **"Conversa aberta" (C2).** Nenhum código grava `closed`, e o `GET` do portal cria a conversa de
  toda ocorrência visível. Contar `status = 'open'` mandava quase todo WhatsApp da contratante para
  "não atribuída".
  - A correção usa a definição de aberta da T206: a tratativa não terminal.
  - Na atribuição automática, a conversa também precisa ter mensagem.
  - O fragmento que lê a tratativa mora em `trips`, porque o contrato D4 proíbe a conversa até de
    citar a tabela.
- **Corrida do primeiro e-mail (C3).** O advisory lock era por chave de idempotência. O aviso
  automático (T802) e um envio manual simultâneos criavam duas threads, e o segundo levava 23505,
  que virava 500 sem motivo.
  - Agora há um lock por ocorrência antes de procurar a thread.
  - O contrato do lock foi visto falhando.
  - A integração da corrida passa, mas **não reproduziu a corrida sem a correção**: o Postgres
    local serializa rápido demais. Isso foi registrado, não escondido.
- **Aviso automático (T802 e C4).** O gancho dispara depois do commit, em série. O lote do
  escritório (50 notas) disparava 50 transações contra um pool de 10.
- **Achados menores aceitos para depois** (o registro completo está na T903 do `evidence.md`):
  - desempenho: N+1 na lista do app (C7), corte de 1000 mensagens (C8), resumo que traz tudo (C9),
    índices (C16);
  - robustez: diagnóstico do gancho (C10), `new Error` cru (C11), S3 dentro da transação (C12),
    posição duplicada das respostas rápidas (C13), atualização perdida no contato (C14),
    fingerprint sem ator (C15).

## A leitura automática do canhoto (spec 220 + 222)

**Rota do robô: `PATCH /trips/:tripId/documents/:documentId/proof/review/automatic`.** O worker
chama com `client_credentials` do `config.mdfeAutoIssue` (Keycloak, compartilhado com MDF-e) +
`x-company-id` + os quatro campos de leitura (`readDocumentId`, `readNumber`, `readSeries`,
`readSource`). Schema próprio, `.strict()` — recusa `action`, veredito, empresa, qualquer campo que
não seja os quatro de leitura. **Nenhum deles é `optional()`** — com `exactOptionalPropertyTypes` um
campo ausente chega `undefined`, e `assertReadingIsConsistent` compara contra `null`: os quatro são
`nullable()` e obrigatórios, logo "não enviado" é 400.

**A decisão não sai do servidor.** `resolveAutomaticCanhotoReview` (220 RF26: código de barras que casa
aprova; o resto é `pending`, nunca recusa) fica na API, e o worker só reporta o que leu — é a premissa
que segura a 220 invariante mesmo com um canal novo. **Máquina nunca recusa.** Foto ilegível, código de
outra nota, código fora da viagem, código-malformado, tudo fica `pending` com a leitura gravada para o
operador revisar. A trilha fica em `audit_logs` com ação `trip.canhoto-review.automatic`, ator = usuário
do serviço (do token `client_credentials`), e sem nota nem PII — o Keycloak, em `audit_logs`, é o único
lugar onde a identidade do serviço aparece (ADR-0047 §6).

**Permissão: `trip.canhoto-auto-review`** — nova, só no papel `automation`, entra no catálogo de
`TRANSPORTADA_PERMISSIONS` e em `SERVICE_ONLY_PERMISSIONS` (lista que `isGrantablePermission` consulta
para recusar concessão por grupo ou avulsa). O robô não herda `trip.manage`: não separa, não carrega,
não cancela, não aprova nem recusa à mão. A rota de gente (`PATCH .../proof/review`, `trip.manage`)
continua aceitando `action: 'automatic'` (para o navegador não mudar), mas o canal que ela reporta é
`person`, então não grava trilha (o navegador já vem com pessoa logada).

**A rota de gente e a do robô são paralelas**, não cadeia. Tanto `status 200` (aprovado/recusado) como
`status 409` (já resolvido) devolvem a view final. Mas `409` **não** recusa aprovação humana por cima de
automática: quem olhou a foto manda mais que quem leu a barra. A policy não trata origem `automatic`
como veredito humano — ela se importa se há **veredito**, período. Então: veredito humano rejeitado →
`unchanged` (segunda rota não altera); veredito automático aprovado → segunda rota aprova e devolve 200.
Tela não chama isso de conflito (RF-A7). A idempotência é dupla: primeira rota por `(document_id, value)`,
segunda por veredito de fato (já gravado ≠ novo = `unchanged`).

**Lote em massa** (`GET /trips/:tripId/delivery-proofs`, RF-A1) retorna os comprovantes da viagem com
`documentId` por item, permissão `fleet.read` (mesma do comprovante de uma nota, 220 RF26), `trip.manage`
não é exigido. O diálogo do painel mostra as fotos e permite ao operador marcar e confirmar a aprovação
— **a tela não aprova o que não mostrou** (RF-A8). Item cuja foto não carregou nasce desmarcado; o lote
só envia os marcados.

Detalhe completo (rota, permissão, diálogo, testes/integração): spec 222 (seções de requisitos,
decisões, strategy de teste, evidence.md).

## O momento do evento do motorista (spec 234)

**`resolveOccurredAt` corrige a hora do evento e nunca o recusa.** `src/trips/domain/occurred-at.policy.ts`
devolve `corrected` (`tappedAt + clockOffsetMs`) ou `ignored` (`missing` quando falta um dos dois campos
ou algum não é finito; `future` acima de +2 min do recebimento; `too_old` com mais de 30 dias): relógio
ruim **descarta a correção** e o evento segue com `captured_at ?? recorded_at`. `resolveRecordedEventClock`
(mesmo arquivo) é quem decide o que gravar, e só grava a hora corrigida **com posição no relato** (D4b).
Os esquemas `.strict()` de `arrive`/`deliver`/`return`/ocorrência de parada (`me-trip.schema.ts`) e o
multipart do comprovante (`delivery-proof.schema.ts`) aceitam `tappedAt` e `clockOffsetMs` **opcionais** —
cliente antigo segue valendo, e `clockOffsetMs` é inteiro sem teto (o absurdo vira `ignored`, não `400`).
Migration `20261002213734_delivered_moment_clock`: `trip_stop_events.occurred_at` e
`trip_stop_events.clock_offset_ms` (`bigint`), `trip_delivery_proofs.clock_offset_ms` e o índice
`trip_stop_events_company_delivered_moment_idx`; todas nulas, sem backfill, gravadas **só** quando a
correção vale (`recordEvent` recebe `correctedClock`, campo à parte do `occurredAt` do escritório;
`saveProof` grava o desvio só quando a correção foi usada: flag efetiva e posição na entrega). **O momento da entrega tem uma expressão só,
`deliveredMomentSql` (`src/database/delivered-moment.support.ts`, `coalesce(occurred_at, captured_at,
recorded_at)`), usada SÓ na nota (`fleet/infrastructure/drizzle-driver-score.repository.ts`), em
`findDeliveryContext` (`drizzle-delivery-proof.repository.ts`) e em `listPendingProofs`
(`drizzle-current-driver-trip.repository.ts`) — e pelo índice, que precisa da mesma expressão. As outras
seis consultas continuam em `captured_at ?? recorded_at` (fora de escopo).** A política de pontualidade
(`trips/domain/delivery-proof-punctuality.policy.ts`) recebe `hasCorrectedClock`, que nasce de
`resolveOccurredAt(...).kind === 'corrected'` em `attach-delivery-proof.use-case.ts` (nunca de "o campo
veio"; R1: com posição na entrega só vale se `findDeliveryContext.isEventClockCorrected`, senão `deliveredAt` é hora crua): com a flag e posição na entrega, a foto é julgada pela hora corrigida sem o piso de
`recebimento − missingAfterHours` (D4); sem posição na entrega a flag é ignorada, vale o recebimento e a
entrega conta como longe (D4b). **GPS desligado pune em todo cliente (D4c, T1.8):** sem posição na
entrega, a entrega **do app do motorista** conta como longe com ou sem o desvio — `findDeliveryContext` lê
`trip_stop_events.channel` e devolve `isDeliveryRecordedByDriver` (`DRIVER_FIELD_CHANNELS` = só
`driver_app`, em `trips/domain/trip-field-channel.constant.ts`); a baixa do escritório (`office`, spec 223)
e a entrega pelo WhatsApp (com ponto quando o motorista compartilha a localização; decisão pendente do
usuário — o ponto do WhatsApp pode ser pino de mapa, ver ADR-0081 §3.1) nunca têm posição e **não** são punidas por isso (a referência de tempo sem posição
segue o recebimento quando o relógio é alegado). Sem o canal no contexto, vale a regra anterior (só a D4b
pune). A pontualidade é gravada no anexo e a nota só lê `trip_delivery_proofs.punctuality` — nada já
gravado é reclassificado; só a foto anexada depois da publicação (inclusive a substituta de entrega
antiga, pela fusão pior-de-duas) sente a regra. O prazo de "foto ausente" (`fleet/domain/driver-score.policy.ts`) conta
de `max(momento da entrega, deliveryReceivedAt)`, e `deliveryReceivedAt` é `trip_stop_events.recorded_at`
(D5). Limite antifraude e achado do `location.capturedAt` sem teto: `docs/SECURITY.md`, entrada de
2026-10-03. Spec: `specs/234-a-nota-mede-o-momento-do-evento-nao-a-chegada/`.

## Planejamento de viagem com rota escolhida e redação monetária por permissão (spec 153)

### Rota gravada no planejamento, não descartada após criação (spec 153 Fase 1–2)

**O seam de assinatura e critério** (`trips/domain/route-choice.policy.ts`): quatro critérios
(`ROUTE_CHOICE_CRITERIA = 'cheapest' | 'fastest' | 'no_toll' | 'alternative'`); assinatura é sha256
de `nodeIdsByLeg` truncado nos 32 primeiros hex (16 bytes) — assina os nós **por perna**, não a lista
achatada (`nodeIds`), para evitar colisão entre rotas que diferem só em onde a parada cai;
`selectRouteOption({ options, choice })` elege a opção cuja assinatura bate o pedido, ou cai para o
critério quando não encontra ou quando o critério tem de escolher entre várias. `reproduced` (que
`freezeTripPlannedRoute` grava como `choiceReproduced`) é `true` quando a eleição bate o que foi
pedido, `false` quando caiu para o critério ou a assinatura não foi encontrada. Pedido sem assinatura
que o critério atende é `true` — todo congelamento sem seletor manual (recálculo de rota no
reordenar/vincular) e sem assinatura é uma escolha bem-sucedida do critério padrão, não uma falha.

**Seam de distância e volta** (`trips/domain/planned-road-distance.policy.ts`): `summarizeRoadDistance`
lê pernas da rota (`legs: RoadLeg[]`, que é traçado com nós) e quantos trechos do fim são a volta ao
depot (`trailingLegs: number`, como `route-depot.policy.ts` já os conta), devolve
`{ distanceMeters, durationSeconds, returnDistanceMeters }`. Sem perna nenhuma (`legs.length === 0`)
o resumo é todo `null` — nunca zero, porque a conta de combustível não pode fingir que a viagem não
consome. `end_policy: 'last_stop'` = volta `0` (já vem como `trailingLegs: 0`).

**Gateway com `exclude=toll` em paralelo** (`infrastructure/osrm-route-geometry.gateway.ts`,
`application/route-geometry-toll-free-candidates.service.ts`): `readRouteGeometry` ganha flag
`options?: { excludeToll?: boolean }` na porta; o chamador (`read-route-geometry.use-case.ts`) dispara
as duas chamadas em paralelo com `Promise.allSettled` (isola falha de uma), deduplica por assinatura
(assinatura nula nunca deduplica), marca `isNoToll` em cada candidata. `readRouteGeometryTollFreeCandidates`
aplica a dedupe pura — o use-case a usa para montar `options[]` no retorno.

**Congelamento numa escrita só, não numa transação com a mudança de parada**
(`application/freeze-trip-planned-route.use-case.ts`,
`infrastructure/drizzle-trip-planned-route.repository.ts`): `WritePlannedRouteInput` recebe rota
(`FrozenPlannedRoute | null`) e pedágio (`TollRouteCost | null`); `writePlannedRoute` faz um `UPDATE`
só, com `plannedRoute`/`plannedDistanceMeters`/`plannedReturnDistanceMeters`/`plannedDurationSeconds`/
`plannedRouteFrozenAt` (`null` em bloco quando a rota é nula — D5) e `plannedToll`/
`plannedTollFrozenAt` (`null` em bloco quando o pedágio é nulo) lado a lado. **As duas datas de
congelamento são colunas separadas**, cada uma sob seu próprio CHECK (`trips_planned_route_check`
força as quatro colunas da rota a nascerem e morrerem juntas com `planned_route_frozen_at`;
`trips_planned_toll_check`, de sempre — spec 090 —, faz o mesmo para `planned_toll` com
`planned_toll_frozen_at`). ⚠️ **O congelamento não roda dentro da transação que muda a parada.**
Reordenar (`reorder-trip-stops.use-case.ts`), vincular (`link-trip-documents-batch.use-case.ts`) e
vincular/desvincular no detalhe (`trip.use-case.ts`, `freezeRouteGracefully`) chamam o freezer
**depois** da escrita principal ter commitado, com `try/catch` que nunca a desfaz — "o vínculo já
está gravado; o pedágio congela no próximo replanejamento" é o comentário no próprio código. A fila
de revisão (`drizzle-trip-document-review.repository.ts`, `freezeRoutesGracefully`) segue o mesmo
padrão para origem e destino, em paralelo, cada tentativa isolada por `try/catch`.

**Redação monetária por permissão** (`shared/monetary-redaction.service.ts`):
`redactRouteGeometryMoney({ canReadFinancials, view })` devolve a view sem alteração quando
`canReadFinancials`, e senão omite os campos monetários — `fuelTotal`/`totalCost` de cada opção,
`chargePerAxle`/`total` do pedágio (do topo e de cada opção) e as parcelas por praça de cada
`TollBoothRouteLine` (`chargeCar`, `chargePerAxle`, `chargePerAxleAutomatic`,
`effectiveChargePerAxle`, `total`) — nunca `null` nem zero no lugar, para o TypeScript recusar quem
ler o campo sem checar a ausência primeiro.
`redactNfeDocumentMoney`/`redactTripDocumentMoney`, no mesmo arquivo, fazem o mesmo para NF-e e para
o total da viagem; a fila de revisão usa a mesma redação.

### Fluxo de atualização de rota (spec 153 Fase 2, T205–T206)

`POST /trips/:id/plan-route` (RF3): `{ routeChoice?: { criterion, signature } }` opcional; tira a
rota anterior (coloca `null`), recalcula com OSRM (D6), aplica a escolha ou o padrão `cheapest`,
congela. Toda mudança de parada antes do despacho recalcula: `linkDocument`, `unlinkDocument`
(`releaseLiveLink`, que chama `reconcileStopOnUnlink` dentro da transação da liberação) e
`reorderTripStops` (T205) disparam o freezer graciosamente **depois** de gravar a mudança — nunca na
mesma transação, para uma falha do roteirizador não desfazer o vínculo ou a reordenação. Fila de
revisão (`move`/`swap`) funciona por vinculação/desvinculação das duas viagens (origem e destino);
ambas recalculam, em paralelo e cada uma isolada, antes do despacho (T206, RF12).

## Spec 232 — o custo da viagem desce para a nota, por distância e tempo

`GET /trips/:id/valuation` devolve, em cada item de `revenueLines`, oito campos além do frete
(`amount`): `costAmount`, `legCostAmount`, `tripShareCostAmount`, `taxAmount`, `marginAmount`,
`marginPercentage`, `costBasis` e `timeBasis`. **Nada é persistido** — o número é derivado na leitura
sobre a avaliação que já existia, e o `totalCost` da viagem **não se move**: ele só se reparte.

A regra vive em `trips/domain/document-cost-apportionment.policy.ts`, função pura. Quatro coisas dela
que não se adivinham lendo o código rápido:

1. **A classificação das nove parcelas é tabela exaustiva** (`COST_KIND_APPORTIONMENT`, tipada
   `Record<TripCostKind, …>`), sem `default`. Estrada (`fuel`, `other_per_kilometer`, `toll`,
   `delivery_charges`) reparte por **distância**; `driver` e `helper` por **tempo**; `icms` e
   `pis_cofins` acompanham o **frete da própria nota**; `manual` é **rateio de viagem**, porque
   `trip_cost_entries` tem só `trip_id` — não existe vínculo com parada nem nota a que amarrá-lo.
   ⚠️ `delivery_charges` tem `trip_document_id` e **daria** para atribuir exato; vai por distância por
   decisão de produto, registrada no D1 da spec.
2. **A invariante inclui imposto**: `Σ (costAmount + taxAmount) == totalCost`. O `buildTripValuation`
   final recebe `[...buildCostParcels(context), ...taxParcels]`, então o `totalCost` **já** o contém,
   ainda que a tela separe as naturezas. Afirmar `Σ costAmount == totalCost` deixaria a conta fora por
   todo o imposto, sem nada falhar.
3. **A soma fecha por construção, não por tolerância**: toda divisão acontece em dois níveis — o balde
   entre os trechos (e, no tempo, também entre as paradas), e cada trecho entre as notas a bordo —, com
   piso e o resto inteiro para o de maior peso, desempate determinístico. Dinheiro é `bigint` escalado.
4. **A espera na parada não é `departed − arrived`.** O `departed` da ADR-0088 é a saída **em direção**
   à parada, com o `stopId` do destino: na mesma parada ele vem **antes** do `arrived`, e essa conta
   sairia negativa. A espera vai da chegada até o que vier **primeiro** entre o `departed` de outra
   parada e a chegada/entrega em outra parada (`trips/domain/stop-dwell.policy.ts`), e
   `departure_cancelled` desfaz o `departed` anterior da mesma parada. Só é `measured` com os dois
   extremos do `driver_app` no **mesmo relógio** (aparelho ou servidor) — senão `proxy`. O `proxy` da
   **última** parada não rebaixa a viagem para `partial` (depois dela não existe saída); o de uma parada do
   meio rebaixa.

`trips/domain/apportionment-route-legs.policy.ts` normaliza `planned_route.legs`: tira o retorno (ele já
vem em `planned_return_distance_meters` e entraria duas vezes) e, **sem barracão**, põe um trecho vazio
na frente, porque o caminhão começa na primeira parada e nenhum trecho a alcança. Sem roteiro utilizável
— ou com contagem de trechos que não casa com as paradas — a nota sai `costBasis: 'unavailable'` com os
valores **nulos**, nunca zero.

A leitura dos fatos custa **uma** consulta nova (`readStopDwells`, dentro do `Promise.all` que já
existia): paradas e eventos da viagem inteira de uma vez. O teste de integração conta os `select` com um
`Proxy` e **exige igualdade** entre viagem de 1 parada/1 nota e de 3 paradas/5 notas.

⚠️ A prévia (`POST /trips/valuation-preview`) e a sugestão multi-veículo passam pelo mesmo
`buildValuationFromContext` **sem** trechos e paradas: as linhas delas saem `unavailable`, com
`taxAmount` calculado. É por isso que os oito campos são **opcionais** na resposta.

- **`hasStop`** (T3.4, RF7) em cada `revenueLines[]`: `true` se a nota desce numa parada, `false` se
  `trip_documents.stop_id` é nulo. Vem do dado real (`attachDocumentCostFigures`/`toStopFlag`); contexto
  que não informou `stopId` (undefined) **não** manda o campo — nunca um `false` inventado. Não é dinheiro,
  mas segue a rota de `trip.financials`. Aditivo: o painel antigo o ignora.

## Spec 233 — a nota se abre inteira (o que a API devolveu ao painel)

Três leituras ganharam campo ou filtro, todas aditivas:

- **`GET /trips/:id/timeline?documentId=<uuid>`** filtra a linha do tempo **no servidor** pela nota
  (`trip-timeline.schema.ts`; `documentId` que não é UUID dá 400, e a chave entra em `ALLOWED_KEYS`).
  Mantém a permissão de leitura de localização do evento (`trip.event-location`) e o isolamento por
  empresa. O teto de `limit` é o da rota (1..200, padrão 100), não o de `readPaging`.
- **`volumeCount`** em cada nota do detalhe da viagem (`serializeTripDocumentDetail`), por uma consulta
  só para a viagem inteira (`trip-document-volume.query.ts`) — sem N+1, com contrato de tenant.
- **`proofRadiusMeters`** (metros, opcional) em cada item de `GET /trips/:id/delivery-proofs`. É o raio
  **da empresa** (`company_delivery_proof_settings`, ou 300 m de fábrica), a mesma fonte que o juiz da
  captura usa — **não** por contratante. A premissa da D6 ("resolvido por contratante, como a 218") não
  se sustentou: a 218 só resolve por contratante os modos dos campos, e a tabela de exceção não tem a
  coluna do raio (ADR-0070: a regra é da empresa). Raio por contratante exigiria migration. A rota segue
  em `fleet.read`; o leitor **não** precisa de `settings.manage`. Sem número finito e positivo o campo
  **não vai** (nunca zero), e viagem sem comprovante devolve `[]` sem consultar a configuração.

⚠️ Campo novo no comprovante só pode ir para staging **depois** de o painel aceitá-lo: o validador do
painel descarta o item inteiro que traga chave desconhecida (ver `frontend-transportada.md`, § "A nota
se abre inteira"). O rateio de custo da 232 está acima, em "Spec 232".

## Spec 228 — a foto do canhoto e o endereço corrigido viram evento da linha do tempo

Dois `kind`s novos em `GET /trips/:id/timeline`, ambos **derivados na leitura** — sem tabela, coluna nem
migration. Estão em `TRIP_TIMELINE_KINDS`; o painel recebe a cópia na mesma lista (ver `frontend-transportada.md`).

| `kind`                   | Fonte                                                   | Prioridade |
| ------------------------ | ------------------------------------------------------- | ---------- |
| `document.canhoto_photo` | `trip-timeline-proof.query.ts` (`trip_delivery_proofs`) | 3          |
| `stop.address_corrected` | `trip-timeline-address.query.ts` (duas trilhas, abaixo) | 2          |

Nenhuma prioridade existente foi renumerada: o cursor compara a prioridade como `::int`.

**Foto (`trip-timeline-proof.query.ts`).**

- Só `kind = 'photo'` (literal na consulta), ligada à nota pela baixa (`stop_event_id`) e filtrada com
  `documentStopScope`.
- O instante é `coalesce(captured_at, created_at)`, **uma só expressão** (`PHOTO_INSTANT`) no filtro, na
  ordem e na chave em texto: se divergirem, a página seguinte pula ou repete.
- Prioridade 3, logo abaixo da baixa (4): foto e baixa saem da mesma transação e empatam no instante.
- Lê posição do comprovante, então está na lista fechada `EVENT_LOCATION_READERS`
  (`event-location-readers.constant.ts`); sem `trip.event-location` a rota devolve `location = null`.
- O corpo não leva nome de quem recebeu nem referência de objeto.

**Endereço (`trip-timeline-address.query.ts`).**

- **Uma consulta só** (`union all`) sobre as duas trilhas de correção humana:
  `geocoded_address_corrections` (origens `contractor`, `driver`, `operator`) e
  `geocoding_refinement_requests` com `outcome = 'refined'` (origem `refinement`). O `Promise.all` da linha do
  tempo já abre nove consultas e o pool é de 10 (`DATABASE_POOL_MAX`); uma consulta por trilha o esgotaria.
- O evento é da **parada**: pertence a ela a correção da mesma empresa e da mesma `address_key`, com
  `created_at >= trip_stops.created_at`. Um `distinct on (changes.id)` num subselect, com a menor `sequence`,
  evita repetir a mesma correção em duas paradas de mesmo endereço.
- O refino **não tem ponto guardado**: `location = null` e sem deslocamento. Não há `join` com
  `geocoded_addresses` (tabela global, o ponto vivo pode ser de outra empresa).
- Nunca saem `reason`, `requestedBy` nem `address_key`. Só origem, deslocamento (`addressChange`, só neste
  `kind`) e o ponto novo.
- Com `documentId`, entra só a parada da nota; nota sem parada não gera evento de endereço.

**Falha de fonte.** Erro de qualquer das duas **propaga** (sem `catch`, sem `allSettled`): o `nextCursor` sai
do último item da página mesclada, e omitir uma fonte faria o cursor pular itens sem aviso.

⚠️ **Limite conhecido.** A distância de cada evento é medida contra o ponto **vivo** do endereço. Uma correção
de **outra empresa** muda essa distância sem gerar evento aqui, porque a geocodificação automática não deixa
rastro por empresa. Incluí-la exigiria migration e foi recusada (spec 228, N1: "Só correção humana").

## Spec 235 — O ajudante é um perfil

**Arquivos-chave:** reconciliação em `identity/domain/fleet-role-reconciliation.policy.ts`, erros em
`fleet.error.ts` e `trip.error.ts`, permissão em `identity/domain/authorization.policy.ts`, constante
`fleet-linked-roles.constant.ts`, política de viagem em `trips/domain/trip.policy.ts`.

Ajudante (perfil `helper`) é papel em Acesso e terceira opção no cadastro de frota. Duas colunas
(`can_drive`, `can_act_as_helper` — a segunda já existia) carregam a capacidade; papel e colunas são
reconciliados na transação de troca de papéis (só se a troca toca `driver`/`aggregate`/`helper`). A
viagem e a proposta recusam quem não dirige (`409 TRIP_DRIVER_CANNOT_DRIVE`); MDF-e avulso aplica a
mesma regra. Permissão `trip.read` — sem `trip.report`. Limite: atribuição em lote e papéis de grupo
não reconciliam. Ver ADR-0093.

## Spec 196 — todo toque do motorista carimba onde aconteceu (ADR-0081)

- **Cinco tabelas, um molde.** `event-location.schema.ts` dá a cada uma `latitude`, `longitude`,
  `accuracy_meters`, `captured_at` e `location_state`, com CHECKs (par latitude/longitude, faixa, estado
  `captured` ⇔ ponto, canal que pode gravar coordenada) e o índice parcial do expurgo
  (`<tabela>_located_<coluna_de_tempo>_idx ... where latitude is not null`). `trip_stop_events` e
  `trip_delivery_proofs` já tinham o ponto (ADR-0045/0070); `trip_status_events`, `trip_stop_occurrences` e
  `trip_document_occurrences` ganharam na migration `20261002153258_occurrence_location_stamp`.
- **O canal `whatsapp` carrega ponto** pela migration corretiva aditiva
  `20261003010806_event_location_whatsapp_coordinate` (a anterior já estava em `origin/staging`, então não foi
  editada). É a ação que decide: o WhatsApp do operador e o despacho automático gravam `null`.
- **Uma política só** (`event-location-stamp.policy.ts`: `resolveEventLocationStamp`,
  `NO_EVENT_LOCATION_STAMP`; `event-location-state.policy.ts`). As rotas de toque do motorista aceitam `location`
  opcional; um contrato (`test/trip-http`) reprova rota `POST` nova do motorista sem ele.
- **Leitura.** `GET /trips/:id/timeline` devolve `location` (só com `trip.event-location`) e `locationState`
  nas **três** consultas (parada, status, documento) e na do comprovante; as demais respostas não carregam
  posição. `event-location-readers.constant.ts` é a lista fechada de leitores por coluna, e
  `EVENT_LOCATION_FORBIDDEN_RESPONSES` nomeia as respostas que nunca podem (portal, tratativa, demonstrativo,
  acerto, reentrega, lote do escritório, anexo, prontidão do despacho).
- **WhatsApp.** A mensagem de localização vira ponto (`shared-location`), mas os pacotes `meta-whatsapp-*`
  `0.6.0`/`0.7.0` entregam `messages[].location` ao gancho: ponta a ponta provado em
  `whatsapp-driver-flow-actions.integration.ts`. **T3.8 (feita):** o bot **pede** a geolocalização no fluxo do motorista
  (decisão do usuário, 2026-10-03) por **texto** — o `.d.ts` dos pacotes `0.7.0` não expõe `location_request_message`;
  só `sendLocation` (envio). `DRIVER_LOCATION_REQUEST_TEXT` (`whatsapp-driver-flow.constant.ts`) entra na `question`
  dos nós `driver_trip_menu`, `driver_return_reason_menu` e `driver_note_entry`; nenhum nó do operador. Sem coordenada
  nem dado pessoal no texto. ⚠️ Vale só após `whatsapp-flow-publish --company <id> --confirm` (ação do usuário). A relação do ponto declarado com a distância/pontualidade
  segue sem decisão.
- **N+1:** `test/integration/trip-timeline.integration.ts` conta as consultas de `listTripTimeline` com 1 nota e
  com 50 notas (todas com ponto): o número é o mesmo (9 em 2026-10-02).

## Spec 240 — as leituras publicam a correção e o cancelamento (RF9)

A spec 167 gravava correção (`trip_document_occurrence_corrections`) e cancelamento (três colunas de
`trip_document_occurrences`), mas só as **respostas das escritas** os devolviam. Agora as leituras
também: `GET /trip-occurrences/:id` e `GET /trips/:tripId/documents/:documentId/occurrences` trazem
`corrections` (`[]` sem correção, **mais antiga primeiro**) e `cancellation` (`null` ou
`{ cancelledAt, cancelledByName, reason }`); `GET /trip-occurrences` (feed) traz `cancellation`.
Mesmo formato da resposta das escritas, por construção: tudo lê por
`trips/infrastructure/occurrence-correction-read.query.ts` (`listOccurrenceCorrectionsByIds`,
`listOccurrenceCancellationsByIds`), em lote — uma consulta por página, agrupada em `Map`, `companyId`
do contexto. `readOccurrenceView` (a resposta das escritas) passou a usar o mesmo leitor.

- **A cancelada continua nas três listas**, marcada por `cancellation` preenchido; nenhuma consulta a
  filtra. Tirá-la das contas é decisão da 167 e não mudou aqui.
- Ocorrência de parada sai sempre com `cancellation: null` (a 167 não as cobre) e não consulta nada.
- Sem migration, sem rota nova, escritas intactas. Não há OpenAPI gerado nesta API (confirmado por busca neste repo):
  o contrato publicado é o dos tipos `TripOccurrenceFeedItem` / `TripOccurrenceDetail` e os testes
  `test/integration/trip-occurrence-correction-read.integration.ts` e
  `test/trip-http/occurrence-detail.contract.ts`.

## Spec 243 — O ajudante fecha as pontas: cobrança, diária geral e papel na resposta

**Arquivos-chave:** cobrança em `delivery-clients/presentation/delivery-charge.routes.ts`, resposta do motorista
em `trips/presentation/me-trip.routes.ts` e `find-current-driver-trip.use-case.ts`, serializador
em `trips/domain/trip-serializer.service.ts`, repositório em `drizzle-current-driver-trip.repository.ts`.
Testes: `test/delivery-clients/charge-read-policy.contract.ts` (cobrança, 9 papéis × 2 rotas),
`test/driver-trip/crew-role.contract.ts` (validação e papel), `test/integration/me-trip.integration.ts` (leitura).

Três decisões (ver ADR-0095): D1 — Cobrança muda de `trip.read` para `trip.financials` (`company-admin`,
`finance`, `operator` leem; `driver`, `aggregate`, `separator`, `helper` recebem `403`). Sem consumidor de
campo; fechado `docs/SECURITY.md` 2026-09-18. D2 — Painel tem diária geral do ajudante (painel separado da
configuração, permissão `fleet.read`/`fleet.manage` da API, não de settings). D3 — `/me/trips/current`
devolve `crewRole` por viagem (`'driver'` | `'helper'`, do `trip_drivers.role`); falta de campo lê como `driver`.

**Pegadinhas:** Cobrança pede `trip.financials` — papel novo exige atribuição manual; sem ele, acesso anterior
era por equívoco (`trip.read` no driver que ela nunca deveria ter). Diária geral vazia + ajudante sem diária
própria segue com a lacuna `HELPER_DAILY_RATE_MISSING`, agora com onde resolver (RF-2 da 149).

**As duas linhas do tempo (T3.2a).** `GET /trips/:id/timeline`: o item `document.occurrence` ganhou
`occurrence.cancellation` (`null` ou o mesmo `{ cancelledAt, cancelledByName, reason }`), lido por
`listOccurrenceCancellationsByIds` em **uma consulta por página** (`trip-timeline-document.query.ts`);
`stop.occurrence` sai sempre com `cancellation: null`. A linha do tempo da ocorrência
(`GET /trip-occurrences/:id/timeline`, spec 183) ganhou o evento `occurrence.cancelled`
(`reason`; ator `operation` com `cancelledByName`; data = `cancelledAt`; prioridade 5, por último no
mesmo instante), montado a partir do `cancellation` que o leitor do feed já traz — sem consulta nova.
Não é evento-chave. **Fecha `openUntil`** (decisão de 2026-10-03, T6.5): `resolveTimings`
(`occurrence-timeline.policy.ts`) toma o **mais cedo** entre o terminal da tratativa e o cancelamento da
ocorrência — a cancelada deixa de aparecer "em andamento" para sempre; `driverReleasedAt` segue só da
tratativa. Contrato `test/trip-occurrence/timeline.contract.ts` e integração
`trip-occurrence-correction-read.integration.ts`. O painel precisa conhecer o kind novo antes de a API ir
a produção (etapa 1 da ordem de publicação, `specs/240-…/evidence.md` T6.1).

**Política de reentrega no cadastro de tipos (spec 242, cumpre 164 RF1/T21).** `PUT`/`GET`
`/company-settings/occurrence-types` passam a ler e gravar `redeliveryPolicy` (`unset | allowed | blocked`).
Ausente no `PUT` não altera o valor guardado (o INSERT usa o padrão da coluna): `saveOccurrenceType` só
grava o campo quando vem, no molde de `attachmentMode`. Antes, o schema estrito recusava o campo que o
painel sempre manda (400) e o `GET` não o devolvia. Contrato `test/trip-occurrence/redelivery-policy-schema.contract.ts`
e integração `occurrence-type-redelivery-policy.integration.ts`.

## Spec 237 — o perfil de recebimento do contratante (ADR-0094, Fase 1)

`contractor_receiving_profiles` (módulo `src/cargo-receiving/`) guarda, por contratante, as regras do
recebimento **antes da viagem** como dado — janela de separação, prazo em dias úteis (lido pela 236),
prévia por planilha (aba e mapa **nome de coluna → campo**, nunca posição), o padrão que lê o `NroCarga`
do `infCpl` e os parâmetros do vínculo por conteúdo (`match_window_days`, `weight_tolerance_percent`).
FK composta `(company_id, contractor_id)` → `contractors`, unique por contratante. **Ausência é ausência**:
sem linha, ou com `is_enabled = false`, o contratante segue o fluxo de hoje.

- `GET /contractors/:id/receiving-profile` (`fleet.read`): `{ data: null }` sem perfil; 404
  `CONTRACTOR_NOT_FOUND` para contratante de outra empresa (consulta pela empresa do contexto).
- `PUT` (`settings.manage`): substitui o perfil **inteiro** e exige todas as chaves (`null` explícito) —
  chave omitida é 400, para um painel em cache não apagar coluna futura sem erro. Idempotente: trava o
  contratante (`for no key update`), compara a forma canônica (o `jsonb` não guarda ordem de chave) e só
  grava e audita (`audit_logs`, `contractor-receiving-profile.saved`) quando algo mudou.
- ~~`arrivalReferencePattern`~~ saiu na revisão de segurança S3 (2026-10-04): o filtro deixava passar
  padrões que retrocediam por segundos. Hoje é `arrivalReferenceLabel` — o **texto literal** que antecede o
  número da carga (1..60, sem controle, aparado; `arrival-reference-label.policy.ts`); a extração é a
  gramática fechada `literal + \s{0,5}([A-Za-z0-9]{1,30})` (`load-reference.policy.ts`). O `PUT` exige a
  chave nova e recusa a antiga; a coluna `arrival_reference_pattern` fica no banco, sem uso.
- `previewColumnMap`: chaves fechadas (`PREVIEW_ITEM_FIELDS`), coluna repetida comparada por
  `normalizePreviewColumnName` (o leitor da planilha usa a mesma); prévia ligada exige `routeName`,
  `value`, `weightKg` (Zod) e mapa não nulo (CHECK). O agregado `Contractor` não mudou.
- Contratos: `test/cargo-receiving*.contract.test.ts`; integração
  `test/integration/contractor-receiving-profile.integration.ts`.

### Fase 2 — a chegada e a primeira separação (T2.1–T2.3)

`cargo_arrivals`, `cargo_arrival_documents` e `cargo_arrival_events` (append-only por trigger). A nota
da chegada tem **eixo próprio** `expected → received → separated` (`cargo-arrival-transition.policy.ts`):
entra `expected`, uma etapa por vez, sem volta; repetir é no-op sem evento; chegada `closed` recusa tudo.
`trip_documents.separation_status`, o despacho e o roteirizador **não são tocados** — a nota entra na
viagem pelo fluxo de sempre, e a leitura da chegada só a marca `isInLiveTrip`.

- **Relógio copiado:** a chegada só nasce com o perfil ligado (`422 CARGO_RECEIVING_NOT_ENABLED`) e copia
  `separation_window_hours`/`delivery_deadline_business_days` naquele instante; `separation_due_at =
arrived_at + janela` em horas corridas, preso por CHECK exato
  (`extract(epoch from separation_due_at - arrived_at) = separation_window_hours * 3600`, e janela e prazo
  nulos **juntos**). ⚠️ Até `20261006144825_cargo_arrival_check_null_holes` (revisão das Fases 1–2, M1) três
  CHECKs viravam NULL com coluna nula e deixavam a linha passar: janela sem prazo, nota `separated` sem
  `separated_at` e evento de nota sem `from_state`/`to_state`. CHECK novo que compara coluna anulável
  exige `is not null` antes — `test/integration/cargo-arrival-null-checks.integration.ts`. Editar o
  perfil depois não muda chegada nenhuma. `isSeparationOverdue` é leitura (prazo passado e nota pendente).
- **Uma nota, uma chegada, para sempre** (`unique (company_id, nfe_document_id)`, ADR-0094 §6): nota
  posta por engano não tem conserto nesta fase. Candidata = emitente com o CNPJ do contratante
  (`nfe_participants` papel `emitter`, índice novo `(company_id, role, tax_id)`), `authorized`, sem
  `trip_documents` com `released_at is null`, sem chegada.
- **Rotas** (`fleet.read` lê, `trip.manage` escreve — o `separator` tem as duas; `trip.read` ficou de fora
  porque daria a motorista/ajudante/agregado as chegadas da empresa inteira):
  `GET /cargo-arrivals/available-documents?contractorId=` (cursor `issued_at desc, id desc`, `limit` ≤
  100), `POST /cargo-arrivals` (`Idempotency-Key` obrigatório; repetição com o mesmo pedido → **200** com
  a mesma chegada; mesma chave com outro pedido → `409 CARGO_ARRIVAL_KEY_REUSED`, pela
  `request_fingerprint`; `arrivedAt` > agora + 2 min → `422 CARGO_ARRIVAL_ARRIVED_AT_IN_FUTURE`; toda
  nota recusada volta junta em `422 CARGO_ARRIVAL_DOCUMENTS_REFUSED`, `details[{ field:
'documentIds.<i>', message: <motivo> }]`), `GET /cargo-arrivals` (filtros `contractorId`/`status` repetíveis,
  `sort`/`direction`, cursor — ver correções abaixo), `GET /cargo-arrivals/:id` (grupos rota × cidade, contagens, vencimento),
  `POST …/documents/:documentId/receive|separate` (`documentId` = id da NF-e), `POST
…/documents/batch-status` (≤ 300, resultado por nota `changed|unchanged|refused`), `POST
…/route-assignment` (`routeName` ≤ 40 ou `null`, tudo ou nada) e `POST …/close` (`409
CARGO_ARRIVAL_HAS_PENDING_DOCUMENTS` com a lista; fechar de novo é `unchanged`).
- **Concorrência:** o registro trava o contratante (`for no key update`) — só notas do emitente dele
  entram, então a trava serializa a disputa pela mesma nota e pela mesma chave; a chave é procurada
  **antes** das notas (na repetição elas já estão na chegada). Toda escrita de separação trava a chegada
  primeiro e as notas depois, em ordem de id. O lote é decidido em memória (`decideCargoArrivalBatch`) e
  gravado com um UPDATE e um INSERT — uma recusa nunca derruba as outras notas.
- **Trilha:** canal `backoffice` (ADR-0068 §3), ator, `occurred_at` (a chegada usa `arrived_at`) e
  `recorded_at`; `from_state`/`to_state` em coluna, com o CHECK de forma repetindo a tabela de
  transições; `route_assigned` guarda a rota anterior e a nova em `details`. `audit_logs` no registro e
  no fechamento.
- Contratos: `test/cargo-receiving/cargo-arrival-*.contract.ts`,
  `test/cargo-receiving-http/cargo-arrival-routes.contract.ts`,
  `test/cargo-receiving-schema/{cargo-arrival,tenant-safety}.contract.ts` e
  `test/separator-role.contract.test.ts`; integração `test/integration/cargo-arrival.integration.ts`.
- **Follow-ups:** ~~a cidade do grupo vem do destinatário~~ (resolvido na T2.6, abaixo); corrida aceita — a
  nota pode entrar numa viagem entre a checagem e o commit da chegada (a leitura mostra "já em viagem").

### Correções da revisão das Fases 1–2 (2026-10-06)

- **M1 — CHECK com NULL:** `20261006144825_cargo_arrival_check_null_holes` (aditiva, `NOT VALID` +
  `VALIDATE`, `lock_timeout` 3 s) troca três CHECKs que viravam NULL. Prova:
  `test/integration/cargo-arrival-null-checks.integration.ts` (SQLSTATE `23514` + nome do CHECK).
- **M3 — lista inteira, não a página:** `GET /cargo-arrivals` aceita `contractorId` (≤ 50 UUIDs) e `status`
  (≤ 4) **repetidos** (`?status=open&status=closed`, `inArray`; um valor funciona como antes) e
  `sort=arrivedAt|contractorName|separationDueAt|status` + `direction=asc|desc` (padrão `arrivedAt desc`).
  Desempate por `id` no mesmo sentido; prazo nulo por último nos dois sentidos; `status` ordena `open` antes
  de `closed`. Cursor: na ordem padrão continua `<iso>::<uuid>`; nas outras é base64url de
  `[sort, direction, valor, id]` — cursor de outra ordem é `400 CARGO_ARRIVAL_CURSOR_ORDER_MISMATCH`,
  malformado é `400 INVALID_REQUEST`. Código em `cargo-arrival-list-order.policy.ts`,
  `cargo-arrival-list.query.ts`, `cargo-arrival-list-query.schema.ts`; integração
  `cargo-arrival-list.integration.ts`.
- **M4 — sem N+1 do navegador:** `GET /contractor-receiving-profiles?enabled=true|false&limit=&cursor=`
  (`fleet.read`, empresa do contexto) → `{ data: [{ contractorId, isEnabled, previewEnabled }], nextCursor }`,
  ordem `contractor_id asc`, cursor = id do último, `limit` ≤ 100 (padrão 25). Contratante sem perfil não
  aparece. Rota própria: o agregado `Contractor` e o `PATCH /contractors` não mudaram.
- **M5 — lock da migration da chegada:** já em staging, não se edita (hash preso no contrato estático). O
  `rollback.sql` põe o `lock_timeout` antes do primeiro `DROP`. **Antes de produção**, medir
  `nfe_participants` (consulta em `docs/SECURITY.md`, 2026-10-06) — pendência do usuário.
- **M7 — concorrência de verdade:** `cargo-arrival-concurrency.integration.ts` segura as linhas numa
  transação bloqueadora até as duas escritas pararem num lock (`pg_stat_activity`): {201, 200} com a mesma
  chave, {201, 409} com outro contratante, e dois lotes em ordem inversa sem deadlock. Cada uma das travas
  da separação (chegada, notas) basta sozinha; só tirar as duas fica vermelho.
- **L5:** `received_at = now()` e `separated_at = greatest(received_at, now())` do **banco** no UPDATE.
- **L6:** `arrivedAt` com mais de 30 dias → `422 CARGO_ARRIVAL_ARRIVED_AT_TOO_OLD`
  (`CARGO_ARRIVAL_LIMITS.arrivedAtMaxAgeMs`); a proposta da prévia registra pela mesma rota.
- **L7:** o `409 CARGO_ARRIVAL_HAS_PENDING_DOCUMENTS` traz `details[{ field: 'pendingDocumentIds.<n>',
message: 'The document is not separated yet', documentId }]` — o id saiu do `message`.
- **M6, decidido em 2026-10-06 (T2.6):** a cidade do grupo é o **destino físico** da nota
  (`resolvePhysicalDestination`, spec 073: `<entrega>` → `<enderDest>`), não o cadastro. Nota cadastrada em
  SP com entrega em Guarulhos cai no grupo de Guarulhos; sem destino resolvível, no grupo sem cidade.
  ADR-0094 §6.

### T2.6 — a cidade do grupo é onde a carga será entregue (2026-10-07)

- **Código:** `src/cargo-receiving/infrastructure/cargo-arrival-destination.query.ts` →
  `selectArrivalDestinationCities`: uma consulta em lote (`nfe_participants` ⋈ `nfe_addresses`, papéis
  `delivery`/`recipient`, `company_id` na própria consulta) e a escolha por `pickPhysicalDestinationByDocument`
  — a **mesma** política da parada e do MDF-e; nada de precedência reimplementada. Três leitores a usam: o
  detalhe `GET /cargo-arrivals/:id` (código **e** nome da cidade, lidos de agora), a lista
  `GET /cargo-arrivals/available-documents` (código, nome e UF) e o registro (que grava o código físico).
- ⚠️ **O `cargo_arrival_documents.city_ibge_code` não decide mais o grupo:** é só o registro do momento da
  chegada (migrations não mudaram). Ler o gravado deixaria a chegada já aberta no grupo errado.
- ⚠️ **O desvio manual não entra** — `delivery_address_overrides` pertence a `trip_documents` (vínculo da
  viagem, que nasce depois da chegada) e nem o MDF-e nem o roteirizador o leem do `nfe_documents`.
- **Não mudou:** as chaves da resposta (o painel confere chave exata; `toDocumentView` é campo a campo), o
  rascunho de viagem da prévia (`cargo-preview-trip-draft.query.ts` segue pela cidade do destinatário) e o
  vínculo prévia↔nota (CEP/nome da planilha). Integração: `cargo-arrival-physical-destination.integration.ts`.

## Spec 244 — O ajudante sem resto: consentimento, foto pendente e diária zero

**Arquivos-chave:** pendências em `find-current-driver-trip.use-case.ts` e `drizzle-current-driver-trip.repository.ts`,
rotas em `me-trip.routes.ts` (aplicação de `canReportProofs`), consentimento em `me-location.routes.ts` (permanece
`trip.report`), conversor em `src/modules/shared/decimalAmount.service.ts` (frontend-transportada).

Três correções mínimas (T1–T3) das pendências deixadas pela spec 243:

- **T1:** `GET /me/trips/current` devolve `pendingProofs: []` quando o contexto sem `trip.report`;
  `findCurrentDriverTrip` recebe `canReportProofs` (padrão `true` para os chamadores existentes).
- **T2:** `useLocationConsent` (frontend-driver) trata `403` na leitura como inaplicável à conta;
  o cartão não renderiza (sem alerta). Qualquer outro erro segue como antes.
- **T3:** Conversor `toTypedAmountKeepingZero` preserva zero (`0.0000` → `0,00`) nos campos
  `helperDailyRate`, `dailyAllowanceAmount` (ficha) e diária geral; `toTypedAmount` inalterada.

## Spec 239 — a configuração do expurgo da posição (T1.3/T1.4)

Quatro rotas sob `settings.manage` (nenhuma permissão nova), em `companies/{application,domain,infrastructure,presentation}`:

- `GET /company-settings/location-retention` -> `{ data: { purgeEnabled, retentionDays, purgeEffectiveAt,
origin, updatedAt } }`; sem linha é `200` com desligado, 90 dias, `origin: 'default'` (nunca `404`).
- `PUT` (corpo `{ purgeEnabled, retentionDays }`, Zod `.strict()`, inteiro 30–90) e `DELETE` (`204`,
  idempotente; sem linha não audita). A carência de 24 h é `resolvePurgeEffectiveAt` com o relógio
  injetado no use case (`now: () => new Date()` em `main.ts`).
- `GET .../impact?retentionDays=N` -> `{ data: { byTable: [{ kind, count, capped }] } }`, `kind` estável
  (`stop_event`, `delivery_proof`, `status_event`, `stop_occurrence`, `document_occurrence`). Uma consulta
  por tabela (`drizzle-location-retention-impact.query.ts`), só a empresa do contexto, `LIMIT 100001`
  pelo índice parcial `(company_id, tempo) where latitude is not null`.

Auditoria (D4): `drizzle-location-retention-settings.repository.ts` lê a linha com `FOR UPDATE`, calcula a
carência, grava e insere em `audit_logs` na **mesma transação** (ator, empresa-alvo, antes/depois, IP e
`affectedEstimate` em `metadata`; nenhuma coordenada). `affectedEstimate` é recontado no servidor ao
ligar/alongar (não vem do cliente). Sem rate limit por rota: nenhuma rota de `company-settings` o tem.
Provas: `test/companies/location-retention-settings.contract.ts` e
`test/integration/location-retention-settings.integration.ts`.

## Spec 237 — Fase 4a, parte A: o leitor da planilha e a política de vínculo (T4.1, núcleo de T4.3)

Tudo em `src/cargo-receiving/domain/`, **sem I/O**: bytes, relógio (`clock`) e tetos entram por
parâmetro. Ainda **não há** migration, rota, fila nem worker (parte B).

- **Leitor** `parseCargoPreviewWorkbook({ bytes, clock, columnMap, sheetName, limits? })` →
  `{ rows, rowErrors }` (ADR-0094 §7). Sobre `fflate` + `fast-xml-parser`, já dependências da API. O
  diretório central do zip é lido pelo leitor (`cargo-preview-zip.parser.ts`), não pelo `unzipSync`; só
  `workbook.xml`, `_rels/workbook.xml.rels`, `sharedStrings.xml` e a aba escolhida são descomprimidos, em
  fatias de 4 KiB contadas — **`vbaProject.bin` e a aba `RESULTADO` nunca**. `DOCTYPE`/`ENTITY` recusados
  antes do parse; fórmula nunca avaliada (vale o `<v>`); célula `t="e"` (`#NAME?`) é ausência. A aba é
  varrida por linha: só linha com `<v>`/`<is>` passa pelo parser (a aba inteira custaria 237 ms e 80 MB;
  o leitor mede 45–70 ms nas quatro FR reais). Tetos em `CARGO_PREVIEW_WORKBOOK_LIMITS` e códigos
  `PREVIEW_*` em `cargo-preview-workbook.constant.ts`; `CargoPreviewWorkbookError` (413 para arquivo
  grande, 422 para o resto).
- **Coluna por NOME** (`cargo-preview-header.policy.ts`, mesma normalização do perfil): cabeçalho = a
  primeira linha entre as 20 primeiras com mais colunas mapeadas; toda coluna mapeada ausente sai junta
  em `PREVIEW_COLUMN_NOT_FOUND`; repetida é `PREVIEW_COLUMN_DUPLICATED`. Linha vazia e cabeçalho de rota
  (só rota e data) ignorados; erro de linha vira `rowErrors[{ rowNumber, field, column, message }]`.
- **Normalização** (`cargo-preview-value.policy.ts`): decimal em `bigint` (`138.69999999999999` →
  `138.700`; `value` 2 casas, `weightKg` 3, `volumeM3` 4), vírgula ou ponto em texto (os dois juntos é
  erro), expoente só em célula numérica, negativo é erro; serial do Excel com o 29/02/1900 (60 é
  inválido); CEP com 7–8 dígitos (o zero da frente volta); cidade/UF sem acento e caixa alta.
- **Política** `resolveCargoPreviewMatches` (RF5a): nível 1 `pairRoutesWithLoads` (pares conhecidos,
  depois totais + votos + contagem, guloso 1:1, empate não pareia); níveis 2–3 `matchScope` em passadas
  alias → CEP/razão social → qualquer nota → só valor (`suggested`); partição de até 6 linhas por
  cliente (`MAX_PARTITION_LINES`), busca com teto de nós e de soluções (estourou: `ambiguous`). Nota
  disputada por dois clientes na mesma passada fica `ambiguous` para os dois. Linha de roteiro pareado
  só pega, fora do grupo, nota **sem** carga. Alias aprendido só de `matched`, sem conflito, nunca o já
  conhecido. `extractLoadReference` refiltra o padrão, corta o `infCpl` em 2 000 e nunca lança.
- ⚠️ **O peso não é exato ao grama**: há diferença de até 5 g por arredondamento da planilha (2 casas
  × 3 do `pesoB`). Concordância de peso: `|Δ| ≤ max(0,01 kg, weight_tolerance_percent × peso da nota)`
  (`PREVIEW_WEIGHT_ROUNDING_FLOOR_KG`, em `createWeightCloses`); o padrão do perfil continua 0 e já fecha
  180/187 e 97/107. Somas de roteiro inteiro acumulam mais que 10 g, então parte dos pares sai por votos.
- Contratos: `test/cargo-receiving/cargo-preview-{workbook-safety,workbook-rows,matching-levels,
matching-rules,matching-scale,corpus,corpus-pii}.contract.ts` no entrypoint
  `cargo-receiving.contract.test.ts`; construtor sintético em
  `test/fixtures/cargo-preview-{workbook,xml,zip}.fixture.ts`; corpus anonimizado em
  `test/fixtures/cargo-preview-corpus/`. A checagem de PII contra os arquivos reais roda com
  `CARGO_PREVIEW_PII_WORKBOOK_DIR` e `CARGO_PREVIEW_PII_NFE_DIR` (no CI, pulada de propósito).

## Spec 237 — Fase 4a, parte B: envio, leitura, vínculo e reavaliação (T4.2, T4.3)

Migration aditiva `20261004140624_cargo_previews` (ADR-0094 §8): `cargo_previews`, `cargo_preview_items`,
`cargo_preview_document_links`, `cargo_preview_route_loads`, `contractor_recipient_aliases`,
`cargo_preview_events` (append-only por trigger) e `cargo_preview_outbox` (trilho próprio — o
`processing_outbox` é preso a `nfe_import`). Valores das listas em `shared/cargo-preview.constant.ts`
(cópia idêntica no worker, com contrato de paridade).

- **Envio** `POST /cargo-previews` (multipart `contractorId` + `file`, `Idempotency-Key`, `trip.manage`):
  `parseUploadCargoPreviewRequest` recusa campo desconhecido (inclusive `companyId`) e devolve todos os
  problemas juntos; arquivo acima de `CARGO_PREVIEW_UPLOAD_MAX_BYTES` (960 KiB — o menor entre o leitor e o
  corpo de 1 MiB) é 413 `PREVIEW_FILE_TOO_LARGE`; tipo pelos bytes (`assertPreviewWorkbookBytes`). Portão
  na ordem contratante (404) → chave (mesma impressão = 200, outra = 409 `CARGO_PREVIEW_KEY_REUSED`) →
  arquivo do contratante já enviado (200 com a existente) → perfil ligado com prévia e mapa (422
  `CARGO_PREVIEW_NOT_ENABLED`). O objeto sobe antes da transação e sai do bucket se ela não criar a
  prévia (corrida, falha). `received_at` = hora do servidor.
- **Leitura** `GET /cargo-previews` (contratante, situação, cursor `<iso>::<uuid>`) e
  `GET /cargo-previews/:id?state=&routeName=&afterRow=&limit=` (`fleet.read`): contagens por estado, grupos
  por roteiro com a carga ligada, itens pela linha (o cursor é o número da última linha) com a nota
  vinculada (número, série, destinatário, valor, importada em).
- **Ações** (`trip.manage`, sob `lockContractorMatching` — a trava advisory do worker):
  `…/items/:itemId/confirm|unlink|link` decididas por `decideCargoPreviewItemAction` (repetir é no-op sem
  evento). Confirmar e desvincular agem no grupo (as linhas da mesma nota ou da mesma sugestão);
  desvincular solta a nota quando nenhuma linha da prévia aponta mais para ela. Vincular à mão exige nota
  da empresa, autorizada, do CNPJ do contratante (422 `CARGO_PREVIEW_DOCUMENT_NOT_CANDIDATE`); nota de
  outra prévia é 422 `CARGO_PREVIEW_DOCUMENT_ALREADY_LINKED` (o unique do vínculo decide). Toda ação
  deixa o item `matched_by = user`.
- **Propor a chegada** `POST /cargo-previews/:id/propose-arrival`: contratante, `plannedDate` e as notas
  `matched` distintas julgadas por `findArrivalCandidateRefusals` (a mesma política do registro da Fase
  2); as recusadas voltam com o motivo. Não cria nada; grava `arrival_proposed` uma vez por conjunto
  de notas (impressão sha256 nos `details`; repetir a proposta sem mudança não grava). ⚠️ **Pendente,
  follow-up real:** nada preenche `cargo_previews.arrival_id` hoje — o `POST /cargo-arrivals` não
  recebe `previewId`, e a T4.4 entregou a tela sem essa ponte. A chegada registrada a partir da
  proposta não fica ligada à prévia até esse campo entrar (aditivo, com o índice parcial que já
  existe).
- Testes: `test/cargo-receiving-http/cargo-preview-routes.contract.ts`,
  `test/cargo-receiving/cargo-preview-{upload,item-action}.contract.ts`,
  `test/cargo-receiving-schema/cargo-preview.contract.ts` (+ isolamento em `tenant-safety`), e
  `test/integration/cargo-preview.integration.ts` (transação com falha injetada no outbox, isolamento,
  ações, 1:1 com dois operadores concorrentes, proposta). As rotas estão em
  `test/separator-role.contract.test.ts`.

## Spec 237 — Fase 4a: correções da revisão de código (2026-10-04)

Decisões no ADR-0094 §4, §7 e §8; evidência em `specs/237-…/evidence.md` § "Correções da revisão da
Fase 4a".

- **Par roteiro ↔ carga (H1):** por votos só com 2 votos e 25% das linhas do roteiro; a diferença de
  contagem não desempata; o par por votos nunca é gravado (o worker grava só `totals`, e ignora linha
  `votes` antiga ao montar os pares conhecidos).
- **Valor e peso sozinhos (M2):** sem par pelos totais e sem CEP, razão social ou alias, é `suggested`.
  Desvincular (`cargo-preview-unlink.writer.ts`) revoga o alias aprendido por esta prévia daquele
  vínculo — salvo se outro item dela o sustenta — e grava um pedido `reevaluate` no outbox (L5).
- **Piso de peso (M5):** `max(0,01 kg, 0,005 kg × linhas somadas)`; **bloco inteiro (M6):** linha só
  vincula com o mesmo bloco em toda partição; linhas idênticas vão pela ordem
  (`cargo-preview-partition-choice.policy.ts`, arquivo novo também na cópia do worker).
- **Leitor (H2, L3):** teto de dígitos inteiros por campo (`PREVIEW_DECIMAL_FIELDS`) vira erro da linha;
  data no sistema 1904 e célula `t="d"` com hora.
- **Reenvio (M1):** o mesmo arquivo de prévia `failed`, ou `processing` além de 15 min, reabre a MESMA
  prévia (`cargo-preview-reopen.writer.ts`, 201); pronta ou em leitura recente segue 200. Códigos novos
  `PREVIEW_PROCESSING_ABANDONED` e `PREVIEW_VALUE_OUT_OF_RANGE` (migration aditiva
  `20261004165112_cargo_preview_failure_codes`, só o CHECK).
- **Proposta de chegada (L6):** o evento `arrival_proposed` é gravado uma vez por conjunto de notas.
- Testes novos: `test/cargo-receiving/cargo-preview-{route-pairing-partial,match-reinforcement,
partition-sum,workbook-overflow,workbook-dates,resend}.contract.ts`,
  `test/integration/cargo-preview-{unlink,resend}.integration.ts` e a asserção
  `test/database-migration/cargo-preview-failure-codes.assertion.ts`.

## Spec 237 — Fase 4a: correções da revisão de segurança (2026-10-04)

Detalhe, números e mutações em `specs/237-.../evidence.md` § "Correções da revisão de segurança da Fase 4a".

- **Leitor (S1/S4):** a promessa dos 5 s era falsa (87 KiB → 7,8 min e 2,27 GB). Tetos novos em
  `CARGO_PREVIEW_WORKBOOK_LIMITS`: aba 8 MiB, total 16 MiB, última linha 5 000, **512 células por linha e
  120 000 no total** contadas no texto antes do parser (`PREVIEW_TOO_MANY_CELLS`); decimal em texto acima de
  40 caracteres é inválido antes do regex e do `BigInt`; o cabeçalho é linear e cabeçalho e itens recebem
  o `budget`. A thread que termina o parse é do worker.
- **Vínculo (S2):** `resolveCargoPreviewMatches` exige `budget: MatchingBudget` (`check` por cliente, por
  roteiro e por par pontuado) e é linear no cliente grande (`cargo-preview-free-documents.policy.ts` indexa
  as notas livres uma vez por passada). Testes passam `{ check: () => undefined }`.
- **Perfil (S3):** `arrivalReferenceLabel` (acima). Migration `20261004180153_contractor_receiving_arrival_reference_label`
  (aditiva; rollback recusa sem apagar se houver texto gravado).
- **Envio (S5):** `rateLimit` `cargo-preview-upload` 20/300 s no Postgres e teto de 5 prévias
  `queued`/`processing` por contratante (`assertCargoPreviewOpenLimit`, sob `pg_advisory_xact_lock` do envio,
  no `create` e no `reopen`) → 422 `CARGO_PREVIEW_TOO_MANY_OPEN`.
- Códigos novos de falha (`PREVIEW_TOO_MANY_CELLS`, `PREVIEW_PROCESSING_INTERRUPTED`, `PREVIEW_MATCH_TIMEOUT`):
  migration aditiva `20261004174001_cargo_preview_security_failure_codes`.

## Spec 241 — o tipo da ocorrência diz se ela carrega itens (T2.1)

`company_occurrence_types.items_mode varchar(16) NOT NULL DEFAULT 'optional'`, no vocabulário de
`DELIVERY_PROOF_FIELD_MODES` (CHECK `company_occurrence_types_items_mode_check`, sem ENUM). `optional`
é o seletor de produtos de hoje; `off` é o tipo que vale para a nota inteira; `required` o banco aceita
para a 239, o cadastro ainda recusa.

A migration `20261006033752_occurrence_type_items_mode` tem ordem obrigatória: coluna → CHECK de
vocabulário → **um** `UPDATE` que põe `items_mode = 'off'` **e** `redelivery_policy = 'unset'` na
segunda via do boleto (nome exato `SECOND_COPY_BILL_OCCURRENCE_TYPE_NAME`, `stage = 'delivery'`,
`flow = 'document'`) → CHECK `company_occurrence_types_items_off_shape_check` (`items_mode <> 'off' or
redelivery_policy = 'unset'`, D-E: tipo sem itens não abre tratativa). Inverter os dois últimos passos,
ou tirar a política do `UPDATE`, derruba a migration numa segunda via que o operador pôs em `blocked`
(mutação provada em `specs/241-…/evidence.md`). O nome é único por empresa
(`company_occurrence_types_company_name_unique`, `lower(btrim(name))`), então o `UPDATE` pega no
máximo uma linha por empresa; renomeado fica `optional`. O rollback derruba as duas CHECKs antes da
coluna e não devolve a política zerada. Prova: `test/database-migration/occurrence-type-items-mode.assertion.ts`.

**Catálogo e cadastro (T2.3–T2.4).** `OccurrenceTypeCatalogEntry` ganhou `itemsMode`: `optional` nos
derivados de `TRIP_OCCURRENCE_TYPES`, `off` na segunda via e na **prorrogação do boleto**
(`BILL_EXTENSION_OCCURRENCE_TYPE_NAME`, `delivery`, defaults da 208). A prorrogação só existe no catálogo
de **bootstrap** (empresa sem nenhum tipo): nenhuma migration a insere (D2) e o seeder segue sem
reconciliar tipo existente — o operador de produção a cadastra pela tela. O `PUT
/company-settings/occurrence-types` aceita `itemsMode?: 'off' | 'optional'` **sem `default`** (ausente não
mexe; `required` e o resto voltam 400 até a 239) e valida o estado **resultante** `off` ⇒
`redeliveryPolicy 'unset'` lendo o tipo gravado quando um dos dois campos vem ausente
(`findCurrentType`): `422 OCCURRENCE_TYPE_ITEMS_OFF_REDELIVERY_POLICY` antes do `UPDATE`; a CHECK do banco é
só a rede (sem a validação a resposta seria 500).

**Registro e correção (T2.5).** `assertOccurrenceTypeAcceptsProducts`
(`trips/domain/occurrence-items-mode.policy.ts`) recusa `productCode` não vazio ou `productCodes` não
vazio em tipo `off` com `422 OCCURRENCE_TYPE_ITEMS_NOT_ALLOWED`, **antes** de ler produtos, gravar, avisar
ou substituir itens, em `registerTripOccurrence` (galpão e WhatsApp do operador),
`registerDriverOccurrence` (app e WhatsApp do motorista) e `correctOccurrenceItems` (o tipo ATUAL manda:
ocorrência antiga com item num tipo que virou `off` aceita esvaziar, não preencher). O lote do escritório
em nome do motorista grava `productCode: ''` fixo e não tem guarda. Lista vazia vale em qualquer tipo.

**Leituras (T2.7).** `listOccurrenceTypeItemsShapesByIds`
(`trips/infrastructure/occurrence-type-items-read.query.ts`) lê `items_mode` e `allows_multiple_items` dos
tipos da página numa consulta, `where company_id and id in (…)`. Feed e detalhe publicam
`occurrenceTypeId`, `typeItemsMode`, `typeAllowsMultipleItems` (`null` na parada); a lista da nota, os
dois últimos; o cadastro (`GET /company-settings/occurrence-types`), `/me/trips/current/occurrence-types`
e o snapshot do motorista, `itemsMode`. O `frontend-driver` ignora a chave nova
(`isDriverOccurrenceType` só lê o que conhece). Não há OpenAPI gerado nesta API (nenhum arquivo
`openapi*` no repositório e nenhum gerador no `package.json`): o contrato vive nos schemas Zod e nesta
nota. Publicação: etapa 2, **depois** do painel tolerante (ADR-0081 §9).

**Revisão final (API).** (1) A leitura do modo de itens é refinamento e não derruba a lista:
`listOccurrenceTypeItemsShapesOrEmpty` é a que a lista da nota e o feed usam, e no feed ela roda no
`Promise.all` com os cancelamentos (continua uma consulta por página). Com `logger` (os dois recebem o de
`main.ts`: `listTripOccurrences(db, { …, logger })` e `listTripOccurrenceFeed(db, query, { logger })`), a falha
vira mapa vazio **e** um `warn` `occurrence_type_items_read_failed` com só o SQLSTATE (`metadata.code`; a
mensagem do Drizzle traz os parâmetros e nunca vai ao log). Sem `logger` a falha propaga: é o caso de
`findTripOccurrenceFeedItem`, chamado dentro de transação (`drizzle-driver-conversation`,
`drizzle-contractor-portal-message`) e nas leituras de detalhe — o `.catch` ali esconderia a causa e o
comando seguinte da transação morreria com `25P02`. Sem Sentry: o repo não tem padrão de captura em leitura
degradada (o `errorTracker` só recebe o que o servidor propaga). (2) A corrida entre dois `PUT` (o `findCurrentType` lê fora
da transação do `UPDATE`) cai na CHECK `OCCURRENCE_TYPE_ITEMS_OFF_SHAPE_CHECK`: `saveOccurrenceType` traduz
o `23514` **dessa** constraint, pelo nome, em `422 OCCURRENCE_TYPE_ITEMS_OFF_REDELIVERY_POLICY`; outra CHECK
segue propagando. (3) `OCCURRENCE_ITEMS_MODE`, `REDELIVERY_POLICY` e `OCCURRENCE_ATTACHMENT_MODE.off`
(`shared/trip-occurrence.constant.ts`) nomeiam o `off`/`optional` do modo de itens, a política de reentrega e o
padrão da foto; os `?? optional` ficam onde `OccurrenceTypeRecord.itemsMode` é opcional por causa dos
dublês. (4) ⚠️ Dois guards de chave exata do painel **atual** de staging derrubam a tela contra esta API:
`isTripOccurrence`/`TRIP_OCCURRENCE_OPTIONAL_KEYS` recusa `typeItemsMode` e `typeAllowsMultipleItems` na lista
da nota, e `isOccurrenceType` recusa `itemsMode` no catálogo do cadastro. A etapa 2 só sobe depois do painel
tolerante e do `autoUpdate` do PWA.

## Spec 245 — a localização do WhatsApp não fica na conversa (Fase 2)

- **Pacotes:** `@adatechnology/meta-whatsapp-module@0.8.0` e `@adatechnology/meta-whatsapp-provider@0.4.0`
  (API e worker; contratos seguem `0.6.0`). As 11 migrations do `meta_whatsapp` são as mesmas: **sem migration**.
- **Opção ligada no resolver** (`src/whatsapp/application/meta-whatsapp-module.resolver.ts`):
  `features: { redactInboundLocation: true }`. A linha de entrada `location` grava sem `payload.location`
  (`payload` fica `NULL` se não sobrar chave) e com `content = INBOUND_LOCATION_CONTENT` (`'📍 Localização'`),
  sem `name`/`address`/`url`. O gancho `onMessageReceived` recebe a mensagem crua; o armazém
  `whatsapp-shared-location.service.ts` e o carimbo `captured` da 196 não mudam.
- **Provas:** `test/whatsapp/meta-whatsapp-module-features.contract.ts` prende a opção na chamada da fábrica
  (texto-fonte; some em silêncio sem ela) e `test/integration/whatsapp-driver-flow-actions.integration.ts`
  prova pelo webhook real: a linha da empresa do teste sem `payload.location`, `content` igual à constante, e o
  toque seguinte ainda grava `captured` com a coordenada. A fixture manda `name`, `address` e `url`: sem eles o
  rótulo já saía neutro na `0.7.0` e a asserção não ficaria vermelha.
- **Painel:** o texto do `whatsapp` em `trip.locale.json`/`trip.en.locale.json` (aba da 239) diz que a
  localização vai só para o evento e segue o prazo dele.
- **Legado não redigido:** o que chegou antes do deploy segue gravado até a Fase 3 (script com dry-run,
  `--confirm`, aprovação por ambiente e empresa).

## Spec 237 — Fase 5, T5.1: os rascunhos de viagem da prévia (RF7)

`GET /cargo-previews/:id/trip-drafts` (`fleet.read`, `companyId` do contexto, prévia de outra empresa ⇒ 404, **sem
query nem corpo**: `?companyId=` é 400). Só lê: **nenhuma viagem nasce aqui** (ADR-0044 §5) — o painel leva as notas
ao fluxo de criação de viagem ou ao `POST /route-suggestions/multi-vehicle`, e o aceite é o de sempre.

- **Camadas.** `domain/cargo-preview-trip-draft*.policy.ts` (pura: agrupamento, contagens, totais, cidades, ordem),
  `application/read-cargo-preview-trip-drafts.use-case.ts`, `infrastructure/cargo-preview-trip-draft.query.ts`
  (uma consulta por tabela: prévia, itens, pares roteiro↔carga, notas pelo vínculo **desta** prévia) e
  `presentation/cargo-preview-trip-draft.routes.ts`. Sem N+1; o peso da NF é `round(sum(nfe_volumes.gross_weight), 3)`.
- **Só `matched` é nota do rascunho.** O **estado** manda, não a coluna `matched_document_id` (contrato com
  `suggested` carregando id). `suggested`, `ambiguous`, `awaiting_xml` e `invalid` ficam só nas contagens.
- **Nota roteável** = `authorized` **e** fora de viagem viva (a conta de `findUnavailableDocumentIds` do multi-veículo)
  **e** fora de `excludedDocumentIds`. Esse é o **único portão**: `isCargoPreviewDocumentRoutable`. O gancho da
  **RF8a** (Fase 3, "devolver ao contratante") é `findExcludedTripDraftDocumentIds()` — hoje devolve vazio; a Fase 3
  só preenche essa função, sem tocar a política. Nota em viagem viva aparece com `isInLiveTrip` e fora dos
  `routableDocumentIds`. O roteirizador aceita até 500 notas por proposta (`MAX_STOPS_PER_SUGGESTION`).
- **Formato** (chaves exatas, o painel as confere): topo `contractorId, plannedDate, previewId, routableDocumentIds,
routes, status, summary`; `summary` `canPropose, counts, inLiveTripDocumentCount, linkedDocumentCount, missingCount,
routableDocumentCount, routeCount`; roteiro `canPropose, cannotProposeReason (no_linked_documents|none_routable|null),
cities, counts, documents, linkedTotals, loadOrigin, loadReference, missingCount, plannedDate, routableDocumentIds,
routeName (null = "sem roteiro", sempre por último), totals`; nota `cityIbgeCode, cityName, documentId, isInLiveTrip,
isRoutable, lineCount, number, recipientName, series, status, totalValue, weightKg`; cidade `cityIbgeCode, cityName,
documentCount, pendingLineCount` (casada por nome sem acento + UF: a nota traz o IBGE do XML, a linha que espera o XML
  só o texto da planilha). `missingCount` é só `awaiting_xml` (linhas, não notas: n linhas podem fechar 1 nota).
  `totals` é a planilha inteira do roteiro; `linkedTotals`, as notas vinculadas uma vez cada. Decimais em texto, somados
  em `bigint`. Ordem estável: roteiro, cidade, número da NF (numérico), id.
- Prévia não lida (`queued|processing|failed`) devolve `routes: []` com a situação, não erro.
- Contratos: `test/cargo-receiving/cargo-preview-trip-draft-{policy,use-case}.contract.ts`,
  `test/cargo-receiving-http/cargo-preview-trip-draft-routes.contract.ts`, `separator-role.contract.test.ts` (rota
  alcançada pelo separador), integração `test/integration/cargo-preview-trip-draft.integration.ts` (Postgres).

## Spec 237 — Fase 3, T3.2: a avaria sem viagem e a marcação "devolver ao contratante" (ADR-0094 §9)

**A ocorrência de recebimento é linha de `trip_document_occurrences`.** Migration
`20261006180700_cargo_arrival_receiving_occurrence`: coluna `cargo_arrival_document_id`, `trip_document_id`
**sem `NOT NULL`** e no lugar o CHECK `num_nonnulls(trip_document_id, cargo_arrival_document_id) = 1`; CHECK
`(stage = 'receiving') = (cargo_arrival_document_id is not null)`; FK `restrict` para a nota da chegada e unique
`(company_id, cargo_arrival_document_id, id)` (leitura e alvo da FK do motivo). Tratativa (164), fotos (161),
itens (166/172) e cobrança continuam apontando para a mesma tabela — nada delas mudou.

- ⚠️ **`trip_document_id` é anulável no TS.** Leitor que junta `trip_documents` por `inner join` não vê a
  ocorrência de recebimento (é o certo: não há viagem). Leitor por id trata o nulo como "não é desta rota":
  correção/cancelamento → não encontrada; cobrança do acerto → **não cobra** (T3.4a: `recordSettlement` só chama a ponte
  com viagem; antes o `PUT` do acerto dava 422 `DELIVERY_CLIENT_NOT_RESOLVED`); lote do escritório e marcador da viagem filtram o nulo; e-mail/conversa da ocorrência devolvem "sem alvo".
- **Etapa `receiving`** em `TRIP_OCCURRENCE_STAGE` (gera os CHECKs das duas tabelas). `TRIP_BOUND_OCCURRENCE_STAGES`
  é a lista da viagem: `listOccurrenceTypes` (o `GET /company-settings/occurrence-types` do painel, que recusa a
  lista inteira com etapa desconhecida) filtra por ela, e o `UPDATE` de `saveOccurrenceType` não alcança tipo
  `receiving` (404). ⚠️ **O nome do tipo é único por empresa em qualquer etapa** (índice
  `company_occurrence_types_company_name_unique` só na migration de 03/09, fora do schema TS): os três tipos de
  recebimento se chamam "… na chegada" e o bootstrap pula nome usado (`seedReceivingOccurrenceTypeCatalog`, pre-deploy,
  `blocked` + `items_mode optional`).
- **A marcação** é `cargo_arrival_documents.return_to_contractor none|marked|returned` + `return_occurrence_id`
  (FK `(company_id, id, return_occurrence_id)` → a ocorrência DESTA nota). Ortogonal ao eixo
  `expected → received → separated`: separar nota marcada/devolvida é recusado no lote
  (`CARGO_ARRIVAL_DOCUMENT_MARKED_FOR_RETURN`/`…_RETURNED`); fechar exige `returned` ou (`none` e `separated`), e o 409
  diz por nota se ela está marcada ou só não separada; "vencida" conta só a `none` não separada
  (`pendingSeparationCount`, contado pronto na lista). `findExcludedTripDraftDocumentIds(database, {companyId,
previewId})` devolve as notas da prévia `marked|returned`; a proposta de chegada as recusa com
  `DOCUMENT_RETURN_TO_CONTRACTOR`.
- **Rotas** (`presentation/cargo-arrival-occurrence.routes.ts`, composição em `cargo-arrival-occurrence.composition.ts`):
  `GET /cargo-arrivals/occurrence-types` e `GET /cargo-arrivals/:id/occurrences[?documentId=]` (`fleet.read`; a segunda
  traz `occurrences` com itens, fotos assinadas e `case {id,status}`, `documents` com a marcação de cada nota e
  `returnCounts`); `POST …/documents/:documentId/occurrences` (`trip.manage`, multipart da 161, `Idempotency-Key`
  obrigatória em `idempotency_records` operação `cargo-arrival-occurrence`, `rateLimit` 60/300 s, pelo menos um item,
  foto obrigatória, nota `received|separated`, dentro de `separation_due_at`; sem janela = enquanto aberta);
  `POST …/return-mark` (`trip.manage`, `{occurrenceId, note?}`), `…/return-unmark` (**`occurrences.resolve`** — o
  separador recebe 403) e `…/return-complete` (`trip.manage`, só com a tratativa da origem `decided|closed`).
  Códigos: `CARGO_ARRIVAL_OCCURRENCE_WINDOW_CLOSED` (422), `…_TYPE_NOT_FOUND` (404), `OCCURRENCE_TYPE_NOT_RECEIVING`
  (422), `…_ITEMS_REQUIRED` (422), `…_KEY_REUSED` (409), `CARGO_ARRIVAL_RETURN_OCCURRENCE_INVALID` (422) e, em 409, o
  motivo da política (`CARGO_ARRIVAL_CLOSED`, `…_DOCUMENT_NOT_RECEIVED`, `…_DOCUMENT_RETURNED`,
  `…_RETURN_ALREADY_MARKED`, `…_DOCUMENT_IN_LIVE_TRIP`, `…_RETURN_NOT_MARKED`, `…_RETURN_DECISION_PENDING`).
- **Ordem da abertura** (T3.4a: a foto sobe ANTES da trava — ver "Fase 3, T3.4a" abaixo; use case
  `register-cargo-arrival-occurrence.use-case.ts`, dentro da trava `…-lock.service.ts` e
  `application/cargo-arrival-occurrence-guard.service.ts`): reenvio já gravado (consulta fora da trava) → foto no bucket →
  trava da chegada → chave (o reenvio devolve a gravada, 200, mesmo com janela vencida ou chegada fechada) → nota
  (`for no key update`) → estado e janela → tipo e itens → linhas (ocorrência, itens, tratativa, evento
  `occurrence_registered`, auditoria, chave, objetos e anexo). Marcar/desfazer/concluir: trava chegada → nota → política pura
  (`domain/cargo-arrival-return.policy.ts`) → `UPDATE` + evento `return_*` + auditoria `cargo-arrival.return-*`.
- ⚠️ **A leitura `GET /cargo-arrivals[/:id]` NÃO ganhou chave** (o painel confere chave exata no resumo, grupo e
  nota): a marcação sai só na rota de ocorrências. Incorporá-la à leitura da chegada é passo seguinte, depois de o
  painel aceitar as chaves como opcionais.
- **Portal (164):** as quatro leituras de `contractor-occurrence.query.ts` resolvem a NF-e por
  `coalesce(trip_documents.nfe_document_id, cargo_arrival_documents.nfe_document_id)` (duas junções à esquerda com
  a empresa da ocorrência); a projeção não mudou. A conversa (183) não cria conversa para a ocorrência de
  recebimento (junção obrigatória com a viagem) — o portal mostra a ocorrência sem conversa.
- Contratos: `test/cargo-receiving/cargo-arrival-{return,occurrence-use-case,return-use-case}.contract.ts`,
  `test/cargo-receiving-http/cargo-arrival-occurrence-routes.contract.ts`,
  `test/cargo-receiving-schema/cargo-arrival-{receiving-occurrence,occurrence-tenant-safety}.contract.ts`,
  `test/database-migration/cargo-arrival-receiving-occurrence-migration.contract.ts`; integração
  `test/integration/cargo-arrival-{occurrence,return,occurrence-reach}.integration.ts`.
- **Itens da nota da chegada** (T3.2b): `GET /cargo-arrivals/:id/documents/:documentId/products` (`fleet.read`, sem
  query; `presentation/cargo-arrival-document-products.routes.ts`, caso de uso
  `read-cargo-arrival-document-products.use-case.ts`, repositório
  `drizzle-cargo-arrival-document-products.repository.ts`). Resposta `{ data: [{ code, commercialUnit, description,
ordinal (number), quantity, totalValue, unitValue (texto decimal) }] }` ordenada por `ordinal`, **sem NCM nem CFOP**
  (mesmo tipo `TripDocumentProduct` da rota da viagem). Uma consulta só: `cargo_arrival_documents` pela empresa e pela
  chegada, `left join nfe_products` — nenhuma linha = nota fora da chegada (404 `CARGO_ARRIVAL_DOCUMENT_NOT_FOUND`) ou
  chegada de outra empresa/inexistente (404 `CARGO_ARRIVAL_NOT_FOUND`, decidido por `arrivalExists`); nota sem item é
  `data: []`. ⚠️ Id que não é UUID nem chega à rota: o roteador responde 404 `NOT_FOUND` (formato `canonicalUuid`), o 400
  do `parseUuidPathIdentifier` só vale para query. Integração:
  `test/integration/cargo-arrival-document-products.integration.ts`.

## Spec 246 T5.3-api — as exceções de todos os tipos numa resposta (RF11c)

`GET /company-settings/occurrence-types/attachment-overrides` (`settings.manage`, só leitura, sem migration)
devolve as exceções de contratante e de destinatário de **todos** os tipos da empresa do token, agrupadas por
tipo, para a tela mostrar contagem e lista sem uma requisição por linha. Resposta:
`{ data: { overridesByType: [{ occurrenceTypeId, contractorOverrides: [...], recipientOverrides: [...] }] } }`.
Cada item tem o formato da rota por tipo (`attachmentMode` sempre; `noteMode`/`signatureMode`/`itemsMode`/
`photoMinimumCount`/`itemsMinimumCount` modo-ou-nulo, nulo herda do tipo; `contractorId` ou `taxId`), sem o
`occurrenceTypeId`, que é a chave do grupo. Tipo aposentado também entra (a tela filtra); tipo sem exceção devolve as
duas listas vazias; ordem dos tipos = a de `GET /company-settings/occurrence-types`, das exceções = `contractorId`/`taxId`.

- **Três consultas, sempre**: os ids dos tipos (`occurrence-type-ids-read.query.ts`) e as duas tabelas de exceção
  (`listOverridesForTypes`, já usado por `list-field-occurrence-types`). Não cresce com o número de tipos
  (`test/integration/occurrence-attachment-overrides-batch.integration.ts` conta `select` com 1 e com 4 tipos).
- `companyId` só do contexto autenticado; a `?companyId=` da query é ignorada. A lista de ids filtra por empresa, e
  as exceções são lidas só para esses ids com `company_id` no `where`.
- ⚠️ Roteamento: o endereço tem três segmentos e a rota por tipo quatro (`/:occurrenceTypeId/attachment-overrides`),
  então `attachment-overrides` nunca é lido como `occurrenceTypeId`. Provado pelo roteador real em
  `test/trip-occurrence/attachment-overrides-batch-route.contract.ts`.
- Código: `list-occurrence-attachment-overrides.use-case.ts`, rota em `trip.routes.ts`, fiação em `main.ts`.

## Spec 246 — terceira revisão: `receiving` e as migrations (2026-10-06)

- **O tipo `stage = 'receiving'` (spec 237) não tem momento de rua.** `deriveOccurrenceMomentsFromStageAndFlow` devolve `[]` para ele;
  antes caía no ramo "não é separação" e virava `['document','office']`, e o motorista o registrava na nota e o escritório no lote.
  Sem linha de momento e sem derivado, nenhuma guarda de rua o aceita. A escrita por momentos sobre ele é 404 (o `UPDATE` só alcança
  as etapas da viagem) e o backfill de momentos só cobre `separation` e `delivery`. Prova: `occurrence-type-receiving-moments` e
  `occurrence-type-moments-backfill`.
- **As quatro migrations da 246 foram regeradas por cima da `20261006180700`** (a da 237 tem o mesmo pai da primeira): `20261006205139`,
  `20261006205158`, `20261006205209`, `20261006205232`. Nome de migration que a 246 cita em teste ou doc é o novo.

## Spec 246 — a exigência da ocorrência chega na rua (visão geral, T6.2)

Decisões D-a a D-d e a ordem de publicação: `specs/246-a-exigencia-da-ocorrencia-chega-na-rua/` (`spec.md`, `evidence.md`).

- **Colunas** (`trip.schema.ts`): no tipo, `note_mode` (`DEFAULT 'optional'`), `signature_mode` (`DEFAULT 'off'`),
  `photo_minimum_count` (`DEFAULT 1`, 1–5) e `items_minimum_count` (nulo = todos os itens; CHECK só com `items_mode = 'required'`);
  nas duas tabelas de exceção, `note_mode`, `signature_mode`, `items_mode`, `photo_minimum_count` e `items_minimum_count`,
  **nulas e sem default**. `signature_object_id` (FK composta para `stored_objects`) nas duas tabelas de ocorrência — em
  `trip_stop_occurrences` **sem escritor nem leitor** (existe para não exigir segunda migration). `attachment_mode` segue sendo a foto.
- **Migrations (ordem, cada uma com `rollback.sql`):** `20261006205139_occurrence_type_requirement_modes` (modos; `UPDATE`
  que leva a regra "foto `required` arrasta a observação" para o dado), `20261006205158_occurrence_type_moments` (tabela e
  backfill), `20261006205209_occurrence_type_quantity_minimums`, e **separada** `20261006205232_street_occurrence_attachment_backfill`
  (copia `attachment_object_id` para `trip_document_occurrence_attachments` com `created_at` da ocorrência e `NOT EXISTS`; o
  rollback não apaga as linhas). ⚠️ Uma a uma regeradas por cima da última da staging: rebase que traga migration nova refaz as
  quatro. Os nomes antigos `…184835/184901/184909/184921` e `…112823/115725/123712/131040` só aparecem em relatos antigos.
- **Backfill de momentos:** `separation` onde `stage = 'separation'`; `document` onde `delivery + document`; `stop` onde
  `delivery + stop` **e** `separation + stop` (D-c); `office` onde `stage = 'delivery'`. `separation + document` nunca sai do
  backfill; os dois "Avaria" existentes continuam dois tipos. **Nenhuma linha para `receiving`.**
- **Leitura tolerante na janela de deploy:** tipo sem linha de momento usa os derivados de `stage`/`flow`
  (`deriveOccurrenceMomentsFromStageAndFlow`, que devolve `[]` para `receiving`); `PUT` sem `moments` mantém os gravados; `PUT`
  que muda `stage`/`flow` de tipo com vários momentos é 409; `document + stop` juntos e conjunto vazio são recusados.
- **Formatos de resposta:** `GET /me/trips/current/occurrence-types`, `GET /trips/occurrence-types/field` e
  `document.occurrenceTypes` do snapshot trazem, além de `id/name/flow/stopKind/attachmentMode/itemsMode`, `photoMode`
  (= `attachmentMode`, por um ciclo), `noteMode`, `signatureMode`, `photoMinimumCount` e `itemsMinimumCount` (`null` = todos).
  `GET /company-settings/settings-resolution` devolve os seis campos e `sources` (`type | contractor | recipient | default`).
  `PUT .../:id/attachment-overrides` distingue **ausente** (não mexe), **nulo** (herda) e **valor**; linha nova de painel antigo
  sem `noteMode` recebe a observação que segue a foto da exceção, não nulo.
- **Cobrança** (`assertDriverOccurrenceRequirements`, `register-driver-occurrence.use-case.ts` + `driver-occurrence-assessment.service.ts`):
  observação `required` → texto; foto → `attachmentObjectIds` (1–5) e o mínimo efetivo; assinatura → `signatureObjectId`
  conferido como o anexo (empresa, viagem **e motorista**); produtos → nota inteira (`productCode` vazio) ou um código.
  `assertOccurrenceTypeAcceptsProducts` lê o modo efetivo e por isso roda depois do `404` da nota. WhatsApp usa o mesmo caso de
  uso e **não filtra** a lista por exigência (RF13): tipo com assinatura `required` volta o erro estável, e a conversa traduz.
- **Demonstrativo ao cliente** (`drizzle-occurrence-statement.repository.ts`) e a resposta da correção mostram a foto de rua e nunca a assinatura.
- **Pendências declaradas:** "Ao menos N" produtos sem efeito no app do motorista (snapshot sem itens); Fase 3 por nota só no
  servidor; assinatura inexistente no WhatsApp; `trip_stop_occurrences.signature_object_id` sem uso; a fila offline do app antigo
  recebe 422 permanente quando o tipo endurece. **Medições T1d.0 e T3.0 pendentes do usuário** — a 246 não vai a `main` sem elas.

## Spec 237 — Fase 3, T3.4a: correções da revisão `opus` da avaria e da devolução (API)

- **A tratativa da avaria de recebimento funciona pelas rotas existentes** (`/trip-occurrences/:id/case/*`: `review`,
  `contractor-submission`, `decision`, `closure`, `warehouse-return`, `cancel`), porque elas leem só
  `trip_occurrence_cases`. Prova: `test/integration/cargo-arrival-occurrence-case.integration.ts` (HTTP, sem `UPDATE`
  direto). ⚠️ **O acerto `PUT …/case/settlement` não funcionava** (a ponte acerto → cobrança lançava
  `DELIVERY_CLIENT_NOT_RESOLVED` sem viagem) e a decisão `goods_paid` não fechava; hoje o acerto é gravado **sem
  cobrança** quando a ocorrência não tem viagem (`DrizzleOccurrenceSettlementRepository.lockWritableCase` devolve
  `hasTrip`). `redelivery-*`, `reimbursement` e o detalhe/feed `GET /trip-occurrences…` não foram exercitados sobre
  ocorrência de recebimento (o detalhe/feed exigem viagem). A tela do escritório lê `GET /cargo-arrivals/:id/occurrences`.
- **Concluir a devolução** (`decideCargoArrivalReturn`) recusa, nesta ordem: nota em viagem viva
  (`CARGO_ARRIVAL_DOCUMENT_IN_LIVE_TRIP`), tratativa da origem cancelada (`CARGO_ARRIVAL_RETURN_CASE_CANCELLED`, 409,
  `CargoArrivalReturnCaseCancelledError`, mensagem própria) e tratativa ausente ou não `decided|closed`
  (`CARGO_ARRIVAL_RETURN_DECISION_PENDING`). **Marcar** também recusa a origem com tratativa cancelada; o caso de uso lê a
  tratativa da ocorrência pedida ao marcar e da `return_occurrence_id` ao concluir. Teto `cargo-arrival-return`
  (120/300 s, Postgres) nas três rotas da devolução.
- **A foto sobe antes da trava da chegada.** `execute` do caso de uso: valida a foto → `reads.findReplay` (a chave, fora da
  trava; outro pedido = 409, o mesmo = devolve a gravada sem tocar o bucket) → `uploadCargoArrivalOccurrencePhoto` (o id da
  ocorrência vem de `newOccurrenceId`, gerado antes: a chave do objeto leva o id) → transação (`registerWithinLock`:
  trava, chave de novo, linhas via `persistCargoArrivalOccurrencePhoto`). Foto subida é apagada na recusa, na falha (por
  `runWithStoredObjectCleanup`) e no reenvio que a corrida resolveu dentro da trava (`discardUploadedPhoto`). Preço: recusa
  depois do upload sobe e apaga ≤ 512 KiB; a rota tem teto. Provas: `…-occurrence-upload.integration.ts` (a trava da
  chegada livre durante o upload, a corrida da mesma chave, o reenvio sem bucket, a recusa sem órfão).
- **A foto não derruba a leitura:** `readAttachmentsSafely` (repositório de leitura) isola a assinatura por ocorrência e
  loga `cargo_arrival_occurrence.attachments_unavailable` (`errorName`, `occurrenceId`). ⚠️ O N+1 de anexos (uma consulta por
  ocorrência) segue: agrupar exige método novo em `DrizzleOccurrenceAttachmentRepository` (da viagem) — follow-up.
- **Nome de tipo:** criar/renomear um tipo de viagem com o nome de um tipo de recebimento escondido (ou qualquer nome já
  usado: o índice é por empresa em qualquer etapa) é 409 `OCCURRENCE_TYPE_NAME_TAKEN` (`rethrowOccurrenceTypeViolation`).
- **Erros do módulo:** `CargoArrivalOccurrence{NotReadBack,ReplayUnreadable,NotSaved}Error` são `DiagnosableError`.
  A semente de recebimento avisa `occurrence_type_seed.receiving_none_created` (`{ companyId }`, stderr do pre-deploy) quando
  grava 0 numa empresa sem tipo `receiving`.

## Spec 238 T1.1 — o calendário de dias úteis por cidade (ADR-0096)

Módulo `src/business-calendar/` (só domínio + um helper de borda; sem rota, sem tabela, sem consumidor no worker nem
no cron). `buildBusinessCalendar({ cityIbgeCode, coverage, municipalRules, stateRules, saturdayIsBusinessDay })`
monta nacionais ∪ estaduais da UF (prefixo de 2 dígitos do IBGE) ∪ municipais da cidade para no máximo 5 anos e
congela; `isBusinessDay`, `explainDay`, `addBusinessDays` (`{ date, dayZero }`) e `countBusinessDays` (`from < d ≤ to`)
contam sobre ele. Detalhe da semântica (dia 0 que avança, feriado de fim de semana não transferido, 29/02 só em ano
bissexto, recusa tipada `BUSINESS_CALENDAR_*`): ADR-0096.

- **Data civil é texto** `YYYY-MM-DD`, contada com `Date.UTC`/`getUTC*`. A política não lê relógio nem fuso;
  `toCivilDate({ instant, timeZone })` (`application/civil-date.service.ts`) é a borda.
- ⚠️ **`bun test` roda o processo em UTC**: trocar `getUTCDay` por `getDay` passa em todos os testes do processo. Só o
  subprocesso com `TZ=America/Sao_Paulo` (`test/business-calendar/time-zone-probe.ts`) pega — medido por mutação.
- **Paridade com o painel** por conjunto de datas, 1900–2199 (`national-holiday-parity.contract.ts`, carrega
  `brazilianHoliday.service.ts` por URL de arquivo). Mudou feriado no painel? Mude aqui, ou o contrato reprova.
- Decidido pelo usuário (ADR-0096): o `yearly` é guardado como regra **e** materializado como data fixa por ano em
  `municipal_holidays`, e o roteirizador (`holiday_on = input.date`) não muda (Q1; desenho na T1.2/T1.3, migration com
  aprovação humana); a cidade é a do **destino físico**, resolvida pelo chamador com `resolvePhysicalDestination`, nunca
  o endereço cadastrado do destinatário (Q2); fuso fixo de São Paulo (Q3).

## Spec 236 T1.1 — o prazo de entrega da nota (só a política; sem consulta, rota ou tela)

`src/trips/domain/delivery-deadline.policy.ts` (`resolveDeliveryDeadline`) é pura: datas civis em texto, sem relógio,
sem fuso, sem I/O. `dueOn = addBusinessDays(chegada, N)` da 238, com o **N copiado de `cargo_arrivals`** (não o perfil
atual); a janela de 24 h de separação **não existe na assinatura** (corre dentro dos dias úteis). Estados: `on_time`
(com `businessDaysRemaining`), `due_today`, `overdue` (com `businessDaysLate`, que pode ser 0), `delivered_on_time`,
`delivered_late` (os dois terminais: ignoram o `today`) e `not_applicable` com motivo (precedência: cancelada,
devolvida, a devolver ao contratante, liberada; depois sem chegada, sem prazo, sem cidade do destino físico). Entrega no
dia do vencimento é no prazo. Só informa: nada em `src/fleet/**`, `src/cte-*/**`, `delivery-proof-*.ts`,
`proof-pending.query.ts` e `drizzle-current-driver-trip.repository.ts` pode importá-la (contrato estático
`delivery-deadline-isolation.contract.ts`).

- A borda `application/delivery-deadline-input.service.ts` (`resolveDeliveryDeadlineFromInstants`) converte chegada,
  entrega e "agora" em **dia civil de São Paulo** (`toCivilDate`, fuso fixo). A hora não conta: chegar às 23:30 de
  segunda é chegar na segunda. Quem chama passa o instante da entrega de `deliveredMomentSql`, nunca a chegada ao
  servidor.
- ⚠️ `dueOn` é **data**, não instante: `new Date('2026-10-15')` vira 14/10 em São Paulo. Nunca converter de volta.
- A fixture da 238 inventa um aniversário em BH (29/02); o contrato da 236 usa a própria (`delivery-deadline-calendar`).
- Falta (T1.2): `loadRules` em série, guarda do painel, leitura no `readTripDetail`. Evidência e mutações:
  `specs/236-*/evidence.md`.

## Spec 237 — Fase 4b, a migration da prévia por e-mail encaminhado (T4.6)

`20261007040900_cargo_preview_email_intake` (aprovada pelo usuário; aditiva, com `rollback.sql` que **recusa**
enquanto existir prévia por e-mail):

- `contractor_receiving_profiles`: `preview_inbound_token_hash char(64)` (hash do token do endereço de entrada,
  único por empresa quando não nulo), `preview_forwarder_allowlist text[]` e `preview_sender_allowlist text[]`
  (1..20 entradas de 3 a 254 caracteres, sem NULL, vazia, controle, espaço, vírgula, `<>` nem `|` — T4.7a); CHECK: token ⇒ as duas listas. **A rota
  `PUT /contractors/:id/receiving-profile` não conhece as colunas** (T4.6b); o worker as lê.
- `cargo_previews`: `uploaded_by_user_id` nulo e `source` aceita `email`; `cargo_previews_uploader_check` amarra
  `source = 'upload'` a quem enviou. Nada na API lê `uploaded_by_user_id` fora do insert do upload.
- `cargo_preview_email_intakes` (append-only por trigger): uma linha por e-mail que casou o token — `accepted`
  (com `preview_id`, `is_replay`, `raw_object_id`) ou `rejected` (com `reason_code`) —, único por
  `(company_id, provider_email_id)`. Só ids e códigos; `reason_code` inclui `RATE_LIMITED` (o rastro do excesso, uma linha por
  contratante e janela) e `FORWARDER_DKIM_UNVERIFIABLE` (T4.7a). Constantes (`CARGO_PREVIEW_EMAIL_*`) em
  `shared/cargo-preview.constant.ts`, cópia byte a byte no worker.
- Teste da migration: `test/database-migration/cargo-preview-email-intake.assertion.ts` (CHECKs, único, append-only,
  rollback que recusa e que desfaz). Quem for ler a recusa na ficha do contratante (T4.6b) consulta a tabela por
  `(company_id, contractor_id, recorded_at desc)` — o índice é por `recorded_at`, o relógio do banco, que a janela de
  e-mails do worker usa. **O upload recusa `Idempotency-Key` com o prefixo `email:`** (reservado à prévia por e-mail, 400).
  A pasta se chama `20261007040900_…`, depois da última de staging (renomeada na T4.7a, com o snapshot refeito).

## Spec 249 — a viagem na rua troca de motorista e de ajudante (ADR-0097)

- **Rota:** `POST /v1/trips/:id/crew-transfers`, permissão `trip.report-on-behalf` (admin, operador e
  financeiro; o separador não alcança). Corpo estrito `{driverIds, helperIds, reason}` — **sem
  `vehicleId`**. 201 com `data.trip` e `data.transfer` (`id`, `costBefore`, `costAfter`,
  `costDifference`, `costHasGaps`, `mdfeDriverDivergence`; decimais string de 2 casas).
- **Janela:** `isCrewTransferable` = `dispatched`, `in_transit`, `on_delivery_route`. Ação própria
  `transferCrew` (publicada na lista `trip[]` de `allowed-actions`); a janela da 217 (`defineCrew`)
  não mudou. `separating` e `loading` seguem sem troca.
- **O que não muda:** `status`, `vehicle_id`, rota congelada, pedágio, ETA, paradas e notas. Em
  `trips` só `updated_at`. **Nunca** `clearPlannedRoute`.
- **Valor:** frete e receita não dependem do motorista. O custo (diária de motorista e de ajudante) é
  **recalculado** e o evento guarda `cost_before`, `cost_after` e `cost_difference`. A conta é a de
  `read-trip-valuation` (`trip-crew-cost.policy.ts`, `buildCostParcels` delega a ela) e roda **em
  memória, dentro da transação e sob `FOR NO KEY UPDATE`** — não se lê `readContext` na transação.
- **Histórico:** `trip_crew_events` (append-only por trigger; FK composta RESTRICT; CHECK
  `cost_difference = cost_after − cost_before`), `audit_logs` `office.trip.crew-transfer` (só ids
  opacos, sem nome nem motivo) e o item `crew_transfer` na linha do tempo (conteúdo aninhado em
  `crewTransfer`; `costDifference` some para quem não tem `trip.financials`).
- **MDF-e:** `mdfe_driver_divergence` é verdadeiro quando há MDF-e `authorized` **e** o conjunto de
  motoristas (`role='driver'`) mudou. O MDF-e segue com o condutor anterior; incluir o condutor é
  spec futura. Troca só de ajudante nunca diverge (ADR-0065).
- **Erros:** `409 STATE_TRANSITION_NOT_ALLOWED` (`TRIP_CANCELLED`, `TRIP_COMPLETED`,
  `TRIP_NOT_DISPATCHED`), `409 TRIP_CREW_UNCHANGED`, e os erros de ficha inelegível da criação.
- **Risco conhecido (D10):** `financial-summary.query.ts` une o resultado congelado ao `trip_drivers`
  **atual**; depois de uma transferência o total por motorista da viagem migra para o novo.

## Spec 247 — A devolução soma os itens e registra o valor pago (ainda não publicada)

**Dado.** Migration `20261007033420_occurrence_declared_amount` (aditiva, com `rollback.sql`): seis colunas no tipo
(`reference_number_mode`/`_label`, `declared_amount_mode`/`_scope`/`_label`, `email_item_line_template`), os dois modos **nulos** nas duas
exceções, `reference_number` e `declared_amount` na ocorrência, `unit_value` e `declared_amount` nos produtos. CHECKs geradas das
constantes; `declared_amount_scope = 'item'` com modo ligado exige `items_mode <> 'off'` (422
`OCCURRENCE_TYPE_DECLARED_AMOUNT_NEEDS_ITEMS`). A soma nunca é gravada: é derivada. `unit_value` é a **cópia** do `vUnCom` no registro
(a 166 aponta produto por código; mesma linha de menor `ordinal`).

**Cálculo.** `trips/domain/occurrence-amount.policy.ts`, `bigint`, sem `Number`/`parseFloat`: linha = `round(quantidade × vUnCom)` meio para cima
(`3 × 19,995 = 59,99`; sem quantidade = `vProd`); `somaItens` = soma das linhas arredondadas; `valorItem` = valor pago da linha, senão a soma;
`valorDeclarado` = valor pago da ocorrência, senão Σ `valorItem`. Espelhado em `frontend-driver` e `frontend-transportada` por contratos que
rodam os **mesmos casos**; mutações (truncar, somar antes de arredondar, `Number`) ficam vermelhas.

**E-mail.** `occurrence-template.policy.ts`: duas listas fechadas de marcadores (corpo/assunto e linha de item); `{{linhasItens}}` renderiza a
linha por item, teto de 200 ("e mais N itens"); valor de item nunca é re-renderizado (`{{` na descrição sai literal); `{{valorNota}}` em
`7.840,64`; `{{quantidadeItem}}` é a quantidade da ocorrência (D5); `{{numeroNotaSemSerie}}` novo, `{{numeroNota}}` intacto. Prévia pelo
servidor: `POST /company-settings/occurrence-types/email-preview` (`settings.manage`, rate limit), mesma função do envio. RF2: chave do aviso interno
e assunto/corpo da contratante são independentes.

**Registro do motorista (T4.4).** Itens `(productCode, quantity, declaredAmount?)`, `referenceNumber?`, `declaredAmount?`; `.strict()` recusa
preço/unidade (400). Exigência efetiva por `resolveOccurrenceRequirements` com contratante e destinatário lidos da nota; modo efetivo `off`
descarta (M2, não recusa). CA03 (só a configuração decide) provada com tipos de mesmo nome e config diferente, e vice-versa, com mutação por nome.

**Snapshot, detalhe e correção.** O snapshot traz produtos por nota (uma consulta por viagem; leitura isolada com `logger.warn`
`driver_snapshot_products_read_failed`; só sintético: 76 KB para 300 itens, viagem inteira extrapolada acima de 256 KiB). O detalhe da
ocorrência ganhou `referenceNumber`, `declaredAmount` (`"0.00"` nunca `null`), `itemValues` (`unitValue` com 4 casas, senão o centavo da soma se perde) e
`requirements`. A correção (T7.2b N1) usa o modo efetivo (`off` descarta; `required` recusa só `null` explícito). Golden compartilhado:
`test/fixtures/occurrence-detail-values.golden.json` idêntico no painel.

**Decisões pendentes e riscos abertos.** (a) O registro do motorista não abre a tratativa da 164. (b) `previous_items` não guarda número/valor da
ocorrência. (c) T0.2 (tipos com `email_template_key` e `emails_contractor`) não medida em staging. (d) `requirements: null` por tipo inexistente sem
integração. (e) M4: `{{quantidadeItem}}` com vírgula em modelo antigo. Gates e vermelhos: specs/247-\*/evidence.md.
