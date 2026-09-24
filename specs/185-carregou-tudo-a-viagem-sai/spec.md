# Feature 185 — Carregou tudo, a viagem sai

Decisão: `docs/adr/0074-carregou-tudo-a-viagem-sai.md`.

## Problema e resultado

Em staging (24/09), uma viagem com as quatro notas separadas e carregadas ficou em "carregando": o
despacho era um clique manual que ninguém sabia que faltava. Clicado "Despachar", o cabeçalho ainda
pediu "Conferir carga" — uma conferência repetida do que o barracão acabara de conferir nota a nota.

A operação é **separar → carregar → entregar**. Resultado desta feature:

- carregar a última nota despacha a viagem sozinha;
- o botão "Despachar" leva todas as notas (separa e carrega o que falta) em vez de deixá-las fora;
- ocorrência de separação de um tipo marcado "a viagem segue sem a nota" libera a nota e não segura
  o despacho;
- "Conferir carga" some; quando algo impede o despacho, a tela diz o quê.

## Fora do escopo

- Despacho pelo WhatsApp do operador e pelo app do motorista: continuam como estão (`force` com
  motivo libera as não carregadas). Só o "Conferir carga" some do app do motorista.
- Exigir CT-e para despachar (ADR-0074 §7: aviso, não gate).
- Mover ETA, "A caminho" do portal e rastreamento para o "Iniciar rota" (ADR-0074 §6).
- Despachar a partir de desvincular a última nota pendente ou de soltar nota pela planta de carga
  (ver Casos extremos — a viagem fica em `loading` e o botão resolve).
- Corrigir a gravação de `redeliveryPolicy` no catálogo (defeito à parte, com tarefa própria).

## Histórias priorizadas

### P1 — A última nota carregada despacha a viagem

**Given** uma viagem em `loading`, com roteiro, sem parada pendente de agendamento, e todas as notas
vivas `loaded` exceto uma `separated` **When** o barracão carrega essa nota (na linha, em lote, ou
pelo WhatsApp) **Then** a viagem vai para `dispatched` na sequência, o snapshot é gravado com
`forced = false`, o evento de status tem o ator e o canal de quem carregou, e a tela mostra
"Viagem despachada".

### P1 — Algo impede: a viagem espera e diz por quê

**Given** a mesma viagem, mas com uma parada de cliente que exige agendamento sem agendamento válido
**When** a última nota é carregada **Then** a nota fica `loaded`, a viagem fica em `loading`, e a
tela diz "A viagem não saiu: a parada N (endereço) espera agendamento" — nunca "o servidor recusou".

### P1 — "Despachar" leva todas

**Given** uma viagem com 4 notas, 1 `pending`, 1 `separated`, 2 `loaded` **When** o escritório clica
"Despachar" **Then** um diálogo confirma "Separar e carregar 2 notas e despachar a viagem?", e ao
confirmar as duas viram `loaded` e a viagem é despachada numa transação só; nenhuma nota é liberada.

### P2 — Ocorrência que deixa a nota para trás

**Given** o tipo "Item faltante" (separação) marcado "a viagem segue sem a nota" **And** uma nota
`pending` com ocorrência desse tipo sobre a nota inteira **When** as demais notas são carregadas
**Then** a viagem despacha, a nota com ocorrência é liberada da viagem (`released_at`), e o snapshot
registra o motivo "Ocorrência: Item faltante".

**Given** o mesmo tipo, mas a ocorrência cita só 2 itens da nota **Then** a nota continua contando
como carga: a viagem só sai quando ela for carregada.

### P2 — Sem "Conferir carga"

**Given** uma viagem despachada **Then** nem o cabeçalho do escritório nem o app do motorista
oferecem "Conferir carga"; "Iniciar rota" segue disponível.

## Requisitos funcionais

- **RF1** A conta "carga fechada" considera só notas vivas (`released_at is null`, fora `returned`)
  e trata como resolvida a nota com ocorrência aberta de separação, de tipo "segue sem a nota" e
  escopo de nota inteira. Uma função pura só, usada pelo automático e pelo botão.
- **RF2** Carregar nota (individual e lote, web e WhatsApp) e registrar ocorrência de separação
  tentam o despacho automático depois da escrita, com o ator e o canal dela.
