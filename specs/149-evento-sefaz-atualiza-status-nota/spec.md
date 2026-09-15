# Spec 149 — Evento da SEFAZ que muda a situação da NF-e atualiza a nota

> 🤖 Modelo: `opus` 🧠 (regra de transição, concorrência entre evento e nota, fiscal gate) ·
> `sonnet` (repositórios, contratos, API e tela) · `haiku` (documentação)

## Problema

`nfe_documents.status` só é escrito no `INSERT` da nota, pelo worker, nos dois trilhos de entrada:

- importação de XML — `apps/worker-transportada/src/nfe-imports/infrastructure/drizzle-nfe-import-consumer.repository.ts`
  (~278);
- distribuição DF-e — `apps/worker-transportada/src/nfe-distribution/infrastructure/drizzle-nfe-distribution.repository.ts`
  (`#insertDocument`, ~336).

Os dois usam `onConflictDoNothing` em `(company_id, access_key)`. **Não existe nenhum `UPDATE` em
`nfe_documents`.** Os eventos (`procEventoNFe`) vão para `nfe_events`, com `onConflictDoNothing` em
`(company_id, target_access_key, event_type, event_sequence)`, e param ali: nada os propaga à nota.

Consequência: uma NF-e cancelada pelo emitente continua `authorized` para sempre no TMS. Ela segue
elegível para lote de CT-e (`cte-batch-eligibility.policy.ts`), para a sugestão de roteiro
(`drizzle-multi-vehicle-suggestion.repository.ts:110`), para a simulação de frete
(`freight-simulation.use-case.ts:215`) e para o faturamento. E a listagem, que desde o commit
`3f265e64` ordena por `updated_at desc, issued_at desc, id desc`, não sobe a nota para o topo — o
operador não fica sabendo da mudança.

## Decisão do usuário

Um evento fiscal da SEFAZ que muda a situação da NF-e **atualiza `nfe_documents.status` e
`nfe_documents.updated_at`**, e a nota sobe ao topo da listagem.

## Decisões desta spec

- **D1 — Quais eventos mudam o status.** Pelo código do tipo de evento (`tpEvento`, que o pacote
  fiscal entrega em `NfeXmlEvent.type`):

  | `tpEvento` | Evento                               | Efeito na nota  |
  | ---------- | ------------------------------------ | --------------- |
  | `110111`   | Cancelamento                         | → `cancelled`   |
  | `110112`   | Cancelamento por substituição        | → `cancelled`   |
  | `110110`   | Carta de correção (CC-e)             | nenhum (ver D6) |
  | `2102xx`   | Manifestação do destinatário         | nenhum          |
  | demais     | EPEC, prorrogação, ator interessado… | nenhum          |

  A lista de tipos que mudam o status é uma constante (`NFE_STATUS_CHANGING_EVENT_TYPES`); tipo fora
  dela só grava em `nfe_events`, como hoje. **Não se infere nada da descrição textual** do evento
  (`description`/`descricaoEvento`) — só do código.

- **D2 — O evento só vale se a SEFAZ o registrou.** O `cStat` do registro (`NfeXmlEvent.statusCode`)
  precisa estar em `{135, 136, 155}` (registrado e vinculado · registrado sem vínculo · cancelamento
  homologado fora de prazo — MOC 7.0, tabela de códigos do `retEvento`). Evento de cancelamento com
  outro `cStat`, ou **sem** `statusCode`, é gravado em `nfe_events` como hoje, **não muda a nota** e
  gera `warn` estruturado `nfe_event_status_not_applied` (sem XML, só `companyId`, `eventId`, tipo e
  motivo). A T1 confere no pacote instalado (`0.3.0-rc.7`) que o `statusCode` vem preenchido para
  `procEventoNFe`; se não vier, a T1 para e leva o fato ao usuário — não se inventa o valor.

