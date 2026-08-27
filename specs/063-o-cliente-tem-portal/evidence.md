# 063 — o cliente tem portal · evidência

## T001 — ADR-0050 e a spec sem cláusula em aberto

`docs/adr/0050-o-cliente-tem-portal.md`, e as quatro `[NEEDS CLARIFICATION]` da spec respondidas.

## T002 — o vínculo do contratante com o documento

**Mudança de desenho, decidida pelo cliente em 2026-08-27, no meio da task:** o acesso deixou de ser
código de uso único anônimo e passou a ser **conta de usuário**. A ADR-0050 §2 foi reescrita e as
tabelas `client_access_codes` / `client_portal_sessions`, que chegaram a ser escritas, foram
descartadas antes de gerar migration — não há migration morta no repositório.

O que entrou:

- papel `contractor` em `COMPANY_ROLES` (e, por derivação, no CHECK do convite — contratante se
  convida, ao contrário do `automation`), com a permissão única `deliveries.track`;
- `contractor_portal_bindings` — membership ↔ `contractors`, com `company_id` nas **duas** FKs
  compostas, porque a FK simples aceitaria amarrar a conta de uma empresa ao contratante de outra;
- `trip_location_pings` — `on delete cascade` nas duas pontas, que é o que torna o expurgo do rastro
  consequência de fechar a viagem em vez de rotina que alguém esquece de rodar;
- `fleet_drivers.location_sharing_consent_at`, anulável e sem `default` — um `default now()` teria
  dado consentimento de toda a frota numa migration.

Comandos executados:

```
bun run typecheck                                                     # limpo
bun test ./test/contractor-portal-schema.contract.test.ts \
        ./test/authorization.contract.test.ts \
        ./test/identity-schema.contract.test.ts \
        ./test/separator-role.contract.test.ts \
        ./test/fleet-domain.contract.test.ts                          # 111 pass / 0 fail
make migration-test                                                   # 86 pass / 0 fail
```

Três contratos existentes reprovaram, como deviam, e foram atualizados com o porquê:
`authorization.contract.test.ts` (a matriz por extenso), `identity-schema.contract.test.ts` (a lista
de papéis e o CHECK) e `fleet-domain/person-name.contract.ts` (o registro completo do motorista).

### Buracos declarados

- **Ninguém lê `trip_location_pings` ainda** — a tabela existe, o expurgo é por `cascade`, mas a
  ingestão (T008) e a leitura no portal (T010) não chegaram. Até lá o consentimento do motorista não
  tem onde ser dado.
- **O vínculo não tem rota** — T004. Hoje ele só se cria por SQL, e por isso nenhuma conta de
  contratante existe em ambiente nenhum.

## T003 — o recorte do contratante

O escopo é **derivado da conta**: `resolveContractorScope` é a única fonte, e ela recebe vínculo, não
filtro. Não existe assinatura no módulo por onde um documento vindo da requisição entre no caminho —
e o contrato confere isso por texto de fonte, porque a falha aqui compilaria e passaria em todo teste
de caminho feliz, aparecendo só no dia em que alguém mandasse o CNPJ do vizinho.

Quatro decisões que ficaram escritas no código:

- **conta sem vínculo é 403, não lista vazia.** Lista vazia faria o portal parecer funcionando e a
  pessoa concluir que não tem entrega nenhuma;
- **documento em branco no cadastro não vira escopo** — casar com string vazia alcançaria participante
  sem documento, que é a nota de terceiro que este recorte existe para não mostrar;
- **os dois papéis contam** (`emitter` e `recipient`): restringir ao destinatário deixaria de fora a
  indústria que contrata o frete para entregar na loja do cliente dela, que é o caso mais comum;
- **o `join` com a viagem é `left`** — nota importada e ainda parada é "recebida", não ausência —, e
  ele exclui o vínculo com `released_at`: nota desvinculada volta a ser nota sem viagem.

Comandos executados:

