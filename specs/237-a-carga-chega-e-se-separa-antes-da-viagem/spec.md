# Feature 237 — a carga chega e se separa antes da viagem

> **Estado:** a planilha real foi analisada (`planilha-fr.md`) e a maioria das dúvidas foi respondida pelo
> usuário em 2026-10-03; **restam D4 (avaria) e D6 (como o e-mail chega)**. As Fases 1–2 não dependem
> delas. Sem prompt de execução até D4 e D6 serem respondidas.
> **Depende de:** 238 (dias úteis). **Alimenta:** 236 (prazo de entrega). Ordem de entrega: 238 → 237 → 236.
> **Número:** 237 conferido contra `origin/staging` e os worktrees em 2026-10-03; reconferir antes de publicar.
> O próximo ADR livre é o **0094** (0093 está tomado em worktree) — a decisão do "eixo do recebimento" vira ADR.

## Problema e resultado

Como a carga de um contratante funciona (palavras do usuário, 2026-10-03):

1. **Antes de chegar**, o contratante manda um **e-mail com uma planilha de prévia** (`.xlsm`, uma por dia
   de roteiro; exemplos analisados: `FR-28-09`, `FR-01-10`, `FR-05-10`).
2. A mercadoria chega **embrulhada em paletes**; a equipe **desembrulha, organiza por cidade** e depois
   **separa as notas por rota** — é a **primeira separação**.
3. Há **24 horas** (da chegada) para separar e **abrir ocorrência de item avariado**.
4. São **3 dias úteis desde a chegada** para entregar (spec 236); as 24 h de separação correm dentro deles.
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
- **Contagem de paletes/volumes e conferência contra o XML:** fora da primeira versão (decisão do usuário:
  a separação é **por nota e por grupos de mesma rota e cidade**). Pode voltar em spec própria, nunca como
  bloqueio da carga.

## Histórias priorizadas

### P1 — A prévia chega, é lida e as notas são vinculadas

**Given** um contratante com perfil de recebimento **When** o e-mail com a planilha **é recebido** (o app o
lê sozinho, sem ninguém abrir nem baixar) **Then** o sistema grava a prévia (idempotente), lê as linhas,
**vincula cada nota** a `nfe_documents` e mostra "N notas: X já com XML e conferidas, Y aguardando XML, Z
divergentes, W com erro de leitura". O **momento do recebimento do e-mail** é gravado e comparado com o do XML
(quem chegou antes, e quanto).

### P1 — Recomendar as viagens a partir da prévia

**Given** uma prévia lida **When** o operador pede a recomendação **Then** o sistema mostra **duas visões
lado a lado**: (a) os **grupos do próprio contratante** (a planilha já traz o roteiro `RouteName`, ex.
`FR.S.CAR`, com cidade e peso) como **rascunho de viagem**, e (b) a **proposta do roteirizador** existente
sobre as notas já vinculadas (peso, volume, janela, veículos). O operador revisa e aceita pelo fluxo atual;
nada vira viagem sem o aceite (ADR-0044 §5). As notas ainda sem XML aparecem como "esperadas".

### P1 — Registrar a chegada da carga

**Given** a carga do contratante na doca **When** o operador registra a chegada (data/hora, contratante,
paletes opcional, notas da prévia) **Then** começam os relógios: **janela de separação** (24 h no perfil
desse contratante) e, via 236, o prazo de entrega.

### P1 — Primeira separação, no celular: por nota, agrupada por rota e cidade

**Given** uma chegada com notas **When** o separador, **no celular**, vai separando a mercadoria **por nota,
agrupada por rota e por cidade** (a separação costuma ser por cidade, por ser mais prática) **Then** cada
grupo (rota × cidade) mostra o que falta separar, e cada nota passa por `esperada → recebida → separada` com
ator, canal e hora (append-only, ADR-0067). A nota entra na viagem já com a rota decidida.

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
- **RF4 — Leitura da planilha:** XLSX/XLSM/CSV (as de exemplo são `.xlsm`, com macro de VBA: **a macro nunca
  é executada nem lida**, só o conteúdo OOXML); tipo conferido pelos **bytes**; tamanho, linhas e
  descompressão limitados (a aba `IMPORTAÇÃO` reserva ~13,8 mil linhas e usa 107–194: ler só até a última
  linha com dado); **valores em cache**, nenhuma fórmula é avaliada; a aba `RESULTADO` (tabela dinâmica com
  `#NAME?`) é **ignorada**; linhas só com `RouteName` + `RoutingDate` são cabeçalho de rota e não nota; cada
  linha validada por Zod (fronteira não confiável); erro por linha, nunca da planilha inteira. Biblioteca nova
  **justificada** (moderna, mantida, compatível com Bun, tipada — code-standart §13), em ADR/plan.
