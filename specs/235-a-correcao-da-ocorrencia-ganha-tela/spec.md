# Feature 235 — A correção da ocorrência ganha tela

## Problema e resultado

A spec 167 construiu a correção e o cancelamento da ocorrência registrada inteiros **e ninguém
consegue usar**. O servidor tem os dois casos de uso (`correct-occurrence-items.use-case.ts`,
`cancel-occurrence.use-case.ts`), o repositório escritor
(`drizzle-occurrence-correction.repository.ts`), a tabela `trip_document_occurrence_corrections`
com as três colunas de cancelamento, as duas rotas com `trip.manage`, `Idempotency-Key` e limite
de taxa, e até os tipos `corrections` e `cancellation` já declarados no painel
(`trip.types.ts:195`). O que não existe é **um único botão**: o cliente HTTP do painel não conhece
as rotas e não há uma string de "corrigir ocorrência" nas traduções.

O efeito é o defeito que a 167 descreveu, intacto: quem marcou o item errado registra uma segunda
ocorrência para consertar a primeira, e duas ocorrências contando a mesma avaria mandam dois
e-mails ao contratante, aparecem duas vezes na nota e somam duas vezes na cobrança da 164.

Ao fim: no detalhe da ocorrência existem **Corrigir** e **Cancelar**, o histórico de correções
aparece com autor e hora, e a ocorrência cancelada se mostra cancelada, com motivo, em vez de
sumir ou de continuar contando.

Esta spec é **a tela, mais a leitura que faltava**. Nenhuma regra de negócio é reaberta: elas
foram decididas na 167 e estão implementadas nas escritas. A Fase 0 provou que as leituras
(detalhe, feed, lista da nota) não publicam `corrections` nem `cancellation`. Por decisão de
2026-10-02, a 235 inclui essa leitura na API, sem migration, sem rota e sem regra nova (RF9).

## Fora do escopo

- **Qualquer mudança de regra.** Correção é fato novo com histórico; a janela fecha quando a
  tratativa abre; cancelada fica visível e fora das contas. São decisões da 167 e ficam como estão.
- **Corrigir a foto e corrigir o tipo.** A 167 as deixou de fora de propósito, e continuam fora.
- **A ocorrência de parada** (`trip_stop_occurrences`). As rotas da 167 são da ocorrência de nota.
- **O app do motorista.** Correção é trabalho de escritório, `trip.manage`.
- **Reenviar o e-mail ao contratante depois da correção.** Continua a dúvida aberta da 167, e
  responder por conta própria aqui seria decidir negócio dentro de uma spec de tela.
- **Criar o tipo "Prorrogação" no catálogo.** O template do SAC o traz e o catálogo
  (`occurrence-type-catalog.constant.ts`) só tem "segunda via do boleto". Cadastro de tipo é da
  234/208, não desta tela.
- Tudo o que pertence à spec 234 — momentos, exigências por campo, aba Tipos, exceção por CNPJ.

## Histórias priorizadas

### P1 — O operador conserta o que foi marcado errado

**Given** uma ocorrência registrada, sem tratativa aberta, e eu tenho `trip.manage`
**When** clico em **Corrigir**
**Then** o formulário reabre com o conjunto atual de produtos, quantidades e unidades
**And** ao salvar, o novo conjunto passa a valer e a ocorrência mostra que foi corrigida.

### P2 — A janela fechada se explica antes do clique

**Given** a ocorrência já tem tratativa aberta, ou já está cancelada
**When** olho o detalhe
**Then** **Corrigir** e **Cancelar** aparecem desabilitados, com o motivo em texto — não some o
botão e não espera o `409` para contar.

### P3 — Quem audita vê o que era antes

**Given** uma ocorrência corrigida duas vezes
**When** abro o histórico
**Then** vejo cada correção com autor, data e o conjunto que passou a valer naquele momento.

### P4 — Cancelar pede motivo

**Given** uma ocorrência que não deveria existir
**When** clico em **Cancelar** e escrevo o motivo
**Then** o botão de confirmar só habilita com motivo preenchido
**And** depois disso a ocorrência aparece marcada como cancelada, com o motivo e quem cancelou,
em toda lista onde ela já aparecia.

## Requisitos funcionais

- **RF1** O cliente HTTP do painel ganha as duas chamadas:
  `PATCH /trips/:tripId/documents/:documentId/occurrences/:occurrenceId/items` e
  `POST .../occurrences/:occurrenceId/cancellation`, ambas com `Idempotency-Key`, como a API exige.
- **RF2** O corpo da correção é `{ items: [{ code, quantity?, unit? }] }` e **substitui o conjunto
  inteiro** — não é edição item a item. O formulário reabre preenchido e manda tudo.
- **RF3** O cancelamento manda `{ reason }`. Motivo vazio não sai da tela; o `400` da API é a
  segunda linha de defesa, não a primeira.
- **RF4** Os dois botões só aparecem para quem tem `trip.manage`, e ficam desabilitados com motivo
  à vista quando a ocorrência tem tratativa aberta ou já está cancelada.
- **RF5** O histórico de correções (`corrections[]`) aparece no detalhe: autor, data e o conjunto
  que passou a valer. Não vinha na leitura (Fase 0); passa a vir pela RF9.
