# Evidências — 227 A nota se abre inteira

Spec escrita em 2026-10-02 a partir do mapa da exploração. Todas as perguntas respondidas em 2026-10-02; a Fase 5 espera a spec 228.

## T0.1 — renumeração 225 → 226

`origin/staging` já tinha `225-a-viagem-terminada-nao-foi-movida`; os números 226 a 229 estavam livres em
**todas** as refs. Feita **antes** do rebase, o único momento em que toda referência a 225 é minha.
37 arquivos, 85 substituições por lista explícita de padrões e 21 renomes via `git mv`; **zero resíduo**
conferido por `grep`. Ficaram de fora de propósito os falsos positivos — `'225.0000'`, o código `'225'`
da SEFAZ, os builds em `dist/`. Os commits antigos continuam dizendo 225: história não se reescreve.

## T0.2 — rebase em `origin/staging`

93 commits atrás, 32 à frente. Backup guardado em `backup/pre-rebase-226`. **Seis conflitos**, todos
resolvidos sem perder o trabalho de ninguém:

| arquivo                               | natureza                                          | resolução                                                |
| ------------------------------------- | ------------------------------------------------- | -------------------------------------------------------- |
| `static-migration.contract.ts`        | lista exaustiva de migrations                     | as duas entradas, em ordem                               |
| `trip-http.fixture.ts` (2×)           | dois campos opcionais acrescentados ao mesmo tipo | os dois                                                  |
| `package.json` da API                 | a lista explícita de `test:integration`           | a lista de staging **mais** o meu arquivo (148 no total) |
| `trip.contract.test.ts` (painel)      | imports de teste dos dois lados                   | todos                                                    |
| `tripValuationResponse.validation.ts` | **fusão de duas intenções**, ver abaixo           | staging + a minha validação dentro de `toRevenueLine`    |

Um commit (`0659a481b`, o SQLSTATE do `RESTRICT`) foi **pulado sozinho pelo git — já estava em staging**,
a mesma correção feita por outra sessão.

### O único conflito que não era mecânico

A tarefa "endurecer a leitura de dinheiro", que o usuário começou em outra sessão a partir de uma
observação minha, **já estava em staging** e tinha reestruturado `toTripValuation` (`collectLines` +
`toRevenueLine` recusando `amount` malformado). A minha T3.1 acrescentava a validação dos oito campos no
formato antigo. Escolher um lado perderia a outra intenção; a fusão põe a minha validação **dentro** de
`toRevenueLine`, com a mesma semântica das duas: linha malformada → `null` → avaliação recusada. Um
commit seguinte só editava o comentário de uma função (`readRevenueLines`) que deixou de existir, e o texto
corrigido já vive em `toRevenueLine` — descartei o órfão.

### Rebase limpo não é typecheck verde

`bun install --frozen-lockfile` e `typecheck` nas **sete** apps: exit 0. Os testes pegaram o que o typecheck
não podia: **5 contratos de cadeia de snapshots** reprovaram — T0.3.

## T0.3 — a migration reencadeada

Ver a entrada final de `specs/196-…/evidence.md`. Procedimento: guardar o `migration.sql` e o `rollback.sql`,
remover a pasta, deixar o `drizzle-kit` gerar a partir do snapshot de staging (`prevIds` = id dela, conferido
por script), trocar o SQL gerado pelo escrito à mão, renomear no `DELETE` do journal do rollback, atualizar
a lista exaustiva.

| portão                  | resultado                                            |
| ----------------------- | ---------------------------------------------------- |
| `db:generate`           | `no_changes`                                         |
| contratos de migration  | **75 pass · 4 skip · 0 fail**                        |
| `make migration-test`   | **115 pass · 0 fail**                                |
| contrato inteiro da API | **8656 testes · 0 fail**                             |
| painel                  | **6301 pass · 0 fail** e hooks **248 pass · 0 fail** |

O teste `beacon` do painel estourou o teto de 5 s no primeiro run (carga) e passou 3 de 3 isolado e na
suíte inteira; nada em `driver-trip` foi tocado por mim.

## Fase 1 — o acordeão (T1.1 e T1.2)

Executada por subagente `executor` em `sonnet`; gates e mutações conferidos por mim.

### A decisão que a spec deixou aberta: estado próprio, com `openProofDocumentId` **derivado**

