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

- **Intake fiscal / Workspace NF-e** (a aba de notas): o padrão é o filtro que já existe, **notas sem documentos
  vinculados** (`unlinkedOnly`: sem CT-e e sem NFS-e). Fica só nessa página, bem separado das demais.
- **Busca de viagens, criação de viagem e roteiro automático**: o padrão esconde a nota **emitida há mais de 30 dias
  que já foi de viagem concluída**. Fica a nota com menos de 30 dias **ou** que nunca foi de viagem concluída.
- O padrão é **informativo** e o botão **Mostrar tudo** traz tudo.

## Decisões por delegação

- **No servidor, não só na tela.** Esconder no cliente depois de baixar tudo não acelera nada.
- **Busca direta ignora o padrão.** Número, faixa de número e chave de acesso procuram em tudo; nota antiga não "some"
  quando alguém a procura.
- **Pílula visível e removível** na linha das pílulas de filtro (spec 258), com texto fixo do padrão.
- **"Mostrar tudo" vale para a sessão** e vive na URL como os demais filtros; o padrão volta ao reabrir a tela.
- **Um mês = 30 dias corridos** a partir da **emissão** da nota (`issued_at`) e da **finalização** da viagem, em UTC.
  [NEEDS CLARIFICATION: os 30 dias contam da emissão da nota, como entendi, ou da conclusão da viagem?]

## Fora do escopo

Mudar o que "emitido" significa; paginar a aba de notas no servidor além do padrão (a spec 258 deixou isso fora e segue fora); importar as 107 notas que faltam (é distribuição/XML, não tela).

## Histórias priorizadas

### P1 — A aba de notas abre só com o pendente

**Given** a empresa tem 10 000 notas e 9 000 já têm documento vinculado **When** o operador abre o Intake fiscal
**Then** o servidor devolve só as ~1 000 sem vínculo e a pílula "Sem documentos vinculados" aparece.

### P1 — Mostrar tudo

**Given** a pílula do padrão ativa **When** o operador aciona **Mostrar tudo** **Then** a pílula some, a lista passa a
trazer todas as notas e o contador reflete o total.

### P1 — Busca direta não perde nota antiga

**Given** uma nota com CT-e emitido **When** o operador filtra pela faixa de número ou cola a chave de acesso
**Then** a nota aparece, sem precisar acionar **Mostrar tudo**.

### P1 — Viagens, criação de viagem e roteiro automático

**Given** notas emitidas há mais de 30 dias que já foram de viagem concluída **When** o operador busca notas nessas três
telas **Then** elas ficam de fora, com a pílula "Sem notas antigas de viagens concluídas", e **Mostrar tudo** as traz.

## Requisitos funcionais

- **RF1** O Intake fiscal abre com `unlinkedOnly` ligado como padrão, **no servidor** (`scope=unlinked|all` em
  `GET /nfe-documents`), reusando a definição de "vinculado" que a aba já usa.
- **RF2** Com `accessKey`, `numberFrom` ou `numberTo` na consulta, o escopo é `all`, mesmo sem o parâmetro.
- **RF3** Busca de viagens, criação de viagem e roteiro automático aplicam o padrão "emitida há ≤ 30 dias **ou** sem
  viagem concluída" no servidor; viagem não concluída nunca corta a nota.
- **RF4** A pílula do padrão usa o mecanismo de pílulas existente, é removível e reflete na URL e em `Exportar
relatório`/`canhotos` (a exportação leva o mesmo escopo da tela).
- **RF5** O frontend deixa de baixar páginas que o servidor não devolve; seleção em lote e contagem respeitam o escopo.

## Requisitos não funcionais

- Ordem e cursor da listagem não mudam (`updated_at, issued_at, id`).
- Índice para o corte de pendentes e para `finished_at`, medido com `EXPLAIN` em staging antes de ir a produção.
- Sem `sql.raw` com valor do cliente.

## Casos extremos e falhas

- Nota com CT-e **cancelado**: conta como sem vínculo — usar a mesma regra de vínculo ativo da 258.
- Nota emitida exatamente há 30 dias: fica (corte é "mais de 30").
- `scope` inválido → 400.

## Critérios de aceite

- Contrato da API: `scope` padrão, `all`, busca direta ignorando o padrão, cursor estável com o padrão.
- Contrato do frontend: pílula aparece, some em **Mostrar tudo**, volta ao reabrir.
- Medição em staging: tempo de abertura da aba de notas antes e depois (evidence.md).

## Dúvidas

- [NEEDS CLARIFICATION: nota sem viagem, mas com CT-e emitido, aparece no padrão das telas de viagem? (assumido: sim, só o Intake fiscal esconde por vínculo)]
- [NEEDS CLARIFICATION: "viagem concluída" = status finalizada, ou também cancelada?]
