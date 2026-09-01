# ADR 0043 — A viagem tem fases, e a nota tem as suas

- Status: aceito
- Data: 2026-08-24
- Decisores: mantenedor do projeto e revisão Opus
- Responde a pergunta em aberto do **§4 da ADR-0023** (`[NEEDS CLARIFICATION: quais são os estados de
trips.status ...]`) e substitui o ciclo `open|closed` que a spec 027 implementou como resposta
  provisória. O resto da ADR-0023 (§1, §2, §3, §5) continua valendo integralmente
- Fecha a decisão da spec 056
- Base das specs 057, 058, 059, 060 e 061

## Contexto

A ADR-0023 desacoplou a viagem do manifesto e deixou uma pergunta explícita no §4: quais são os
estados de `trips.status`, "paralelo a `mdfe_manifests` (`draft/issuing/authorized/...`) ou mais
simples (`open/closed`), já que a viagem em si não fala com a SEFAZ?".

A spec 027 respondeu `open|closed`, e o comentário em `src/database/trip.schema.ts:24` registra o
raciocínio: _"a viagem não fala com a SEFAZ, então o ciclo é só aberto/fechado"_. A premissa estava
certa e a conclusão não seguia dela. Não falar com a SEFAZ elimina a necessidade de espelhar os
estados **fiscais** do manifesto; não elimina os estados **operacionais**, que são de outra natureza e
existem de qualquer forma — só que fora do sistema.

Entre "a nota entrou na viagem" e "a nota foi entregue" está todo o trabalho do barracão: conferir o
roteiro, tirar da prateleira, carregar, sair. Hoje nada disso é registrado. `trip_documents` guarda
duas datas soltas (`delivered_at`, `released_at`), e quando o cliente liga perguntando da entrega a
resposta vem do WhatsApp de alguém.

E há um segundo buraco, mais estrutural: **a viagem não tem paradas**. Ela tem um saco de notas. Duas
notas para o mesmo destinatário no mesmo endereço são duas linhas independentes, e nada no modelo diz
que o motorista vai parar uma vez só. Sem parada não há ordem; sem ordem não há roteiro; sem roteiro
não há o que otimizar (spec 058) nem o que mostrar ao motorista (spec 057).

## Decisão

### 1. São dois eixos de estado, e o da viagem é derivado do da nota

A tentação é um `status` único em `trips`. Não funciona: "mercadoria separada" é um fato **por nota** —
numa viagem de trinta notas, vinte e oito estão separadas e duas faltam no estoque. Um estado único
obrigaria a escolher entre mentir (dizer separada com duas faltando) ou travar (não avançar por causa
de duas).

**Eixo da nota** — `trip_documents.separation_status`:
`pending` → `separated` → `loaded` → `delivered` | `returned`.

**Eixo da viagem** — `trips.status`, substituindo `open|closed`:

| Estado          | Entra quando                           | Transição                   |
| --------------- | -------------------------------------- | --------------------------- |
| `draft`         | viagem criada                          | manual (é o `open` de hoje) |
| `route_planned` | roteiro montado e conferido            | manual, exige ≥1 parada     |
| `separating`    | primeira nota vira `separated`         | automática                  |
| `loading`       | primeira nota vira `loaded`            | automática                  |
| `dispatched`    | motorista saiu do barracão             | manual, irreversível        |
| `in_transit`    | primeira entrega confirmada            | automática                  |
| `completed`     | toda nota em `delivered` ou `returned` | automática                  |
| `cancelled`     | viagem abortada antes de `dispatched`  | manual                      |

O estado da viagem **nunca é escrito à mão** fora das quatro transições manuais. O restante é
consequência aritmética do estado das notas, calculada na mesma transação da escrita da nota. Duas
fontes de verdade para a mesma coisa é como um painel passa a discordar do outro.

Migração: `open → draft`, `closed → completed`. Nota com `delivered_at` → `delivered`; as demais de
viagem fechada → `returned` com motivo `migration`.

### 2. `dispatched` é a porta de não-retorno

Antes de `dispatched`, tudo é editável. Depois, a carga está fisicamente na rua e o modelo para de
fingir que não: **nenhuma nota entra, nenhuma nota sai**, e a ordem das paradas congela num snapshot.
O roteiro que o motorista levou é o que se cobra dele depois, não a versão que alguém editou às onze
da noite.

O motivo fiscal é mais duro que o operacional. A partir da spec 059, é `dispatched` que autoriza o
MDF-e, e o MDF-e declara à SEFAZ exatamente quais documentos vão naquele veículo. Nota que entra
depois do manifesto autorizado é divergência fiscal, não ajuste de tela.

