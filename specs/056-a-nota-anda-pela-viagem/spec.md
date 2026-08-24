# 056 — a nota anda pela viagem

> **Base das 057, 058 e 059.** Esta feature cria a máquina de estados e a parada. As três seguintes
> consomem o que nasce aqui e não têm onde se apoiar sem ela.
>
> **Relação com a 055:** a 055 dá ao separador a _câmera_ para vincular a nota. Esta dá a ela o
> _significado_: uma nota vinculada passa a ter estado, e a viagem passa a ter fases. As duas se
> encontram na mesma tela e podem sair na mesma sprint, mas não dependem uma da outra — a 056
> funciona com o vínculo por UUID que já existe hoje.

## Problema e resultado

A viagem de hoje é uma lista. `trips` tem dois estados (`open`/`closed`, ADR-0023 §4) e
`trip_documents` guarda duas datas soltas — `delivered_at` e `released_at`. Entre "a nota entrou na
viagem" e "a nota foi entregue" existe todo o trabalho real do barracão, e nada dele é registrado:
ninguém sabe se o roteiro já foi conferido, se a mercadoria saiu da prateleira, se subiu no
caminhão, se o caminhão saiu. Quando o cliente liga perguntando da entrega, a resposta vem do
WhatsApp de alguém.

Pior: **a viagem não tem paradas.** Ela tem um saco de notas. Duas notas para o mesmo destinatário
no mesmo endereço são duas linhas independentes, e nada no modelo diz que o motorista vai parar uma
vez só. Sem parada não há ordem, sem ordem não há roteiro, e sem roteiro não há o que otimizar
(058) nem o que mostrar ao motorista (057).

O resultado desta feature é uma viagem que **anda**: o conferente monta o roteiro, o separador marca
o que tirou da prateleira, o carregador marca o que subiu, e o portão marca a saída — cada
transição com ator, hora e trilha de auditoria. E é uma viagem que tem **paradas ordenadas**,
derivadas do endereço de entrega das notas, prontas para receber uma sugestão de sequência.

## Fora do escopo

- Sugestão automática de sequência de paradas — é a **058**.
- Qualquer tela ou rota consumida pelo motorista em rota — é a **057**.
- Emissão de MDF-e a partir da viagem — é a **059**.
- Leitura por câmera — é a **055**.
- Cadastro de cliente/destinatário como entidade própria — é a **060**. Aqui o destinatário continua
  derivado de `nfe_participants`, como hoje.
- Cancelamento de CT-e. A D8 cria a **visibilidade** e a ação; a mecânica de cancelar já existe
  (`CTE_ATTEMPT_KINDS.cancel`) e não muda.
- Janela de entrega e agendamento por cliente — é a **060**. As colunas de janela nascem aqui
  reservadas e nulas; nada as consome antes dela.

## Decisões

### D1 — O estado é da viagem _e_ da nota, porque são coisas diferentes

Existe a tentação de pôr um único `status` em `trips` e pronto. Não funciona: "mercadoria separada"
é um fato **por nota** — numa viagem de trinta notas, vinte e oito estão separadas e duas faltam no
estoque. Um estado único na viagem obrigaria a escolher entre mentir (dizer separada com duas
faltando) ou travar (não avançar por causa de duas).

Então são dois eixos, e o da viagem **é derivado** do das notas:

**Eixo da nota** (`trip_documents.separation_status`):

| Estado      | Significa                                               |
| ----------- | ------------------------------------------------------- |
| `pending`   | vinculada à viagem, nada feito                          |
| `separated` | mercadoria tirada da prateleira e conferida             |
| `loaded`    | mercadoria dentro do veículo                            |
| `delivered` | entregue ao destinatário (hoje é o `delivered_at`)      |
| `returned`  | voltou sem entregar (recusa, ausência, endereço errado) |

**Eixo da viagem** (`trips.status`, substituindo `open`/`closed`):

| Estado          | Entra quando                           | Transição                   |
| --------------- | -------------------------------------- | --------------------------- |
| `draft`         | viagem criada                          | manual — é o `open` de hoje |
| `route_planned` | roteiro montado e conferido            | manual, exige ≥1 parada     |
| `separating`    | primeira nota vira `separated`         | **automática**              |
| `loading`       | primeira nota vira `loaded`            | **automática**              |
| `dispatched`    | motorista saiu do barracão             | **manual e irreversível**   |
| `in_transit`    | primeira entrega confirmada            | automática (057)            |
| `completed`     | toda nota em `delivered` ou `returned` | automática                  |
| `cancelled`     | viagem abortada antes de `dispatched`  | manual                      |

