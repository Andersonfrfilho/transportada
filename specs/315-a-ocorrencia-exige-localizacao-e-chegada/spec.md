# Feature 315 — A ocorrência exige localização e horário de chegada

## Problema e resultado

Em 10/11/2026 o Anderson decidiu o que cada ocorrência de parada precisa trazer. Quatro tipos precisam de **prova de onde o
motorista estava** e de **quando ele chegou**: "Local fechado", "Espera longa", "Endereço incorreto" e (só localização, opcional)
"Cobrança inesperada". Hoje nada disso é cobrável:

1. **Localização é sempre opcional.** O corpo do registro aceita `location` nulo (ADR-0045 §3.1: GPS desligado é caso normal),
   e o tipo não tem como dizer "esta ocorrência só vale com ponto".
2. **O horário de chegada não existe na ocorrência.** A chegada é o toque em "Cheguei" (`trip_stops.arrived_at`). Quem esquece o
   toque registra "Espera longa" sem que o sistema saiba desde quando esperou, e o contratante recebe um aviso sem hora.
3. **O servidor não cobra foto nem observação na ocorrência de parada.** A spec 246 deixou isso de fora de propósito (D-d: o caso
   de uso da parada não lê `attachment_mode`). A decisão de "foto obrigatória" para "Local fechado" e "Espera longa" só vale se
   o servidor a cobrar, então esta spec **revoga a D-d para o momento `stop`** (foto e observação; assinatura, produtos e valor
   seguem fora).

Resultado: o tipo ganha dois campos, `location_mode` e `arrival_time_mode` (`off` | `optional` | `required`), editáveis na aba
**Tipos** de `/ocorrencias`. O servidor recusa o registro que não os traz, e o app do motorista pede os dois na tela de registro.
Quando o horário de chegada é pedido e o motorista **não marcou "Cheguei"**, o horário informado também **grava a chegada** da
parada.

## Fora do escopo

- **WhatsApp.** O grupo não coleta foto nem localização da ocorrência hoje. Ver § WhatsApp: o que falta.
- **Exceção por contratante/destinatário** para os dois campos novos. Os modos moram só no tipo (a exceção da 246 herda campo a
  campo e não ganha coluna aqui; entra em spec própria se a operação pedir).
- **Valor declarado e número do documento na ocorrência de parada** (a "Cobrança inesperada" pediu valor obrigatório). Esse
  campo é da 247 e só existe no registro por nota; levá-lo à parada é outra decisão, listada em Dúvidas.
- **Assinatura e produtos na ocorrência de parada.**
- **Distância mínima/precisão mínima da localização.** Distância nunca é porteiro (ADR-0057 §3); o servidor cobra a **presença**
  do ponto, não a qualidade.
- **Configurar os tipos em staging** (quais tipos recebem `required`). É o script da thread "Listar tipos de ocorrência a validar
  em staging", que roda **depois** desta spec estar em staging.

## Decisões

- **D1 — Nomes e vocabulário.** `company_occurrence_types.location_mode` e `.arrival_time_mode`, `varchar(16) NOT NULL DEFAULT
'off'`, CHECK em `off | optional | required` (o mesmo `DELIVERY_PROOF_FIELD_MODES`). Aplicar a migration **não muda o
  comportamento de nenhum tipo**.
- **D2 — Onde vale.** Os dois modos são lidos no registro de momento `stop` (`POST /me/trips/current/stops/:stopId/occurrences`
  e a rota equivalente do escritório, que não manda ponto e por isso é **isenta da localização**, mas não da hora). O registro
  por nota (`document`) passa a cobrar só `location_mode` (o corpo já tem `location`); `arrival_time_mode` é ignorado nele.
  `separation` não muda.
- **D3 — "Localização obrigatória" é presença do ponto.** `location` ausente ou nulo → `422 TRIP_OCCURRENCE_LOCATION_REQUIRED`.
  Não há limite de precisão nem de distância ao endereço.
- **D4 — "Horário de chegada obrigatório" só vale sem chegada marcada.** O servidor lê `trip_stops.arrived_at` **dentro da
  transação** do registro: se já existe, o horário informado é descartado sem erro (o toque venceu; é a corrida normal da fila
  offline) e a resposta diz `arrivalRecorded: false`. Se não existe e o modo é `required`, falta de `arrivedAt` →
  `422 TRIP_OCCURRENCE_ARRIVAL_TIME_REQUIRED`. Com o modo `optional`, `arrivedAt` presente grava a chegada do mesmo jeito;
  ausente, não grava nada.
