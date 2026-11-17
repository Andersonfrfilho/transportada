# Tasks — 343

Ordem de publicação (ADR-0081 §9): painel tolerante → API → telas. Teste antes da implementação, uma task por vez.

- [ ] T1 Migration: `occurrence_kind` em `occurrence_contractor_manual_notices` + FK removida (rollback ao lado, snapshot).
- [ ] T2 `findPlan`/`sendManual`/`readNoticeState` aceitam ocorrência de parada com nota (valores do e-mail e do grupo
      lidos da ocorrência de parada + nota); parada sem nota devolve estado `unavailable: no_document`.
- [ ] T3 Painel: `ContractorNoticeSection` em toda ocorrência; desabilitado com motivo quando sem nota.
- [ ] T4 Camada de correção do endereço do cliente (tabela, escritor, leitura em `resolvePhysicalDestination`, contratos de
      isolamento e de precedência).
- [ ] T5 Tela de correção (texto + pino) na ocorrência; invalida coordenada; auditoria.
- [ ] T6 "Pedir correção do endereço" na ocorrência (e-mail e WhatsApp do grupo).
- [ ] T7 Modelo WhatsApp `ocorrencia.correcao-endereco` + script de publicação + prints claro/escuro, desktop/celular.