O estado da viagem **nunca é escrito à mão** exceto nas quatro transições marcadas como manuais.
Toda a demais é consequência aritmética do estado das notas, calculada na mesma transação da
escrita da nota. Duas fontes de verdade para a mesma coisa é como um painel passa a discordar do
outro.

### D2 — `dispatched` é a porta de não-retorno

Antes de `dispatched`, tudo é editável: entra nota, sai nota, muda parada, muda motorista. Depois de
`dispatched`, a carga está fisicamente na rua e o modelo tem de parar de fingir que não. A partir
dali: **nenhuma nota entra**, **nenhuma nota sai**, e a ordem das paradas congela num
`trip_stop_snapshot` — o roteiro que o motorista levou é o que se cobra dele depois, não a versão
que alguém editou às onze da noite.

Sair de `dispatched` só por `cancelled` administrativo, com motivo obrigatório e trilha — e isso é
um incidente, não um fluxo.

O motivo fiscal é mais duro que o operacional: a partir da 059, é `dispatched` que autoriza o MDF-e,
e o MDF-e declara à SEFAZ exatamente quais documentos vão naquele veículo. Nota que entra depois do
manifesto autorizado é divergência fiscal, não ajuste de tela.

### D3 — A parada existe, e ela agrupa por endereço, não por nota

Nasce `trip_stops`: uma parada por **endereço de entrega distinto** da viagem, com `sequence`
inteiro. `trip_documents` ganha `stop_id`, e toda nota vinculada cai numa parada.

A chave de agrupamento é o endereço normalizado do destinatário da NF-e —
`(postal_code, number, city_code)` de `nfe_addresses` — e **não** o CNPJ do destinatário: a mesma
rede entrega em cinco lojas, e são cinco paradas. Inversamente, dois CNPJs no mesmo galpão são uma
parada, e o motorista só desce uma vez.

Normalização de CEP e número tem de ser uma função só, testada, em `shared/` — `01310-100` e
`01310100`, `nº 45` e `45` são o mesmo lugar, e duas variantes viram duas paradas no mesmo portão.

A parada é **derivada e reconciliada**: vincular uma nota cria a parada se não existir; desvincular
a última nota de uma parada apaga a parada. Nunca é criada à mão.

### D4 — A transição é registrada, não inferida da coluna

`trip_document_events` guarda cada mudança: `from_status`, `to_status`, `actor_membership_id`,
`occurred_at`, `note`. A coluna `separation_status` responde "onde está agora"; a tabela de eventos
responde "quem, quando e por quê" — e é ela que sustenta o §10 do `security.md` (trilha de ação
sensível) e a conversa com o cliente que liga.

O evento nunca guarda conteúdo de nota nem dado pessoal: id opaco de ator, id opaco de documento.

### D5 — O separador tem permissão própria

`fleet.manage` hoje governa toda escrita de viagem (`trip.routes.ts:40`) e junto dá cadastro e
exclusão de veículo e de motorista. Dar isso a quem anda no armazém é dar o poder errado à pessoa
certa. Nasce `trip.manage` — o slot já está reservado ao lado de `trip.read` e `trip.report`, que
existem no catálogo e não têm consumidor.

Divisão: `trip.manage` monta, vincula e move estado; `fleet.manage` continua dona do cadastro.
Quem tem `fleet.manage` **não herda** `trip.manage` automaticamente — herança implícita é como uma
permissão volta a valer tudo.

> **Esta decisão é compartilhada com a 055.** Quem sair primeiro a implementa; a outra consome.

## Histórias priorizadas

**P1 — o conferente monta o roteiro**
_Dado_ uma viagem `draft` com oito notas vinculadas em cinco endereços distintos,
_quando_ o conferente abre a viagem,
_então_ ele vê cinco paradas com as notas agrupadas sob cada uma, arrasta para ordenar, e ao
confirmar a viagem vai para `route_planned`.

**P1 — o separador marca o que tirou da prateleira**
_Dado_ uma viagem `route_planned` e um usuário com `trip.manage`,
_quando_ ele marca três notas como separadas,
_então_ cada nota vai a `separated`, a viagem vai sozinha a `separating`, e três eventos ficam
gravados com o id dele e a hora.