- **D5 — O horário informado grava a chegada pelo caminho que já existe.** `arrivedAt` vira o `occurredAt` do evento
  `arrived`, e a hora do registro vai em `recordedAt` (mesma semântica da chegada informada pelo escritório, spec 156 A1). Passa
  por `performSequencedStopArrival`, então **a ordem da parada (spec 294) vale**: parada fora da ordem responde
  `409 TRIP_STOP_OUT_OF_ORDER` e o app repete com `confirmOutOfOrder`. Canal e autoria seguem os da ocorrência (`driver_app`).
- **D6 — Validação do horário.** `arrivedAt` é `ISO-8601` com fuso; recusado com `422 TRIP_OCCURRENCE_ARRIVAL_TIME_INVALID`
  quando é **futuro** (com a tolerância de relógio da 234), **mais velho que `OCCURRENCE_ARRIVAL_MAX_AGE_HOURS` (24 h)** ou
  **anterior à saída da viagem** (`dispatched_at`). Sem localização do evento de chegada: a chegada herda o `location` da
  ocorrência quando houver (é o mesmo ponto, mesmo dia).
- **D7 — Foto e observação na parada (revoga a D-d da 246 só para `stop`).** O registro de momento `stop` passa a conferir
  `attachment_mode` (+ `photo_minimum_count`) e `note_mode` com o mesmo guarda de `assertDriverOccurrenceRequirements`,
  recusando com os erros que já existem (`TRIP_OCCURRENCE_ATTACHMENT_REQUIRED`, `…_PHOTO_MINIMUM_NOT_MET`,
  `…_NOTE_REQUIRED`). A foto da parada pode chegar **depois** pela fila (spec 209 RF3): o servidor cobra a **referência**
  (`attachmentObjectId` presente) no registro, como o registro por nota faz. Tipo de parada hoje com `attachment_mode =
'required'` (cadastro antigo) passa a ser cobrado — **T1 mede em staging quantos tipos ativos mudam de comportamento antes de
  qualquer deploy**.
- **D8 — Um resolvedor só.** `resolveOccurrenceRequirements` ganha `locationMode` e `arrivalTimeMode` e continua sendo a fonte
  nas três apps (API, painel, app do motorista). O snapshot do motorista entrega os dois modos já resolvidos; o app não reimplementa
  regra (contrato de tabela espelhada, skill `contrato-de-paridade`).
- **D9 — Publicação em etapas (ADR-0081 §9).** Painel tolerante (lê os campos novos, ignora ausência) → API (migration, cobrança
  e snapshot) → app do motorista (tela). Como o default é `off`, **nenhum tipo passa a exigir antes do app novo estar no
  aparelho**: o script de configuração da staging é o último passo, e a `main` só recebe depois de o app estar publicado.

- **D10 — Espera mínima depois do "Cheguei" (pedido do Anderson, 10/11/2026).** O tipo ganha
  `min_wait_after_arrival_minutes` (`smallint NULL`, 1..1440; nulo = sem espera mínima; "Espera longa" recebe 30 pela
  configuração). O servidor só aceita o registro depois de `arrived_at + N minutos`, lido na transação; antes disso responde
  `422 TRIP_OCCURRENCE_MIN_WAIT_NOT_REACHED` com `availableAt` (ISO). **Sem chegada marcada o tipo fica bloqueado** — e aqui o
  horário informado (D4) **não** destrava: a espera conta do toque, ou do horário informado que a ocorrência anterior da parada
  tenha gravado, nunca de uma hora digitada na própria ocorrência. Por isso `min_wait_after_arrival_minutes` não nulo
  **dispensa** o `arrival_time_mode` do mesmo tipo (CHECK: `min_wait_after_arrival_minutes is null or arrival_time_mode =
'off'`). O app mostra o contador regressivo no tipo bloqueado ("Disponível às 14:50 · faltam 12 min"), calculado com o
  relógio do servidor (`serverNow` do snapshot, não o do aparelho). O WhatsApp passa a ser bloqueado pelo mesmo servidor; a
  mensagem do bot é trabalho separado (§ WhatsApp).

  **O escritório não tem a trava** (pedido do Anderson, 10/11/2026): pelo painel ou pelo WhatsApp, o escritório registra o
  tipo a qualquer momento, em nome do motorista. Se a parada não tem chegada, o escritório **informa o horário exato em que o
  motorista chegou** (obrigatório, mesmas janelas de D6) e esse horário grava a chegada (D5, canal `office`, `recordedAt` do
  servidor); se já tem, o horário é descartado como em D4. Vale para qualquer tipo com `min_wait_after_arrival_minutes`, mesmo
  com `arrival_time_mode = 'off'`.

## Histórias priorizadas

### P1 — O operador declara a exigência no tipo

