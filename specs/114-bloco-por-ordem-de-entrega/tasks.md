# Spec 114 — Tarefas

> 🤖 Modelo: `opus` (empacotador — `docs/domain/cargo-placement.md` lido antes)

| id  | tarefa                                                                                        | depende | verificação                                     | status |
| --- | --------------------------------------------------------------------------------------------- | ------- | ----------------------------------------------- | ------ |
| T1  | Contrato do bloco (`test/cargo-placement/delivery-block.contract.ts`) antes da implementação  | —       | falha nos 4 pontos esperados antes do código    | feita  |
| T2  | `placeDeliveryBlock`: bloco girado, sem espelho, pela ordem de entrega, deslocado até a porta | T1      | `bun test ./test/cargo-volume.contract.test.ts` | feita  |
| T3  | Face aberta na ponta da porta (`lineEnd`) no mapa de apoio                                    | T2      | idem                                            | feita  |
| T4  | Fileira seguinte na próxima borda de carga, com lista ordenada e busca binária                | T2      | peça de 3 m entra; contrato de 50 ms            | feita  |
| T5  | Sete contratos da 095/100 reescritos para a propriedade de descarga, com a razão no teste     | T2      | 212 pass                                        | feita  |
| T6  | `docs/domain/cargo-placement.md` e `CLAUDE.md`                                                | T2–T5   | leitura                                         | feita  |
