# ADR 0109 — A ocorrência tem dono

- **Status:** aceita com mudanças (2026-10-18) — T0.2 da spec 273, revisada por `architect` (plan § Revisão de
  arquitetura e § Revisão de arquitetura da D-f). Decisões do dono (D-a a D-g) em
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
   atraso → dono elegível ?? quem despachou; reabertura → dono elegível ?? quem resolveu por último. O registro **não**
   gera sino ao dono (D-g): o painel mostra o status "Atribuída a você" ao dono e o nome do dono aos demais, derivado,
   sem estado de lida.
   **Elegível é a mesma regra na API e no worker (D-f):** empresa ativa, vínculo ativo, perfil e `occurrences.resolve`
   no conjunto efetivo (papéis e concessões, diretos e de grupo). Como nenhuma app importa código da outra, a regra é
   **pura e espelhada** nas duas apps, com os fatos lidos por SQL sobre as mesmas tabelas, e presa por uma **tabela de
   casos em forma de fatos idêntica byte a byte** nas duas (E01–E27): um teste na raiz falha se as cópias divergirem ou
   sumirem, a API confere a tabela contra toda a matriz `COMPANY_ROLE_PERMISSIONS`, e a integração das duas apps semeia o
   banco a partir dos mesmos casos. Motivo: a matriz de papéis continua com uma fonte só (TypeScript), e qualquer mudança
   nela fica vermelha no próprio PR que a faz.
8. **Assinante no e-mail: a 272 manda.** A 272 (ADR-0110, sai antes) define `OccurrenceMailSigner`
   (`operator` | `owner` com nome e cargo, ou `team`), a regra única do "De" (`buildSenderDisplayName`:
   `<nome> — <nome de exibição da transportadora>`, nos dois transportes, gravado em `from_display_name`) e a porta
   `OccurrenceOwnerReader`, nula até aqui. Esta ADR só implementa a porta: o dono **elegível** da ocorrência com nome e
   `job_title`. Sem dono, assina a equipe (`team`). Nenhuma coluna de assinante própria.
9. **O dono vai em cópia.** Dono elegível com endereço entra na cópia, fora das listas e antes do corte de 50; não pode
   ser excluído pelo operador.
10. **Publicação:** 272 → painel tolerante (pode não ter deploy se os parsers atuais já tolerarem o payload) → API
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
- **Worker só com vínculo ativo:** recusado pelo dono (D-f) — o worker verifica a permissão como a API.
- **View ou função no banco, criada por migration da API, para as duas apps:** seria uma terceira cópia da matriz de
  papéis (em SQL, numa migration congelada), toda troca de papel exigiria migration nova, a deriva em relação ao
  TypeScript só apareceria com o mesmo teste espelhado, e o worker passaria a depender do tempo das migrations da API.
- **Sino ao dono no registro, ou estado "nova até o dono abrir":** o dono quis só o status (D-g).

## Consequências

- Uma consulta a mais (listas + elegíveis) na transação de registro; o caminho de separação passa a ler a contratante
  sempre, não só em tipo de contratantes.
- Os filtros "Minhas" e "Sem dono" dependem do conjunto de elegíveis da empresa, resolvido em TypeScript a cada leitura
  (a permissão não é SQL).
- Duas implementações da elegibilidade (API e worker) e duas consultas de fatos para manter; as quatro travas da §7
  tornam a divergência um teste vermelho, não um aviso no lugar errado. A API passa a exigir empresa ativa também no
  diretório de responsáveis.
- O nome do dono passa a sair no "De" do e-mail para a contratante pelo formatador saneado da 272; nunca vai a log.
- Ocorrência de recebimento de carga ganha dono, mas não aparece no feed do painel (como hoje).