Sair de `dispatched` só por `cancelled` administrativo, com motivo obrigatório e trilha — e isso é um
incidente, não um fluxo.

Despachar com nota pendente é caso real e acontece todo dia: a API recusa por padrão
(`409 TRIP_HAS_UNLOADED_DOCUMENTS`, listando as notas) e aceita com `force` **mais motivo
obrigatório**, que desvincula as pendentes de volta ao pool. O que não pode é acontecer sem alguém
assinar.

### 3. A parada existe, e agrupa por endereço, não por destinatário

Nasce `trip_stops`: uma parada por **endereço de entrega distinto**, com `sequence`. `trip_documents`
ganha `stop_id`.

A chave é o endereço normalizado — `(postal_code, number, city_code)` de `nfe_addresses` — e **não** o
CNPJ: a mesma rede entrega em cinco lojas, e são cinco paradas; dois CNPJs no mesmo galpão são uma
parada, e o motorista desce uma vez.

A parada é derivada e reconciliada, nunca criada à mão: vincular cria se não existir, desvincular a
última apaga. A normalização de CEP e número é uma função só, testada — `01310-100` e `01310100`,
`nº 45` e `45` são o mesmo lugar, e duas variantes viram duas paradas no mesmo portão.

Nota sem endereço no XML cai numa parada `SEM ENDEREÇO`, sempre última, e impede `route_planned`
enquanto existir.

### 4. A transição é registrada, não inferida da coluna

`trip_document_events` guarda `from_status`, `to_status`, `actor_membership_id`, `occurred_at`,
`note`. A coluna responde "onde está agora"; a tabela responde "quem, quando e por quê" — e é ela que
sustenta o §10 do `security.md` e a conversa com o cliente que liga.

O evento nunca guarda conteúdo de nota nem dado pessoal: id opaco de ator, id opaco de documento.

Toda transição é **idempotente**: marcar como `separated` uma nota já `separated` devolve `200` sem
novo evento. A rede do armazém cai, e o separador toca duas vezes.

### 5. O separador tem permissão própria

`fleet.manage` hoje governa toda escrita de viagem (`trips/presentation/trip.routes.ts:40`) e junto dá
cadastro e exclusão de veículo e de motorista. Dar isso a quem anda no armazém é dar o poder errado à
pessoa certa.

Nasce `trip.manage`, no slot já reservado ao lado de `trip.read` e `trip.report` — que existem no
catálogo do frontend (`identity/queries/useAuthMe.query.ts:51-52`) e não têm consumidor em nenhuma
rota. `trip.manage` monta, vincula e move estado; `fleet.manage` continua dona do cadastro. **Sem
herança implícita**: quem tem `fleet.manage` não ganha `trip.manage` de graça — herança implícita é
como uma permissão volta a valer tudo.

Esta decisão é compartilhada com a spec 055 (leitura de DANFE por câmera), que precisa da mesma
permissão pelo mesmo motivo. Quem sair primeiro implementa.

### 6. Um veículo por viagem, e isso é decisão, não omissão

`trips.vehicle_id` continua sendo uma coluna só. A operação é de chassi único — caminhão-baú, VUC,
utilitário. Não há cavalo mecânico com carreta trocável.

Fica registrado o que isso significa, porque a pergunta vai voltar: `fleet_vehicles` tem
`role ∈ {traction, trailer}` (`fleet.schema.ts:43`) e o layout do MDF-e tem grupos separados para
tração e para até três reboques. Se a frota passar a ter composição, três coisas quebram juntas — o
manifesto sai sem a placa da carreta, a capacidade lida pelo solver da spec 058 é a do cavalo e não a
de quem carrega, e o custo por km da composição não fecha. Nesse dia nasce `trip_vehicles`, e o mesmo
em `mdfe_manifests`.

Não se prepara a estrutura agora. Uma tabela de junção criada por precaução e sempre com uma linha é
complexidade paga hoje por um benefício que pode nunca chegar; a migração, quando vier, é aditiva e
mecânica — a coluna atual vira a linha de tração.

### 7. Entrega parcial é ocorrência, não estado

O motorista entrega 8 de 10 volumes: a nota vai a `delivered` e a divergência vira **ocorrência**
(spec 057), tipada, com foto e rastro.