**P1 — a mercadoria sobe no caminhão**
_Dado_ notas em `separated`,
_quando_ o carregador marca como carregadas,
_então_ elas vão a `loaded` e a viagem a `loading`. Nota em `pending` **não** pode ir direto a
`loaded` — `409 STATE_TRANSITION_NOT_ALLOWED`, com a mensagem dizendo qual nota e qual estado.

**P1 — o motorista sai do barracão**
_Dado_ uma viagem em `loading` com toda nota em `loaded`,
_quando_ o portão confirma a saída,
_então_ a viagem vai a `dispatched`, a ordem das paradas é congelada, e as rotas de vínculo e
desvínculo passam a responder `409` para essa viagem.

**P2 — a saída com pendência é uma decisão consciente**
_Dado_ uma viagem em `loading` com duas notas ainda em `pending`,
_quando_ o portão tenta despachar,
_então_ a API recusa por padrão (`409 TRIP_HAS_UNLOADED_DOCUMENTS`, listando as notas), e só aceita
com `force: true` **mais motivo obrigatório** — que desvincula as pendentes de volta ao pool e grava
o motivo na trilha. Sair com carga faltando acontece todo dia; o que não pode é acontecer sem
alguém assinar.

**P2 — a nota volta sem entregar**
_Dado_ uma nota `loaded` numa viagem `dispatched`,
_quando_ o retorno é registrado com motivo,
_então_ ela vai a `returned` e volta a ficar elegível para outra viagem — o índice único parcial de
`trip_documents` já trata `released_at` assim, e `returned` entra na mesma condição.

**P3 — o painel responde onde está a nota**
_Dado_ uma chave de acesso,
_quando_ consultada,
_então_ devolve a viagem, a parada, a posição na sequência e o estado atual, sem varrer lista.

## Requisitos funcionais

1. `trips.status` migra de `open|closed` para os nove estados de D1. `open → draft`,
   `closed → completed`. O check constraint muda junto.
2. `trip_documents` ganha `separation_status` (check pelo enum), `stop_id` (FK), `separated_at`,
   `loaded_at`, `returned_at`, `return_reason`. `delivered_at` permanece e passa a ser escrito
   **junto** com `separation_status = 'delivered'` na mesma transação.
3. Nasce `trip_stops`: `id`, `trip_id`, `sequence` (unique por viagem), chave de endereço
   normalizada, rótulo legível (cidade/UF/logradouro), `arrived_at`, `completed_at`,
   `delivery_window_start`/`end` (reservadas, nulas). Sem coordenada — ela chega na 058.
4. Nasce `trip_document_events` conforme D4.
4b. Nasce `delivery_address_overrides` (D9): documento, endereço anterior e novo, `requested_by`
   (texto), `actor_membership_id`, motivo, `created_at`. Histórico, nunca sobrescrito.
4c. A chave de agrupamento da D3 lê o override quando existir.
5. Nasce `trip_stop_snapshot` (ou coluna JSONB congelada em `trips`) gravada na transição a
   `dispatched`.
6. Rotas novas, todas sob `trip.manage`:
   - `POST /trips/:id/documents/:documentId/separate`
   - `POST /trips/:id/documents/:documentId/load`
   - `POST /trips/:id/documents/:documentId/return` (motivo obrigatório)
   - `POST /trips/:id/documents/batch-status` — a operação real é em maço, não uma a uma
   - `POST /trips/:id/plan-route` (→ `route_planned`, aceita a ordem das paradas)
   - `POST /trips/:id/dispatch` (→ `dispatched`, aceita `force` + motivo)
   - `POST /trips/:id/cancel`
   - `POST /trips/:id/documents/:documentId/delivery-address` (D9 — sobrescreve, exige motivo e
     solicitante; `409` a partir de `dispatched`)
   - `GET /trips/:id/documents/:documentId/delivery-address-history`
   - `GET /trip-documents/returned-with-active-cte` (D8 — a lista que não deve ser procurada)
   - `GET /trips/:id/stops`
   - `PATCH /trips/:id/stops/order`
   - `GET /nfe-documents/by-access-key/:accessKey/trip-location` (P3 — e é o mesmo resolvedor de
     chave que a 055 precisa)
7. `POST /trips/:id/documents` e o `DELETE` correspondente passam a recusar viagem em `dispatched`
   ou posterior.
8. Toda transição de estado é idempotente: marcar como `separated` uma nota já `separated` devolve
   `200` sem novo evento, não `409`. A rede do armazém cai, o separador toca duas vezes.
