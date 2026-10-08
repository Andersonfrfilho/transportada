# Plano — 238

- **Domínio puro primeiro** (`business-calendar.policy.ts`): contrato em tabela antes; o resto só
  alimenta a política com o conjunto de feriados.
- **Dado (forma B1, ADR-0096 §Modelo de dados):** regra "todo ano" em tabela própria (`municipal_holiday_rules`);
  `municipal_holidays` fica só com datas fixas e ganha `kind` + `source_rule_id` (nulo = digitada; preenchido =
  gerada, apagada em cascata com a regra). `state_holidays` nova (`once`/`yearly`, não materializa).
  `company_business_calendar_settings` guarda o sábado (uma linha por empresa; ausência = `false`). Nacionais ficam
  no código (fixos + Páscoa), pois são lei, não dado do cliente.
- **Roteirizador intocado:** ele casa `holiday_on = data`. A rota (T1.3) gera as datas de **10 anos** na escrita da
  regra, sem rotina agendada; a tela avisa até que ano foi gerado e oferece a ação idempotente "gerar próximos anos".
  Data gerada que colide com uma digitada é ignorada (`on conflict do nothing`).
- **Leitura:** um repositório devolve os feriados do conjunto de cidades/anos pedido. Para a política, regras
  `yearly` vêm de `municipal_holiday_rules` e `municipal_holidays` entra como `once` **só com `source_rule_id` nulo**
  (a gerada seria a mesma causa duas vezes); a expansão `yearly` mora na política (testável), não no SQL.
- **Frontend:** o cálculo de feriado nacional do painel (`brazilianHoliday.service.ts`) **não** vira a
  fonte da verdade; o backend o é. O painel pode passar a consumir a rota do calendário para o date-picker
  numa task posterior (não bloqueia).
- **Riscos:** (1) divergência entre o calendário do painel e o do backend — por isso o contrato de paridade; (2)
  29/02; (3) fuso na virada do dia; (4) o solver lê `municipal_holidays` — a integração do worker
  (`route-optimization-municipal-holiday.integration.test.ts`) roda depois da migration e ganhou o caso da data
  materializada; (5) CHECK com coluna nula passa em silêncio — `state_holidays` exige `month`/`day` `is not null`
  na ponta `yearly`; (6) o horizonte de 10 anos acaba: sem rotina, a tela é quem avisa.
- **Documentação viva:** `docs/spec/domain-model.md`, `docs/ai-context/api-transportada.md`,
  `docs/ai-context/frontend-transportada.md`, `CLAUDE.md` das duas apps.
