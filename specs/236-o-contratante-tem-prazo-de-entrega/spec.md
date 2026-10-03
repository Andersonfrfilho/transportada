# Feature 236 — o contratante tem prazo de entrega

> **Estado:** decisões D1–D5 respondidas pelo usuário em 2026-10-03; **depende** das specs 238 (dias úteis)
> e 237 (chegada da carga e perfil do contratante). Ordem: 238 → 237 → 236. Uma dúvida nova (D6) no fim.
> **Número:** nasceu como 235; duas outras sessões usam 235 em worktrees sem push. Reconferir antes de publicar.

## Problema e resultado

Alguns contratantes dão **três dias úteis** para a transportadora entregar o que eles mandam. O sistema não
tem prazo de entrega da mercadoria: a nota do motorista mede só a foto do comprovante (ADR-0070 §5),
`cte_emission_profiles.delivery_days` não é lido por regra nenhuma, e os 24 h de `missingAfterHours` são o
prazo do **comprovante**, não da mercadoria.

**Como o prazo funciona para esse CNPJ (palavras do usuário):** a carga chega, há 24 horas para fazer a
primeira separação e abrir avarias, e **a partir daí há 3 dias úteis para entregar** — contando feriados e o
aniversário das cidades. Outros contratantes têm outras regras.

O resultado: **o painel mostra, em cada nota do contratante com prazo, até quando ela deve ser entregue e se
está no prazo**, sem bloquear a entrega e sem mexer na nota do motorista.

## Decisões já tomadas

- **D1 — Âncora = a chegada da carga** (spec 237), não a emissão da NF-e. O prazo conta **depois da janela
  de separação**: `prazo = chegada + janela de separação (24 h do perfil) + N dias úteis`. [leitura a
  confirmar em D6]
- **D2 — Dias úteis**, incluindo feriados nacionais, estaduais, municipais e o aniversário da cidade
  (spec 238). Sábado segue a configuração da empresa.
- **D3 — O vencimento só informa:** selo e filtro no painel; **sem pontos na nota do motorista** e sem
  bloqueio de entrega (ADR-0070 §1/§5, spec 193).
- **D4 — Os "três dias" são o prazo de ENTREGA**, não o do comprovante. O prazo do comprovante por contratante
  (`missingAfterHours`) **fica fora**: toca a nota e hoje três chamadores resolvem a configuração em duas
  camadas, não em três (escrita do comprovante, `proof-pending.query.ts`, nota do motorista).
- **D5 — Notas antigas:** é tudo novo e está em teste; o prazo é **derivado** e vale a configuração atual
  do contratante. Sem backfill nem prazo congelado por nota.

## Fora do escopo

- A coluna do prazo e a **tela do contratante**: moram na spec 237 (perfil de recebimento,
  `delivery_deadline_business_days`, aba "Contratantes"). Esta spec **lê** o perfil.
- O calendário (238) e o registro de chegada (237).
- Prazo do comprovante por contratante (D4); nota do motorista (D3); CT-e `dPrev`/`delivery_days`.
- App do motorista e portal do contratante exibirem o prazo (o portal tem payload mínimo guardado por
  contrato — spec 063; mostrar prazo ali é decisão de segurança).
- Nota sem chegada registrada ou sem perfil: **sem prazo** (ausência é ausência, ADR-0048); nunca inventar
  âncora.

## Histórias priorizadas

### P1 — Ver o prazo na nota

**Given** uma nota de contratante com perfil (3 dias úteis) e chegada registrada **When** o operador abre a
viagem **Then** vê "vence em 2 dias úteis" / "vence hoje" / "vencida há 1 dia útil" e, depois da entrega,
"entregue no prazo" ou "entregue com 1 dia útil de atraso".

### P2 — Filtrar o que vence

**Given** a lista de notas/viagens **When** o operador filtra "vencidas" ou "vencem hoje" **Then** vê só
essas, com contagem.

### P3 — Sem chegada ou sem perfil

**Given** uma nota sem chegada registrada, ou de contratante sem prazo **Then** nenhum selo de prazo
aparece e nada quebra.