9. Frontend: a tela de viagem passa a listar por parada, com maço de seleção, ação em lote, e uma
   barra de progresso por fase. Cada ação segue `docs/frontend/mutations.md`.
10. Todo texto novo em `*.locale.json`; nenhum literal em JSX.

## Requisitos não funcionais

- A transição em lote de 50 notas é **uma** transação e **uma** ida ao banco por tabela — não 50.
- `GET /trips/:id` com 200 notas em 40 paradas responde sem N+1 (§15 do `code-standart.md`).
- A tela funciona em 375px: o separador está de pé, com o celular numa mão. `min-width` para
  adicionar, nunca `max-` para remover (`web.md` §10). Alvo de toque ≥44px — marcar nota separada é
  o gesto mais repetido do produto.
- Evento nunca carrega PII (`security.md` §1).
- Nenhum estado é escrito por `UPDATE` direto: a transição passa por um use case que valida a
  origem, ou a máquina não existe.

## Casos extremos e falhas

| Caso                                                  | Comportamento                                                                                                                         |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Nota sem endereço de destinatário no XML              | Cai numa parada `SEM ENDEREÇO`, sempre a última na ordem, e a viagem **não** vai a `route_planned` enquanto ela existir.              |
| CEP igual, números diferentes                         | Paradas distintas.                                                                                                                    |
| Notas de destinatários diferentes, mesmo CEP e número | Uma parada, rótulo com os dois nomes.                                                                                                 |
| Duas pessoas marcam a mesma nota ao mesmo tempo       | Idempotente (RF-8); o segundo evento não é gravado.                                                                                   |
| Nota desvinculada depois de `separated`               | Volta a `pending` e a parada é reconciliada; evento de desvínculo com o estado que ela tinha.                                         |
| Viagem `dispatched` com nota `pending` esquecida      | Não acontece: o `force` de P2 desvincula. Se acontecer por dado legado, migração as move para `returned` com motivo `legacy`.         |
| Migração de viagem `closed` sem estado por nota       | Toda nota com `delivered_at` → `delivered`; as demais → `returned` com motivo `migration`. Backfill em migration versionada, aditiva. |
| Reordenar parada de viagem `dispatched`               | `409`.                                                                                                                                |

## Critérios de aceite

- [ ] Migration versionada e aditiva; `drizzle-kit push` só em local (`database.md`).
- [ ] Teste de transição para **cada** aresta inválida da máquina, não só as válidas.
- [ ] Teste negativo de tenant: viagem de outra empresa responde 404, não 403.
- [ ] Teste de idempotência com a mesma transição duas vezes.
- [ ] Teste de agrupamento de parada com as quatro variantes de normalização de CEP/número.
- [ ] Teste de que a chave de agrupamento prefere o override ao endereço do XML (D9).
- [ ] Teste de que o override exige motivo e solicitante, e recusa em `dispatched`.
- [ ] Teste de que o histórico de override sobrevive ao desvínculo da nota.
- [ ] Teste de que `returned` **não** produz nenhum efeito fiscal (D8), e de que a nota aparece na
      lista de retornadas com CT-e ativo.
- [ ] Teste de que `dispatched` recusa vínculo e desvínculo.
- [ ] E2E em `env.test.e2e`: criar viagem → vincular 3 notas em 2 endereços → planejar → separar →
      carregar → despachar → conferir snapshot congelado.
- [ ] `tsc --noEmit` + `make validate`.
- [ ] Tela conferida em 375px, 768px e 1280px.
- [ ] ADR novo (**0042**) registrando a máquina de estados e a substituição de `open|closed` —
      ele revisa o ADR-0023 §4, que precisa ser marcado como superseded nessa parte.
- [ ] `docs/spec/domain-model.md#estados` atualizado.
- [ ] `CLAUDE.md` da raiz atualizado (§14 do `code-standart.md`).

### D6 — Um veículo por viagem, e isso está decidido

`trips.vehicle_id` é uma coluna só, e continua sendo. A operação é de **chassi único** — caminhão-baú,
VUC, utilitário: motor e carroceria no mesmo veículo. Não há cavalo mecânico com carreta trocável.

Fica registrado o que isso significa, porque a próxima pessoa vai perguntar: `fleet_vehicles` tem
`role ∈ {traction, trailer}` (`fleet.schema.ts:43`) e o layout do MDF-e tem grupos separados para
tração e para até três reboques. Se a frota passar a ter composição, três coisas quebram juntas — o
manifesto sai sem a placa da carreta, a capacidade lida pelo solver (058) é a do cavalo e não a de
quem carrega, e o custo por km da composição não fecha. **Nesse dia, nasce `trip_vehicles`** (uma
tração + até três reboques), e o mesmo em `mdfe_manifests`.