**Given** a aba Tipos de `/ocorrencias` **When** o operador abre o tipo "Local fechado" **Then** vê, ao lado de Foto, Observação
e Assinatura, os seletores **Localização** e **Horário de chegada** (Desligado / Opcional / Obrigatório), com o texto de ajuda
"Pedido só quando o motorista não marcou Cheguei" no segundo, e o que ele salva volta igual na leitura.

### P1 — O motorista não registra sem localização

**Given** um tipo com localização obrigatória **When** o motorista abre o registro **Then** o app mostra "Localização" como campo
a preencher (capturada / obter localização / como ligar o GPS) e o botão de registrar só libera com o ponto capturado; se o app
antigo mandar sem ponto, o servidor responde `422 TRIP_OCCURRENCE_LOCATION_REQUIRED`.

### P1 — Quem esqueceu o "Cheguei" informa o horário

**Given** uma parada sem chegada marcada e um tipo com horário de chegada obrigatório **When** o motorista registra a ocorrência
informando `14:20` **Then** a ocorrência e a chegada da parada (14:20, gravada agora) nascem na mesma transação, e a parada passa
a "chegou". **Given** a parada já marcada como chegada **Then** o app nem mostra o campo, e o servidor descarta o horário se ele vier.

### P1 — "Espera longa" só abre 30 minutos depois do "Cheguei"

**Given** o tipo com espera mínima de 30 min **When** o motorista ainda não marcou "Cheguei", ou marcou há 12 min **Then** o tipo
aparece bloqueado com o contador (ou "marque Cheguei primeiro"), e o servidor responde `422
TRIP_OCCURRENCE_MIN_WAIT_NOT_REACHED` se o registro chegar assim mesmo.

### P2 — O servidor cobra foto e observação na parada

**Given** "Local fechado" com foto obrigatória **When** o registro chega sem `attachmentObjectId` **Then** `422
TRIP_OCCURRENCE_ATTACHMENT_REQUIRED`; com a foto e sem a observação obrigatória, `…_NOTE_REQUIRED`.

### P2 — O escritório registra em nome do motorista

**Given** um tipo com os dois modos obrigatórios **When** o escritório registra em nome do motorista **Then** a localização não é
cobrada (o escritório não tem ponto de toque), o horário de chegada é cobrado quando a parada não tem chegada, e a trilha de
auditoria registra a hora informada.

## Requisitos funcionais

- **RF1** Migration aditiva `location_mode`, `arrival_time_mode` (D1), com rollback; tipos existentes ficam `off`.
- **RF2** `PUT/GET /company-settings/occurrence-types` aceitam e devolvem os dois campos; ausente no `PUT` mantém o valor atual
  (cliente antigo não zera).
- **RF3** O registro de parada cobra D3–D7 e responde os códigos acima; o corpo é `.strict()` e `arrivedAt` entra no schema
  (campo extra continua `400`).
- **RF4** A resposta do registro de parada devolve `arrivalRecorded: boolean`.
- **RF5** O snapshot do motorista e a lista de tipos de campo trazem `locationMode` e `arrivalTimeMode` resolvidos, e `stopArrived`
  por parada já existe no snapshot (ou ganha — T0 confirma) para o app decidir se pede o horário.
- **RF6** O painel edita os modos na aba Tipos com os componentes padrão do design system (rótulo em cima, seletor de três
  estados igual ao de Observação), sem estilo próprio.
- **RF7** O app do motorista mostra os campos Localização e Horário de chegada na tela de registro, bloqueia o envio até o que
  é obrigatório estar pronto, e manda `location` e `arrivedAt` no corpo.
- **RF9** Coluna `min_wait_after_arrival_minutes` (D10): migration junto da T2, escrita/leitura no tipo, snapshot com `serverNow`
  e `availableAt` por tipo e parada, bloqueio no servidor e contador no app.
- **RF8** A mensagem de erro de cada código é uma frase em português no catálogo de erros da API e no `locale.json` do app.

## Requisitos não funcionais

- **RNF1** `arrivedAt` e `location` nunca vêm de URL nem de log (dado pessoal; `security.md` §3).
- **RNF2** Idempotência: o registro e a chegada dele compartilham a chave de idempotência do registro; reenviar a mesma chave
  devolve o mesmo resultado sem segunda chegada.
- **RNF3** Teste de contrato **antes** do código, em cada app (CLAUDE.md, "regras que não se negociam").
- **RNF4** Tela nova ou alterada: prints em tema claro e escuro, desktop e celular, comparados com outra tela do painel/app
  antes do PR (regra de padrão visual do projeto).

## Casos extremos e falhas

- **Fila offline com a chegada tocada depois.** O motorista registra a ocorrência com horário e, sincronizando, o toque de
  "Cheguei" já está lá: vale o toque (D4), `arrivalRecorded: false`, nada falha.
