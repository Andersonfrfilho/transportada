# Evidência — 073

## T001 — Medição em produção (2026-09-01)

Consulta agregada, somente leitura, via `railway ssh -e production -s api`. Nenhuma linha
individual lida — os números são contagens.

```
notas                 1628
com participante delivery  0
divergem do destinatário   0
entrega incompleta         0

papéis existentes em nfe_participants:
  recipient  1628
  emitter    1628
  carrier    1628
  delivery      0
  pickup        0
```

Últimas 1000 notas importadas: idem, `delivery` = 0.

### O papel é antigo, então zero é ausência de dado — não ausência de código

`NFE_PARTICIPANT_ROLE.DELIVERY` e a linha `{ party: document.delivery, role: … }` entraram em
`4e74a25e` (spec 013, **2026-07-28**), 50 commits antes de HEAD e antes de qualquer das 1628
notas. O caminho de escrita esteve ligado o tempo todo; nenhuma nota trouxe `<entrega>`.

Bate com a amostra de 345 notas reais do lote `ID1010506`: `<entrega>` em 0/345.

### O parser lê `<entrega>` — medido, não deduzido

Uma nota real do lote, com um bloco `<entrega>` injetado depois de `</dest>`, passada por
`importarNfeXml`:

```
delivery.address = { street, number, district, cityCode 3509502,
                     city Campinas, state SP, postalCode 13052000 }
recipient key     = 3549102 | 13872400 | 400
```

Endereço completo, município e CEP divergentes do destinatário. A premissa da spec —
_"o importador já grava os dois"_ — se sustenta no parser e no mapeamento.

### Consequência para a D2

D2 **revisada**: não há backfill porque não há dado, e não porque o dado já esteja lá. A
diferença importa — o caminho de escrita nunca foi exercitado por nota real, então converter os
sete leitores sem prová-lo primeiro seria ligar sete consumidores a uma linha que talvez nunca
apareça. Virou a **T002**.

---

## T002 — O caminho de escrita, provado (2026-09-01)

Teste de integração em
`apps/worker-transportada/test/nfe-import-repository.integration.test.ts`:
`persists the delivery party and its own address, apart from the recipient`.

A nota importada leva destinatário **e** `<entrega>`, com os três campos da chave de parada
divergindo (`3549102|13872400|400` contra `3509502|13052000|4500`). O teste afirma:

- os papéis gravados são `['delivery', 'emitter', 'recipient']`;
- o endereço do `delivery` chega inteiro a `nfe_addresses` — rua, número, bairro, município,
  código IBGE, CEP e UF;
- os três campos da chave divergem do endereço do destinatário;
- a linha nasce carimbada com `company_id`.

```
bun test test/nfe-import-repository.integration.test.ts
  8 pass · 0 fail · 54 expect()

make worker-integration
  65 pass · 4 skip · 0 fail   (baseline era 64 pass — o 65º é este)
```

**Resultado: a D2 se sustenta.** O importador persiste o papel `delivery` e o endereço dele.
Os sete leitores podem passar a depender dessa linha.

### O teste achou um defeito de vizinhança

O `afterAll` do arquivo apagava `nfe_participants` sem apagar `nfe_addresses` antes. Nenhuma
fixture do arquivo tinha endereço, então a FK nunca era exercida e o buraco era invisível. Com
endereço, a limpeza aborta em
`nfe_addresses_company_participant_fk`, o perfil fiscal sobra — e como o CNPJ de teste é
**único global** e outros três arquivos usam a mesma constante, os quatro passam a falhar em
`beforeAll` por chave duplicada.

Corrigido no mesmo commit: `nfeAddresses` é apagado antes de `nfeParticipants`.

⚠️ A fragilidade de fundo continua: cinco arquivos de teste compartilham o CNPJ
`12345678000190` num unique global, e só três limpam. Não é desta spec, e mexer nisso aqui
misturaria escopo — mas fica registrado, porque o sintoma (quatro arquivos falhando longe da
causa) custa mais para diagnosticar do que para consertar.

---

## Fase A — O seam (T003–T006, 2026-09-01)

**T003** `test/nfe-documents/physical-destination.contract.ts` — escrito primeiro e **falhando**
(`Cannot find module physical-destination.policy`), como manda a regra. Sete casos: entrega vence;
sem entrega nada muda; entrega incompleta cai para o destinatário; entrega sem número é válida
(`S/N` é lugar); nenhum dos dois utilizável mantém o destinatário e o caso `SEM ENDEREÇO` de hoje;
nota sem participante é `null`, não erro; a origem viaja no resultado.

**T004** `src/nfe-documents/domain/physical-destination.policy.ts` (puro) e
`src/nfe-documents/infrastructure/physical-destination.join.ts` (`destinationRolesFilter`,
`pickPhysicalDestinationByDocument`).