`openDocumentId` é o estado do acordeão, em `useOpenTripDocument`; `openProofDocumentId` deixou de ser
estado e passou a ser **derivado** dele — só vale quando a nota é entregue ou devolvida
(`hasTripDocumentProof`). Reaproveitar `openProofDocumentId` como estado teria feito abrir uma nota **não
entregue** disparar as três buscas que dependem dele (`delivery-proofs`, `document-products`, `occurrences`,
todas `enabled: openProofDocumentId !== null`) e ligar o gate do canhoto — chamada à toa, com risco de 404 ou
estado de erro na tela de uma nota que **não tem** comprovante. Com a derivação as três buscas e o gate
ficaram intactos.

Efeito colateral declarado: nota não entregue aberta não busca itens nem ocorrências. Antes só o diálogo
de ocorrência de separação buscava os itens, então nada regrediu; mostrar itens e ocorrências na nota
aberta é das Fases 3 e 4.

### O que mudou na estrutura

O cabeçalho da nota é **checkbox e botão irmãos** (`<button aria-expanded aria-controls>`); o checkbox
**não** está aninhado no botão, que é HTML inválido e engole o clique. Os selos continuam fora do botão,
porque um deles é `<Button>`. Saíram os dois botões "Comprovante" e "Detalhes da nota" e o `useState` da
linha. `TripStopList` continua com cinco props.

A âncora da linha do tempo agora **abre** a nota. O `click` no `document` existe porque clicar duas vezes
na mesma âncora **não** dispara `hashchange`; é restrito a âncoras que casam com o formato
`#trip-timeline-document-…`, e os dois listeners têm limpeza.

### O contrato da spec 181 não foi afrouxado

`document-row-structure.contract.ts` ganhou **só acréscimo** (4 testes): nenhuma asserção existente foi
alterada ou removida, e o contrato antigo **não** afirmava "duas expansões independentes", ao contrário do
que a exploração tinha lido. A afirmação por **estrutura renderizada** (checkbox fora do botão, exclusividade)
está em `test/trip-hooks/trip-document-accordion.contract.ts` (13 testes, em DOM).

### Provado por mutação — e a que quase passou despercebida

| mutação                                         | o que reprovou                                                                                    |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| estado local por linha (volta ao `useState`)    | exclusividade (RF1/CA01) e os 3 testes de âncora                                                  |
| checkbox aninhado no botão                      | "a caixa não está dentro do botão…" e "marcar a caixa seleciona a nota e não abre nem fecha nada" |
| **nota não entregue passa a pedir comprovante** | "a nota não entregue abre sem buscar comprovante, itens nem ocorrências"                          |

A terceira linha é a que importa. O executor viu esse teste reprovar numa mutação que **não tocava** o hook
dele, **suspeitou** de vazamento de `window.location.hash` entre testes, mexeu no `afterEach` e **não
reexecutou**. Eu reexecutei: com a ordem **embaralhada 6 vezes** (`--randomize`, e com o preload de DOM que o
script `test:hooks` registra) a suíte dá **261 pass · 0 fail** nas seis, e a mutação **certa** para esse
teste reprova só ele (260 · 1), voltando a 261 · 0 revertida. Teste que reprova por causa de outro teste
passa ou falha conforme a ordem; este não faz isso.

⚠️ Rodar esse arquivo **solto** (`bun test ./test/trip-hooks/…`) dá treze falhas de 0,05 ms — falta o DOM do
`--preload ./test/trip-hooks/dom.preload.ts`. É o aviso do `CLAUDE.md` sobre invocação errada: a falha é de
ambiente e se parece com defeito.

### Portões

| Portão                        | Resultado                                                            |
| ----------------------------- | -------------------------------------------------------------------- |
| `typecheck` / `lint` (painel) | exit 0 · 0 erros, 16 avisos pré-existentes, nenhum novo              |
| `bun run test` (painel)       | **6305 pass · 0 fail** (era 6301)                                    |
| `test:hooks`                  | **261 pass · 0 fail** (era 248), estável em 6 execuções embaralhadas |

### O que ficou declaradamente fora

- **`scrollWidth <= innerWidth` em 375 px** não foi medido (exige o smoke com a stack de pé). Pelo CSS não há
  causa de transbordo (`min-width: 0` no botão e no corpo), mas CSS lido não é medida: fica para o smoke
  `spec-227-prints` e para a T6.1.
- Os dois `useState` de dentro do comprovante (`isProductsExpanded`, `isOccurrencesExpanded`) continuam —
  são das Fases 3 e 4.
- A ordem do canvas dentro do corpo é só a aproximação de detalhes → comprovante.

## T0.4 — a integração inteira da API, sobre a base rebaseada

Gate de push das specs 196 e 226, rodado **depois** do rebase, da renumeração e do reencadeamento da
migration — ou seja, sobre o código que de fato seria publicado:

```
829 pass · 8 skip · 0 fail · 5063 expect() · 837 testes · 150 arquivos · [1014.00s]
```

São **29 testes a mais** que a rodada anterior à rebase (802): as specs 222, 223 e 224 de staging, todas
verdes junto com o meu código. Infra de E2E (postgres 65432), `--env-file=../../.env.test`. Os 8 skips são
os de sempre da suíte.

⚠️ Os testes do painel que rodaram **durante** esta integração (a Fase 1) não a atrapalharam: nenhum
`company-user-listing` estourou o teto, ao contrário da primeira rodada da spec 196.

## Fase 2 — Dados da nota (T2.1, T2.2 e T2.3)

Painel e API por dois executores `sonnet` em paralelo, em apps diferentes, com o contrato do campo combinado
**antes**: `volumeCount`, inteiro ou `null`, opcional no painel até a API existir. Gates e mutações conferidos
por mim.

### O que a Fase 2 entrega

A nota aberta passou a ter a seção **Dados da nota** (`TripDocumentData.component.tsx`, 153 linhas — o
`TripStopList` **diminuiu**): NF-e, **Série** própria, Cliente, **CNPJ**, Valor da carga e **Volumes**, cada
um com um `CopyButton` do primitivo da casa; o contato, a regra de frete e o bloco de custo e lucro (spec 226) entraram **nela**, e `hasNoteDetail` deixou de existir. Seção sem nenhum dado devolve `null`.

O CNPJ vinha da API e **nenhum componente o imprimia**. **Volumes** é campo novo: `volumeCount` em
`documents[]` do `GET /trips/:id`.

### O que cada botão copia, e a decisão

Copia-se **exatamente o que está na tela** — quem cola num formulário espera o que viu: CNPJ formatado,
valor com `R$`, número da NF-e **sem** a série. O espaço inseparável que o `Intl` põe depois do `R$` vira
espaço comum, porque cola mal em campo de formulário; visualmente idêntico. Todos usam a variante `boxed`,
sempre visível: a `inline` só aparece com hover e não serve no celular.

### O rótulo que mentia, achado na conferência

O executor percebeu e **deixou como estava**: o campo usava `formatTaxId`, que formata CPF **e** CNPJ pelo
tamanho, mas o rótulo era fixo "CNPJ" — um contato pessoa física sairia com máscara de CPF e título de CNPJ.
Corrigido: `isIndividualTaxId` no serviço expõe **a mesma regra** do formatador (até 11 dígitos), e o rótulo
e o texto do botão de copiar seguem por ela. Provado por mutação (rótulo sempre CNPJ reprova o contrato do
CPF). A mutação de **"série ausente"**, que o executor não fez, também foi feita: reprovou 2 testes.

### Volumes na API

`nfe_volumes.quantity` é o `qVol` de cada `<vol>` da NF-e (uma linha por `<vol>`); a soma por nota é o
número de volumes dela. **`null` quando não há linha de volume — nunca `0`**: zero diria "a nota não tem
volumes", um número que parece resposta. Linhas somando zero dão `0`; nota sem vínculo com NF-e dá `null`.

**Uma** consulta agregada para a viagem inteira (`companyId`, `inArray`, `group by`), nenhuma com lista
vazia. O teste existente `trip-detail-query-count.integration.ts` compara por **igualdade** e não precisou
mudar. A prova de que não é N+1 é por contagem de `select`: 1 nota e 12 notas fazem o mesmo número;
trocando por leitura por nota o teste vê **15 contra 26**.

Classificado como `'safe'` na `FieldPolicy` **exaustiva** — não é dinheiro nem dado pessoal, então aparece
**sem** `trip.financials`. Sem migration (`db:generate` = `no_changes`).

### Mutações

| mutação                                             | o que reprovou                                                        |
| --------------------------------------------------- | --------------------------------------------------------------------- |
| tirar o `CopyButton` do CNPJ                        | "um botão por campo, com rótulo que diz o que copia"                  |
| Volumes com `null` impresso                         | 3 testes (só com número; seção vazia; dois botões a menos)            |
| campo de dinheiro sem permissão                     | 2 testes                                                              |
| `TripDocumentCost` solto de volta no `TripStopList` | "o TripStopList não monta mais o custo solto"                         |
| rótulo ignora CPF                                   | o contrato do CPF                                                     |
| série ausente imprime rótulo                        | 2 testes                                                              |
| API sem filtro de `companyId`                       | `never reads the volumes of another company` (esperado 0, recebido 1) |
| API sem `group by`                                  | o Postgres recusa a consulta; o teste de valores reprova              |
| API com leitura por nota                            | "mesmo número de selects para 1 e 12 notas" (15 × 26)                 |