```
bun run typecheck                                                     # limpo
bun run lint                                                          # limpo
bun test ./test/contractor-portal.contract.test.ts                    # 8 pass / 0 fail
DATABASE_URL=… bun test ./test/integration/contractor-portal.integration.ts   # 3 pass / 0 fail
```

A integração prova contra Postgres o que só o banco prova: a nota do vizinho existe na mesma empresa
e **não aparece**; a nota sem viagem aparece; a desvinculada volta a `null`; e inativar o contratante
fecha o portal da conta dele.

### Buracos declarados

- **Ainda não há rota** — T005. O use case existe e é testado, mas nada o chama, então nenhum
  contratante alcança nada por HTTP.
- **Sem cursor**: o teto é `CONTRACTOR_DELIVERY_LIMIT = 100`, sem paginação. Contratante com mais de
  cem notas no período vê as cem mais recentes e **não é avisado disso** — quando aparecer, é cursor
  igual ao da tabela de CT-es.

## T004 — administrar o vínculo

Três rotas em `/contractors/:id/portal-users`, todas sob **`users.manage`** — e não `settings.manage`.
São decisões diferentes que moram na mesma tela: administrar o cadastro do contratante decide **para
quem se cobra**; amarrar uma conta a ele decide **quem enxerga a operação**. O contrato reprova
`settings.manage` de propósito.

Duas guardas no repositório:

- **só membership com o papel `contractor` pode ser amarrada** (`409
CONTRACTOR_PORTAL_ROLE_REQUIRED`). Amarrar um operador não daria acesso nenhum — `deliveries.track`
  não está no papel dele —, e é justamente isso que faz o erro valer: quem tentou acreditaria ter
  concedido acesso, e ninguém descobriria até o cliente ligar dizendo que não entra;
- **amarrar duas vezes é o mesmo vínculo** (`onConflictDoNothing`), porque quem administra clica de
  novo quando a rede some.

Comandos executados:

```
bun run typecheck                                # limpo
bun run lint                                     # limpo
bun run test                                     # 3507 pass / 0 fail / 19 skip
bun run test:integration                         # 166 pass / 0 fail / 4 skip
```

Quatro contratos existentes reprovaram e foram atualizados com o porquê: o CHECK do convite
(`user-invitation-schema`, que agora aceita `contractor` — contratante se convida) e as duas listas
de colunas do motorista (`fleet-schema/drivers`, pelo consentimento anulável).

⚠️ A primeira rodada de `test:integration` acusou uma falha em "drains and exits cleanly on SIGTERM";
era **do ambiente da sessão** (o subprocesso herda `process.env`, e faltavam `KEYCLOAK_ADMIN_*`), não
do código. Com o `.env` do repositório carregado, passa.

### Buracos declarados

- **Não há tela** — criar o contratante-usuário hoje é convidar por `/company-users` com o papel
  `contractor` e depois chamar `POST /contractors/:id/portal-users` na mão. A tela entra com o
  frontend (T009–T010).
- **`GET /client/me/deliveries` continua sem existir** (T005): o contratante já pode ser amarrado,
  mas ainda não tem o que abrir.

## T005 — `/client/me/deliveries`

Uma rota, sob `deliveries.track`, escopo `company`. Ela **não recebe id de nada** — nem de nota, nem
de viagem, nem de contratante — e nem lê query: filtrar por documento é a única coisa que ela nunca
vai oferecer. Não há BOLA a testar porque não há objeto que o cliente possa nomear.

O payload é lista fechada, e o contrato compara **as chaves por extenso**: campo novo no tipo interno
não vaza para o portal sem alguém decidir, por escrito, que ele pode sair. O que ficou de fora:

- **id interno** de nota, de viagem e de vínculo — a chave de acesso já identifica a nota para quem é
  dono dela, e um UUID nosso na mão do cliente é identificador para tentar em outra rota no dia em
  que alguma aceitar id;
- **motorista, placa e roteiro** — é a operação da transportadora. Saber que a mesma carreta leva a
  carga do concorrente é informação comercial de graça;
- **valor de frete** — o que o contratante paga está na fatura dele.