Não vamos preparar a estrutura agora. Uma tabela de junção criada "por precaução" e sempre com uma
linha é complexidade paga hoje por um benefício que pode nunca chegar — e a migração, quando vier,
é aditiva e mecânica: a coluna atual vira a linha de tração.

### D7 — Entrega parcial é ocorrência, não estado

O motorista entrega 8 de 10 volumes. A nota vai a `delivered`, e a divergência vira **ocorrência**
(057 D6) — tipada, com foto e rastro, no mesmo lugar em que todo desvio de entrega já é registrado.

Não nasce um `partially_delivered`. Um quinto estado no eixo da nota se propaga para a derivação do
estado da viagem, para a readiness fiscal da 059 e para toda tela que mostra progresso — caro para um
caso que a ocorrência resolve com o mesmo rastro e sem tocar a máquina. A operação confirma que é
raro; se a frequência mudar, a inversão é uma decisão nova, com o custo já mapeado aqui.

### D8 — A nota volta, o CT-e fica de pé, e isso fica visível

`returned` **não dispara nada no fiscal**. O transporte até a tentativa de entrega aconteceu, e o
CT-e emitido continua válido — regra da operação, não escolha de produto.

O que ela dispara é **visibilidade**. Nota que volta carregando um CT-e autorizado é uma situação
que precisa ser vista sem ninguém procurar: ela aparece destacada na viagem, entra numa lista própria
de "notas retornadas com CT-e ativo", e leva junto a chave do CT-e. Nada disso é derivado por
varredura na hora de abrir a tela — é a mesma consulta de prontidão que a 059 já constrói.

Dali sai uma **ação explícita** de cancelar o CT-e, quando a operação decidir que aquele documento
não deve continuar de pé. Ela reusa o cancelamento que já existe (`CTE_ATTEMPT_KINDS` tem `cancel`),
e é sempre humana: cancelar documento fiscal por consequência automática de um estado operacional é
como uma nota fiscal some sem ninguém ter decidido.

Nota `returned` volta a ficar elegível para outra viagem independentemente do CT-e — o índice único
parcial de `trip_documents` já trata `released_at` assim, e `returned` entra na mesma condição.

### D9 — O endereço de entrega pode ser sobrescrito, e o desvio tem dono

Redespacho, entrega em depósito do cliente, entrega em obra: acontece. Então a nota pode receber um
**endereço de entrega sobrescrito**, e a chave de agrupamento da D3 passa a ler o sobrescrito quando
ele existir — a parada nasce onde a mercadoria vai, não onde o XML diz.

O que torna isso seguro é que **não é um campo, é uma ação**. Ela mora num menu explícito, nunca
numa edição em linha, e grava:

- quem **solicitou** o desvio (o cliente que ligou, o vendedor, o próprio destinatário — texto livre,
  porque essa pessoa quase nunca é usuário do sistema);
- quem **executou** no sistema (membership do operador);
- o **motivo**;
- o endereço anterior e o novo;
- quando.

`delivery_address_overrides` guarda tudo isso como histórico, não como estado: a nota pode ser
redirecionada duas vezes, e as duas ficam. A parada é reconciliada a cada mudança (D3), e sobrescrever
o endereço depois de `dispatched` é `409` — a carga já está na rua e o roteiro está congelado.

A razão de exigir o solicitante é que essa é a informação que some primeiro e é a única que interessa
quando a entrega dá errado no endereço novo. "Quem mandou entregar ali?" é a pergunta que vem, e sem
campo ela é respondida por memória.

O endereço sobrescrito **também é geocodificado** (058 D2) e **também pode não ter cliente cadastrado**
(060 D1) — ele é um endereço como qualquer outro a partir do momento em que existe.

## Dúvidas

Nenhuma. As três que existiam foram respondidas e viraram D7, D8 e D9.
## 🤖 Modelo

| Etapa                                      | Modelo    |
| ------------------------------------------ | --------- |
| Desenhar a máquina de estados e o ADR-0043 | `opus` 🧠 |
| Migration, use cases, rotas, testes        | `sonnet`  |
| Tela, locale, passe de responsividade      | `sonnet`  |
| Extração de constantes e nomes de estado   | `haiku`   |