### Portões

| Portão                                    | Resultado                                                             |
| ----------------------------------------- | --------------------------------------------------------------------- |
| painel: typecheck · lint                  | exit 0 · 0 erros, 16 avisos pré-existentes                            |
| painel: `bun run test` · `test:hooks`     | **6318 pass · 0 fail** (era 6305) · **261 pass · 0 fail**             |
| API: typecheck · lint · `db:generate`     | exit 0 · exit 0 · `no_changes`                                        |
| API: contrato inteiro                     | **8659 testes · 0 fail** (+3, todos do `volumeCount`)                 |
| API: integração dos dois arquivos tocados | **3 de 3 verde em 3 rodadas** (`volume-count` 3·0, `query-count` 4·0) |

O executor da API viu **1 falha em 63 s** num rerun logo depois de uma mutação e atribuiu a contenção sem
investigar; eu rodei os dois arquivos **três vezes seguidas** e passaram todas — foi o descarte do banco
depois da mutação, não defeito.

### O que ficou declaradamente fora

- **"Cliente" é `contact.name`, o destinatário**, o mesmo contato cujo documento aparece como CNPJ; o
  contratante continua em "Contratante: X" abaixo da grade. O vocabulário do painel já usa "cliente" para o
  destinatário (`/clientes`), mas se o canvas queria o contratante, é trocar uma linha.
- O "não aparece no portal da contratante" é **só de tipo** (`volumeCount` não está em `ContractorDelivery`):
  o `serializeTripDocumentDetail` não alimenta o portal.
- Revisão visual e `scrollWidth <= innerWidth` em 375 px: T6.1.

## Fase 3 — Ocorrências por nota, com link (T3.1)

Executada por subagente `executor` em `sonnet`; gates, mutações e uma correção conferidos por mim.

### O que mudou

A lista de ocorrências saiu da **terceira expansão dentro do comprovante** e virou a **seção Ocorrências** da
nota aberta, irmã de Dados da nota e do Comprovante, nessa ordem (D2). O `isOccurrencesExpanded` e o toggle
somaram-se à lista do que sumiu; o `isProductsExpanded` (itens) **fica**, é do comprovante. Cada ocorrência
tem `<a href="/ocorrencias/:id">` **com** `onClick` + `preventDefault` + `navigateToTripOccurrence`: navega
na mesma aba sem recarregar, e o `href` serve para "abrir em outra aba".

### A armadilha que a Fase 1 criou, e que o briefing nomeou

`activeOccurrenceDocumentId` seguia `openProofDocumentId`, que só existe para nota **entregue** — mas nota
**não entregue** também tem ocorrências (spec 182). Só mover a lista deixaria a seção de uma nota não entregue
**sempre vazia por defeito de busca**, dizendo "Nenhuma ocorrência registrada" quando existe: mentira pior que
não mostrar. A busca de ocorrências agora segue `openDocumentId` (a nota aberta, entregue ou não); a de
comprovante e a de itens continuam seguindo `openProofDocumentId`. O contrato prova as duas coisas separadas.

### A permissão do link: o `TripTimeline` não serve de modelo

O executor foi ver como o `TripTimeline` decide mostrar o link e achou que **ele não decide**: mostra sempre,
porque a linha do tempo já mora numa tela que exige leitura da viagem. Aqui isso não serve: `/ocorrencias/:id`
exige **estritamente `fleet.read`**, e `canReadTrips` também aceita `trip.report-on-behalf` — quem tem só essa
cairia numa tela que não pode abrir. Usei `canReadTripFleetDetails`, que é exatamente `fleet.read`. Sem ela a
ocorrência **continua listada**, só sem link.

### Um defeito que o relatório sinalizou e eu corrigi

O executor moveu o `TripOccurrences` **inteiro**, que carrega a lista **e o formulário de registro**, e avisou
que o formulário passaria a aparecer em **toda** nota aberta (para quem tem `trip.manage`). Conferi: antes o
formulário só existia dentro do comprovante de nota entregue (`canRegister={canManageTrips}` lá). Numa nota
**não entregue** a busca de itens não roda, então o formulário listaria produtos só pelo código — e duplicaria
o botão "Ocorrência" da separação (spec 182). Corrigi: `canRegister = canManageTrips && hasTripDocumentProof(document)`.
A **lista** aparece em toda nota; o **formulário** só onde já aparecia. Provado por mutação: sem a restrição o
teste novo reprova ("o botão de registrar só aparece na nota entregue ou devolvida").

### Provado por mutação

