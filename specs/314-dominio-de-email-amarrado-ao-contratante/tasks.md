# Tasks — spec 314

> 🤖 Modelo: `sonnet` (T1 e T4 → `haiku` por serem mecânicas; T2 é 🧠 — validar com `opus`: onde o filtro do emitente entra no intake/importação).

- [x] T1 Migration aditiva `contractor_id` + rollback + schema Drizzle (e `nfe_imports.issuer_tax_id_root`, migration própria)
- [x] T2 Filtro do emitente na importação (intake → importação), com motivo no resumo (código real: `NFE_IMPORT_ISSUER_MISMATCH`)
- [x] T3 Teste de contrato: domínio com contratante recusa emitente alheio; sem contratante, aceita; contato cadastrado, aceita
- [x] T4 Script `liberar-dominio-xml.sh` com CNPJ do contratante (simula antes, pede `sim`)
- [ ] T5 Tela de remetentes: coluna do contratante
- [ ] T6 Cadastro da SPANI em produção (script; pede `sim` do Anderson)

## Decisões da implementação

- O repositório do intake devolve `issuerTaxIdRoot` só quando o remetente passou **apenas** pelo domínio e o domínio tem contratante; usuário da empresa e contato (302) são checados antes e nunca recebem restrição.
- A restrição fica em `nfe_imports.issuer_tax_id_root` (nula = qualquer emitente) e é conferida no consumidor, depois do filtro de empresa e antes de gravar. Domínio ligado a contratante sem CNPJ legível vira raiz vazia: recusa tudo (falha fechada).
- Evento (`nfe-event`) não traz emitente no corpo: vale o CNPJ embutido na chave da nota (posições 7-20), a mesma fonte que o filtro de empresa já usa para eventos. Evento de nota desconhecida de outra empresa continua recusado por `NFE_IMPORT_UNRELATED_CNPJ`.
- O código que chega ao resumo é o do item (`nfe_import_items.error.code`), então `PROBLEM_TEXT` basta; nada de nome de arquivo em log.
- T5 (tela) e T6 (cadastro em produção, pede `sim` do Anderson) seguem abertos.
