# Evidence — spec 227

Base: `origin/staging` em `8b057713f`. Branch `work/driver-queue-resilience`.

## Vermelho antes (T1.1)

`queue-discard.contract.ts` e `queue-retention.contract.ts` no app novo: o módulo
`queueDiscard.service` não existia e as funções de prazo ainda eram exportadas.

## Prova por mutação (T1.5)

| #   | Mutação                                                   | Resultado |
| --- | --------------------------------------------------------- | --------- |
| 1   | app novo: anexo antigo deixa de contar na pendência       | 8 falhas  |
| 2   | app novo: `5xx` vira descartável                          | 2 falhas  |
| 3   | app novo: `REQUEST_FAILED` vira descartável               | 1 falha   |
| 4   | app novo: "Descartar" aparece para qualquer item          | 1 falha   |
| 5   | app novo: volta uma chamada de descarte por idade no hook | 1 falha   |
| 6   | legado: anexo antigo deixa de contar                      | 3 falhas  |

Restaurado: 910 pass (app novo) e 281 pass (legado, contrato do driver-trip).

## Revisão de design (T1.6)

`test/spec-227-prints.smoke.spec.ts` (login real, API de smoke com a ocorrência respondendo `409`):
`prints/recusado-com-descartar-375-*.png` e `prints/recusado-confirmacao-375-*.png`. Achado: na
confirmação, "Enviar agora / Descartar" ficava abaixo de "Descartar mesmo assim" — dois "Descartar"
próximos. A linha agora some enquanto a confirmação está aberta.
