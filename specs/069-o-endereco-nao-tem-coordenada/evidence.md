# Evidências

## Fase 0 — O adendo, antes do código

### T001 ✅ 2026-09-01 — Adendo na ADR-0044 §3

`docs/adr/0044-o-roteiro-se-sugere-sozinho.md` ganhou a linha `Emendada em 2026-09-01` no cabeçalho
(l. 9) e a seção `## Adendo 2026-09-01 — o CEP é o degrau primário, e o provedor pago é escalada`
(l. 218), no mesmo formato do adendo da ADR-0039.

O que o adendo fecha:

- **por que a ordem escrita na §3 não é a implementada** — as duas medições de 2026-09-01 contra a
  BrasilAPI (a coordenada já chega no corpo que `postal-code.gateway.ts` descarta; resolve em cidade
  de onze mil habitantes). Quando a §3 foi escrita, o degrau gratuito era teórico;
- a escada de três degraus, **sem gatilho automático**, e o registro de que a escalada automática por
  colisão foi avaliada e recusada por gastar sem decisão;
- o que da §3 **continua valendo**: armazenamento permanente, `place_id` `not null`, a exceção de
  licença (sobre muito menos linhas), a ordenação da cascata, o pino manual vencendo tudo, e `city`
  fora da otimização;
- a recusa renovada de hospedar geocodificador, com o motivo ao lado da §2 porque contradiz a
  intuição de quem a leu — matriz lida milhares de vezes por sugestão contra geocodificação uma vez
  por endereço novo;
- **o risco novo que a §3 não tinha**: a coordenada do CEP ignora o número, e a marca é a mitigação
  e o instrumento de medida;
- o caso do CEP geral, com o `street` ausente como discriminador em vez do sufixo `-000`;
- onde cada degrau roda, e por que a marca na API não contraria a §7.

**Verificação:** `bunx prettier --check docs/adr/0044-o-roteiro-se-sugere-sozinho.md` → verde.

## Fase A — O fio e o degrau de graça

### T002 ✅ 2026-09-01 — A cascata mudou de app

⚠️ **A task corrigiu o próprio plano.** Ele mandava partir `geocoding-precision.policy.ts` por
consumidor; ao executar, duas medições no código mostraram que isso estava errado:

- `geocodeAddresses` **não chama** `shouldReplaceStored` — a cascata só grava o que está ausente da
  base, nunca substitui. Só o teste as via juntas.
- Com o degrau 2 na API, quem precisa de `toGeocodingPrecision` é o gateway pago, que mora lá.

Partir como estava escrito deixaria o ranking `rooftop > street > postal_code > city` **duplicado nas
duas apps** — a cópia por valor que diverge em silêncio. `plan.md` foi corrigido antes da execução.

O que ficou:

| peça                            | destino                                                        |
| ------------------------------- | -------------------------------------------------------------- |
| `geocodeAddresses` (cascata)    | worker — `src/routing/application/geocode-address.use-case.ts` |
| `shouldReplaceStored`           | API — migrou para `domain/geocoding-precision.policy.ts`       |
| `geocoding-precision.policy.ts` | API, inteira                                                   |
| tipos da porta                  | ambas (declaração, não regra)                                  |

`routing.schema.ts` do worker ganhou `source`, `external_place_id` e os três carimbos — ele deixou de
só ler a tabela e passou a escrevê-la. Os dois vocabulários de precisão/origem entraram como **tipo**,
não como catálogo em tempo de execução: quem valida são os CHECKs que a API migra.

Testes separados junto: a cascata foi para `worker/test/routing/geocode-address.contract.ts`, a
precedência para `api/test/routing-domain/stored-precedence.contract.ts`, e os três entrypoints
foram religados.

**Verificação:**

```
bun run --cwd apps/worker-transportada typecheck   → verde
bun run --cwd apps/api-transportada typecheck      → verde
bun run --cwd apps/worker-transportada test        → 821 pass / 0 fail (72 arquivos)
bun run --cwd apps/api-transportada test           → 3818 pass / 23 skip / 0 fail (151 arquivos)
```