## Requisitos funcionais

- **RF1 — Política pura** `delivery-deadline.policy.ts`
  (`resolveDeliveryDeadline({ arrivedAt, separationWindowHours, deadlineBusinessDays, deliveredMomentAt,
now, recipientCityIbge, calendar })` → `{ dueAt, state, businessDaysLate? }`): soma a janela de separação
  em horas e **depois** os dias úteis pelo calendário da 238. Relógio, fuso e calendário por parâmetro.
- **RF2 — Estados:** `open`, `due_today`, `overdue`, `delivered_on_time`, `delivered_late`,
  `not_applicable` (sem chegada, sem perfil/prazo, devolvida, cancelada, sem cidade do destinatário).
- **RF3 — Entrega medida pelo momento da 234** (`deliveredMomentSql`), nunca pela chegada ao servidor; sem
  entrega, o relógio do servidor.
- **RF4 — Cidade do calendário:** a do **destinatário** da nota (`nfe_addresses.city_code`) [D7].
- **RF5 — Leitura por nota:** o detalhe da viagem recebe por documento `deliveryDeadline:
{ dueAt, state, businessDaysLate? } | null`, no join que já traz o `contractorId`, **sem** novo resolvedor
  paralelo e sem N+1 (o calendário das cidades da viagem em uma consulta).
- **RF6 — Selo e filtro** no painel, no padrão de `tripDocumentProofBadges.service.ts` (estrutura e tokens,
  nunca texto cru), locale pt-BR/en, contraste nos dois temas.
- **RF7 — Última tarefa:** revisão de design e usabilidade com print (web.md §15).

## Requisitos não funcionais

- Nenhum PII em log; política pura testada com relógio injetado; sem `Date.now()` solto.
- Compatível para trás: contratante sem perfil e clientes que não conhecem o campo seguem como hoje.
- Não-regressão (CA6): `computeDriverScore`, `missingAfterHours` e CT-e **intactos**.

## Casos extremos e falhas

- Janela de 24 h cruza fim de semana/feriado: a janela conta **horas corridas**; só os dias de entrega
  são úteis.
- Chegada em dia não útil: o prazo começa a contar no próximo dia útil depois da janela.
- Entrega **no dia** do vencimento é no prazo.
- Nota devolvida ou cancelada: `not_applicable`.
- Perfil alterado depois da chegada: vale o perfil atual (D5).
- Cidade sem feriado cadastrado: só nacionais e estaduais; calendário nunca "assume" município.

## Critérios de aceite

- **CA1** Tabela de casos do domínio (chegada, janela, dias, calendário, agora, entrega) → estado, incluindo
  fim de semana, feriado municipal, aniversário da cidade, entrega no dia e devolvida.
- **CA2** Integração contra Postgres: viagem com notas de dois contratantes (um com perfil e chegada, outro
  sem) devolve prazo só na primeira; nota sem chegada devolve `null`.
- **CA3** O painel mostra o selo nos dois temas e filtra vencidas/vencem hoje; smoke cobre.
- **CA4** Mutação: tirar a janela de 24 h, contar sábado, ignorar o aniversário da cidade, inverter
  `<`/`<=` no vencimento, medir a entrega pela chegada ao servidor — cada uma derruba um teste.
- **CA5** Nenhuma query nova por nota (contrato de contagem de consultas).
- **CA6** Não-regressão da nota do motorista, do comprovante e do CT-e.

## Dúvidas

**[NEEDS CLARIFICATION: D6 — confirmar a leitura do relógio]** Entendi: o prazo é **chegada + 24 h de
separação e, depois disso, 3 dias úteis** (as 24 h não gastam os 3 dias). É isso, ou os 3 dias úteis contam
desde a chegada com as 24 h dentro deles? (a mesma pergunta está em D2 da 237.)

**[NEEDS CLARIFICATION: D7 — de qual cidade é o feriado]** Recomendo a **cidade do destinatário** de cada
nota (o prazo é para entregar lá). Se o contrato conta pelo município onde a carga é **recebida**, usa-se o
da chegada. Confirma?