- **RF3** O despacho automático nunca usa `force`. Gate recusado não desfaz a escrita da nota; a
  resposta traz `autoDispatch: { outcome: 'dispatched' } | { outcome: 'blocked', code, details }`
  (ou ausente, quando a carga ainda não fechou).
- **RF4** `POST /trips/:id/dispatch` aceita `loadRemaining: true`: separa e carrega as notas
  `pending`/`separated` (exceto as deixadas para trás pelo RF1) e despacha na mesma transação.
  Continua recusando por gate de roteiro e agendamento.
- **RF5** No despacho (automático, botão ou `force`), a nota deixada para trás por ocorrência é
  liberada com o motivo derivado do tipo, sem exigir `force`.
- **RF6** O catálogo de ocorrências ganha `leavesDocumentBehind` (boolean, padrão `false`), só
  editável para `stage = separation`, devolvido no GET e aceito no PUT com "ausente = não mexe".
- **RF7** `allowed-actions` para de oferecer `confirmLoad`; a rota `confirm-load` segue aceita e
  idempotente.
- **RF8** A tela traduz `TRIP_HAS_UNSCHEDULED_STOPS` (listando as paradas de `details`) e
  `TRIP_HAS_NO_ROUTE` em frases específicas, tanto no automático quanto no botão.
- **RF9** O "Despachar" do escritório troca o diálogo de "forçar com motivo" pela confirmação de
  "leva todas", com a contagem.

## Requisitos não funcionais

- Despacho automático e botão respeitam a ordem de travas da ADR-0068 §2 (notas → viagem) e são
  idempotentes: duas cargas simultâneas da última nota despacham uma vez (`unchanged` na outra).
- Nenhuma escrita de sistema: `actor_user_id` continua not null.
- Migration aditiva com `rollback.sql`.

## Casos extremos e falhas

- Duas pessoas carregam as duas últimas notas ao mesmo tempo → uma despacha, a outra recebe
  `unchanged`; nenhuma falha.
- Viagem que já estava toda carregada antes do deploy não despacha sozinha (não há escrita) — o
  botão resolve.
- Desvincular a última nota pendente deixa a viagem pronta sem despachar — o botão resolve (fora do
  escopo automático).
- Todas as notas deixadas para trás por ocorrência → não há carga; a viagem **não** despacha
  (`TRIP_HAS_NO_ROUTE` após liberar tudo seria enganoso): a conta exige ao menos uma nota `loaded`.
- Ocorrência "segue sem a nota" registrada **depois** que a nota já foi carregada → a nota continua
  carregada e vai; a regra só tira da conta o que não foi carregado.
- Tipo desmarcado depois de a ocorrência existir → vale o tipo no momento do despacho.

## Critérios de aceite

- **CA01** Carregar a última nota (individual) despacha; snapshot `forced=false`; evento com ator e
  canal da carga.
- **CA02** Idem pelo lote e pelo WhatsApp.
- **CA03** Parada sem agendamento: a nota fica `loaded`, a viagem `loading`, `autoDispatch.blocked`
  com `TRIP_HAS_UNSCHEDULED_STOPS` e os `stopIds`.
- **CA04** `loadRemaining` carrega pendentes e separadas e despacha numa transação; falha de gate
  não deixa nenhuma nota alterada.
- **CA05** Ocorrência de nota inteira de tipo "segue sem a nota" libera a nota no despacho, com
  motivo; ocorrência parcial não libera.
- **CA06** Catálogo: GET devolve e PUT grava `leavesDocumentBehind`; ausente no PUT não apaga;
  tipo de entrega recusa `true`.
- **CA07** `allowed-actions` sem `confirmLoad`; `confirm-load` ainda responde 200.
- **CA08** Tela: "Viagem despachada" após carga; frase de bloqueio com a parada; diálogo "leva
  todas"; sem "Conferir carga" no escritório e no app do motorista; caixa do catálogo. Prints.
- **CA09** Carga simultânea da última nota despacha uma vez.

## Dúvidas

Nenhuma aberta — decisões na conversa de 24/09, registradas na ADR-0074.