### T003 ✅ 2026-09-01 — O repositório do worker, e por que ele não é o da API

`worker/src/routing/infrastructure/drizzle-geocoded-address.repository.ts`.

⚠️ **`onConflictDoNothing`, e não o upsert da API** — a diferença é o que cada lado quer dizer. A
cascata só grava o que estava **ausente**: ela lê o que existe, separa o que falta e resolve só isso.
Conflito aqui é sempre corrida entre duas sugestões pedindo o mesmo endereço novo, e nessa corrida
quem escreveu primeiro está tão certo quanto quem chegou depois.

Sobrescrever seria pior que inútil: se uma das duas caiu ao centroide de município porque o CEP falhou
só para ela, a escrita tardia **rebaixaria** a coordenada boa — e o endereço ficaria em `city` para
sempre, porque a cascata nunca mais reconsulta o que já está em base. Degradação que gruda.

Melhorar coordenada existente é o degrau 2, na API. Aqui não há decisão de precisão a tomar, e é por
isso que a ordenação não precisa existir deste lado.

**Verificação:** `bun run --cwd apps/worker-transportada typecheck` → verde.

### T004 ✅ e T005 ✅ 2026-09-01 — O degrau de graça

Contrato escrito **antes** do gateway, vermelho pelo motivo certo
(`Cannot find module '.../brasil-api-postal-code.gateway.js'`).

`worker/test/routing/postal-code-geocoding.contract.ts`, oito casos, com **corpos medidos** contra a
BrasilAPI em 2026-09-01 — fixture inventado provaria o que nós achamos, não o que o provedor faz:

- lê a coordenada que a resposta já carrega → `postal_code`;
- **CEP geral de cidade pequena vira `city`** (RF9) — Sales Oliveira, `street: null`;
- **`-000` não é o discriminador**: Araraquara `14801-000` com logradouro segue `postal_code`;
- `location` ausente → `null` (o `/cep/v2` responde por vários serviços a montante);
- 404, 429 e transporte que lança → `null`, sem exceção subindo;
- pede o CEP canônico, só dígitos.

O gateway nunca lança: degrau que não resolve devolve `null` e quem chama desce a cascata. A
coordenada é guardada como **texto** — a coluna é `numeric`, e passar por `Number` traria erro
binário para dentro de dado comparado e exibido.

**Verificação:** `bun run --cwd apps/worker-transportada test` → **829 pass / 0 fail** (era 821).

⚠️ Nota de execução: rodar `bun test <arquivo>` da raiz faz os dois contratos de paridade falharem
com `ENOENT` — eles leem o arquivo da API por caminho relativo e exigem o cwd da app. Use
`bun run --cwd apps/worker-transportada test`.

### T006 ✅ 2026-09-01 — A tabela do último degrau

`municipality_centroids` (código IBGE como PK, UF, coordenada, carimbos), migration
`20260901211242_municipality_centroids` com `rollback.sql` ao lado.

⚠️ **Correção do que a spec dizia:** ela chamava esta de "segunda exceção declarada" de tenant. São
**três** que já existiam — `geocoded_addresses`, `fuel_price_references` e `energy_tariff_references`
—, então esta é a quarta. O contrato novo assera a ausência de `company_id` no mesmo formato das
vizinhas, para não passar por esquecimento.

Três tropeços que valem ficar escritos:

1. **`db:generate` respondia `no_changes`** com a tabela declarada e registrada em `databaseSchema`.
   Faltava a linha `export * from './municipality-centroid.schema.js'` — é ela que o drizzle-kit
   enumera; o objeto `databaseSchema` é o schema de runtime, não a fonte do gerador.
2. **O CHECK de regex precisa de `sql.raw`.** `sql\`${col} ~ ${PADRÃO}\`` parametriza, e
   `checkSqlByName` devolve `$1` em vez do padrão. A convenção do repositório é
   `sql\`${col} ~ ${sql.raw(\`'${PADRÃO}'\`)}\``.
