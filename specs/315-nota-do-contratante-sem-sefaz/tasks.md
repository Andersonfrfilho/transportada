# Tasks — spec 315

> Modelo: `sonnet` (decisão local de segurança; execução com gates por comando).

- [x] T1 — Contratos do consumidor (nota sem relação + contratante ligado/inativo/outra raiz/evento/sem contratante)
- [x] T2 — `isIssuedByLinkedContractor` e uso no consumidor; repositório devolve `isRestrictedContractorActive`
- [x] T3 — E-mail: contato devolve o contratante (único); integração com banco atualizada
- [x] T4 — WhatsApp: migration `nfe_xml_receipts.restricted_contractor_id`, API grava, worker repassa; contratos
- [x] T5 — Integração com Postgres descartável local (ver evidence.md); `make migration-test` não rodado
- [ ] T6 — Reprocessar as 46 notas recusadas (operação, aprovação humana)
