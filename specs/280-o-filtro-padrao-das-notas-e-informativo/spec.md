# Feature 280 — O filtro padrão das notas e das viagens é informativo

## Problema e resultado

A aba de notas baixa **todas** as notas da empresa (páginas de 100, em laço, até acabar) e só depois filtra no
navegador (`useNfeWorkspace.hook.ts`, `useNfeDocumentTable.hook.ts`). O relatório de viagens (`/trips`) também parte de
tudo. Quanto mais histórico, mais lenta a tela, e a maior parte do que se vê já foi resolvida (CT-e/NFS-e emitidos,
viagem finalizada há mais de um mês).

Resultado: cada tela abre com um **filtro padrão informativo**, aplicado **no servidor**, visível numa pílula, e um botão
**Mostrar tudo** que o retira. Não é filtro escondido: quem vê a lista sabe o que ficou de fora e como trazer.

Origem: investigação de 26/10/2026, em que o painel mostrou 246 notas na faixa 914060–918210 e a planilha tinha 371
(264 existem no banco; 107 nunca chegaram). Filtro invisível confunde contagem; este desenho evita repetir isso.

## Decisões do usuário (2026-10-26)

- Aba de notas: por padrão, só o que **não teve CT-e nem NFS-e emitido**.
- Viagens: por padrão, **não** devolver nota vinculada a viagem **finalizada há mais de um mês**.
- O padrão é **informativo** e o botão **Mostrar tudo** traz tudo.

## Decisões por delegação

- **No servidor, não só na tela.** Esconder no cliente depois de baixar tudo não acelera nada.
- **Busca direta ignora o padrão.** Número, faixa de número e chave de acesso procuram em tudo; nota antiga não "some"
  quando alguém a procura.
- **Pílula visível e removível** na mesma linha das pílulas de filtro (spec 258 já as tem), com texto fixo do padrão.
- **"Mostrar tudo" vale para a sessão**, e a escolha vive na URL como os demais filtros; o padrão volta ao reabrir a tela.
- **Um mês = 30 dias corridos** a partir da finalização da viagem (`finished_at`), em UTC.

## Fora do escopo

Mudar o que "emitido" significa; paginar a aba de notas no servidor além do padrão (a spec 258 deixou isso fora e
segue fora); importar as 107 notas que faltam (é distribuição/XML, não tela).

## Histórias priorizadas

### P1 — A aba de notas abre só com o pendente

**Given** a empresa tem 10 000 notas e 9 000 já têm CT-e ou NFS-e emitido **When** o operador abre a aba de notas
**Then** o servidor devolve só as ~1 000 pendentes e a pílula "Pendentes (sem CT-e e sem NFS-e)" aparece.

### P1 — Mostrar tudo

**Given** a pílula do padrão ativa **When** o operador aciona **Mostrar tudo** **Then** a pílula some, a lista passa a
trazer todas as notas e o contador reflete o total.

### P1 — Busca direta não perde nota antiga

**Given** uma nota com CT-e emitido **When** o operador filtra pela faixa de número ou cola a chave de acesso
**Then** a nota aparece, sem precisar acionar **Mostrar tudo**.

### P2 — Relatório de viagens sem o que já passou

**Given** viagens finalizadas há mais de 30 dias **When** o operador abre `/trips` **Then** elas e suas notas ficam de
fora, com a pílula "Sem viagens finalizadas há mais de 30 dias", e **Mostrar tudo** as traz.

## Requisitos funcionais

- **RF1** `GET` das notas aceita o parâmetro `scope=pending|all` (padrão `pending`); a API aplica "sem CT-e e sem NFS-e
  emitidos" por consulta, reusando a definição de "emitido" que o filtro `cteIssued` já usa (spec 258).
- **RF2** Com `accessKey`, `numberFrom` ou `numberTo` na consulta, o escopo é `all`, mesmo sem o parâmetro.
- **RF3** O relatório de viagens aceita `finishedWithinDays` (padrão 30, `0`/ausente em "Mostrar tudo"); viagem não
  finalizada nunca é cortada.
- **RF4** A pílula do padrão usa o mecanismo de pílulas existente, é removível e reflete na URL, em `Exportar relatório`
  e em `canhotos` (a exportação leva o mesmo escopo que a tela mostra).
- **RF5** Frontend deixa de baixar páginas que o servidor não devolve; a seleção em lote e a contagem respeitam o escopo.

## Requisitos não funcionais

- Ordem e cursor da listagem não mudam (`updated_at, issued_at, id`).
- Índice para o corte de pendentes e para `finished_at`, medido com `EXPLAIN` em staging antes de ir a produção.
- Sem `sql.raw` com valor do cliente.

## Casos extremos e falhas

- Nota com CT-e **cancelado**: conta como não emitida (volta a pendente) — usar a mesma regra de vínculo ativo da 258.
- Viagem finalizada exatamente há 30 dias: fica (corte é "mais de 30").
- `scope` inválido → 400.

## Critérios de aceite

- Contrato da API: `scope` padrão, `all`, busca direta ignorando o padrão, cursor estável com o padrão.
- Contrato do frontend: pílula aparece, some em **Mostrar tudo**, volta ao reabrir.
- Medição em staging: tempo de abertura da aba de notas antes e depois (evidence.md).

## Dúvidas

- [NEEDS CLARIFICATION: "NFS-e emitida" para o padrão da aba de notas conta só NFS-e autorizada, ou também pendente de autorização?]
- [NEEDS CLARIFICATION: nota sem viagem, mas com CT-e emitido, é escondida pelo padrão das notas? (assumido: sim)]
- [NEEDS CLARIFICATION: o corte de 30 dias vale também para o filtro de situação da entrega do relatório?]