- **D3 — Denegação não é evento.** A NF-e denegada nasce denegada: a SEFAZ devolve `cStat`
  301/302/303 no protocolo, não um `procEventoNFe`. A única fonte que diz "denegada" sobre uma chave
  que o TMS já conhece é o **resumo** (`resNFe`) da distribuição, campo `cSitNFe` (`situacao`:
  `1` autorizada · `2` cancelada · `3` denegada), que hoje é lido em `buildDistributionSummary` e
  descartado. Esta spec usa o resumo como **segunda fonte**, só sobre nota que já existe:
  - `situacao = '2'` → `cancelled` (mesma transição do cancelamento, D4);
  - `situacao = '3'` → `denied`, **só a partir de `unsigned`** (a NF-e não assinada importada por XML
    e depois denegada). `authorized → denied` é impossível pela regra fiscal: não muda a nota e gera
    `warn` `nfe_summary_status_inconsistent`;
  - `situacao = '1'` → nenhum efeito (o resumo nunca rebaixa nem "desfaz" nada);
  - resumo de chave que o TMS ainda não tem → nada (o resumo não é persistido como pendência; o
    cancelamento propriamente dito chegará como evento e é coberto por D5).

- **D4 — Máquina de estados, e nunca rebaixar.** As únicas transições permitidas:

  | de           | para        | por                               |
  | ------------ | ----------- | --------------------------------- |
  | `authorized` | `cancelled` | evento 110111/110112 · resumo `2` |
  | `unsigned`   | `cancelled` | evento 110111/110112 · resumo `2` |
  | `unsigned`   | `denied`    | resumo `3`                        |

  `cancelled` e `denied` são **terminais**. Nenhum caminho — evento, resumo, reimportação — tira uma
  nota de `cancelled`/`denied`. O `UPDATE` carrega a guarda no próprio `WHERE`
  (`status in (<origens permitidas>)`), não num `SELECT` anterior: é o banco que garante.

- **D5 — Evento que chega antes da nota.** A ordem da distribuição não é garantida, e o XML do evento
  pode ser importado antes do da nota. Quando a nota é **inserida** (qualquer trilho), na mesma
  transação, o repositório procura em `nfe_events` um evento aplicável (D1 + D2) para
  `(company_id, access_key)` e, se houver, grava a nota já `cancelled`. A nota nasce cancelada — o
  `updated_at` é o do insert, e ela já aparece no topo por ser nova.

- **D6 — CC-e não toca `updated_at`.** A carta de correção não muda a situação da NF-e, e o TMS
  **não aplica** o conteúdo corrigido (endereço, volumes, dados do transporte) na nota — ele só fica
  em `nfe_events` e no XML preservado. Subir a nota ao topo sem nada visível mudado nela é ruído: o
  operador abre, não vê diferença, e aprende a ignorar o topo da lista — que é exatamente o sinal que
  esta spec quer proteger para o cancelamento. Quando uma spec futura passar a exibir ou aplicar a
  CC-e na nota, é ela que decide mover `updated_at`. Registrado como follow-up, não como pendência.

- **D7 — Idempotência.** O mesmo evento reentregue (retry da fila, NSU reprocessado, reimportação
  do XML) não muda nada: `nfe_events` já é idempotente pela unique `(company, chave, tipo, sequência)`,
  e o `UPDATE` guardado por D4 não casa com nota que já está `cancelled`. **`updated_at` só se move
  quando o status de fato muda** (o `UPDATE` retorna 0 linhas no reprocessamento). Um segundo evento
  de cancelamento com outra sequência sobre nota já cancelada também não mexe em `updated_at`.

- **D8 — Concorrência entre nota e evento.** Nota e evento da mesma chave podem ser gravados em
  transações simultâneas (itens diferentes da mesma página de distribuição, ou o consumidor de
  importação e o de distribuição ao mesmo tempo). Em `READ COMMITTED`, cada uma não vê a linha não
  commitada da outra, e a nota ficaria `authorized` com o cancelamento gravado. As duas escritas —
  inserir nota (D5) e aplicar evento/resumo (D1–D3) — tomam `pg_advisory_xact_lock` sobre
  `hashtextextended(company_id || ':' || access_key, 0)` antes de ler/escrever. O lock é por chave e
  por empresa, dura só a transação e não serializa chaves diferentes.

- **D9 — Isolamento por empresa.** Toda leitura e escrita filtra por `company_id` do item em
  processamento (que o worker já recebe do envelope/cursor, nunca do XML). Evento da empresa A nunca
  cancela a nota da mesma chave na empresa B — a mesma NF-e pode existir nas duas (a transportadora
  com dois CNPJs, ADR-0021), e cada uma recebe o seu próprio evento pela sua distribuição.
  Contrato negativo obrigatório.

