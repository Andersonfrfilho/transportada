# Plano — 238

- **Domínio puro primeiro** (`business-calendar.policy.ts`): contrato em tabela antes; o resto só
  alimenta a política com o conjunto de feriados.
- **Dado:** `municipal_holidays` ganha `recurrence`/`kind`/mês-dia (aditivo); `state_holidays` nova; flag
  `saturday_is_business_day` na configuração da empresa. Nacionais ficam no código (fixos + Páscoa), pois
  são lei, não dado do cliente.
- **Leitura:** um repositório devolve os feriados do conjunto de cidades/anos pedido; a expansão `yearly`
  mora na política (testável), não no SQL.
- **Frontend:** o cálculo de feriado nacional do painel (`brazilianHoliday.service.ts`) **não** vira a
  fonte da verdade; o backend o é. O painel pode passar a consumir a rota do calendário para o date-picker
  numa task posterior (não bloqueia).
- **Riscos:** (1) Carnaval/Corpus Christi (D1) — divergência entre o painel de hoje e o backend; (2)
  29/02; (3) fuso na virada do dia; (4) o solver lê `municipal_holidays` — o teste de integração do solver
  roda depois da migration.
- **Documentação viva:** `docs/spec/domain-model.md`, `docs/ai-context/api-transportada.md`,
  `docs/ai-context/frontend-transportada.md`, `CLAUDE.md` das duas apps.
