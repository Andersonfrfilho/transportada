# ADR 0109 — A ocorrência tem dono

- **Status:** aceita com mudanças (2026-10-18) — T0.2 da spec 273, revisada por `architect` (plan § Revisão de
  arquitetura). §7 tem uma divergência do RF5 no worker pendente do dono (`[NEEDS CLARIFICATION]` Q1 no evidence). Decisões do dono em
  [`specs/273-a-ocorrencia-tem-dono/evidence.md`](../../specs/273-a-ocorrencia-tem-dono/evidence.md) § Decisões do dono.
- **Data:** 2026-10-18
- **Nasce da spec 273:** cada lista de responsáveis marca um principal; a ocorrência ganha um dono no registro; o dono
  recebe os avisos pessoais e assina o e-mail automático.
- **Emenda:** spec 267 (o sino para responsáveis ficava fora do escopo — passa a existir só para o dono), spec 248 (o
  alarme de resposta atrasada ia a quem despachou — vai ao dono, com quem despachou como reserva) e spec 266 / ADR-0105
  (a reabertura avisava quem resolveu — avisa o dono, com quem resolveu como reserva). **Não muda:** a precedência da
  cópia da 271 / [ADR-0108](0108-o-modelo-do-email-a-contratante-vem-do-modulo-de-notificacao.md) §4 (tipo → contratante →
  empresa).

## Contexto

- A ocorrência nasce sem responsável. A resposta da contratante só avisa o motorista
  (`record-contractor-mail-inbound-message.use-case.ts:217`, worker), o e-mail automático assina com o nome da
  transportadora (`occurrence-mail.template.ts:28-47`) e o alarme de atraso cai em quem despachou a viagem.
- Já existem três listas de responsáveis (267 e 271): empresa, contratante e "Em cópia" do tipo. Elas dizem quem vai em
  **cópia**; nenhuma diz quem **atende**.
- Há duas tabelas de ocorrência: `trip_document_occurrences` (nota de viagem e recebimento de carga) e
  `trip_stop_occurrences` (parada). Nenhuma tem estado próprio de aberta/resolvida: o estado é o último evento de
  `trip_occurrence_resolution_events` (ADR-0105).
- O vínculo do usuário (`user_company_memberships`) pode ser desabilitado **ou apagado** (spec 191 / ADR-0076).
- O "De" do e-mail é montado no worker a partir das configurações da empresa; o corpo e a assinatura, na API.

## Decisão

1. **Principal por lista.** `is_primary boolean not null default false` nas três listas, com índice único parcial por
   lista (`… where is_primary`). Marcar outro desmarca o anterior na mesma transação, sob a trava consultiva da lista que
   a 267 já usa. Inativar na empresa limpa a estrela da linha da empresa **e** das linhas de tipo daquele usuário (a
   linha do tipo não tem status: lê o da empresa); inativar na contratante limpa a da contratante. Toda troca grava
   `audit_logs`. A estrela só vale se o membro está ativo e elegível (§3); limpar na inativação é higiene, não garantia.
2. **O dono é escolhido no registro e gravado na ocorrência.** Colunas iguais nas duas tabelas de ocorrência:
   `owner_user_id`, `owner_source` (`contractor` | `occurrence_type` | `company` | `manual`), `owner_assigned_at`,
   `owner_assigned_by_user_id` (só em `manual`). Escolha dentro da transação de **todo** caminho que insere ocorrência
   (separação, motorista, lote do escritório, recebimento de carga, parada). Mudar as listas depois não troca dono
   gravado. Sem backfill. Sem trava consultiva no registro: as listas saem de uma consulta e o vínculo do escolhido é
   conferido `for key share`; sem vínculo ativo, a ocorrência nasce sem dono — o registro nunca falha por causa do dono.
   Ocorrência de recebimento de carga ganha dono no registro, mas leitura e troca ficam fora até ela aparecer no feed.
3. **Precedência do dono ≠ precedência da cópia.** Dono: contratante (da nota) → tipo → empresa; vale a primeira lista
   com algum membro **ativo e elegível**; dentro dela, o principal se elegível, senão o primeiro elegível por nome; sem
   contratante (parada sem nota, contratante não cadastrada) ou sem tipo, a lista é pulada. Elegível = vínculo ativo +
   `occurrences.resolve` (sem exigir endereço, ao contrário da cópia). A cópia segue tipo → contratante → empresa.
4. **O dono gravado fica; a leitura decide se ainda vale.** Dono que perdeu vínculo ativo ou `occurrences.resolve` é
   lido como "sem dono" (`owner.isEligible = false`) e os avisos caem na reserva. A FK composta
   `(owner_user_id, company_id)` → `user_company_memberships (user_id, company_id)` é `RESTRICT`, como as demais FKs de
   usuário do repositório; a remoção do vínculo (`removeMembership`) limpa o dono das ocorrências daquele usuário na
   mesma transação, antes do `DELETE`, e registra o evento. A remoção já é bloqueada por `audit_logs_actor_membership_fk`
   e outras FKs `RESTRICT` para quem tem histórico; a limpeza cobre o dono **passivo** (atribuído automaticamente, sem
   ação auditada). Remover quem tem histórico continua fora do escopo (suspender). Não se usa `SET NULL (col)`: o
   Drizzle não expressa a lista de colunas (declarar `set null` zeraria também `company_id`, `not null`) e o repositório
   já recusou `set null` em FK composta (`trip.schema.ts:1091-1095`).