| mutação                                                     | o que reprovou                                                                               |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| a busca de ocorrências volta a seguir `openProofDocumentId` | "a nota não entregue abre sem buscar comprovante nem itens, mas busca as ocorrências"        |
| tirar o `onClick` do link                                   | "o clique cancela a navegação do navegador e leva a /ocorrencias/:id na mesma aba"           |
| `canOpenOccurrence` forçado para `true`                     | "sem permissão… ela continua listada, sem link" (markup) e "sem permissão não há link" (DOM) |
| remover a restrição do formulário a nota entregue           | "o botão de registrar só aparece na nota entregue ou devolvida"                              |

### O contrato da spec que mudou, e como

`delivery-proof-disclosure.contract.ts`: `aria-controls`/`aria-expanded` de `toBe(2)` para `toBe(1)` (a
expansão de ocorrências deixou de existir; a de itens continua exigindo o padrão da spec 180), e a asserção do
id `trip-delivery-proof-occurrences-…` saiu **porque o alvo sumiu**. Entrou uma asserção nova — "o
comprovante não carrega mais ocorrência" — e a garantia sobre a lista passou para
`document-occurrences.contract.tsx` e para o DOM de ordem e irmandade. O executor ainda renomeou um teste de
hooks que passara a mentir sobre ocorrências no título, sem tocar a asserção.

### Portões

| Portão                        | Resultado                                               |
| ----------------------------- | ------------------------------------------------------- |
| `typecheck` · `lint` (painel) | exit 0 · 0 erros, 16 avisos pré-existentes, nenhum novo |
| `bun run test` (painel)       | **6325 pass · 0 fail** (era 6318)                       |
| `test:hooks`                  | **267 pass · 0 fail** (era 261)                         |

### Declaradamente fora

- O CSS do link (`.occurrenceEntryLink`, copiado do padrão do `itemTitleLink`) **não tem a área de toque de
  44 px**: é a revisão da T6.1.
- Os itens na descrição do formulário de uma nota não entregue seguem sem descrição — a busca de itens continua
  só em nota entregue, por decisão da Fase 1.

## Fase 4 — os dois selos do comprovante (T4.1 e T4.2)

Executada por subagente `executor` em `sonnet`, com um **passo 0** no briefing: descobrir, lendo o código,
se o endpoint em lote da spec 222 traz o que o cabeçalho da nota fechada precisa, **antes** de mexer — e parar
se não trouxesse, porque aí seria trabalho de API e a decisão é minha.

### O passo 0 liberou: o lote já traz tudo

`GET /trips/:id/delivery-proofs` (`fleet.read`) devolve, por nota, o `DeliveryProof` completo, com
`canhotoReview` **e** `punctuality`. Nenhuma mudança de API. `proofPending` (spec 223) **não** vem do lote:
já está no detalhe da nota e continua com o seu selo "Canhoto pendente" no cabeçalho, **ao lado** dos dois
novos. O painel não chamava o endpoint para o cabeçalho — só o lote de conferência, com `trip.manage` e ao
menos uma nota marcada.

### Dois selos, nunca um só (D4)

`TripDocumentProofBadges` mostra a **conferência** (`Aguardando` / `Aprovado` / **`Recusado`**) e a
**pontualidade** (`on_time` / `late` / `away` / `late_and_away`) lado a lado, **no cabeçalho da nota fechada**
(fora do botão de abrir, porque um selo vizinho é `<Button>`) **e** no topo da seção do comprovante. Os rótulos
reaproveitam as chaves que já existiam — nenhum texto novo para o mesmo estado. O badge "Longe do ponto" saiu
de **dentro** de `ProofReadings`; a célula Distância, o alerta vermelho de `away` e o selo de registro tardio
ficaram. Recusado **e** longe do ponto diz as duas coisas.

A peça principal para ler os selos segue a ordem do cartão: canhoto, depois assinatura, depois mercadoria.
Nota sem comprovante ou `not_required` não tem selo — sem rótulo vazio, sem "—".

### Uma mutação sobreviveu na primeira rodada, e o executor disse

Fazer o serviço devolver `{ review: 'pending' }` para uma nota **sem comprovante** não reprovava nada: o teste
de cabeçalho passa por `Map.groupBy`, que nunca chama o serviço com `undefined`. Ele acrescentou o teste que
faltava ("sem comprovante o serviço não devolve selo algum") e repetiu a mutação — agora reprova. Mutação que
sobrevive é o aviso de que a asserção não prende o que parecia prender; relatar isso em vez de omitir é o que
torna o resto da lista confiável.

### Um custo que o relatório não mediu, e eu condicionei