- **RF5 — Prévia e itens** (`cargo_previews`, `cargo_preview_items`): idempotente pelo sha256 do anexo;
  `received_at` = momento do e-mail. **A planilha não traz o número da NF-e, nem chave de acesso, série ou
  CNPJ do emitente.** `Text001` é o **identificador do próprio contratante** (provável pedido/ordem dele) e
  fica guardado como `contractor_reference`; as demais colunas são `Company`/`CompanyName` (código e razão
  social do destinatário), `PESO TOTAL` (kg), `VOLUME(M3)`, `VALOR`, `ENDEREÇO`, `Comment16` (bairro),
  `City`, `State`, `PostalCode` e `RouteName`/`RoutingDate`. O vínculo com a nota é **por conteúdo**
  (RF5a), nunca por número de nota. Estados do item: `matched`, `awaiting_xml`, `ambiguous`, `suggested`,
  `invalid`.
- **RF5a — Como cada linha vira uma nota** (`cargo-preview-matching.policy.ts`, função pura). Medido em XMLs
  reais (`planilha-fr.md`): **o XML não traz `Text001` nem o código do cliente**, e **a planilha não traz
  `NroCarga`** (só `RouteName`). O vínculo desce em **três níveis**, dentro do universo de **um contratante**
  (notas do emitente do perfil, ainda não vinculadas, importadas depois do recebimento do e-mail):
  1. **Roteiro ↔ carga (grupo).** `RouteName` (planilha) ↔ `NroCarga` (XML, em `infCpl`, lido pelo padrão do
     perfil). Medido: **1:1**, e a soma de **valor e peso por roteiro é igual, ao centavo, à da carga** em
     8 de 10 roteiros (24/09) e 7 de 8 (28/09); a diferença é XML faltando. O par nasce pelo **melhor encaixe
     de totais** (valor, peso, nº de notas) e é confirmado pelos vínculos de nota abaixo; `NroCarga` é novo a
     cada dia e `RouteName` se repete, então o par vale **por prévia**, nunca para sempre.
  2. **Cliente dentro do grupo.** Destinatário por `Company` (código aprendido) ou CEP/razão social
     aproximada (só reforço: o nome bate em 83%).
  3. **Linhas → notas, por soma.** **Uma NF pode juntar vários pedidos** (`Text001`) do mesmo cliente (medido:
     clientes com 2 ou 3 linhas, p.ex. 2.664,00 + 1.243,56 → uma nota; e 20 linhas para 16 notas com o
     mesmo valor total): resolve-se, por cliente, a partição das linhas em notas cujo **valor** e **peso**
     fecham — valor exato ao centavo; peso com diferença de até 5 g por arredondamento da planilha
     (`PESO TOTAL` com 2 casas × `pesoB` com 3), coberta por um piso de 0,01 kg — que cresce 0,005 kg por
     linha somada (revisão da Fase 4a); o percentual do perfil vale acima dele. É soma de subconjuntos
     sobre ≤ 3 linhas.
  4. **Veredito por linha:** partição única que fecha valor **e** peso → `matched` (guarda `n` linhas ↔ 1
     nota); mais de uma partição possível → `ambiguous` (as candidatas, para o operador escolher); nenhuma
     nota → `awaiting_xml`; fecha só o valor → `suggested` (só vale depois de o operador confirmar).
     Valor e peso sem par roteiro ↔ carga pelos totais e sem CEP, razão social ou alias também são
     `suggested` (revisão da Fase 4a, ADR-0094 §4).
  5. **Matching 1:1 por nota:** uma nota nunca fica em dois grupos de linhas.
  6. **Taxa medida (XMLs parciais, 2 dias):** por linha isolada, valor + CEP achou uma nota em 74–90% e valor
     - peso em 78–85%; **agrupando por cliente a soma fecha em ~92–100% dos clientes** dos roteiros testados
       (13/14, 22/24, 23/25, 10/10). As que sobram são XMLs ainda não importados.
  7. **Aprendizado:** cada vínculo confirmado guarda `Company` ↔ CNPJ do destinatário
     (`contractor_recipient_aliases`: **1:1, 212 códigos, 0 conflitos**).
  8. **Assíncrono:** o vínculo **nasce quando o XML é importado**, porque a prévia chega 2,7 a 4,2 h **antes**
     da emissão. O passo do worker de importação reavalia, a cada XML, os itens `awaiting_xml` do contratante;
     a tela mostra "esperando o XML" por item e a hora do vínculo.
  9. **Sem chave não há certeza:** `matched` é "vínculo conferido", nunca "garantido"; o operador
     **desvincula e vincula à mão**, e toda ação fica na trilha (ator, canal, hora).
- **RF5b — A prévia é a chegada** (decisão do usuário, 2026-10-03): **1 prévia = 1 chegada**. Ao ler a
  prévia, o sistema **propõe a chegada** (contratante, data planejada, roteiros e notas esperadas) e o operador
  só **confirma a hora em que o caminhão chegou**. O `LACRE` das notas (3 lacres para 18 cargas nos XMLs) fica
  como **informação de apoio** na chegada, não como chave.
