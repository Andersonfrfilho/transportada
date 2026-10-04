# Plano — 237

## Decomposição (cada fase se publica sozinha)

1. **Perfil do contratante + ficha** (aba "Contratantes"): dado e tela; nada muda para quem não tem perfil.
2. **Chegada e primeira separação** (eixo próprio, eventos, relógios), sem prévia ainda: o operador registra a
   chegada e organiza as notas já existentes.
3. **Avaria sem viagem** (RF8): ocorrência pertencente à nota da chegada; a decisão 🧠.
4. **Prévia por e-mail** (RF2–RF5): webhook → outbox → worker, leitura de planilha, casamento por chave.
5. **Proposta de roteiros** (RF7): ponte para a sugestão multi-veículo.

A ordem põe o que já entrega valor sem planilha (2 e 3) antes do que depende do formato real (D1).

## Decisões de desenho

- **Eixo próprio do recebimento**, antes da viagem; `separation_status` não é tocado (ADR-0043/0074). A nota
  entra na viagem como `pending`, trazendo a rota decidida (`route_ref`) — a viagem a usa como sugestão, não
  como verdade (o aceite continua do ADR-0044 §5).
- **Perfil como dado** (ADR-0021/0048): tabela por contratante com FK composta, no molde de
  `delivery_proof_setting_contractor_overrides`. Ausência = fluxo atual. Nenhum CNPJ em `src/`.
- **E-mail:** reaproveitar webhook assinado, `contractor_inbound_email_outbox`, relay e worker; acrescentar o
  ramo "prévia" resolvido pelo token do perfil. **Não** relaxar a regra "sem token, descarta".
- **Planilha:** worker, nunca a API; leitor próprio sobre `fflate` + `fast-xml-parser` (já na API),
  com tetos de zip, descompressão, linhas e tempo — decisão e alternativas no ADR-0094 §7 (T4.1).
- **Ocorrência sem viagem:** coluna `cargo_arrival_document_id` ao lado de `trip_document_id`, `CHECK`
  exatamente-um, em vez de relaxar `NOT NULL` e perder a garantia; ou tabela irmã — a escolha é 🧠 com
  `architect` (impacto em tratativa 164, portal 063/183, seed de tipos, `leaves_document_behind`).
- **Relógio da chegada:** `arrived_at` segue a regra da 234 (momento do evento, não da chegada ao
  servidor) quando registrado por app.
- **Roteirização:** só notas `matched` (têm `nfe_documents`), pelo endpoint que existe.

## Riscos

- **D1 é bloqueante para a Fase 4:** sem exemplo real, o mapeamento de colunas é chute.
- XLSX (zip) é superfície de ataque: limites de tamanho, de linhas, de descompressão e de tempo.
- A ocorrência sem viagem toca três specs vivas (157/164/183); regressão na tratativa é o maior risco.
- O contratante pode não aceitar mandar a um endereço novo (D6); o fallback é encaminhamento.
- Volume de trabalho grande: por isso 5 fases publicáveis separadamente.
- Outras sessões usam 235 e 234 em worktrees; reconferir numeração de spec e ADR no publish.