A consulta do cabeçalho rodava em **toda** visita ao detalhe da viagem com `fleet.read` — inclusive viagem
que **ainda não entregou nada**, onde a rota devolveria lista vazia: chamada à toa. Acrescentei `hasAnyProof`
(alguma nota entregue ou devolvida) ao `enabled`, com o teste "viagem sem nota entregue ou devolvida não faz
chamada, mesmo com a permissão"; sem o `hasAnyProof` ele reprova. A rota devolve o comprovante **completo** de
cada nota (com as URLs assinadas) para a consulta ler dois selos — é o desenho do lote da 222, que não toquei.

⚠️ Com o diálogo de conferência em lote aberto, são **duas** buscas do mesmo endpoint, com chaves diferentes
(`delivery-proofs-badges` e a da 222). O executor preferiu não mexer na consulta e no contrato da 222; fica
registrado como oportunidade: unificar as chaves.

### Mutações

| mutação                                 | o que reprovou                                                                             |
| --------------------------------------- | ------------------------------------------------------------------------------------------ |
| esconder a pontualidade quando recusado | 8 testes (4 da matriz, "recusado e longe do ponto", coexistência com a 223, `en`, a seção) |
| nota sem comprovante devolve selo       | primeira rodada **sobreviveu**; com o teste acrescentado, reprova                          |
| chamar sem permissão                    | "sem a permissão que a rota exige, não faz chamada"                                        |
| remover `hasAnyProof` do `enabled`      | "viagem sem nota entregue ou devolvida não faz chamada…"                                   |

### Portões

| Portão                        | Resultado                                               |
| ----------------------------- | ------------------------------------------------------- |
| `typecheck` · `lint` (painel) | exit 0 · 0 erros, 16 avisos pré-existentes, nenhum novo |
| `bun run test` (painel)       | **6325 pass · 0 fail**                                  |
| `test:hooks`                  | **294 pass · 0 fail** (era 267)                         |

### Declaradamente fora

- Nenhum print: a revisão de design da T6.1 ainda falta, e o cabeçalho com **três** selos possíveis
  (conferência, pontualidade e "Canhoto pendente") pode apertar em 375 px — é o que a revisão tem de olhar.
- Não criei CSS: os selos reaproveitam `.proofBadges` e as classes do `ProofReviewChip`.

## T5.1 — `GET /trips/:id/timeline?documentId=` filtra por nota no servidor

**Desenho (D7).** Query param `documentId` (UUID, opcional). Aplicado no SQL das fontes que carregam nota:
`trip_stop_events` (`trip_document_id is null or = :documentId`), `trip_document_occurrences` e
`trip_document_events` (`trip_documents.id = :documentId`). As fontes sem nota (criação, despacho e troca de
status da viagem, ocorrência de parada) não ganham o filtro: o que não pertence a nota nenhuma passa, como a D7
pede. Ausente = a viagem inteira, e a chave nem chega ao caso de uso (nenhum contrato existente mudou).

**Tenant e 404.** `findTripDocumentScope` confere a nota por `companyId` (do contexto), `tripId` (do caminho) e
`id`; o caso de uso a chama **depois** do 404 da viagem e **antes** do leitor. Nota de outra empresa, de outra
viagem da mesma empresa ou inexistente responde o mesmo `404 TRIP_DOCUMENT_NOT_FOUND` (erro que já existia) —
nunca lista vazia que confirme ou negue a existência. Valor que não é UUID, vazio, repetido ou injeção → `400`.
O cursor segue o mesmo keyset; o filtro só soma uma condição.

**Permissão.** Inalterada: `TRIP_FIELD_READ_POLICY`; sem `trip.event-location` a coordenada sai `null` com o
filtro também (recorte no caso de uso, depois da leitura).

**Contratos (escritos antes da implementação).**

- `test/trip-http/timeline-document-filter.contract.ts` — chave ausente; UUID + cursor + limit chegam; 400 para
  `not-a-uuid`, vazio, repetido e `'; drop table trips; --`, e o caso de uso não roda.
- `test/trip-application/read-trip-timeline-document-filter.contract.ts` — 404 sem chamar o leitor; o escopo da
  nota recebe `companyId` do contexto; o leitor recebe o `documentId`; sem filtro a nota nem é consultada; sem
  `trip.event-location` a posição é `null` e o `locationState` fica.
- `test/trip-schema/trip-timeline-document-filter.contract.ts` — estático: o filtro nas três fontes, ausência
  nas outras, e as três chaves do `findTripDocumentScope`.
