# Feature 237 — a carga chega e se separa antes da viagem

> **Estado:** rascunho com **dúvidas abertas** (fim do arquivo). Sem prompt de execução até serem respondidas.
> **Depende de:** 238 (dias úteis). **Alimenta:** 236 (prazo de entrega). Ordem de entrega: 238 → 237 → 236.
> **Número:** 237 conferido contra `origin/staging` e os worktrees em 2026-10-03; reconferir antes de publicar.
> O próximo ADR livre é o **0094** (0093 está tomado em worktree) — a decisão do "eixo do recebimento" vira ADR.

## Problema e resultado

Como a carga de um contratante funciona (palavras do usuário, 2026-10-03):

1. **Antes de chegar**, o contratante manda um **e-mail com uma planilha de prévia**.
2. A mercadoria chega **embrulhada em paletes**; a equipe **desembrulha, organiza por cidade** e depois
   **separa as notas por rota** — é a **primeira separação**.
3. Há **24 horas** (da chegada) para separar e **abrir ocorrência de item avariado**.
4. A partir daí há **3 dias úteis** para entregar (spec 236).
5. **Isso vale para um CNPJ específico.** Outros contratantes terão **outras regras** de início e conferência
   da carga.

O sistema modela a separação **só dentro de uma viagem** (`trip_documents.separation_status`:
`pending → separated → loaded`), **depois** de a nota ter sido vinculada a uma viagem. Antes disso não há
estado, evento de chegada, conferência, prazo de 24 h, nem como abrir ocorrência (a ocorrência de nota exige
`trip_document_id`). Não há prévia nem leitura de planilha (nem biblioteca para isso). O e-mail de entrada
descarta tudo que não traz token de resposta de uma conversa que o sistema abriu. O contratante só tem
período de fechamento, e-mail do relatório e observações. O roteirizador exige `nfe_document_id` real.

O resultado: **o módulo de recebimento** — o contratante tem um **perfil de recebimento** (dado, nunca
código por CNPJ); a prévia chega por e-mail, é lida e as notas são identificadas; a **chegada** é registrada
e abre os relógios; a equipe faz a **primeira separação** (cidade → rota) e abre **avarias** sem precisar de
viagem; e os roteiros são **propostos** a partir das notas da prévia.

## Fora do escopo

- **Viagem do tipo coleta** (buscar de A a B): não existe `kind` de viagem nem spec. Spec própria depois.
- **O prazo e o selo de entrega** (236) e o **calendário** (238).
- **Nota do motorista**, entrega e comprovante: nada muda.
- **Ler texto livre do e-mail** ou interpretar com IA: a prévia é planilha estruturada; o corpo do e-mail
  não decide nada (ADR-0063 §3).
- **Reescrever `separation_status`** (`pending/separated/loaded`) ou o despacho derivado (ADR-0043/0074): a
  primeira separação tem **eixo próprio**, antes da viagem; ao entrar na viagem a nota continua `pending`.
- **Roteirizador:** não muda. A prévia alimenta o pool que ele já usa (ADR-0044 §5: a sugestão nunca cria
  viagem sozinha; só o aceite).
- Contagem física de paletes/volumes contra o XML como bloqueio: só registro (D3), nunca trava a carga.

## Histórias priorizadas

### P1 — A prévia chega e as notas são identificadas

**Given** um contratante com perfil de recebimento e um endereço de entrada da prévia **When** o e-mail com a
planilha chega de um remetente permitido **Then** o sistema grava a prévia (idempotente), lê as linhas,
**identifica cada nota** (casando com `nfe_documents` pela chave) e mostra "N notas esperadas: X já com XML,
Y aguardando XML, Z com erro de leitura".

### P1 — Propor roteiros a partir da prévia

**Given** uma prévia lida **When** o operador pede a proposta **Then** as notas **já casadas** entram no
pool da sugestão multi-veículo existente e a proposta volta como hoje (revisão e aceite); as ainda sem XML
ficam listadas como "esperadas" e entram quando o XML chegar.

### P1 — Registrar a chegada da carga

**Given** a carga do contratante na doca **When** o operador registra a chegada (data/hora, contratante,
paletes opcional, notas da prévia) **Then** começam os relógios: **janela de separação** (24 h no perfil
desse contratante) e, via 236, o prazo de entrega.

### P1 — Primeira separação: por cidade, depois por rota

**Given** uma chegada com notas **When** a equipe organiza por cidade e atribui cada nota a uma rota
(proposta/aceita ou manual) **Then** cada nota passa por `recebida → organizada por cidade → atribuída a
rota`, com ator, canal e hora (append-only, ADR-0067), e a nota entra na viagem já com a rota decidida.

### P2 — Avaria na entrada