- **D10 — `updated_at` é o momento em que o TMS soube**, não `occurredAt` do evento: é a pergunta que
  a listagem responde ("o que mudou por último aqui"). Um reprocessamento de NSU antigo que cancela
  uma nota antiga a sobe para o topo — é o comportamento desejado, a informação é nova para o operador.

- **D11 — Nada fiscal é desfeito automaticamente.** O TMS não cancela CT-e, MDF-e, NFS-e nem fatura
  por causa de NF-e cancelada: cada um é ato irreversível contra órgão público ou contra o cliente, e
  a decisão é do operador. O que esta spec garante é que **nada novo** nasce sobre nota cancelada/
  denegada, e que o que já existe **aparece sinalizado** (D12).

- **D12 — Nota já em uso: o que acontece.** O sinal é derivado do `status` da nota, lido a cada
  consulta — nunca uma flag copiada (flag dessincroniza, a mesma razão da regra de prontidão do MDF-e
  em `docs/spec/fiscal-integration.md`).

  | Onde a nota está                       | Efeito                                                                                                                                                                                                                                                                                                                                                                                                                           |
  | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | Livre (sem lote/viagem)                | Some dos seletores que já filtram `authorized` (lote, sugestão de roteiro, simulação). Nada a fazer.                                                                                                                                                                                                                                                                                                                             |
  | Item de lote de CT-e ainda não emitido | **A emissão bloqueia o item** com `CTE_BATCH_DOCUMENT_NOT_AUTHORIZED` — o worker relê o status de **todas** as notas do item (`cte_batch_item_documents`; item sem nota também bloqueia) antes da primeira transmissão do número. Retransmissão que pode já ter chegado à SEFAZ (redelivery em `in_flight`, retry de erro/timeout com o mesmo número) não é barrada: o gateway reconcilia a duplicidade e vale a linha de baixo. |
  | CT-e já autorizado sobre a nota        | CT-e continua válido na SEFAZ. A tela do lote/CT-e mostra "NF-e cancelada após a emissão" ao lado do CT-e. Cancelar ou substituir é decisão do operador.                                                                                                                                                                                                                                                                         |
  | Viagem (antes ou depois do despacho)   | A nota na viagem mostra o mesmo aviso; a viagem não muda de estado sozinha.                                                                                                                                                                                                                                                                                                                                                      |
  | MDF-e / fatura já emitidos             | Fora do escopo desta spec (follow-up): o aviso da nota é o sinal por ora.                                                                                                                                                                                                                                                                                                                                                        |

  **Alerta ativo** (e-mail, WhatsApp, notificação push) fica fora desta spec: o sinal é a nota no topo
  da listagem com o badge `cancelled` (já existe em `NfeDocumentTable.component.tsx`) e o aviso nos
  pontos de uso acima. Registrado como follow-up.

### Histórico de eventos fiscais da nota (pedido do usuário, 2026-09-14)

- **D13 — A tela de Notas mostra a linha do tempo fiscal de cada nota.** No detalhe da nota (drawer
  aberto pela linha da `NfeDocumentTable`), uma linha do tempo com **todos** os eventos de
  `nfe_events` da chave (cancelamento, CC-e, manifestação, e os demais), mais as mudanças de status que
  não vieram de evento (resumo `resNFe`, D3; nota que nasceu cancelada, D5). Cada entrada mostra:
  tipo do evento (código + nome em pt-BR), sequência, data/hora do evento (`occurred_at`), data/hora em
  que o TMS registrou, protocolo e `cStat` do registro, **status anterior → status novo**, **origem**,
  **quem fez** (manual) ou **quem solicitou** (automática), e, para CC-e, o **texto da correção**.
  Ordem: mais recente primeiro.

