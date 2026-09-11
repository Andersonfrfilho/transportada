# Spec 120 — Plano

> 🤖 Modelo: `opus` (empacotador — decisão estrutural medida) · frontend `sonnet`

1. Contratos antes do código (`test/cargo-placement/complement.contract.ts`), afirmando propriedade nas
   quatro viagens reais do fixture: tudo desenhado quando cabe de pé; o recomendado sozinho passa a 118;
   o complemento não quebra física nem apoio na descarga; só o complemento trava; só `needsRehandling`
   fura a ordem; pedaços por contato de face.
2. `packSlice` devolve `overflow` (cada unidade `bedFull` ou sobra) e guarda o primeiro lugar recusado só
   pela mão (`reachFallback`); a gêmea procura em volta da última e nas fileiras já achadas.
3. `placeComplement` no fim do bloco por ordem de entrega: `needsRehandling`, encostado na nota primeiro.
4. `resolveSplitNotes` em `resolveCargoPlacement`, sobre o que o desenho mostra.
5. Tempo: memória de um item do pacote em profundidade (`lastDepthPacking`) entre a decisão e o desenho;
   condições baratas antes da esbeltez.
6. Contratos antigos reescritos com a razão (`dead-space` volta ao caso isolado; `unloading`,
   `real-mixed-cargo`, `note-identity`, `placement`).
7. Frontend: marca, legenda, folha, resumo, nota dividida, locales, contratos.
8. Documentação: `docs/domain/cargo-placement.md`, `CLAUDE.md`, evidência.