3. **`rollback.sql` que só faz `DROP TABLE` reprova.** Ele também apaga a própria linha de
   `drizzle.__drizzle_migrations`, com `GET DIAGNOSTICS` conferindo que removeu exatamente uma —
   senão o diário fica com uma migration a mais que as tabelas, e é isso que a integração pega.

A lista explícita de migrations em `static-migration.contract.ts` recebeu a nova entrada.

**Verificação:**

```
bun run --cwd apps/api-transportada db:check   → Everything's fine
bun run --cwd apps/api-transportada test       → 3823 pass / 23 skip / 0 fail
make migration-test                            → 90 pass / 0 fail (migration + rollback + reaplicação)
```

### T007 ✅ 2026-09-01 — Os 5.570 centroides

`scripts/municipality-centroid-build.py` roda **uma vez** sobre a malha do IBGE (27 requisições, uma
por UF, com pausa) e emite `src/database/seeds/municipality-centroids.json` (635 KB, versionado). O
centroide é o da **área** — laço de sapato, com os furos subtraídos e ilha/enclave somados por área —,
não o centro da caixa envolvente, que num município em forma de foice cai fora dele.

O seed passa pelo **use case**, nunca por `INSERT` bruto: `createSaveMunicipalityCentroidsUseCase`
valida cada linha na fronteira (código de sete dígitos, UF de duas letras, coordenada dentro da
Terra) e grava em lotes de 500 — 5.570 linhas num `insert` só estouram o limite de parâmetros do
Postgres. **Nada é gravado se alguma linha do lote for inválida**: meia base é pior que base nenhuma.

⚠️ **A T007 pegou um defeito na T004.** O fixture do contrato do gateway trazia `ibge.city` de Sales
Oliveira como `3545803` — que não é o código dela, e sim o de outra cidade a 230 km. Eu o **inventei**
dentro de um fixture cujo comentário afirma ser medido. O campo não é lido pelo gateway, então nenhum
teste ficaria vermelho; ele só apareceu porque o seed comparou o código com a malha. Os três corpos
foram remedidos e corrigidos, e o aviso ficou escrito no arquivo: campo inventado dentro de fixture
"medido" é a mentira que sobrevive à suíte inteira.

Conferência do dado: Ribeirão Preto `3543402` → `-21.2138406, -47.8218619` (certo); Sales Oliveira
`3544905` → `-20.8331134, -47.8540347`, a ~7 km do CEP que a BrasilAPI devolve — que é exatamente o
palpite de município que a ADR-0044 §5 descreve, e a razão de esta precisão sair da otimização.

**Verificação:**

```
bun run --cwd apps/api-transportada test                        → 3829 pass / 0 fail
bun run --cwd apps/api-transportada db:seed:municipality-centroids  → seeded: 5570
(reexecutado)                                                   → seeded: 5570
select count(*), count(distinct city_code) …                    → 5570 | 5570
```

### T008 ✅ 2026-09-01 — O último degrau, e a cascata que encurtou

`worker/src/routing/infrastructure/municipality-centroid.gateway.ts` lê a tabela semeada e devolve
`city`/`city` — palpite de ~8 km que põe o endereço no mapa e **sai da otimização** (ADR-0044 §5).
Ele não fala com ninguém: este degrau só roda quando o CEP já falhou.

⚠️ **A cascata do worker passou de quatro degraus para dois**, e `CentroidPort.byPostalCode` foi
removida. Com a inversão, o CEP virou o degrau **primário** (servido pela BrasilAPI através de
`GeocodingPort`) e o provedor pago saiu da app — então um segundo slot de centroide por CEP ficaria
vazio para sempre. Slot que ninguém preenche é estrutura morta que o próximo leitor tenta entender.

O que sobra no worker: **CEP → município**. O degrau pago é a marca, na API.

**Verificação:** worker **829 pass / 0 fail**; API **3829 pass / 0 fail**; typecheck verde nas duas.