5. **Histórico do dono em tabela própria.** `trip_occurrence_owner_events` (só inserção, aponta para uma das duas
   ocorrências como `trip_occurrence_resolution_events`): atribuição no registro, assumir, passar e limpeza por remoção
   de vínculo, com de/para, origem e ator. Não se reaproveita `trip_occurrence_resolution_events`, cuja leitura de estado
   trata todo `kind` diferente de `resolved` como reaberta. Uma função só grava colunas e evento. A linha do tempo ganha
   `owner.assigned`, `owner.transferred` e `owner.cleared` (um `kind` por verbo, como `resolution.*`).
6. **Assumir e passar.** Quem tem `occurrences.resolve` troca o dono para si ou para outro elegível da empresa; destino
   fora da empresa ou inelegível → 404 (não revela quem existe). Vale também para ocorrência resolvida. Trava a linha da
   ocorrência, grava o evento e `audit_logs`, e avisa quem recebeu quando não foi ele mesmo.
7. **Avisos pessoais com reserva.** Resposta da contratante → sino ao dono elegível (sem dono, nada novo); alarme de
   atraso → dono elegível ?? quem despachou; reabertura → dono elegível ?? quem resolveu por último. Na API, elegível é
   vínculo ativo + `occurrences.resolve`; no worker (resposta e alarme), que não resolve permissão, elegível é vínculo
   ativo — quem perdeu só a permissão aparece "sem dono" no painel e ainda recebe os dois sinos (divergência do RF5,
   pendente do dono).
8. **Assinante no e-mail.** A mensagem gravada ganha o assinante (`signer_user_id`, `signer_name`, `signer_kind`
   `owner` | `operator`). No envio automático, o assinante é o dono elegível: a assinatura do corpo leva o nome dele e o
   worker monta o "De" como `"<nome do dono> — <nome do remetente>" <endereço da empresa>` em quoted-string RFC 5322,
   sem caracteres de controle nem bidi, truncado. No envio manual o assinante é o operador, como hoje, e o "De" não
   muda. É esse assinante que a spec 272 desenha no e-mail em HTML: `name` é o texto cru do perfil (sem controle, ≤ 120,
   instantâneo do envio); escapar HTML e citar no cabeçalho é de quem consome; só `kind = 'owner'` altera o "De".
9. **O dono vai em cópia.** Dono elegível com endereço entra na cópia, fora das listas e antes do corte de 50; não pode
   ser excluído pelo operador.
10. **Publicação:** painel tolerante (pode não ter deploy se os parsers atuais já tolerarem o payload) → API
    (migration) → worker → telas.

## Alternativas rejeitadas

- **Dono calculado na leitura, sem gravar:** trocaria o dono de ocorrências antigas a cada mudança de lista (fere RF3) e
  não daria histórico de quem atendeu.
- **Mesma precedência da cópia (tipo primeiro):** o dono escolheu contratante primeiro para o dono (D-b); a cópia não muda.
- **Tabela de atendentes separada das listas:** duas listas de pessoas para o mesmo assunto; o dono quis a estrela nas
  listas que já existem (D-c, D-d).
- **`ON DELETE SET NULL (owner_user_id)`:** funciona no Postgres 17/18 em uso, mas exige SQL à mão fora do que o Drizzle
  gera e contraria o precedente do repositório; a limpeza explícita na remoção do vínculo resolve o mesmo caso.
- **Sem FK para o dono:** perderia a garantia de que o dono é da mesma empresa (BOLA no banco).
- **Dono como mais um `kind` de `trip_occurrence_resolution_events`:** corromperia a leitura de aberta/resolvida.
- **Rodízio ou menor carga:** fora do escopo da spec.

## Consequências

- Uma consulta a mais (listas + elegíveis) na transação de registro; o caminho de separação passa a ler a contratante
  sempre, não só em tipo de contratantes.
- Os filtros "Minhas" e "Sem dono" dependem do conjunto de elegíveis da empresa, resolvido em TypeScript a cada leitura
  (a permissão não é SQL).
- O worker confere só o vínculo ativo do dono (§7); uma cópia da resolução de permissão no worker não teria teste
  cruzado (apps não importam código uma da outra) e derivaria em silêncio.
- O nome do dono passa a sair no cabeçalho do e-mail para a contratante, citado e saneado; nunca vai a log. O "De" de hoje
  já era montado sem aspas e passa a ser citado também sem dono.
- Ocorrência de recebimento de carga ganha dono, mas não aparece no feed do painel (como hoje).