⚠️ **A forma do plano estava errada e foi corrigida.** Ele mandava escolher em SQL, por `coalesce`
entre dois `left join`. O critério de "utilizável" é `buildStopAddressKey` devolver não-nulo, e
levá-lo para SQL obrigaria a reescrever `normalizePostalCode` como expressão do Postgres — duas
definições da mesma regra, livres para divergir sem ninguém notar. A consulta passa a trazer os
**dois** papéis e a escolha acontece em memória: uma consulta só (RF3), uma definição só.
`mdfe-candidate-document.query.ts` já fazia assim.

**T005** `physical-destination-boundary.contract.ts` — varredura por texto de fonte afirmando que
os cinco consumidores fiscais e comerciais não importam o seam, mais uma asserção de que os cinco
caminhos existem (caminho morto passaria calado).

**T006** `physical-destination-logging.contract.ts` — o seam não registra nada, e a varredura de
campos de endereço é ancorada nos campos de que a chave de parada é feita.

```
bun test test/nfe-documents.contract.test.ts
  27 pass · 0 fail · 71 expect()
```

---

## Fase B — MDF-e (T007–T008, 2026-09-01)

**T007** `test/mdfe-domain/discharge-city.contract.ts`, escrito primeiro e falhando. Cinco casos:
descarga na cidade da entrega; sem entrega o manifesto não muda; `<entrega>` **nunca** toca a
origem (a origem é o emitente, e de onde a carga sai é outra pergunta); entrega incompleta cai para
o destinatário; papel que não é origem nem destino continua ignorado.

**T008** O laço que montava as cidades vivia dentro de `loadCities`, dentro da consulta. Saiu para
`src/mdfe-manifests/domain/manifest-cities.policy.ts` (`resolveManifestCities`), puro — este é o
único consumidor da spec cujo erro sai no XML transmitido à SEFAZ, e valor fiscal precisa de teste
que rode sem banco.

A consulta passou a trazer `postal_code` e `number` junto: a escolha entre `<entrega>` e
`<enderDest>` usa o mesmo critério de utilizável que a parada da viagem (RF2), e sem esses dois
campos ele não pode ser aplicado. `DISCHARGE_ROLE` deixou de existir.

⚠️ Não foi preciso mexer no `where` da consulta: ela **já** trazia todos os participantes e
filtrava por papel no laço. A conversão não acrescenta junção, não acrescenta ida ao banco e não
muda o plano — só passa a olhar uma linha que já vinha e era descartada.

```
bun test test/mdfe-domain test/mdfe-infrastructure test/mdfe-application
  145 pass · 0 fail · 355 expect()
```

---

## Fase C — O roteiro (T009–T013, 2026-09-01)

**T009** `test/trip-domain/physical-destination-wiring.contract.ts`, escrito primeiro e falhando.
Prova o que importa e do jeito que o repo já usa: a **escolha** em função pura
(`chooseNfeDestinationRow`) e a **fiação** por texto de fonte — a consulta que alimenta a parada não
pode voltar a prender `'recipient'`. Esse defeito compila, passa em todo teste de caminho feliz, e
só aparece na nota que traz `<entrega>`, com o motorista já na porta errada.

Casos: parada pelo endereço de entrega; sem entrega a parada é a de hoje; **duas notas do mesmo
cliente, uma com e outra sem, vão para paradas diferentes** — são dois portões; o rótulo acompanha
o endereço escolhido, não o outro; nota sem destino é `null`.

**T010** `nfe-destination-address.support.ts` traz os dois papéis e chama a política.
`NfeDestinationAddress` passou a carregar `origin` (RF4).

**T011/T012** `drizzle-delivery-address-override.repository.ts`. A precedência da P4 já era
**estrutural** — o último desvio retorna antes de a nota ser consultada —, e o contrato agora trava
essa ordem comparando as posições no arquivo: inverter faria a nota sobrescrever o desvio. A base do
desvio passou a ser o endereço físico: mostrar o cadastro do cliente como "endereço anterior" faria
o operador desviar a partir de um lugar que nunca foi o destino.

⚠️ A primeira versão do contrato de ordem passou a ancorar em `destinationRolesFilter(...)` com o
argumento: `indexOf('destinationRolesFilter')` casava com a **linha do import**, no topo do arquivo,
e teria dado verde com a ordem invertida. Foi o próprio teste que pegou.

**T013** Worker: `src/routing/domain/physical-destination.policy.ts`, **cópia por valor** da da API,
com `test/routing/physical-destination-parity.contract.ts` comparando os dois arquivos linha a linha
(descontando o import da chave, que é `pool-address-key` aqui e `stop-address-key` lá — e esses dois
já são cópia um do outro).

⚠️ **O CNPJ não acompanhou o endereço, de propósito.** A mesma consulta trazia
`recipientTaxId` junto, e ele é a identidade do **cliente de entrega** (spec 060). Trocá-lo pelo
documento de `<entrega>` — que é quem recebe a carga no galpão — teria feito a sugestão casar a
parada com outro cadastro. Endereço vem do destino escolhido; documento continua vindo do
destinatário.