Comandos executados:

```
bun run typecheck                                # limpo
bun run lint                                     # limpo
bun test ./test/contractor-portal.contract.test.ts   # 17 pass / 0 fail
bun run test                                     # 3512 pass / 0 fail / 19 skip
```

`docs/SECURITY.md` ganhou a seção do portal: a rota **não tem limite de requisição**, como o resto
desta API — o que muda é que agora existe conta legítima na mão de alguém de fora. O que ele lê é o
que já é dele, então o custo é de disponibilidade; o desfecho é o mesmo limitador que as rotas de
senha esperam.

### Buracos declarados

- **Sem integração de ponta a ponta pela rota**: o recorte é provado contra Postgres na T003 (pelo
  repositório) e a serialização no contrato de rota. Falta o teste que atravessa os dois com sessão
  de verdade — ele entra com o E2E da T011.
- **Sem cursor**, ainda: cem linhas por chamada, e o contratante com mais notas não é avisado.

## T006 — agendar pelo portal

Uma rota: `POST /client/me/deliveries/:accessKey/schedule`. Ela **não recebe id de parada nem de
viagem** — o portal nomeia a nota pela chave de acesso e o servidor descobre a parada, o que mantém a
regra de "nenhuma rota do portal aceita id interno" também aqui. A chave é canonicalizada antes de
ser conferida (a etiqueta chega na caixa que a impressora usou), e o que não casa o padrão é `400`.

**Nenhuma regra de agendamento mora no portal** (ADR-0050 §6): o caso de uso resolve a parada e chama
`tripStopSchedules.save`, o mesmo da 060 — mesma validação de "confirmado sem hora", mesmo bloqueio
de despacho, mesmo `diverged_at`. Se a regra fosse reescrita, no dia em que o WhatsApp também agendar
existiriam três versões dela.

O portal só escreve `confirmed` e `refused`: `pending` e `requested` são movimentos da
transportadora — é ela que pede —, e oferecê-los aqui deixaria o cliente escrever pendência em nome
de quem deveria resolvê-la. Chave que não é dele, chave que não existe e nota que ainda não entrou em
viagem respondem **igual** (`404`).

## T007 — o repasse aprovado pela conta

`GET /client/me/extra-charge-batches` e `POST .../:id/decisions`, com a máquina de estados do
lançamento vinda inteira da 060 — o portal acrescenta o **recorte**, não uma segunda máquina. O lote
precisa ser de um contratante amarrado à conta, e a pergunta é feita **antes** de qualquer leitura:
lote do vizinho responde como lote inexistente, e a decisão nem chega ao ciclo.

Duas decisões:

- **`charges.decide` é permissão própria**, ao lado de `deliveries.track`. Aprovar cobrança é
  dinheiro, e não sai de carona com acompanhar entrega — o contrato prova que `deliveries.track`
  sozinha lista mas não decide;
- **a trilha guarda o `userId` da conta**, não o token. Na página pública da 060 quem decidiu foi
  quem tinha o link; aqui dá para dizer _qual pessoa do cliente_ aprovou, e é essa a razão de o
  portal ter conta em vez de link.

O relatório sai com o mesmo recorte da página pública: sem `clientTaxId`, sem id de viagem, sem id de
nota.

Comandos executados:

```
bun run typecheck                                    # limpo
bun run lint                                         # limpo (monorepo inteiro)
bun run format:check                                 # limpo
bun run --cwd apps/api-transportada test             # 3541 pass / 0 fail / 19 skip
bun run test:integration                             # 171 pass / 0 fail / 4 skip
```

⚠️ **A integração desta spec derrubou três testes vizinhos, e a causa era minha.** Cada teste abria
um banco descartável próprio — quatro rodadas de migration — e a carga estourava o timeout de cinco
segundos de suítes que rodam em paralelo. Passou a ser **um banco para os quatro testes**, com cada
um semeando a própria empresa: 12,8s → 1,6s, e a integração inteira voltou a 0 falhas. O isolamento
continua real porque todo dado aqui é escopado por `company_id`.

