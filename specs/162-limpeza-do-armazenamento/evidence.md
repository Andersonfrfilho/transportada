# Evidência — spec 162

## T0 (portão de decisão) — medição em produção, 2026-09-21

Consulta de leitura em produção, com `statement_timeout`, sem código de produção.
As dezesseis colunas referenciadoras foram **descobertas do catálogo** (`pg_constraint`
com `confrelid = 'stored_objects'`), não de lista escrita à mão.

### Universo total

3.794 objetos, **51 MB** no bucket inteiro.

| Finalidade         | Estado  | Objetos | Tamanho  |
| ------------------ | ------- | ------- | -------- |
| `nfe_document`     | final   | 2.354   | 39 MB    |
| `cte_document`     | final   | 1.243   | 8.853 kB |
| `import_source`    | staging | 181     | 2.934 kB |
| `nfse_document`    | final   | 10      | 578 kB   |
| `billing_document` | final   | 6       | 450 kB   |

Não existe em produção nenhum objeto de `delivery_proof`, `contractor_mail_raw`,
`aggregate_document`, `aggregate_application_attachment`, `trip_occurrence_attachment`
ou `trip_occurrence_thumbnail` — coerente com o achado de 2026-09-21 de que
`company_occurrence_types` estava vazia desde 03/09, então nunca houve ocorrência
para anexar foto.

### Órfãos

**Zero.** Nenhum objeto sem vínculo, em nenhuma finalidade, conferido contra as
dezesseis colunas.

### Conclusão do portão

O universo apagável hoje são **6 PDFs de fatura, 450 kB** — 48 dos 51 MB são guarda
fiscal e arquivo de importação, que a decisão do usuário protege. Dezenove tasks,
migration com dezoito índices, permissão nova e módulo novo de frontend não se pagam
por menos de meio megabyte.

A alternativa barata do `plan.md` passa a ser a recomendação: a varredura periódica
que `docs/SECURITY.md:169` pede desde setembro — objeto **no bucket sem linha no banco**,
que é exatamente o caso que esta consulta não vê, porque ela olha do banco para fora.

Ressalva sobre o futuro: a spec 161 torna a foto de ocorrência obrigatória, então o
volume de imagem vai crescer. A resposta para isso já está desenhada e é automática —
a retenção de cinco anos com expurgo (fase 5 da 161), não uma tela de exclusão manual.