- **GPS negado.** O app explica como ligar e não envia; nunca enfileira um registro sem ponto para um tipo que o exige (o servidor
  o recusaria para sempre na sincronização).
- **Hora no dia anterior (virada de dia).** O app monta `arrivedAt` com a data de hoje; se resultar em futuro, assume ontem só
  quando o horário informado é até 6 h maior que a hora atual; do contrário mostra erro de horário. [Regra testada em T6.]
- **Parada fora da ordem.** `409 TRIP_STOP_OUT_OF_ORDER` do registro: o app mostra o mesmo diálogo de confirmação da 294 e
  repete com `confirmOutOfOrder`.
- **Tipo `optional` com horário informado e parada já chegada.** Descartado sem erro.
- **Tipo desativado entre a abertura da tela e o envio.** Como hoje: `404`/tipo inalcançável.

## § WhatsApp: o que falta (fora desta spec)

O grupo registra ocorrência pelo caminho por nota (`whatsapp-occurrence-draft-checklist.policy.ts`) e não coleta foto de
ocorrência de parada nem localização. Com D2, o tipo que exige localização **já é recusado pelo servidor** se o bot tentar
registrá-lo (sem ponto). O que falta para o bot cumprir: (1) ler `locationMessage` do Evolution e tratá-la como o ponto;
(2) perguntar "que horas você chegou?" quando o horário é obrigatório e a parada não tem chegada; (3) até lá, o bot deve
responder "este tipo precisa ser registrado pelo app" em vez de tentar. O item (3) entra como T9 (agora obrigatório, pelo bloqueio da espera mínima): o bot traduz os 422 de localização, horário e
espera mínima, dizendo quando o tipo abre.

## Critérios de aceite

- **CA01** Migration + rollback passam em `make migration-test`; tipos existentes com `off`.
- **CA02** Contratos da API cobrem: localização ausente (422), horário ausente com e sem chegada marcada, horário futuro/antigo/
  anterior à saída, corrida com o toque, ordem da parada, foto/observação da parada, escritório sem localização, idempotência.
- **CA03** O contrato espelhado de `resolveOccurrenceRequirements` passa nas três apps com os dois campos.
- **CA04** Prints do painel e do app (claro/escuro, desktop/celular) em `prints/`, lado a lado com tela de referência.
- **CA05** Em staging, "Local fechado" configurado pelo script sibling recusa sem ponto e grava a chegada com o horário.

## Pedidos do mesmo dia que ficam em spec separada

Anotados aqui para não se perderem; nenhum deles bloqueia a 315.

- **Cobrança no recebimento com duas fotos distintas** (placa da cobrança e comprovante de pagamento). A 315/D7 já cobra o
  mínimo de fotos do tipo (`photo_minimum_count = 2`), mas **não distingue qual é qual**: é preciso foto com papel/rótulo
  (`placa`, `comprovante`) por tipo. Spec própria.
- **Cobrança vai para a página de cobranças extras/acertos** (confirmado pelo negócio), com viagem, ocorrência, nota e cliente,
  e marca o cliente como possível cobrança na entrega. Ligar a ocorrência de parada a essa página (hoje só a sugestão de
  cobrança por nota, spec 060 D4c) é spec própria. **Nenhum tipo vai direto à Spani.**
- **Módulo de vendedores da contratante** ("Endereço incorreto" vai ao vendedor): chat com canais (WhatsApp e e-mail) e área
  dos vendedores; um vendedor pode estar ligado a mais de uma contratante e atender vários clientes em cada. É outra
  funcionalidade, inspirada nos chats existentes; spec própria. A 315 só entrega o tipo com localização, observação e horário.
- **Mensagem do bot de WhatsApp para tipo bloqueado** ("só abre às 14:50"): depende de D10 estar no servidor; é a T9, agora com
  escopo fixo e não mais opcional.

## Dúvidas

- **[NEEDS CLARIFICATION: valor declarado na parada]** "Cobrança inesperada" pediu valor declarado obrigatório e número do
  documento opcional. O registro de parada não tem esses campos (a 247 é por nota), e `trip_stop_occurrences` não tem coluna
  de valor. Opções: (a) spec própria que leve `declared_amount` à parada; (b) a cobrança segue como hoje (sugestão de cobrança
  do escritório, spec 060 D4c). Esta spec **não** depende da resposta.
- **[NEEDS CLARIFICATION: tipo "Endereço incorreto"]** Não existe no cadastro. Usa `stop_kind = 'other'` (os cinco valores são
  fixos e uma coluna nova de kind é migration destrutiva de CHECK). O e-mail ao contratante para atualizar o endereço é o
  modelo do tipo (spec 271) e pertence à thread de configuração. Confirmar com o Anderson se `other` serve.