- **D14 — Origem: manual ou automática, derivada da importação, não do XML.** Todo evento e toda
  mudança de status nasce de um item de uma importação (`nfe_imports`), e o envelope da fila já traz
  `payload.importId` e `actorId` (referências, sem PII). A classificação:

  | `nfe_imports.source` | `requested_by_user_id`                        | Origem      | Ator (quem fez) | Solicitante      |
  | -------------------- | --------------------------------------------- | ----------- | --------------- | ---------------- |
  | `upload`             | usuário                                       | `manual`    | o usuário       | —                |
  | `distribution`       | `SYSTEM_DISTRIBUTION_ACTOR_USER_ID` (cron)    | `automatic` | —               | nenhum (sistema) |
  | `distribution`       | usuário ("buscar agora", `POST` distribuição) | `automatic` | —               | o usuário        |

  "Ação na tela" que muda status diretamente **não existe** nesta spec; o valor `manual` com ator fica
  disponível para quando existir. A regra de classificação é uma função pura
  (`resolveNfeEventOrigin`), testada pela tabela acima.

- **D15 — Snapshot gravado, nunca recalculado.** `status anterior` e `status novo` são gravados no
  momento em que o evento é registrado (na mesma transação e sob o mesmo lock da D8). Evento que chega
  antes da nota grava `anterior = null` ("nota ainda não recebida") e `novo = null`; quando a nota chega
  e nasce cancelada (D5), essa mudança é uma **entrada própria** da linha do tempo, com a origem da
  importação da nota. Evento que não muda status (CC-e, manifestação, cancelamento não aplicado) grava
  `anterior = novo = <status atual>`.

- **D16 — Quem fez / quem solicitou: só o id é gravado; o nome é resolvido na leitura.** As colunas
  guardam `user_id` (uuid). O endpoint resolve o nome de exibição por `identity_user_profiles.name`
  **filtrando pela membership da mesma empresa**; usuário sem membership na empresa, ou removido,
  aparece como "usuário removido" — nunca o id cru na tela. O ator de sistema aparece como "Sistema
  (distribuição agendada)". Nenhum nome, e-mail ou telefone vai para log nem para a mensagem da fila.

- **D17 — Eventos antigos, gravados antes desta spec.** Não têm origem, ator nem snapshot. Aparecem
  com "origem desconhecida" e "status anterior não registrado" — **não** se inventa snapshot por
  recálculo (seria recalculado, contra D15). A origem (não o snapshot) é recuperável com segurança pela
  cadeia `nfe_events.xml_object_id → nfe_import_items.source_object_id → nfe_imports`; esse
  preenchimento é parte do backfill opcional (T6), com aprovação.