- **RF6 — Chegada** (`cargo_arrivals`): `contractor_id`, `arrived_at` (momento informado, corrigido como
  na 234 quando vier de app), `registered_by`, `channel`, `pallet_count` opcional, `separation_due_at`
  derivado do perfil. `cargo_arrival_documents`: nota na chegada com **eixo próprio**
  `expected | received | separated`, o **grupo** (`route_name` do contratante e `city_ibge_code`), eventos
  append-only (ator, canal, `occurred_at`/`recorded_at`). A "organização por cidade" é o **agrupamento**, não
  um estado a mais.
- **RF7 — Recomendação de viagens:** (a) **grupos do contratante**: cada `RouteName` vira um rascunho de
  viagem com cidades, quantidade de notas, peso e volume totais, e a data planejada (a do nome do arquivo);
  (b) **proposta do roteirizador**: ponte para `POST /route-suggestions/multi-vehicle` com os `documentIds`
  das notas `matched`; **sem** mudar o roteirizador nem escrever viagem; o aceite é o do fluxo atual.
- **RF8 — Avaria sem viagem:** `trip_document_occurrences.trip_document_id` deixa de ser exclusivo: a
  ocorrência passa a poder pertencer a `cargo_arrival_document_id`, com `CHECK` de **exatamente um** dos
  dois (decisão 🧠, migration aditiva e reversível); tipos de ocorrência ganham a etapa `receiving`;
  tratativa (164), anexo/foto (161), item e unidade da nota (166/172) reaproveitados. A rota recusa fora da
  janela (`separation_due_at`) com código estável.
- **RF9 — Telas.** **Painel** (desktop): prévias, chegadas, recomendação de viagens e a **ficha do
  contratante** (aba "Contratantes" em `/clientes` — a primeira tela de contratante) com o perfil. **Celular
  (PWA, mobile-first):** a **primeira separação** do separador, por nota, agrupada por rota e cidade, com a
  câmera/leitura de chave que a spec 055 já usa — dentro do painel PWA, papel `separator`, sem app novo (app
  separado exigiria ADR). pt-BR/en, tabela com ordenação/filtros múltiplos (web.md §7), alvo de toque ≥ 44 px,
  375/768/1280 px.
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

**Respondidas pelo usuário (2026-10-03):** **a prévia é a chegada** (1 prévia = 1 chegada); **seguir o `NroCarga`
sempre que ele existir no XML e na prévia** (na planilha ele não existe: o par vem de `RouteName`, ver RF5a); a planilha e os exemplos (`planilha-fr.md`); o prazo é **3 dias
úteis desde a chegada**; o feriado é da **cidade do destinatário**; a primeira separação é **por nota,
agrupada por rota e cidade**; a operação é **pelo celular**; o e-mail deve ser **lido pelo app quando
recebido**; a comparação com o XML usa a **data de recebimento da planilha**; o calendário de feriados **já
existe** (238 o reaproveita).

**[NEEDS CLARIFICATION: D4 — avaria na entrada]** A nota avariada **segue para a rota** ou **fica no
galpão** até o contratante decidir? _Recomendo seguir a opção do tipo de ocorrência_ (`leaves_document_behind`,
spec 185) por tipo, não por contratante. Bloqueia só a Fase 3.

**[NEEDS CLARIFICATION: D6 — como o e-mail chega ao app]** "O app lê o e-mail quando for recebido". Em qual
caixa o contratante manda hoje (Gmail, Outlook, outra) e qual vocês aceitam? Opções: **(a)** o contratante
passa a mandar a um endereço novo do sistema (`previa-<token>@<domínio de entrada>`) — mantém DKIM e
remetente originais, é o mais seguro; **(b)** uma **regra de encaminhamento automático** da caixa de vocês
para esse endereço — funciona sem o contratante mudar nada, mas o remetente verificado passa a ser o de
vocês e a conferência do contratante vira a conferência do remetente original no
cabeçalho; **(c)** o app **conecta na caixa** (IMAP/Gmail API, OAuth) — evita encaminhar, mas guarda uma
credencial de e-mail e amplia a superfície de ataque. _Recomendo (a); se não for possível, (b)._ Bloqueia só a
Fase 4.

**Resolvida pelos XMLs reais (D8):** `Text001` e o código do cliente (`Company`) **não estão no XML da
NF-e** (0 ocorrências em 277 notas, texto bruto e atributos), e a planilha **não traz `NroCarga`**. O vínculo é
por **grupo (`RouteName` ↔ `NroCarga` pelos totais) e conteúdo** (RF5a). Opcional, se o contratante aceitar:
colocar o número dele nas informações adicionais da NF-e (como já faz com `LACRE` e `NroCarga`) — a T4.3a daria
uma chave exata; se não aceitar, ela é descartada.

**Já medido com XMLs reais (item 7 do usuário):** o e-mail chega **antes** do XML (2,7 a 4,2 h antes da
emissão; ver `planilha-fr.md`). **A rodar por quem tem acesso ao banco:** a mesma comparação no **conjunto
completo** de XMLs e o `created_at` real da importação — `consulta-recebimento-vs-xml.sql`. Não foi possível rodá-la na sessão (leitura em
produção bloqueada). O desenho registra os dois instantes (`cargo_previews.received_at` e
`nfe_documents.created_at`) para que a comparação passe a ser um relatório do sistema.
