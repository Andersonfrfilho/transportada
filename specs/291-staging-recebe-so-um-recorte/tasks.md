# Tasks — spec 291

- [x] T1 Mapa de dependências e política por tabela (`prune-source.sql`, `refresh_work.policy`).
- [x] T2 Banco temporário + recorte + dump recortado no `staging-refresh.sh`; `prune-source.sql` na imagem.
- [x] T3 Contatos fictícios no recorte (formatos dos CHECK).
- [x] T4 Contrato: toda tabela do Drizzle tem política; recorte antes do drop de schemas; cleanup do banco temporário.
- [x] T5 Medida em Postgres descartável com as migrations reais (ver spec).
- [ ] T6 Primeiro ciclo real em staging: conferir `staging_refresh_source_pruned`, espaço em disco e `CREATEDB` (depende do conserto do token, outra thread).