**Given** uma nota da chegada, dentro da janela **When** o separador abre "item avariado" (item, quantidade,
foto) **Then** nasce a ocorrência **sem exigir viagem**, aparece na tratativa existente (spec 164) e no
portal do contratante, e a nota pode ser marcada para ficar para trás (`leaves_document_behind`, spec 185).
Passada a janela, a ocorrência de recebimento é recusada com mensagem clara (nunca perde a de campo).

### P2 — Cada contratante com suas regras

**Given** outro contratante **When** o operador cadastra o perfil dele (sem prévia, janela de 48 h, outra
conferência) **Then** o fluxo dele muda **só por dado**, sem código novo e sem CNPJ no `src/`. Contratante
**sem perfil** continua no fluxo de hoje (ausência é ausência, ADR-0048).

## Requisitos funcionais

- **RF1 — Perfil de recebimento por contratante** (`contractor_receiving_profiles`, FK composta
  `(company_id, contractor_id)`, unique): `is_enabled`; `preview_enabled`; `preview_sender_allowlist`
  (e-mails/domínios aceitos); `preview_column_map` (mapeamento de colunas da planilha → campos); `grouping`
  (`city`); `separation_window_hours` (padrão do perfil, 1..168); `delivery_deadline_business_days` (para a
  236; nulo = sem prazo); `requires_damage_check`. Tudo opcional, nulo = "o contratante não definiu".
- **RF2 — Endereço de entrada da prévia sem conversa:** o local-part leva um token por perfil (hash
  guardado, como o das conversas) e o domínio é o de entrada já configurado. O webhook (assinado) e o outbox
  existentes são **reaproveitados**; o worker ganha o ramo "prévia" ao lado do ramo "conversa".
- **RF3 — Postura do e-mail (ADR-0063 §3, `SECURITY.md`):** assinatura do webhook, **DKIM alinhado**,
  remetente na allow-list do perfil, MIME bruto guardado com sha256. E-mail fora disso vira registro
  "recusado" com motivo, sem corpo gravado.
- **RF4 — Leitura da planilha:** XLSX/CSV; tipo conferido pelos **bytes**; tamanho/linhas limitados; nenhuma
  fórmula é avaliada; cada linha validada por Zod (fronteira não confiável); erro por linha, nunca da
  planilha inteira. Biblioteca nova **justificada** (moderna, mantida, compatível com Bun, tipada —
  code-standart §13), em ADR/plan.
- **RF5 — Prévia e itens** (`cargo_previews`, `cargo_preview_items`): idempotente pelo sha256 do anexo;
  item guarda a chave de acesso (ou número/série, [D1]), cidade, destinatário, volumes, peso; estado
  `matched` (há `nfe_documents`), `awaiting_xml`, `invalid`. Quando o XML chega depois, o item vira
  `matched` (o worker de importação já cria a nota; um passo casa pela chave).
- **RF6 — Chegada** (`cargo_arrivals`): `contractor_id`, `arrived_at` (momento informado, corrigido como
  na 234 quando vier de app), `registered_by`, `channel`, `pallet_count` opcional, `separation_due_at`
  derivado do perfil. `cargo_arrival_documents`: nota na chegada com **eixo próprio**
  `expected | received | sorted_by_city | assigned_to_route`, `route_ref`, eventos append-only
  (ator, canal, `occurred_at`/`recorded_at`).
- **RF7 — Proposta de roteiros:** ponte para `POST /route-suggestions/multi-vehicle` com os `documentIds`
  das notas `matched` da prévia/chegada; **sem** mudar o roteirizador nem escrever viagem.
- **RF8 — Avaria sem viagem:** `trip_document_occurrences.trip_document_id` deixa de ser exclusivo: a
  ocorrência passa a poder pertencer a `cargo_arrival_document_id`, com `CHECK` de **exatamente um** dos
  dois (decisão 🧠, migration aditiva e reversível); tipos de ocorrência ganham a etapa `receiving`;
  tratativa (164), anexo/foto (161), item e unidade da nota (166/172) reaproveitados. A rota recusa fora da
  janela (`separation_due_at`) com código estável.
- **RF9 — Telas** no painel: Recebimento (prévias, chegadas, primeira separação por cidade → rota) e a
  **ficha do contratante** (aba "Contratantes" em `/clientes` — a primeira tela de contratante) com o perfil.
  Papel `separator` e permissão `trip.manage` ou nova permissão de recebimento [D5]. pt-BR/en, tabela com
  ordenação/filtros múltiplos (web.md §7), 375/768/1280 px.
- **RF10 — Documentação e ADR:** ADR-0094 (eixo do recebimento antes da viagem; perfil por contratante),
  `docs/spec/domain-model.md`, `docs/ai-context/*`, `CLAUDE.md` das apps.
- **RF11 — Última tarefa:** revisão de design e usabilidade com print (web.md §15).

## Requisitos não funcionais

- **Segurança:** a planilha e o e-mail são entrada hostil; sem PII em log; nada de segredo no perfil; o
  token de entrada rotacionável; `companyId` do contexto, nunca do corpo.