### T009 ✅ 2026-09-01 — O fio

A geocodificação entra **entre reservar a sugestão e pedir a matriz**, em
`route-optimization-ports.factory.ts`. Trilho próprio adiaria a coordenada para depois do pedido, e a
primeira sugestão de uma viagem nova sairia sem paradas — o defeito da spec 069 com outro nome.

O seam é **puro**, e é isso que o torna testável sem banco
(`application/resolve-stop-coordinates.use-case.ts`):

- `buildGeocodeRequests` monta a requisição **da própria chave de parada** — a cascata do worker
  precisa só de CEP e município, e os dois estão nela. Um `join` com `nfe_addresses` para buscar
  logradouro seria trabalho para um provedor que não roda nesta app.
- `applyResolvedCoordinates` aplica em memória em vez de reler o contexto inteiro. Parada só
  **entra** na otimização; nenhuma sai.

`parseStopAddressKey` é o **segundo** consumidor do formato da chave dentro do worker (o primeiro é
`pool-address-key.ts`, que a monta) — o que torna a T016 mais valiosa, não menos.

`main.ts` liga os três adaptadores. `POSTAL_CODE_BRASIL_API_URL` entrou no schema de env do worker
como **opcional**: vazio, o CEP não resolve e todo endereço novo cai no centroide de município; a
sugestão continua saindo, só pobre. Ela reusa o nome que a API já declara — é o mesmo provedor.

⚠️ `geocoding` é opcional na fábrica para não quebrar quem monta portas sem ela, mas **ausente é
sugestão sem paradas**: sem coordenada tudo fica `excludedFromOptimization` e o solver corre sobre
nada. Era o estado do produto até esta task.

**Verificação:** `bun run --cwd apps/worker-transportada test` → **837 pass / 0 fail** (era 829);
typecheck verde.

### T010 ✅ e T011 ✅ 2026-09-01 — A métrica por origem, e o log que não conta endereço

⚠️ **`geocodedCount` estava errado para o desenho novo.** Ele contava só `source === 'google'` — e
com a inversão o worker nunca chama provedor pago, então o número seria **zero para sempre**: uma
métrica reportando silêncio enquanto a base cresce. Virou `counts`, por origem:
`fromBase` (não custou nada), `resolvedByPostalCode`, `resolvedByCity`, `unresolved`.

É essa separação que responde a pergunta da ADR-0044 §3, mitigação 3 — quanto saiu de graça e quanto
custou. Um número só não responde.

`route_optimization_geocoded` sai na fábrica, com `suggestionId` e as contagens. Nada do endereço.

**T011 não confia em disciplina:** ela varre tudo o que o caminho emitiu — mensagem e metadados —
atrás de CEP, logradouro, bairro e cidade, nos **três** cenários: provedor respondendo, provedor
recusando com o CEP na mensagem de erro, e transporte lançando com o endereço dentro da exceção. Os
dois últimos são onde a tentação de registrar a causa é maior.

Os três testes asseram `lines.length > 0` antes de varrer — sem isso, um caminho que simplesmente
não loga passaria verde e a varredura não provaria nada.

**Verificação:** `bun run --cwd apps/worker-transportada test` → **840 pass / 0 fail** (era 837).

### T012 ✅ 2026-09-01 — CA10: a parada entra na rota

`worker/test/geocoded-route-optimization.integration.test.ts`. **Só o depósito** entra em
`geocoded_addresses`; os dois destinos ficam de fora de propósito — é isso que o teste exercita.

O que ele prova, contra Postgres de verdade:

- a sugestão chega a `ready` com `error_code` vazio;
- a cascata **gravou** os dois endereços que faltavam — `postal_code` para o CEP que resolve, `city`
  para o que cai no município;
- **a parada resolvida está em `route_suggestion_stops`.** Antes desta spec essa lista era vazia para
  qualquer endereço não semeado à mão, e a sugestão saía `ready` sem propor nada.

