# Tasks — 125

> 🤖 Modelo: `sonnet` (a regra fiscal D1 é 🧠 e está na spec)

- [x] **T1 — Contrato antes do código.** `icms-projection.contract.ts` (API): a projeção segue a regra
      de base do CT-e em cada CST; arredonda como o documento; o builder usa `computeIcms`; o
      documento vence; nota sem documento projeta pelo perfil; isento é zero declarado; sem perfil,
      empate e sem CNPJ viram `NO_EMISSION_PROFILE`; CST 60 não é inventado; sem receita não há base;
      a parcela soma medido + projetado com o pior caso; nota ausente nomeia a lacuna com a contagem;
      as três superfícies carregam os perfis. _Verificação:_ vermelho antes (módulos inexistentes).
- [x] **T2 — `computeIcms` extraído.** `cte-issuance/domain/cte-icms.policy.ts`; `composeIcms` do
      builder vira mapeamento. `cte-payload-builder.contract.ts` intocado e verde.
- [x] **T3 — Projeção por nota.** `resolveDocumentIcms` sobre `findEmissionProfile`.
- [x] **T4 — Parcela.** `buildTripTaxParcels` soma medido + projetado, `basis` `of: 'icms'` quando
      uniforme, `detail` `ausentes/total`.
- [x] **T5 — Contexto.** Perfis ativos nos dois leitores (`readContext`, `readPreviewContext`) e
      `recipientTaxId` nas notas; a proposta herda pela prévia.
- [x] **T6 — Tela.** `valuation-icms-basis.contract.ts` (frontend): `basis` de ICMS lido por forma,
      fração → percentual textual, frase nos dois idiomas. Rótulos das duas lacunas nas quatro tabelas;
      `NO_FREIGHT_RULE` do razão deixou de dizer "sem CT-e" (a lacuna significa "sem regra de frete").
- [x] **T7 — Medição.** Conta antes × depois nas viagens reais.
- [x] **T8 — Gate.** API e frontend: testes e typecheck.