- **RF10** **Nem toda ocorrência tem itens.** O template de ocorrências do SAC traz devolução
  parcial (com itens e foto), devolução total e **prorrogação de boleto**, que não toca a
  entrega. **Corrigir** existe quando a ocorrência tem itens gravados **ou** quando o **tipo**
  da ocorrência é de um tipo que carrega itens (decisão de 2026-10-03: "pode ser por itens
  também"); some só em tipo sem itens **e** sem itens gravados (prorrogação, segunda via do
  boleto), onde fica só **Cancelar**. O texto do motivo desabilitado distingue os estados da
  tratativa que a 164 já tem (aberta, decidida, fechada, cancelada) em vez de um genérico
  "tratativa aberta": a tratativa se resolve de mais de um jeito (`redelivery_authorized`,
  `goods_paid`, `other`) e cada um dispara a sua devolutiva ao caso.
- **RF9** As leituras da API publicam o que a 167 grava: detalhe e lista da nota devolvem
  `corrections` e `cancellation`; o feed devolve `cancellation`. Mesmo formato da resposta das
  escritas, lido em lote, e a cancelada continua listada, marcada. Inclui as duas linhas do tempo (decisão de 2026-10-02): o
  item de ocorrência da linha do tempo da viagem e o evento `occurrence.cancelled` da ocorrência.
- **RF6** A ocorrência cancelada é marcada como tal onde quer que apareça — detalhe, lista do feed
  e linha do tempo da nota —, com o motivo acessível, nunca escondida.
- **RF7** Os erros da API viram mensagem em português por código estável, nunca texto cru:
  `409` de tratativa aberta, `409` de já cancelada, `422` de teto de item e `400` de quantidade
  inválida. A tela não inventa código: usa `getApiErrorCode()`.
- **RF8** Depois de corrigir ou cancelar, as consultas afetadas são invalidadas — detalhe, feed e
  linha do tempo —, para a tela não mostrar o estado velho ao lado do novo.

## Decisões de 2026-10-03 (revisão final)

- **Nota inteira é permitida na correção.** O formulário aceita a lista vazia: "sem itens" é a
  ocorrência sobre a nota inteira (como a que nasce do WhatsApp), e salvar assim é uma correção
  válida. O histórico diz "a nota inteira" quando o conjunto vigente vem vazio. Corrigir
  **continua disponível** depois (uma ocorrência corrigida é, por isso, uma ocorrência que já
  passou por Corrigir).
- **Critério de Corrigir (RF10) por itens ou tipo.** O sinal de tipo que o detalhe e o feed
  publicam hoje é só `stage` e `typeName`; a coluna `allows_multiple_items` diz "um ou vários",
  não "carrega itens", e o registro mostra o seletor de produtos para todo tipo de nota. Não há,
  portanto, sinal confiável de "tipo que carrega itens" sem campo novo na API — ver T6.4.
- **O relógio `openUntil` fecha no cancelamento.** `occurrence.cancelled` passa a fechar o
  relógio da linha do tempo da ocorrência (só leitura, T6.5); antes a cancelada seguia "em
  andamento" indefinidamente.

## Requisitos não funcionais

- Os controles são os da aplicação: `Dialog` para o cancelamento, `Select`/`SearchableSelect` no
  formulário de itens, botões do design system. Nada desenhado à parte.
- Acessibilidade: diálogo com foco preso e devolvido ao fechar, motivo com rótulo associado, e os
  botões desabilitados com a razão lida por leitor de tela, não só pela cor.
- `companyId` continua vindo do contexto autenticado. Nada de id de empresa no payload.
- Nenhum CNPJ, nome ou motivo de cancelamento em log do navegador.

## Casos extremos e falhas

- **Tratativa abre entre carregar a tela e clicar** — o `409` chega e vira mensagem clara, com a
  tela recarregando o estado. Desabilitar no cliente não substitui a conferência do servidor.
- **Dois operadores corrigindo a mesma ocorrência** — a `Idempotency-Key` é por tentativa, não por
  ocorrência: a segunda gravação é uma correção nova, e o histórico mostra as duas. É o desenho da
  167, não um defeito a consertar aqui.
- **Correção que não muda nada** — a política da 167 (`occurrence-correction.policy.ts`) decide o
  que conta como mudança; a tela não duplica essa conta.
- **Ocorrência cancelada em lista filtrada por ativas** — some da contagem, continua achável.

## Critérios de aceite

- **CA01** Com `trip.manage`, corrigir o conjunto de itens pela tela grava e o detalhe mostra a
  correção com autor e hora — provado por contrato no painel com a resposta da API dublada.
- **CA02** Sem `trip.manage`, os dois botões não existem na árvore.
- **CA03** Com tratativa aberta, os botões aparecem desabilitados **com motivo em texto**, e o
  contrato prova o texto, não só o atributo.
- **CA04** O diálogo de cancelamento não confirma com motivo vazio nem só com espaços.
- **CA05** Cada um dos quatro códigos de erro vira a sua mensagem; nenhum cai no texto genérico —
  provado caso a caso.
- **CA06** Depois de cancelar, a ocorrência aparece marcada em detalhe, feed e linha do tempo, e
  sai da contagem de ativas.
- **CA07** Revisão de design e usabilidade com print nas três larguras, incluindo o diálogo aberto
  e o estado desabilitado com motivo.

## Dúvidas

Nenhuma bloqueante. Fica registrada, herdada da 167 e **fora do escopo**: se a correção deve
reenviar o e-mail ao contratante. Enquanto não houver decisão, o comportamento é o de hoje — não
reenvia.