### Buracos declarados

- **O agendamento do portal não avisa a transportadora.** A linha muda de estado e o despacho
  destrava, mas ninguém é notificado — `NOTIFICATION_TEMPLATE_KEY` não tem chave de agendamento.
  Quem for implementar precisa de chave nova, como o aviso de CNH a vencer.
- **Nada valida a janela do cliente contra o calendário da 060 no portal**: o contratante confirma a
  hora que quiser, mesmo fora da janela cadastrada. É coerente — quem confirma é o dono da janela —,
  mas significa que `delivery_client_windows` não é lida neste caminho.
- **Sem cursor** também nos lotes: os vinte e quatro mais recentes.

## T008 — o rastro do motorista

As três guardas da ADR-0050 §5, uma em cada camada:

1. **Sem consentimento não se grava.** A checagem é no caso de uso, não na rota — a rota é chamada
   por um relógio no celular, e quem esquece de checar é quem escreve a próxima rota. Fora de viagem
   e sem consentimento respondem **igual** (`ignored`): distinguir daria ao celular um jeito de
   perguntar "esse motorista consentiu?". No HTTP são `202` e `201`, para o log de produção separar
   "chegou e não valia" de "chegou e virou linha" sem abrir o banco.
2. **O rastro morre com a viagem.** `purgeByTrip` roda no fechamento (`trips.close`) e no
   cancelamento — fora da transição, como o congelamento do resultado financeiro da 061: apagar
   dentro dela seguraria o fechamento por uma varredura de tabela que só o portal lê. Além disso,
   **retirar o consentimento apaga o rastro vivo na mesma transação** — deixá-lo para o fechamento
   manteria no banco, por horas, a posição de quem acabou de dizer que não queria ser seguido.
3. **O cliente vê a carga, não quem dirige.** `GET /client/me/deliveries/:accessKey/location`
   devolve `latitude`, `longitude` e `recordedAt`, e o contrato compara as chaves por extenso. Sem
   rastro é `data: null`, não `404`: a nota é dele e existe — o que não existe é posição agora.

A coordenada trafega como **texto** com padrão de até sete casas, o mesmo motivo de dinheiro nunca
ser float: `number` traria erro binário para dentro do campo. A rota do celular não nomeia viagem —
o servidor resolve a viagem corrente do próprio motorista, e `dispatched` conta junto com
`in_transit` porque o caminhão sai da doca antes de alguém marcar a primeira chegada.

⚠️ **Um defeito que só o Postgres achou:** `findScheduleTarget` devolvia `null` quando a nota não
tinha parada, e o rastro passou a usar a mesma consulta — então a leitura de posição respondia
"entrega não encontrada" para toda nota recém-vinculada, porque a parada é **derivada** e nasce
depois. Hoje `stopId` é anulável no tipo: quem precisa da parada (o agendamento) recusa o nulo; quem
precisa só da viagem (o rastro) segue.

Comandos executados:

```
bun run typecheck                                  # limpo
bun run lint                                       # limpo (monorepo inteiro)
bun run --cwd apps/api-transportada test           # 3551 pass / 0 fail / 19 skip
bun run test:integration                           # 172 pass / 0 fail (duas rodadas seguidas)
```

⚠️ Uma rodada intermediária de `test:integration` acusou **uma** falha que não voltou nas duas
rodadas seguintes e não deixou nome no log. Não sei qual foi; registro aqui em vez de omitir. As
suítes desta app rodam em paralelo contra o mesmo Postgres e têm timeout de cinco segundos — é o
mesmo tipo de instabilidade que a carga dos bancos descartáveis causou na T007.

### Buracos declarados

- **Nada expira o rastro de viagem que nunca fecha.** O expurgo é consequência de fechar ou cancelar;
  uma viagem esquecida em `in_transit` guarda posição indefinidamente. Uma rotina de expurgo por
  idade é o desfecho, e ela não existe.
