# Feature 167 — Corrigir e cancelar a ocorrência já registrada

## Problema e resultado

A ocorrência nasce imutável e **não há saída**: não existe rota de alteração nem de remoção, só o
anexo de foto (até cinco). Quem marcou o item errado, esqueceu um item ou digitou a quantidade
errada não tem o que fazer — registra uma segunda ocorrência para consertar a primeira, e duas
ocorrências contando a mesma avaria é pior que uma corrigível: o embarcador recebe dois e-mails, a
lista da nota mostra dois fatos, e a cobrança da spec 164 soma dois.

Imutabilidade não é capricho: a ocorrência dispara e-mail ao contratante, entra na trilha de
auditoria e vira dinheiro na tratativa. O que falta não é poder editar — é poder **corrigir sem
apagar o que foi dito antes**.

Resultado: a ocorrência aceita correção do conjunto de itens e quantidades, guardando o que era e o
que passou a ser; e aceita cancelamento com motivo, ficando visível e fora das contas. Nada some.

## Fora do escopo

- Corrigir a **foto**. Ela já tem caminho próprio (anexar até cinco) e o expurgo é da spec 161.
- Corrigir o **tipo** da ocorrência. Tipo errado é outra ocorrência: muda o e-mail, a política de
  reentrega e a tratativa inteira.
- Reabrir tratativa fechada. É a máquina de estados da spec 164, e ela decide sozinha.
- Reenviar o e-mail ao embarcador depois da correção. Decisão de negócio própria — ver Dúvidas.

## Decisões tomadas (22/09)

1. **Correção com histórico**, não edição no lugar. A ocorrência segue imutável; a correção é um
   fato novo que registra o conjunto que passa a valer.
2. **A janela fecha quando a tratativa abre.** Existindo linha em `trip_occurrence_cases` para
   aquela ocorrência, o número já está valendo dinheiro e não muda por trás da cobrança.
3. **Cancelar com motivo**, nunca apagar. A ocorrência cancelada continua visível, com autor e
   motivo, e sai das contas.

## Histórias priorizadas

### P1 — O separador conserta o que marcou errado

**Given** uma ocorrência registrada sem tratativa aberta
**When** o separador corrige os itens e as quantidades
**Then** o novo conjunto passa a valer, e a ocorrência mostra que foi corrigida, por quem e quando.

### P2 — Quem audita vê o que era antes

**Given** uma ocorrência corrigida
**When** alguém abre o histórico dela
**Then** vê o conjunto anterior e o novo, lado a lado, com autor e hora de cada correção.

### P3 — O registro feito por engano sai das contas sem sumir

**Given** uma ocorrência registrada por engano
**When** alguém com permissão a cancela e escreve o motivo
**Then** ela aparece cancelada na lista, com o motivo, e não entra em contagem, e-mail ou cobrança.

### P4 — A cobrança não muda por trás

**Given** uma ocorrência com tratativa aberta
**When** alguém tenta corrigir ou cancelar
**Then** a resposta é `409`, dizendo que a tratativa já abriu.

## Requisitos funcionais

- **RF1** Tabela nova `trip_document_occurrence_corrections`: quem corrigiu, quando, e o conjunto
  **anterior** de itens (código, quantidade, unidade) em JSONB. O conjunto atual continua nas
  tabelas de hoje — a correção guarda o passado, não duplica o presente.
- **RF2** `PATCH /trips/:id/documents/:documentId/occurrences/:occurrenceId/items` substitui o
  conjunto inteiro de itens. Substituição, nunca `add`/`remove` item a item: o cliente manda o que
  passa a valer, e o servidor guarda o que era.
- **RF3** A correção respeita as mesmas regras do registro: quantidade > 0, par quantidade/unidade
  casado, item pertencente à nota, e o teto de um item quando o tipo não aceita vários (spec 166).
- **RF4** Correção com tratativa aberta é `409 OCCURRENCE_CASE_ALREADY_OPEN`.
- **RF5** Correção que não muda nada é `200` sem gravar correção — registrar "corrigiu para o mesmo"
  sujaria a auditoria com ruído.
- **RF6** `POST .../occurrences/:occurrenceId/cancellation` cancela com `reason` obrigatório (texto
  não vazio, teto de 500). Cancelar duas vezes é `409`.
- **RF7** Ocorrência cancelada não entra em contagem, listagem de ativas, e-mail nem tratativa. Ela
  aparece na lista da nota, marcada, com motivo e autor.
- **RF8** Cancelamento com tratativa aberta é `409`, pela mesma razão da RF4.
- **RF9** A leitura da ocorrência publica `corrections[]` e `cancellation`, ambos opcionais — a
  ordem de publicação da spec 166 vale aqui igual: **frontend tolerante primeiro**.
- **RF10** Corrigir e cancelar exigem `trip.manage`, a mesma permissão de registrar.
- **RF11** A linha do tempo da viagem (spec 158) ganha os dois eventos.
- **RF12** A tela: botão de corrigir que reabre o formulário com o conjunto atual, e botão de
  cancelar que pede o motivo. Os dois só aparecem quando a ação é possível — botão inerte é pior que
  botão ausente.
- **RF13** Textos em pt-BR; en onde a seção já existir.

## Requisitos não funcionais

- Migration aditiva. Nenhuma coluna existente muda de tipo ou de obrigatoriedade.
- `companyId` do contexto autenticado; a ocorrência de outra empresa é `404`, nunca `403`.
- Correção e cancelamento são idempotentes por `Idempotency-Key`, como o registro.
- Motivo do cancelamento **não** é PII, mas também não vai para log.

## Casos extremos e falhas

- **Correção esvaziando a lista de itens**: permitido — é "a nota inteira", que já é um estado
  legítimo hoje (lista vazia).
- **Duas correções concorrentes**: a segunda grava por cima e guarda o conjunto que encontrou. A
  unicidade é por ocorrência + timestamp, e as duas ficam no histórico.
- **Cancelar ocorrência já cancelada**: `409`, não `204` silencioso.
- **Corrigir ocorrência cancelada**: `409`. Cancelada é fim de linha; o caminho é registrar outra.
- **Ocorrência antiga, anterior a esta spec**: corrigível normalmente — ela só não tem histórico
  anterior a mostrar.
- **Bundle antigo**: continua funcionando, porque `corrections` e `cancellation` são chaves novas e
  a tolerância vai antes.

## Critérios de aceite

- **CA01** Migration aplica e reverte em Postgres descartável.
- **CA02** Correção grava o conjunto anterior e passa a valer o novo.
- **CA03** Correção sem mudança real não grava histórico e responde `200`.
- **CA04** Correção violando quantidade, par ou item da nota é `400`.
- **CA05** Correção com dois itens em tipo de item único é `422`.
- **CA06** Correção e cancelamento com tratativa aberta são `409`.
- **CA07** Cancelamento sem motivo é `400`; cancelar duas vezes é `409`.
- **CA08** Ocorrência cancelada sai da contagem e da listagem de ativas, e continua visível marcada.
- **CA09** A leitura publica `corrections[]` e `cancellation`.
- **CA10** O validador do frontend aceita a resposta com e sem os dois campos.
- **CA11** A linha do tempo mostra correção e cancelamento, com autor e hora.
- **CA12** Os botões não aparecem quando a tratativa já abriu.

## Dúvidas

- `[NEEDS CLARIFICATION: depois de uma correção, o e-mail ao embarcador é reenviado, é enviado um
aviso de correção, ou nada sai?]` — bloqueia só a parte de e-mail; o resto da spec anda sem isso.