Não nasce um `partially_delivered`. Um quinto estado no eixo da nota se propaga para a derivação do
estado da viagem, para a prontidão fiscal da spec 059 e para toda tela que mostra progresso — caro
para um caso que a operação confirma ser raro e que a ocorrência resolve com o mesmo rastro. Se a
frequência mudar, a inversão é decisão nova, e o custo dela está mapeado aqui.

### 8. A nota volta, o CT-e fica de pé, e isso fica visível

`returned` **não dispara nada no fiscal**. O transporte até a tentativa de entrega aconteceu, e o CT-e
emitido continua válido — regra da operação, não escolha de produto.

O que ele dispara é visibilidade: nota destacada na viagem e numa lista própria de "retornadas com
CT-e ativo", com a chave junto, pelo mesmo caminho de índice que a spec 059 constrói para a prontidão
fiscal. Dali sai uma **ação explícita** de cancelar o CT-e, reusando `CTE_ATTEMPT_KINDS.cancel`, e ela
é sempre humana: cancelar documento fiscal por consequência automática de um estado operacional é como
uma nota fiscal some sem ninguém ter decidido.

Nota `returned` volta a ficar elegível para outra viagem independentemente do CT-e — o índice único
parcial de `trip_documents` já trata `released_at` assim, e `returned` entra na mesma condição.

### 9. O endereço de entrega pode ser sobrescrito, e o desvio tem dono

Redespacho, entrega em depósito do cliente, entrega em obra: acontece. A nota pode receber um endereço
de entrega sobrescrito, e a chave de agrupamento do §3 lê o sobrescrito quando ele existir — a parada
nasce onde a mercadoria vai, não onde o XML diz.

O que torna isso seguro é que **não é um campo, é uma ação**: menu explícito, nunca edição em linha,
gravando em `delivery_address_overrides` quem **solicitou** o desvio (texto livre — essa pessoa quase
nunca é usuária do sistema), quem **executou** (membership), o motivo, o endereço anterior e o novo, e
quando. Histórico, não estado: a nota pode ser redirecionada duas vezes e as duas ficam. Sobrescrever
depois de `dispatched` é `409`.

Exigir o solicitante é o ponto todo. É a informação que some primeiro e a única que interessa quando a
entrega dá errado no endereço novo — "quem mandou entregar ali?" é a pergunta que vem, e sem campo ela
é respondida por memória.

## Consequências

- **A ADR-0023 §4 deixa de ter pergunta em aberto.** O ciclo `open|closed` implementado pela spec 027
  é substituído; o comentário de `trip.schema.ts:24` precisa apontar para este ADR.
- A ADR-0016 §5 continua na mesma situação em que a ADR-0023 a deixou: o app de campo ancora em
  `trip_id`. Este ADR só especifica o que é aquele ciclo de vida.
- `trip.read` e `trip.report` deixam de ser permissões reservadas sem consumidor — a spec 057 as
  consome, e `trip.manage` nasce ao lado delas.
- Toda tela, rota e teste que hoje assume dois estados de viagem precisa ser revista. O impacto é
  amplo e concentrado no módulo `trips`.
- A prontidão fiscal da spec 059 passa a depender de `dispatched` como garantia. Sem o §2, aquela
  spec não tem como afirmar que o conjunto declarado no manifesto não muda.
- `delivery_address_overrides` cria um endereço que não vem de NF-e. Ele é geocodificado como
  qualquer outro (spec 058) e pode ter cliente cadastrado como qualquer outro (spec 060).

## Alternativas consideradas

- **Manter `open|closed` e registrar as fases só em eventos.** Rejeitada: consultar "quais viagens
  estão carregando agora" viraria agregação sobre a tabela de eventos em toda leitura de lista, e o
  estado corrente ficaria sem constraint — nada impediria uma nota `delivered` numa viagem que nunca
  carregou.
- **Um único `status` na viagem, sem eixo na nota.** Rejeitada pelo motivo do §1: força a mentir ou a
  travar quando parte da carga não acompanha.
- **Espelhar os estados do manifesto (`draft/issuing/authorized`).** Rejeitada: são estados de
  conversa com a SEFAZ, e a viagem não tem essa conversa. A premissa da ADR-0023 §4 continua correta
  nesse ponto.
- **Parada agrupada por destinatário (CNPJ).** Rejeitada: quebra nos dois sentidos — cinco lojas da
  mesma rede viram uma parada falsa, e dois CNPJs no mesmo galpão viram duas paradas para uma descida
  só.
- **Endereço de entrega como campo editável na nota.** Rejeitada em favor da ação do §9: um campo
  editável perde quem pediu o desvio, que é a informação que importa quando ele dá errado.
