# ADR-0023: Viagem é entidade própria — emenda ao §5 do ADR-0016

## Contexto

O ADR-0016 decidiu, no §5 ("O manifesto é a viagem"), que `mdfe_manifests` seria o próprio
agregado de viagem: `vehicle_id`, condutor principal, UF de início e fim já nascem na tabela, e o
plano era um futuro app de campo pendurar `trip_events` em `manifest_id`.

Essa decisão pressupõe que toda viagem nasce como manifesto — e todo manifesto só nasce depois que
as NF-e da carga já viraram CT-e autorizado (`mdfe_manifest_items` referencia
`cte_fiscal_documents`, ADR-0016 §6). Na prática operacional real do negócio existem viagens que
precisam ser organizadas — veículo, condutor(es), notas de frete vinculadas — **antes** de todo
CT-e da carga estar emitido, ou que **nunca** vão precisar de MDF-e. Hoje não existe onde
representar isso: sem CT-e emitido não existe `cte_fiscal_documents`, e sem isso não existe linha
possível em `mdfe_manifest_items`, logo não existe viagem.

Duas opções foram avaliadas:

- **B — manter o manifesto como viagem**: não resolve o problema. O manifesto continuaria nascendo
  só depois do CT-e; não haveria onde planejar a viagem antes disso, nem como ter uma viagem sem
  nunca emitir MDF-e.
- **A — desacoplar viagem do manifesto**: `trips` vira uma entidade própria, com seu próprio ciclo
  de vida, e `mdfe_manifests` passa a **referenciar** uma viagem em vez de **ser** uma, só quando o
  operador decide formalizar o MDF-e daquela viagem.

Optou-se por A.

## Decisão

### 1. `trips` é a nova viagem; `mdfe_manifests` deixa de ser o agregado raiz

Nasce `trips` (`company_id`, `vehicle_id`, status, timestamps) e `trip_drivers` (mesmo desenho de
`mdfe_manifest_drivers`: `driver_id` + `position`, mínimo 1 condutor). `mdfe_manifests` ganha
`trip_id` — toda viagem pode existir sem manifesto, mas todo manifesto pertence a exatamente uma
viagem.

Isso supersede a frase central do §5 do ADR-0016 ("esse é deliberadamente o mesmo agregado que o
app de campo vai chamar de viagem — `mdfe_manifests`"): o agregado que o futuro app de campo vai
chamar de viagem passa a ser `trips`, não `mdfe_manifests`. `trip_events` (ainda não construído)
referenciará `trip_id`, não `manifest_id` — o resto do §5 (append-only, `driver_id` + tipo +
payload + `occurred_at`/`recorded_at`, foto via `stored_objects`) continua válido, só troca a FK de
ancoragem.

O restante do ADR-0016 (§1–4, §6–10) não muda: motorista continua cadastro operacional
independente de usuário, veículo continua cadastro com papel, o vínculo N:1 do manifesto com CT-e
continua por documento fiscal, e o ciclo emitir/encerrar/cancelar do MDF-e continua intacto — só
passa a operar sobre um manifesto que referencia uma viagem, em vez de ser a viagem.

### 2. Vínculo de notas à viagem é anterior e mais amplo que o do manifesto ao CT-e

`mdfe_manifest_items` só aceita CT-e já autorizado — isso não muda, é a regra fiscal do
MDF-e. A viagem precisa aceitar a nota **antes** disso. `trips` referencia as notas/fretes
vinculados por uma tabela própria, independente de existir CT-e.

`[NEEDS CLARIFICATION: a que entidade a viagem se vincula — nfe_documents, freight_calculations, ou
ambas? Uma nota pode estar em mais de uma viagem aberta ao mesmo tempo, ou é N:1 como o CT-e no
manifesto?]`

### 3. Formalizar o MDF-e é uma ação sobre a viagem, não uma criação independente

O operador aciona "emitir MDF-e" a partir de uma viagem. O sistema resolve `mdfe_manifests` com
`trip_id` apontando pra ela, herdando veículo e condutores já cadastrados na viagem (evita
redigitar). A regra "todas as notas da viagem já têm CT-e autorizado" é responsabilidade do
**frontend** (gate na tela/modal) — decisão explícita do usuário, não do domínio da API.

Isso é uma exceção deliberada ao padrão do repositório de validar regra de negócio no backend: a
API continua recusando um manifesto com documento sem CT-e autorizado (isso já existe e não muda,
ADR-0016 §6) — o que fica só no frontend é a conveniência de agrupar/checar **todas as notas da
viagem de uma vez** e abrir o fluxo de emissão de CT-e pendente antes de deixar o operador tentar.
Uma chamada direta à API sem passar pela tela pula esse agrupamento, mas não consegue produzir um
manifesto inválido — cada item ainda é validado individualmente na criação do manifesto.

### 4. Viagem sem manifesto é um estado terminal válido

Viagem "não fiscal" fecha (`status = closed`) sem nunca ter `mdfe_manifests.trip_id` apontando pra
ela. Isso não é um estado de erro nem pendência — é o caso de uso que motivou esta emenda.

`[NEEDS CLARIFICATION: quais são os estados de `trips.status`e as transições entre eles —
paralelo a`mdfe_manifests` (`draft/issuing/authorized/...`) ou mais simples (`open/closed`), já
que a viagem em si não fala com a SEFAZ?]`

### 5. Migração dos manifestos existentes

Todo `mdfe_manifests` já existente representa uma viagem que já aconteceu. A migration cria uma
linha em `trips` para cada manifesto existente (mesmo `vehicle_id`, mesmos condutores de
`mdfe_manifest_drivers`) e preenche `mdfe_manifests.trip_id` antes de tornar a coluna `not null` —
expansão-contração (`~/.claude/rules/rules/backend/database.md`), sem perda de dado, com rollback
documentado ao lado da migration.

## Consequências

- `trips` e `trip_drivers` entram no fechamento transitivo de schemas que o worker copia
  (`Dockerfile`, comentário sobre `src/database`) apenas se o worker vier a consumir viagem — hoje
  o worker só processa manifesto, então a princípio não muda.
- Todo lugar do código/API/frontend que hoje trata `mdfe_manifests` como "a viagem" (telas, nomes
  de variável, `tripStartedAt` em `mdfe_manifests`) precisa ser revisto na spec 027 para decidir o
  que migra para `trips` e o que é campo genuinamente do manifesto (ex.: `tripStartedAt` vs.
  SEFAZ).
- `specs/013-fleet-and-mdfe/spec.md` ("Fora do escopo": `trip_events`/rotas de viagem adiadas para
  o app de campo) e o próprio ADR-0016 §5 precisam de nota de emenda apontando pra este ADR.
- Custo de mudança em `mdfe_manifests` continua alto (ADR-0016 já registrava isso) — esta emenda
  não reduz nem aumenta esse custo, só move a raiz do agregado.

## Alternativas consideradas

- **Derivar a viagem automaticamente do primeiro CT-e vinculado**, sem tela de criação explícita:
  rejeitada pelo mesmo motivo do ADR-0016 (Alternativa 3) — a viagem física (veículo saiu com
  carga) começa antes de qualquer CT-e existir, então derivar de CT-e sempre chegaria tarde demais
  para o caso de uso de planejamento pré-fiscal.
- **Campo `manifest_id` nullable direto em uma tabela de "pré-viagem"**, sem entidade própria:
  rejeitada — não dá pra saber que veículo/condutor/notas pertencem à mesma viagem física sem uma
  tabela dedicada, e o app de campo futuro (ADR-0016 §5) precisa de uma âncora estável que não
  desapareça se o manifesto for descartado (ADR-0017).
