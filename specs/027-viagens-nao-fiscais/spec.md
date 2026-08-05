# Feature 027 — Viagens não fiscais

## Problema e resultado

Hoje a única representação de "viagem" no sistema é `mdfe_manifests` (ADR-0016 §5), que só nasce
depois que toda a carga já tem CT-e autorizado (`mdfe_manifest_items` referencia
`cte_fiscal_documents`). Isso impede duas coisas que o negócio precisa:

1. Planejar/organizar uma viagem (veículo, condutor(es), notas de frete) **antes** de todo CT-e da
   carga estar emitido.
2. Ter viagens que **nunca** vão precisar de MDF-e.

Resultado esperado: o operador cria uma viagem a qualquer momento — veículo, condutor(es), notas
vinculadas — com ou sem CT-e emitido. Só quando decide formalizar o MDF-e daquela viagem o sistema
exige que as notas vinculadas já tenham CT-e autorizado, oferecendo um modal para emitir os CT-es
pendentes antes de prosseguir. Esta spec depende do ADR-0023 (emenda ao ADR-0016 §5), que
desacopla `trips` de `mdfe_manifests`.

## Fora do escopo

- Regra de negócio no **domínio/backend** impedindo emissão de MDF-e sem CT-e de todas as notas da
  viagem — decisão do usuário (ver Dúvidas): o gate fica só na tela (modal). O domínio do
  manifesto continua recusando item sem CT-e autorizado, individualmente, como já faz hoje
  (ADR-0016 §6) — isso não muda.
- App de campo (`trip_events`, papel `driver`, upload de foto/canhoto) — ADR-0016 §5 previa isso
  em cima do manifesto; o ADR-0023 realinha a âncora futura para `trip_id`, mas esta feature não
  constrói o app nem a tabela `trip_events`.
- Edição de CT-e/NF-e/MDF-e já emitidos.
- Reboque/carreta, modais não-rodoviários, MDF-e de contingência — seguem fora, como em 013.
- Múltiplas viagens simultâneas por veículo (um veículo em duas viagens abertas ao mesmo tempo) —
  ver Dúvidas.

## Histórias priorizadas

### P1 — Criar viagem sem exigência fiscal

**Given** um veículo ativo e ao menos um condutor ativo cadastrados na frota, **When** o operador
cria uma viagem informando veículo e condutor(es), **Then** a viagem é criada em estado aberto, sem
exigir nenhuma nota, CT-e ou MDF-e vinculado.

### P2 — Vincular notas de frete à viagem, com ou sem CT-e

**Given** uma viagem aberta, **When** o operador vincula uma nota que ainda não tem CT-e emitido,
**Then** o vínculo é aceito e a viagem passa a listar a nota como pendente de CT-e.

### P3 — Emitir MDF-e a partir de uma viagem

**Given** uma viagem com todas as notas vinculadas já com CT-e autorizado, **When** o operador
aciona "emitir MDF-e" na viagem, **Then** o sistema cria o manifesto (`mdfe_manifests.trip_id`
apontando pra essa viagem, herdando veículo e condutores) e segue o fluxo de emissão já existente
(ADR-0016 §9).

### P4 — Bloquear emissão de MDF-e com nota pendente de CT-e

**Given** uma viagem com ao menos uma nota vinculada sem CT-e autorizado, **When** o operador
aciona "emitir MDF-e", **Then** a tela abre um modal listando as notas pendentes e oferecendo emitir
o(s) CT-e(s) faltante(s) antes de prosseguir, sem chamar a rota de criação do manifesto.

### P5 — Encerrar viagem não fiscal

**Given** uma viagem aberta sem manifesto, **When** o operador marca a viagem como concluída,
**Then** a viagem fecha sem nunca ter passado por MDF-e, e fica consultável no histórico.

## Requisitos funcionais

- Criar viagem: `company_id`, `vehicle_id`, condutor(es) (mínimo 1, mesma validação de
  disponibilidade/atividade que `resolveManifestCrew` já aplica ao manifesto).
- Vincular/desvincular nota de frete à viagem, independente de status fiscal da nota.
- Listar viagens por status, veículo, condutor, período.
- Emitir MDF-e a partir de uma viagem existente, reaproveitando veículo/condutores já cadastrados
  nela (sem redigitar).
- Encerrar viagem sem MDF-e.
- Tela de emissão de MDF-e a partir da viagem verifica, no frontend, que todas as notas vinculadas
  têm CT-e autorizado; se não, abre modal de emissão de CT-e pendente em vez de prosseguir.

## Requisitos não funcionais

- `company_id` sempre do contexto autenticado (nunca do payload), com teste de isolamento de tenant
  (`test/*-schema/tenant-safety.contract.ts`), igual a todo módulo novo do repositório.
- Migration aditiva com backfill: toda viagem retroativa a manifesto já existente é criada a partir
  dele (ver ADR-0023 §5), sem perda de dado, com rollback documentado ao lado da migration.

## Casos extremos e falhas