Real: repositório, cascata, centroide lido do banco, efeito, solver e Postgres. **Stub: a matriz e o
transporte do CEP** — a matriz pela mesma razão do teste do pool (o OSRM não sobe no CI) e o
transporte porque bater na BrasilAPI dentro da suíte tornaria o teste refém de um serviço público.

**Verificação:**

```
make worker-integration                                     → 62 pass / 4 skip / 0 fail
bun test ./test/geocoded-route-optimization.integration.test.ts  → 1 pass, 7 expect() calls
```

⚠️ Rodei o arquivo isolado de propósito: no agregado ele poderia estar entre os `skip` (os quatro são
os do OSRM, que pulam sem `ROUTING_MATRIX_URL`) e o número verde não provaria nada.

---

## Fase A completa

| verificação                                   | resultado                    |
| --------------------------------------------- | ---------------------------- |
| `bun run --cwd apps/worker-transportada test` | 840 pass / 0 fail            |
| `bun run --cwd apps/api-transportada test`    | 3829 pass / 23 skip / 0 fail |
| `make migration-test`                         | 90 pass / 0 fail             |
| `make worker-integration`                     | 62 pass / 4 skip / 0 fail    |

## Fase B — A população adiantada

### T013 ✅ a T016 ✅ 2026-09-01

**A decisão central da fase, e ela não estava no plano:** a rotina **declina o centroide de
município**. No caminho da sugestão o palpite é bem-vindo — a parada precisa de alguma coordenada
agora, e ela entra marcada. Aqui não há pressa, e gravar `city` deixaria o endereço em base, onde a
cascata **nunca mais o reconsulta**: um dia de provedor fora do ar viraria uma cidade inteira
degradada para sempre, em silêncio. Não resolver custa nada.

Isso é expresso por **composição**, não por bandeira: a rotina passa um `CentroidPort` que sempre
devolve `null`. E é por isso que `failureOutcomes` é vazio — não há meia passada a lamentar.

⚠️ **Um defeito real corrigido no caminho:** `geocodeAddresses` processava chave repetida duas vezes
(o `filter` sobre `missing` era calculado antes do laço). A RF1 exige uma chamada, não N — a
deduplicação passou para dentro da use case, porque são **dois** chamadores e o segundo a esquecer
pagaria a conta calado.

`geocoding.backfill` entrou no catálogo das **quatro** apps mais os quatro contratos de paridade,
mais a migration `20260901214952_geocoding_backfill_job` (os dois CHECKs e a linha do relógio, com
`rollback.sql`), mais a lista de `SEED_MIGRATIONS` do contrato do catálogo.

A fila pendente é montada em SQL (`drizzle-pending-address.repository.ts`) — concessão consciente,
com o alcance dito por escrito: o pior caso de divergir de `buildStopAddressKey` é **adiantar uma
chave que ninguém consulta** (trabalho perdido, nunca dado errado), e o filtro é conservador de
propósito.

**T016** trava a forma da chave, que hoje tem três consumidores — quem monta, quem lê e quem remonta
em SQL. Mudá-la faria toda chave em base virar `miss` de uma vez: a base inteira regeocodificada em
silêncio, com fatura, enquanto tudo parece funcionar.

**Verificação:**

```
worker             863 pass / 0 fail
API               3826 pass / 0 fail
cron                94 pass / 0 fail
frontend          2233 pass / 0 fail
make migration-test  90 pass / 0 fail
job_schedules      geocoding.backfill | 300  (aplicado no Postgres local)
```

⚠️ `make worker-integration` acusa **1 falha**: `worker SIGTERM integration > drains an in-flight
synthetic effect`. Ela é **pré-existente** — reproduzida com este trabalho no `git stash`, sem a
rotina registrada, e falha igual. Não é regressão desta spec, e fica registrada aqui para não ser
descoberta de novo como se fosse.

## Fase C — A marca e o degrau que custa

### T017 ✅ a T019 ✅ 2026-09-01 — O gateway que a spec 058 nunca escreveu