- **Idempotência:** o mesmo e-mail/planilha/chegada nunca duplica; chave de idempotência nas escritas.
- **Fila:** o trabalho pesado (ler planilha, casar notas) fica no worker (RabbitMQ), a API só enfileira
  (outbox).
- **Compatível para trás:** contratante sem perfil, viagem e roteirização funcionam exatamente como hoje.

## Casos extremos e falhas

- Planilha de formato diferente do mapeado: recusa com o motivo por coluna, nada parcial silencioso.
- Nota da prévia cuja chave não bate com nenhum XML por dias: fica `awaiting_xml` e aparece na pendência.
- Chegada registrada **sem prévia**: permitida (perfil com `preview_enabled=false` ou prévia que não veio).
- Nota já em viagem viva quando a prévia chega: `matched` com aviso "já está na viagem X".
- Duas chegadas do mesmo contratante no mesmo dia: duas chegadas independentes, cada uma com seus relógios.
- Janela de 24 h vencida: avaria de recebimento recusada; o separador ainda pode abrir a ocorrência de
  separação da viagem (spec 157/182).
- E-mail reenviado pelo provedor: o unique do outbox segura (idempotente).

## Critérios de aceite

- **CA1** E-mail assinado, DKIM alinhado, remetente permitido, com planilha de 3 notas: a prévia nasce com 3
  itens; reenviar o mesmo e-mail não duplica.
- **CA2** E-mail de remetente fora da allow-list ou sem DKIM: registrado como recusado, sem corpo.
- **CA3** Planilha com 1 linha inválida: 2 itens bons, 1 `invalid` com a coluna nomeada.
- **CA4** Item `awaiting_xml` vira `matched` quando o XML da mesma chave é importado.
- **CA5** Proposta de roteiros usa só as notas `matched` e devolve pelo fluxo existente; nenhuma viagem é
  criada sem o aceite.
- **CA6** Registrar chegada abre `separation_due_at` = `arrived_at` + janela do perfil; avaria dentro da
  janela é aceita sem viagem e aparece na tratativa; fora, 4xx com código estável.
- **CA7** Contratante sem perfil: nenhuma rota nova o afeta (contrato de não-regressão do fluxo atual).
- **CA8** Migration sobe e desce; `db:generate` = `no_changes`; `make migration-test`.
- **CA9** Mutação: permitir remetente fora da lista, pular DKIM, avaliar fórmula, aceitar avaria fora da
  janela, duplicar prévia — cada uma derruba um teste.

## Dúvidas

**[NEEDS CLARIFICATION: D1 — a planilha]** Preciso de **um exemplo real** (anonimizado) e do **CNPJ**.
O desenho assume que a planilha traz a **chave de acesso** (44 dígitos) por nota; se trouxer só número e série
(+ emitente), o casamento é por esses campos, mais frágil. Quais colunas existem (nota, cidade, destinatário,
volumes, peso, endereço)? Chega sempre no mesmo formato?

**[NEEDS CLARIFICATION: D2 — o relógio]** "A partir das 24 da chegada temos 3 dias": o prazo de entrega é
**chegada + 24 h e, depois disso, 3 dias úteis** (ou seja, as 24 h de separação não gastam o prazo)? Ou os 3
dias úteis contam **desde a chegada** e as 24 h correm dentro deles? _Leio a primeira_; confirme.

**[NEEDS CLARIFICATION: D3 — o que a primeira separação registra]** Só **a nota → cidade → rota**, ou também
contagem de **paletes/volumes por cidade** e **conferência contra o XML** (volumes que chegaram vs. nota)?
_Recomendo registrar sem bloquear_: a conferência marca divergência, nunca trava a nota.

**[NEEDS CLARIFICATION: D4 — avaria na entrada]** A nota avariada **segue para a rota** ou **fica no
galpão** até o contratante decidir? _Recomendo seguir a opção do tipo de ocorrência_ (`leaves_document_behind`,
spec 185) por tipo, não por contratante.

**[NEEDS CLARIFICATION: D5 — quem opera]** O papel `separator` (já existente) no painel basta, ou o
recebimento é feito no celular (PWA do separador, como a câmera da spec 055)? _Recomendo painel primeiro_,
mobile numa spec seguinte.

**[NEEDS CLARIFICATION: D6 — endereço de entrada]** O contratante passa a mandar a prévia para um endereço
novo por contratante (`previa-<token>@<domínio de entrada>`), ou vocês **encaminham** o e-mail dele? Se
encaminhado, o remetente permitido é o de vocês e a verificação DKIM do contratante se perde.

**[NEEDS CLARIFICATION: D7 — XML antes ou depois]** Os XMLs chegam (distribuição SEFAZ/upload) **antes** da
prévia ou **depois**? Isso decide quanto das notas já estará `matched` na hora de propor roteiros.