- Viagem sem nenhuma nota vinculada tenta emitir MDF-e — mesma regra de manifesto vazio que já
  existe hoje (`MdfePayloadEmptySelectionError`), só que disparada a partir da viagem.
- Nota vinculada a uma viagem é cancelada/rejeitada depois do vínculo — **não bloqueia nada**: o
  vínculo permanece (mesmo se a nota já estava `delivered_at`), a viagem segue seu fluxo normal
  (inclusive emissão de MDF-e, se as demais notas estiverem com CT-e autorizado) e a tela só exibe
  um aviso não bloqueante sobre aquela nota. Sem coluna de status nova em `trip_documents` — o aviso
  é derivado em tempo de leitura a partir do status atual do `nfe_documents`/`cte_fiscal_documents`
  vinculado (ver Dúvidas e `plan.md`).
- Veículo ou condutor da viagem fica inativo depois da viagem criada, antes de emitir o MDF-e —
  reaproveita a mesma validação de disponibilidade que `resolveManifestCrew`/`resolveManifestVehicle`
  já fazem na criação do manifesto.
- Chamada direta à API de criação de manifesto (fora da tela), pulando o modal — o manifesto ainda
  é validado item a item pelo domínio; o que falta é o agrupamento "todas as notas da viagem", que é
  só conveniência de tela (risco aceito, ver ADR-0023 §3).

## Critérios de aceite

- Viagem pode ser criada, ter notas vinculadas/desvinculadas e ser encerrada sem nunca gerar CT-e
  ou MDF-e.
- Emitir MDF-e a partir de uma viagem com todas as notas já com CT-e autorizado produz o mesmo
  resultado que o fluxo atual de criação direta do manifesto.
- Emitir MDF-e a partir de uma viagem com nota pendente de CT-e abre o modal e **não** chama a rota
  de criação do manifesto.
- Todo manifesto (novo e migrado) tem `trip_id` preenchido.
- Teste de isolamento de tenant cobrindo `trips`, `trip_drivers` e a nova tabela de vínculo de
  notas.

## Dúvidas

Decisões já tomadas com o usuário (não são mais `NEEDS CLARIFICATION`):

- **Entidade da nota vinculada**: `trip_documents` referencia `nfe_documents` **e**
  `freight_calculations` (união) — a viagem pode vincular tanto a nota crua quanto o frete já
  calculado sobre ela.
- **Cardinalidade nota↔viagem**: N:1 — uma nota só pertence a uma viagem "viva" por vez. Regra de
  negócio confirmada pelo usuário: entrega pode não acontecer no dia planejado (troca de
  motorista, remarcação); enquanto a nota **não foi marcada como entregue** naquela viagem, ela
  pode ser desvinculada e vinculada a outra viagem. **Uma vez marcada como entregue, a nota fica
  travada na viagem — nunca migra para outra.** Isso exige um status de entrega por vínculo
  (`trip_documents`), não só um flag de liberação — ver `plan.md`.
- **Estados de `trips.status`**: `open`/`closed`, simples — a viagem não fala com a SEFAZ, então
  não precisa espelhar o ciclo do manifesto.
- **Permissão**: `fleet.manage` — sem papel novo por enquanto.

- **Veículo em mais de uma viagem**: sem exclusividade rígida — dependente do status da viagem
  atual, mesmo mecanismo do vínculo de nota. Um veículo só fica preso a uma viagem enquanto ela
  está aberta e não marcada como concluída/entregue; se a viagem trava (não entregue no dia,
  remarcação), o veículo pode ser reatribuído a outra viagem, igual à nota. Sem unique de
  exclusividade no schema — mesmo comportamento que o manifesto já tem hoje (só valida
  `fleet_vehicles.status === 'active'`, não impede reuso).
- **Nota cancelada/rejeitada (NF-e/CT-e) depois de vinculada à viagem**: não bloqueia e não
  desvincula automaticamente — o domínio (`trip.use-case.ts`) não tem regra nenhuma para esse caso,
  ele só reage se o operador decidir desvincular manualmente (permitido enquanto `delivered_at is
  null`, como já é a regra geral). O aviso na tela é puramente de leitura: ao listar as notas da
  viagem, o backend/frontend consulta o status atual do documento fiscal vinculado
  (`nfe_documents.status` / `cte_fiscal_documents.status`) e sinaliza como aviso não bloqueante se
  estiver `cancelled`/`rejected` — sem persistir esse status em `trip_documents`. **Isso vale
  igualmente para nota já marcada como entregue** (`delivered_at` preenchido) — nenhum tratamento
  especial: ela continua travada na viagem (regra de "entregue nunca migra", inalterada), só ganha
  o mesmo aviso.

Ainda em aberto:

- Risco aceito explicitamente pelo usuário: o gate "CT-e de todas as notas antes do MDF-e" existe
  só no frontend (Opção 1 escolhida sobre a alternativa de gate no domínio) — registrado aqui para
  rastreabilidade, não é um `NEEDS CLARIFICATION` porque já foi decidido.