- **Sem limite de frequência**: o celular pode mandar posição de segundo em segundo, e cada uma vira
  linha. Não há teto por viagem nem descarte de ping quase idêntico ao anterior.
- **Não há tela de consentimento** — a rota existe, o PWA do motorista ainda não a chama (T009–T010).

## T009 e T010 — `apps/frontend-client`

App própria: build, bundle, domínio e Dockerfile separados (ADR-0050 §1). O painel carrega frota,
financeiro, fiscal e cadastro; servir o mesmo bundle a um usuário externo seria depender de que
**toda** condicional de permissão no cliente esteja certa, para sempre, em todo deploy.

Três coisas em que ela diverge do painel, todas deliberadas e todas com contrato:

- **`connect-src` sem destino externo nenhum.** O painel tem quatro (BrasilAPI, Photon, IBGE); aqui
  são a própria origem, a API e o Keycloak. Qualquer origem que entrasse seria um terceiro sabendo
  que uma carga daquele cliente está em trânsito. Uma varredura por `https://` no código falha se
  alguma aparecer sem estar declarada;
- **`Permissions-Policy: camera=(), geolocation=(), microphone=()`** — as três negadas. O portal não
  bipa etiqueta (isso é o separador), não rastreia ninguém (quem manda posição é o celular do
  motorista, no outro app) e não grava áudio;
- **sem atalho de autenticação de fumaça.** O provedor é cópia do painel menos o bypass, e o contrato
  falha por nome se ele reaparecer: um bypass num app servido a usuário externo é o tipo de código
  que ninguém quer descobrir ligado em produção.

### As telas

Duas: **Entregas** e **Repasses**. A tradução do vocabulário mora num lugar só
(`deliveryStatus.service.ts`): `separating`/`loaded` é o que acontece no galpão da transportadora, e
o cliente quer saber se a nota **saiu** — `null` vira "Recebida" em vez de sumir, e "Devolvida" vence
"Entregue", porque nota que voltou não é entrega concluída.

**O mapa é desenho nosso**, sem tile de terceiro: projeção equirretangular com a longitude corrigida
pelo cosseno da latitude, janela fixa de meio grau (~55 km), grade e marcador em SVG. ⚠️ **Divergência
da ADR:** ela previa a malha do IBGE, como no mapa de zonas do painel — mas o payload mínimo do
portal (§4) **não carrega cidade nem UF**, e alargá-lo só para desenhar um contorno trocaria
privacidade por enfeite. Ficou o localizador com escala. Foi essa decisão que zerou o `connect-src`
externo.

Sem posição, a tela diz "sem posição no momento" e **não explica por quê**: o motorista pode não ter
consentido, e dizer isso ao cliente seria contar algo que é do motorista.

Comandos executados:

```
bun run lint                                 # monorepo inteiro, limpo
bun run typecheck                            # limpo
bun run test                                 # api 3575/0 · client 17/0 · demais 0 fail
bun run format:check                         # limpo
bun run --cwd apps/frontend-client build     # ok, CSP emitida no dist
```

**Dois contratos existentes reprovaram, e os dois estavam certos:** o que exige que todo `Dockerfile`
copie o `package.json` de **toda** app do workspace (senão `bun install --frozen-lockfile` recusa o
lockfile e o build morre — já derrubou o deploy três vezes), e o do filtro de mudança do pipeline,
que cobra alvo declarado para cada app (app sem alvo nunca publica, e nada fica vermelho para
avisar). Os dois foram atendidos: seis `Dockerfile` atualizados, alvo `client` em
`changed-targets.sh` e no `deploy.yml`.

Ligado ao monorepo: `FRONTEND_CLIENT_PORT=53100`, `VITE_CLIENT_APP_URL`, a origem no
`FRONTEND_ORIGIN` (CORS), `make dev` subindo a quarta app e `make smoke` conferindo a raiz e o
manifest dela. `compose.yaml` **não muda** — ele só sobe infra, nenhum frontend.

### Buracos declarados