- `test/integration/trip-timeline.integration.ts` (bloco novo, Postgres real): a nota A traz os eventos dela e os
  sem nota, nada da B; sem filtro a viagem fica completa; cursor em páginas de 2 não repete nem pula; nota
  de outra empresa / de outra viagem / inexistente → 404 pela rota; posição nula sem a permissão e presente com ela.

As suítes novas entram pelos três entrypoints já listados no `package.json` (`trip-http`, `trip-application`,
`trip-schema`); o `package.json` não mudou.

### Mutações

| mutação                                          | o que reprovou                                                                                              |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| tirar o filtro de `trip_stop_events`             | 3 da integração (filtro, cursor, posição)                                                                   |
| tirar o filtro da ocorrência de nota             | estático + 2 da integração (a 1ª rodada sobreviveu na integração; acrescentei a ocorrência de nota ao seed) |
| tirar o filtro da troca de status da nota        | 2 da integração                                                                                             |
| `findTripDocumentScope` sem `tripId`             | estático + "nota de outra viagem → 404" na integração                                                       |
| `findTripDocumentScope` sem `companyId`          | **só o estático** reprova — ver abaixo                                                                      |
| caso de uso não confere a nota                   | "404 sem chamar o leitor"                                                                                   |
| schema sem validar UUID                          | o 400 de `not-a-uuid`/vazio/repetido/injeção                                                                |
| rota não repassa o `documentId`                  | "o UUID chega ao caso de uso"                                                                               |
| caso de uso não repassa o `documentId` ao leitor | contrato do caso de uso + integração de posição                                                             |
| desligar o recorte de posição                    | 5 contratos (196 T4.1 e o novo) + 2 da integração                                                           |

⚠️ O `companyId` no `findTripDocumentScope` é defesa em profundidade: como o `tripId` já passou por
`findTripCompanyScope` (mesma empresa), a nota de outra empresa já é excluída pelo `tripId`. Nenhum teste
comportamental consegue distingui-lo; a prova é o contrato estático.

### Portões (de dentro de `apps/api-transportada`)

| Portão                                                                                                 | Resultado                        |
| ------------------------------------------------------------------------------------------------------ | -------------------------------- |
| `bun run typecheck`                                                                                    | exit 0                           |
| `bun run lint`                                                                                         | exit 0, `--max-warnings=0`       |
| `bun --env-file=../../.env.test test --timeout 120000`                                                 | **8647 pass · 23 skip · 0 fail** |
| `bun --env-file=../../.env.test test ./test/integration/trip-timeline.integration.ts` (Postgres 65432) | **27 pass · 0 fail**             |

## T5.2 — `GET /trips/:id/delivery-proofs` devolve o raio tolerado (D6)

**O que saiu.** Cada item da resposta ganha `proofRadiusMeters?: number` (metros), lido no servidor pela
mesma fonte única que o juiz da captura usa (`DrizzleDeliveryProofRepository.resolveProofPunctualitySettings`;
linha da empresa, ou 300 m de fábrica). A rota continua em `TRIP_FIELD_READ_POLICY` (`fleet.read`): o leitor
**não** precisa de `settings.manage`, e `settings.manage` sozinho continua sem ler a rota (403). Campo opcional
e tipado em `TripDeliveryProofView`; sem número finito e positivo ele **não vai** (nunca zero). Viagem sem
comprovante (inclusive a de outra empresa, que a consulta já não alcança) devolve `[]` **sem sequer consultar
a configuração** — nada da configuração alheia pode escapar.

⚠️ **Desvio da premissa da D6, a decidir.** A D6 diz "resolvido por contratante, a mesma resolução da spec 218".
Mas a 218 só resolve por contratante os **modos dos campos** (foto, assinatura, quem recebeu…); o raio
(`proof_radius_meters`) existe **só na configuração geral da empresa** — `company_delivery_proof_settings` —
e a tabela de exceção por contratante (`delivery_proof_setting_contractor_overrides`) não tem a coluna. É
decisão registrada: _"a regra é da empresa, não do destinatário"_ (ADR-0070 §3-5; comentário em
`delivery-proof-settings.policy.ts`). Logo o valor devolvido é o raio **da empresa**, que é exatamente o que o
juiz aplicou ao `punctuality`/`distanceMeters` de cada item; **raio por contratante exigiria coluna nova e
migration (fora desta task)**. O campo está por item para que o dia em que isso exista não mude o contrato.

⚠️ **Ordem de publicação.** `isDeliveryProof` do painel (`tripResponse.validation.ts`) recusa chave
desconhecida e `tripDeliveryProofsFromApi` descarta o item inteiro: com esta API em staging e o painel antigo,
**todo comprovante some da tela**, sem erro. `proofRadiusMeters` precisa entrar em
`DELIVERY_PROOF_OPTIONAL_KEYS` (`trip.constant.ts`) no painel **antes ou junto** (é a regra do próprio
comentário: "o painel tem de aceitá-las antes de a API mandá-las"). Não toquei o painel — é a T5.3.