```
bun test (worker)  879 pass · 28 skip · 0 fail
bun test test/trip-domain.contract.test.ts   42 pass · 0 fail
bun test test/routing.contract.test.ts       78 pass · 0 fail
```

---

## Fase D — Geocodificação e cliente de entrega (T014–T016, 2026-09-01)

**T014/T015** `test/geocoding-backfill/destination-roles.contract.ts`, falhando antes. A rotina
passou a selecionar `p."role" in ('recipient', 'delivery')`.

**Por que os dois papéis e não só o escolhido:** escolher em SQL exigiria repetir ali a precedência
de `<entrega>`. O superconjunto **nunca erra por falta** — qualquer endereço que possa virar parada
está nele —, e o excedente é barato por construção, porque o degrau que resolve é o do CEP, grátis;
o provedor pago só entra por marca humana. O segundo teste trava que o **papel** decide quais
endereços entram, nunca **como** a chave é montada: mexer na montagem faria toda chave em base virar
`miss` de uma vez.

**T016 — a task inverteu de sinal.** `unscheduled-stop.query.ts` e
`drizzle-delivery-charge.repository.ts` **não foram convertidos**, porque medido na execução
**nenhum dos dois lê `nfe_addresses`**: eles juntam o participante só para chegar ao CNPJ e, por ele,
ao cadastro do cliente de entrega (spec 060). Convertê-los faria a busca casar pelo documento de quem
recebe a carga no galpão — cadastro que quase nunca existe — e a nota sumiria em silêncio da consulta
que **impede o despacho** por agendamento pendente: uma trava de segurança desligada sem erro nenhum.

Os dois foram para a lista de fronteira do CA7, com um contrato a mais afirmando que seguem sem ler
endereço — porque o que separa um consumidor de _lugar_ de um de _identidade_ é ler ou não o
endereço, não uma opinião sobre o nome dele. É a mesma razão pela qual o `recipientTaxId` do worker
não acompanhou o endereço na T013.

---

## Fase E — Fecho (T017–T018)

**T017 — a premissa da task não se aplicava.** Ela pedia `EXPLAIN` da listagem de notas, mas a
listagem (`drizzle-nfe-document.repository.ts`) está na **lista de exclusão** e nunca foi tocada.
Medi então a consulta que de fato foi alargada, contra produção (4884 endereços, `SELECT`, leitura):

```
antes   p."role" = 'recipient'                 12,54 ms · 50 linhas · 9882 buffers
depois  p."role" in ('recipient','delivery')   11,66 ms · 50 linhas · 9879 buffers
```

Sem regressão: o predicado alarga, o plano não muda de forma. ⚠️ A medição é com **zero** linhas
`delivery` em base — ela prova que o alargamento do predicado é grátis, não o custo de um dia em que
metade das notas traga `<entrega>`.

**T018** `CLAUDE.md` ganhou a seção de `<entrega>`, com a linha divisória (ler ou não o endereço), a
precedência, a cópia por valor e os dois de `delivery-clients` nomeados como exclusão.

---

## Passe de revisão (gate da G006, 2026-09-01)

Duas coisas saíram, e a primeira é um defeito de verdade.

### 1. Conversão pela metade no agrupamento do solver — **corrigida**

`groupStops` tem **dois ramos**: criar a parada e somar a segunda nota nela. Convertido, o primeiro
passou a usar o `recipientTaxId` resolvido; **o segundo seguia lendo `row.recipientTaxId`** — e `row`
passou a ser a linha _escolhida_. Com `<entrega>` vencendo, a parada acumularia o CNPJ de quem recebe
a carga no galpão, e o cadastro de cliente de entrega (spec 060) casaria com outro.

Compila, passa em todo teste de caminho feliz, e é exatamente a classe de defeito que a T013 tinha
nomeado — na task ao lado. Corrigido, com contrato por texto de fonte
(`never reads the tax id off the chosen destination row`) que falhou antes e passa depois.

⚠️ O contrato pegou, de primeira, o **comentário** que eu havia escrito explicando a correção: ele
continha a expressão proibida. Reescrevi o comentário em vez de afrouxar a asserção.

### 2. CA10 não foi cumprida — **registrada como T019, não emendada**

A RF4 pede a origem observável na parada. `chooseNfeDestinationRow` a devolve e
`drizzle-trip.repository.ts` **a descarta** ao chamar `reconcileStopOnLink`. Nenhum consumidor de
produção lê o campo.

Não emendei, e a razão é de desenho: **a origem não é da parada**. Uma parada agrupa várias notas, e
a mesma chave pode ser alcançada pela entrega de uma e pelo cadastro de outra — `trip_stops` faria a
tela mentir na primeira parada mista. O lugar é `trip_documents`, com migration, rota e tela — escopo
que as tasks da Fase C não previram. Decidir modelo de dados no passe de revisão seria pior que
deixar o item aberto com o motivo escrito.

**Consequência honesta: a spec 073 está completa em 18 das 18 tasks planejadas, com a CA10 em
aberto.** As outras nove (CA1–CA9) estão cobertas.