- **Nenhum teste de tela.** Esta app não tem DOM no `bun test`, como o painel: o que se prova é o
  serviço puro (tradução de estado, projeção do mapa) e o texto de fonte (CSP, cabeçalhos). Clique,
  foco e teclado ficam para o Playwright — que **não existe aqui** (sem `playwright.config.ts`, sem
  alvo no `make smoke` além do healthcheck).
- **Nenhum design system.** O portal tem CSS próprio, curto, com os tokens copiados por valor. Os
  contratos de design do painel (select, skeleton, ícone, checkbox, data) **não valem aqui**, e os
  campos são `input` nativo — inclusive o `datetime-local`, que o painel proíbe. Foi troca
  consciente: trazer 1.300 linhas de CSS de componente que ele não usa seria peso morto no celular
  do cliente. Quem for crescer esta app precisa decidir isto de novo, por escrito.
- **Sem service de deploy criado**: o alvo existe no filtro e no gate, mas ninguém provisionou o
  serviço `frontend-client` na hospedagem. O primeiro deploy vai falhar até isso ser feito.
- **Sem tela de vínculo no painel**: continua valendo o buraco da T004 — criar um contratante-usuário
  é convidar por `/company-users` e chamar `POST /contractors/:id/portal-users` na mão.

## T011 — o ciclo inteiro e a enumeração

`test/integration/contractor-portal-end-to-end.integration.ts`, contra Postgres, pelos **use cases
de verdade**. Dois testes:

**O ciclo.** Lista (a nota dele aparece, a do vizinho — que existe na mesma empresa — não) → agenda
pela chave de acesso, e o agendamento fica gravado pela máquina da 060 com protocolo → posição:
**nula antes do consentimento**, e depois dele coordenada e hora, com as chaves conferidas por
extenso → lote de repasse, com o total do relatório batendo com a soma das linhas → decisão linha a
linha, uma aprovada e uma recusada com motivo. A última asserção é a que importa para o desenho:
`delivery_charge_events` guarda o **`actorUserId` da conta do contratante** e `decidedByToken` nulo —
na página pública da 060 é o contrário, e poder dizer _qual pessoa do cliente_ aprovou é a razão de o
portal ter conta em vez de link.

**A enumeração.** No desenho de conta ela mudou de forma: não há login anônimo a sondar, então a
pergunta é o que um contratante autenticado descobre sobre o que não é dele. O teste compara
`{code, status}` de três pares — chave do vizinho vs. chave inventada, agendamento no vizinho vs. em
chave inventada, lote do vizinho vs. lote inexistente — e exige que sejam **idênticos**. Se "não é
sua" respondesse diferente de "não existe", bastaria varrer chaves de acesso para mapear a carteira
da transportadora. O teste também confere que a tentativa recusada **não escreve**: o lançamento do
vizinho continua `submitted`.

Comandos executados:

```
bun run typecheck                            # limpo
bun run --cwd apps/api-transportada test     # 3575 pass / 0 fail / 19 skip
bun run test:integration                     # 174 pass / 0 fail / 4 skip
```

Um defeito do próprio teste, que vale registrar: o token do lote é único **no banco inteiro**, e os
dois testes semeiam mundos na mesma base compartilhada — o segundo quebrou na primeira execução. O
token virou derivado de UUID.

`CLAUDE.md` ganhou a seção `frontend-client` e a linha na estrutura, como manda a documentação viva.

### Buracos declarados

- **O E2E é da API, não da tela.** Nada exercita o `frontend-client` de ponta a ponta: sem Playwright
  nesta app, o caminho "abrir o portal, entrar, agendar" não é verificado por máquina nenhuma.
- **O vínculo é semeado por `insert` no teste**, não criado pela rota `POST
/contractors/:id/portal-users` — a rota tem contrato de HTTP próprio, mas o E2E não atravessa os
  dois juntos.
- **Nada testa o `separator` nem o `operator` batendo em `/client/me/*`**: a defesa é a permissão, que
  o contrato de rota cobre, e o teste de papéis por extenso (`separator-role.contract.test.ts`) ainda
  não lista as rotas do portal.
