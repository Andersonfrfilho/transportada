# Plano — 073 A entrega tem endereço próprio

## Forma da solução

Um **seam só**, copiado por valor onde a fronteira exigir, e sete chamadores.

A resolução é uma junção SQL: hoje cada consulta faz
`join nfe_participants on role = 'recipient'`; passa a fazer um `left join` do papel
`delivery` e um do `recipient`, e escolhe o primeiro cujo endereço monta chave
(`coalesce` sobre as colunas, na ordem `delivery → recipient`). Isso satisfaz a RF3 sem
segunda ida ao banco e mantém a listagem numa consulta só.

O construtor da expressão mora em **um** arquivo por app:

- `apps/api-transportada/src/nfe-documents/infrastructure/physical-destination.join.ts`
- `apps/worker-transportada/src/routing/infrastructure/physical-destination.join.ts` — cópia
  por valor, como `pool-address-key.ts` já é, com contrato que compara os dois arquivos.

A ordem de ataque segue o risco: primeiro o que é fiscal (MDF-e), porque errar ali sai no XML
transmitido; depois o roteiro; por último a geocodificação, que é a mais barata de corrigir
depois.

## Ordem

- **Fase 0** — medir (D2). Sem medição não se sabe se há dado histórico.
- **Fase A** — o seam e o contrato de fronteira (RF1, RF2, RF8).
- **Fase B** — MDF-e (P2/RF6) — o consumidor com efeito fiscal.
- **Fase C** — viagem, solver e desvio (P1/P4).
- **Fase D** — geocodificação adiantada (P3) e cliente de entrega.
- **Fase E** — fecho: `make check`, evidência.

## Riscos

- **A junção dupla piora plano de consulta** na listagem de notas, que já é a consulta mais
  pesada do produto. Mitigação: `EXPLAIN` antes e depois na T-A3, e o índice
  `nfe_participants (company_id, nfe_document_id, role)` conferido antes de otimizar qualquer
  outra coisa.
- **Sete chamadores, um seam** — a tentação é converter todos numa task só. Cada um tem
  contrato próprio e caminho de teste próprio; convertê-los juntos é o jeito de um passar sem
  ninguém olhar.