`GEOCODING_API_KEY` entrou como **opcional** no schema da API. Vazia, o gateway não é construído e a
marca responde que a precisão fina não está disponível — a app sobe, e o produto segue roteirizando
com precisão de CEP.

`google-geocoding.gateway.ts` é o arquivo que a **T006 da spec 058 listou e marcou concluída sem
escrever**. O contrato dele usa **fake de transporte, nunca a porta** (CA5): é injetando
`GeocodingPort` que aquela task ficou verde sobre uma camada ausente.

Onze casos: os quatro `location_type`, `location_type` desconhecido virando `city`, `ZERO_RESULTS`,
`OVER_QUERY_LIMIT`, transporte lançando, `place_id` sempre persistido, resultado **sem** `place_id`
recusado, e a consulta levando endereço e chave.

⚠️ Sem `place_id` o gateway devolve `null` em vez de tentar gravar: o CHECK
`geocoded_addresses_place_id_check` recusaria a linha `google`, e a mitigação da ADR-0044 §3 só vale
se nunca falhar em silêncio.

Duas correções nos **meus testes**, não no código:

- passar `undefined` a um parâmetro com valor padrão **usa o padrão** — o caso "sem `place_id`"
  precisava ser construído, não pedido por `undefined`;
- `URLSearchParams` codifica espaço como `+`, não `%20`.

**Verificação:** `bun run --cwd apps/api-transportada test` → **3837 pass / 0 fail** (era 3826).

### T020 ✅ a T023 ✅ 2026-09-01 — A marca, a trilha, o teto e a trava

**A rota é `POST /geocoded-addresses/:addressKey/refine`** — ⚠️ **desvio do plano, com motivo.** Ele
previa `POST /route-suggestions/:id/stops/:stopId/refine-address`. A marca é sobre o **endereço**, não
sobre a parada de uma sugestão: a coordenada é compartilhada, e o pino manual (degrau 3) já mora em
`/geocoded-addresses/:addressKey`. Pendurar o degrau 2 noutra árvore separaria dois degraus da mesma
escada e obrigaria a carregar uma sugestão que a operação não usa.

**As três respostas, e nenhuma é silêncio** (RF5): `refined`, `not_improved`,
`provider_not_configured`. Quando o provedor volta igual ou pior, `shouldReplaceStored` recusa a
escrita e a linha em base fica **intacta** — e o conferente ouve que nada melhorou, em vez de marcar,
ver a tela idêntica e concluir que a marca está quebrada.

O pino manual continua vencendo: `manual` em base nem chega a custar uma chamada.

**O endereço por extenso vem da nota, escopado pela empresa do contexto.** A coordenada não tem
tenant, mas o endereço tem — ler a nota de outra empresa para montar a consulta ao provedor seria
vazamento com outro nome. Endereço que nenhuma nota desta empresa carrega responde `not_improved`
sem consultar nada.

**A trilha é também o teto.** `geocoding_refinement_requests` (append-only, com `company_id` — o
gasto é de alguém, mesmo que a coordenada não seja) registra quem marcou, o que voltou e se
substituiu, e é ela que conta a janela: 60 marcas por hora por empresa, `429` com código estável
acima disso. Uma tabela, uma verdade sobre quantas marcas houve.

**T023 é o contrato que guarda a decisão de custo**, e ele tem duas metades:

1. uma sugestão inteira com **três paradas colidindo no mesmo CEP** — o caso em que a escalada
   automática seria mais tentadora — faz **zero** chamadas ao provedor pago;
2. varredura de **import** nos dois arquivos do caminho automático.

⚠️ A varredura foi estreitada para `import`, não para a palavra: a cascata cita `google` num
comentário que explica por que a métrica antiga estava errada, e proibir a palavra proibiria a
explicação. O que não pode existir é a dependência.

**Verificação:** API **3845 pass / 0 fail**; worker **865 pass / 0 fail**; `make migration-test`
**90 pass / 0 fail**.

### T024 ✅ a T026 ✅ 2026-09-01 — A ação na tela e os dois documentos