**Contratos (antes da implementação).**

- `test/trip-delivery-proof/read-by-trip-radius.contract.ts` — cada item leva o raio e a configuração é lida com
  o `companyId` do contexto; viagem vazia não consulta a configuração; 0, negativo, `NaN` e infinito saem
  ausentes; o corpo tem `"proofRadiusMeters":300` e nenhuma coordenada nem outro parâmetro da nota.
- `test/trip-delivery-proof/read-by-trip.contract.ts` — a igualdade com a leitura de uma nota passou a incluir o raio.
- `test/trip-http/delivery-proofs-batch.contract.ts` — só `fleet.read` recebe o item com o raio (200); só
  `settings.manage` leva 403 e o caso de uso nem roda.
- `test/integration/delivery-proofs-by-trip.integration.ts` (Postgres real) — raio 500 gravado, 300 sem linha, e
  empresa estranha (raio 800) pedindo a viagem alheia recebe `[]` sem o número.

### Mutações

| mutação                                          | o que reprovou                                              |
| ------------------------------------------------ | ----------------------------------------------------------- |
| tirar o raio do item                             | 3 contratos + a integração                                  |
| tirar o guard "positivo e finito"                | "raio que não é um número positivo sai ausente, nunca zero" |
| tirar o retorno antecipado da lista vazia        | "viagem sem comprovante… a configuração nem é consultada"   |
| raio fixo em 300                                 | 2 contratos + a integração (500)                            |
| configuração lida com o `companyId` errado       | contrato do `companyId` + a integração                      |
| trocar a política da rota para `settings.manage` | 8 testes da rota                                            |

⚠️ Não coberto por teste: a **fiação** em `main.ts` (`settings: deliveryProofRepository`) — o `typecheck`
exige o campo, mas nenhum teste sobe o `main.ts`.

### Portões (de dentro de `apps/api-transportada`)

| Portão                                                                                                           | Resultado                        |
| ---------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| `bun run typecheck`                                                                                              | exit 0                           |
| `bun run lint`                                                                                                   | exit 0, `--max-warnings=0`       |
| `bun --env-file=../../.env.test test --timeout 120000`                                                           | **8653 pass · 23 skip · 0 fail** |
| `bun --env-file=../../.env.test test ./test/integration/delivery-proofs-by-trip.integration.ts` (Postgres 65432) | **7 pass · 0 fail**              |

## T5.3 — Painel: Eventos desta entrega

`TripDocumentEvents` (última seção da nota aberta, depois das Ocorrências) lê `GET /trips/:id/timeline?documentId=`
por `useTripDocumentTimelineQuery` (`queries/useTripDocumentTimeline.query.ts`; mesma permissão `canReadTrip`
do `useTripTimeline`; chave sob `[trip, id, 'timeline']`). Reaproveita `TripTimelineEntry` (agora exportada, prop
`isOwnDelivery`): `stop.departed` diz **"Saída para esta parada"** (D11) e o título não linka de volta à nota.
Ordem cronológica (inverso da API). O raio vem de `resolveProofRadiusMeters` (comprovante) e só é escrito
("Raio tolerado da parada: N m") quando existe. "Foto do canhoto" e "Endereço geocodificado" **não** foram criados (spec 228).

Contratos: `test/trip-hooks/trip-document-events.contract.ts` (6), accordion (ordem da seção), `timeline.contract.ts`
(`documentId` na URL), `late-registration-tolerance.contract.ts` (raio). Mutações reprovadas: tirar `documentId` da
query; tirar a permissão do `enabled`; tirar `isOwnDelivery`; raio sempre escrito; tirar `.toReversed()`; tirar o
retorno sem permissão; tirar o filtro no cliente; trocar a ordem das seções; raio com `?? 300`.

Gates (apps/frontend-transportada): `typecheck` exit 0 · `lint` 0 erros, 16 avisos pré-existentes · `test` 6335 pass /
0 fail + hooks 301 pass / 0 fail · prettier ok. Smoke de prints (13 passed) sem overflow em 375.

⚠️ O círculo do raio **não é desenhado no mapa** (o `AssemblyVectorMap` não tem camada de círculo e não há teste
renderizável de WebGL); o raio aparece como linha de texto. Mapa agregado do canvas também não foi trazido: cada
evento mantém o "Ver no mapa" próprio. Pendência para a T6.1.