- **D18 — Texto da CC-e.** É o `xCorrecao` do XML do evento. Vem do pacote fiscal (princípio "fiscal
  por contrato"): a T1 confere se `NfeXmlEvent` o expõe; se não, a mudança é no pacote
  (`adatechnology-packages`), com versão nova — **parar e perguntar antes de publicar**. A aplicação não
  parseia o XML por conta própria nem importa `src/sefaz/*`. O texto é gravado em
  `nfe_events.correction_text` e mostrado a quem tem `nfe.read`; **nunca vai para log** (pode conter
  endereço). O XML original do evento continua preservado no storage e **não** é exposto pelo endpoint
  do histórico (só pelo download de XML que já existe, com a permissão que já existe).

- **D19 — Endpoint de leitura.** `GET /v1/nfe-documents/:id/events`, permissão `nfe.read` (a mesma do
  detalhe), `company_id` do contexto autenticado, nunca do payload. A nota é buscada por
  `(company_id, id)` — nota de outra empresa responde **404** (não 403, para não confirmar a existência).
  Eventos buscados por `(company_id, target_access_key)` da nota. Paginação por cursor
  (`<registered_at>::<id>`), `limit` padrão 20 e teto 100 (`docs` de APIs). Envelope
  `{ data: [...], page: { nextCursor } }` — mesmo padrão de `GET /nfe-documents`, não o
  `pagination` genérico de `docs/spec/apis.md`. Resposta sem XML, sem `xml_object_id`, sem chave de
  objeto do storage. Documentado no OpenAPI gerado das rotas.

- **D20 — Tela: pt-BR e acessível.** Textos em `*.locale.json` (nomes dos tipos de evento, origens,
  status, "usuário removido", "origem desconhecida"). Drawer com o diálogo do design system da casa
  (este repositório não tem `shadcn/ui` — ver `apps/frontend-transportada/CLAUDE.md`), foco preso e
  devolvido à linha ao fechar, `Esc` fecha; linha do tempo como lista ordenada (`<ol>`) com `<time
dateTime>`; status anterior→novo não depende só de cor (texto + ícone com `aria-label`); "carregar
  mais" como `button` com estado de carregamento anunciado (`aria-live="polite"`). Estado vazio e de
  erro com texto.

### Revisão final (decisão do usuário, 2026-09-15)

- **D21 — Só a SEFAZ muda status: evento enviado por upload é gravado, mas não muda a nota.** Um
  XML de `procEventoNFe` que o usuário sobe (`nfe_imports.source = 'upload'`, origem `manual` pela
  D14) não prova que a SEFAZ registrou o evento — qualquer um monta um XML com `cStat 135`. Ele entra
  em `nfe_events` e na linha do tempo como hoje, mas a política devolve `not-applied` com motivo
  `unverified-upload` (o `warn nfe_event_status_not_applied` sai depois do commit) e o snapshot fica
  `anterior = novo`. Os motivos de D2 têm precedência: upload com `cStat` fora do conjunto continua
  dizendo `status-code-not-registered`. A D5 também só considera evento de origem `automatic` — o
  cancelamento subido por upload não faz a nota nascer cancelada (evento legado, sem origem, também
  não). Quando o mesmo evento chega depois pela distribuição, a unique de `nfe_events` o reconhece,
  a linha do evento **não é reescrita** (D15) e a mudança é contada em
  `nfe_document_status_changes` com a origem `automatic` da distribuição. O resumo (`cSitNFe`, D3) já
  só entra pela distribuição. Consequência para a H9: a CC-e por upload continua `manual` com ator; um
  cancelamento por upload aparece `authorized → authorized`.
- **D22 — Protocolo só com forma de protocolo.** `nfe_events.protocol` só é gravado se casar
  `/^\d{15}$/` (o `nProt` da SEFAZ) **e** houver `statusCode`; caso contrário, `null`.
- **D23 — Ambiente fiscal não é casado entre nota e evento, porque a nota não o guarda.**
  `nfe_documents` não tem coluna de ambiente (`tpAmb`); `nfe_events.environment` existe, mas só é
  preenchido para evento da distribuição (CHECK `(source_nsu is null) = (environment is null)`). A
  chave de acesso não carrega `tpAmb`. Não há onde casar sem inventar dado — follow-up: gravar o
  ambiente da nota (spec própria, migration aditiva).

## Histórias e critérios de aceite

### H1 — O cancelamento chega depois da nota

- **Dado** uma nota `authorized` da empresa A com `updated_at = t0`,
- **quando** o worker grava um `procEventoNFe` 110111 com `cStat 135` para a mesma chave e empresa,
- **então** a nota fica `cancelled`, `updated_at > t0`, e `GET /nfe-documents` a devolve em primeiro.

### H2 — O cancelamento chega antes da nota

- **Dado** um evento 110111 `cStat 135` já em `nfe_events` para a chave K da empresa A, sem nota,
- **quando** a nota K é inserida (por importação de XML **e**, em outro teste, pela distribuição),
- **então** ela é gravada `cancelled`, e os filhos (participantes, volumes, produtos) são gravados
  normalmente.

### H3 — Idempotência

- **Dado** uma nota já `cancelled` com `updated_at = t1`,
- **quando** o mesmo evento é reprocessado, ou chega outro cancelamento com sequência diferente, ou
  a nota é reimportada com XML `authorized`,
- **então** o status continua `cancelled` e `updated_at` continua `t1`.

### H4 — Evento que não muda status

- **Dado** uma nota `authorized` com `updated_at = t0`,
- **quando** chega uma CC-e (110110) ou uma manifestação (210200), **ou** um cancelamento com `cStat`
  fora de `{135,136,155}` ou sem `statusCode`,
- **então** o evento é gravado em `nfe_events`, a nota continua `authorized` e `updated_at = t0`; no
  caso do cancelamento não aplicado, sai `warn nfe_event_status_not_applied` sem XML.

### H5 — Isolamento

- **Dado** a mesma chave K como nota `authorized` nas empresas A e B,
- **quando** chega o cancelamento de K na distribuição da empresa A,
- **então** só a nota da A muda; a da B continua `authorized` com o `updated_at` intacto.

### H6 — Resumo com situação

- **Dado** uma nota `unsigned` K, **quando** chega `resNFe` com `cSitNFe = 3`, **então** ela vira
  `denied` e sobe na listagem.
- **Dado** uma nota `authorized` K, **quando** chega `resNFe` `cSitNFe = 3`, **então** nada muda e
  sai `warn nfe_summary_status_inconsistent`.
- **Dado** uma nota `authorized` K, **quando** chega `resNFe` `cSitNFe = 2`, **então** ela vira
  `cancelled`.

### H7 — Concorrência

- **Dado** a nota K e o cancelamento de K gravados em duas transações simultâneas da mesma empresa,
- **então**, qualquer que seja a ordem de commit, a nota termina `cancelled`.

### H8 — Uso da nota cancelada

- **Dado** um item de lote de CT-e ainda não emitido cuja nota foi cancelada depois da seleção,
- **quando** o worker vai emitir,
- **então** o item falha com `CTE_BATCH_DOCUMENT_NOT_AUTHORIZED` **sem** chamar a SEFAZ.
- **Dado** um CT-e autorizado, ou uma viagem, com nota cancelada, **então** a resposta da API que já
  traz a nota expõe `status: 'cancelled'` e a tela mostra o aviso.

### H9 — Linha do tempo da nota

- **Dado** a nota K com: evento de CC-e importado por upload pelo usuário U1, e cancelamento chegado
  pela distribuição agendada,
- **quando** `GET /v1/nfe-documents/:id/events`,
- **então** vêm duas entradas, mais recente primeiro: cancelamento `automatic`, sem solicitante,
  `authorized → cancelled`, `cStat 135`, protocolo; CC-e `manual`, ator U1 com nome resolvido,
  `authorized → authorized`, com o texto da correção. Nenhum campo de XML ou de storage na resposta.

### H10 — Automática com solicitante

- **Dado** um cancelamento processado pela distribuição disparada por U2 ("buscar agora"),
- **então** a entrada é `automatic` com solicitante U2 e sem ator.

### H11 — Evento antes da nota, na linha do tempo

- **Dado** o cancelamento registrado antes da nota e a nota inserida depois,
- **então** a linha do tempo tem o evento (`anterior = null`, "nota ainda não recebida") e uma entrada
  de mudança de status `→ cancelled` com a origem da importação da nota.

### H12 — Evento antigo

- **Dado** um evento gravado antes desta spec (sem origem nem snapshot),
- **então** a entrada aparece com "origem desconhecida" e "status anterior não registrado", sem erro.

### H13 — Isolamento e ator de outra empresa

- **Dado** o usuário da empresa B, **quando** pede os eventos de uma nota da empresa A pelo id,
  **então** 404.
- **Dado** um evento cujo ator não tem mais membership na empresa, **então** aparece "usuário
  removido", sem id nem nome.

### H14 — Paginação

- **Dado** 25 eventos, **quando** `limit=20`, **então** 20 e um `nextCursor`; a segunda página traz os
  5 restantes; `limit=500` responde 400 com o código de validação.

## Fora de escopo

- Aplicar o conteúdo da CC-e na nota; mover `updated_at` por CC-e (D6).
- Cancelar CT-e/MDF-e/NFS-e/fatura automaticamente (D11).
- Alerta ativo por e-mail/WhatsApp/push (D12).
- Persistir o resumo `resNFe` como pendência para chave desconhecida (D3).
- Backfill das notas já gravadas cujos cancelamentos estão parados em `nfe_events` — ver T6: é
  **uma rotina one-shot opcional** e só roda com aprovação do usuário.

## Riscos

- O pacote fiscal pode não preencher `statusCode` em todo `procEventoNFe` (é opcional no tipo). A T1
  confere antes; sem ele, D2 deixaria todo cancelamento sem efeito.
- Emissão de CT-e em andamento (item já `issuing`) no instante do cancelamento: a verificação da
  T4 acontece antes da chamada à SEFAZ; se a SEFAZ já recebeu, o CT-e sai e cai no caso "CT-e já
  autorizado" de D12.
- Rebaixar por engano seria perda de informação fiscal: por isso a guarda está no `WHERE` e há
  contrato para cada transição proibida.