A ação **"Endereço errado"** entra por parada, no painel de sugestão, e imprime a resposta **sempre**
(RF5) — inclusive as duas que não compraram nada, que dizem "ajuste o ponto à mão" e assim oferecem o
degrau 3. Sem `onRefineAddress` a ação não aparece: quem não pode marcar não vê um botão que
responderia `403`.

O hook **nunca lança**: `429` vira `quota_exceeded` (frase própria — tentar de novo agora não
resolve) e qualquer outra falha vira `failed`. Um estouro no lugar de um aviso faria o conferente
concluir que a marca está quebrada, que é o que a RF5 impede.

Rótulos nos **dois** idiomas — o contrato de paridade de locale reprovou o pt-BR sozinho, como devia.

**`docs/SECURITY.md`** foi **atualizado, não repetido**: o parágrafo existente descrevia com precisão
um mundo em que as chamadas partiam do navegador e a nossa infraestrutura não via o dado. A
geocodificação inverte isso, e o adendo diz por dois trilhos — o CEP saindo do worker (oito dígitos, a
mesma exposição de antes, agora com a nossa infraestrutura no caminho) e o endereço **por extenso**
indo ao Google a partir da API, que é a maior exposição de endereço que o produto já teve.

Dois achados **abertos** ficaram escritos para serem decididos e não redescobertos:

- `geocoded_addresses` guarda `cityCode|postalCode|number` em claro e sem tenant. Não há nome nem
  documento — e é isso que sustenta a tabela não ter `company_id` —, mas CEP e número **são** um
  ponto de entrega identificável, e não criptografá-los nunca foi decidido em ADR, como foi na ficha
  do motorista (ADR-0039).
- a rota da marca não tem rate limit de infraestrutura; o teto é de aplicação, contado na trilha. É o
  mesmo achado já registrado para as rotas de senha.

**Verificação:** frontend **2233 pass / 0 fail**; typecheck verde nas quatro apps.

## Fase D — Fecho

### T027 ✅ 2026-09-01 — `make check`

```
make check → exit 0
```

Sete suítes, **zero falhas** em todas: API 3845, worker 865, cron 94, frontend 2233, landing 17,
client 73, mais os 18 de contrato de realm. Format, lint, typecheck e build incluídos.

---

## Verificação final da spec 069

| gate                                       | resultado                                             |
| ------------------------------------------ | ----------------------------------------------------- |
| `make check`                               | **exit 0** — format, lint, typecheck, test e build    |
| `make migration-test`                      | 90 pass / 0 fail (migration + rollback + reaplicação) |
| `make worker-integration`                  | 62 pass / 4 skip / 1 fail ⚠️                          |
| CA10 isolado (parada dentro da otimização) | 1 pass, 7 asserções                                   |
| seed dos centroides, reexecutado           | 5570 / 5570 distintos                                 |

⚠️ A falha da integração é `worker SIGTERM integration > drains an in-flight synthetic effect`, e ela
é **pré-existente**: reproduzida com este trabalho inteiro no `git stash`, sem a rotina registrada, e
falha igual. Não é regressão desta spec.

## O que fica pendente, e não é código

1. **A chave do Google não existe.** Alguém precisa criar o projeto com faturamento, gerar a chave
   restrita à Geocoding API e pô-la em `GEOCODING_API_KEY` no worker… **na API**, corrigindo: quem
   constrói o gateway pago é a API, porque a marca é síncrona. Enquanto isso, a marca responde
   `provider_not_configured` e oferece o pino manual — nada quebra.
2. **`POSTAL_CODE_BRASIL_API_URL` precisa existir no worker em staging.** Sem ela o degrau 1 não
   resolve e todo endereço novo cai no centroide de município: a sugestão sai, mas pobre.
3. Os **dois achados abertos** de `docs/SECURITY.md`: a chave de endereço em claro sem tenant (nunca
   decidida em ADR) e a ausência de rate limit de infraestrutura na rota da marca.
