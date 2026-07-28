# ADR 0005 — Reserva fiscal idempotente e não reutilizável

- Status: aceito
- Data: 2026-07-19
- Decisores: mantenedor do projeto e revisão Opus

## Contexto

Um único `next_number` atualizado atomicamente evita duplicidade entre
transações concorrentes, mas não resolve retries. Se a chamada confirmar no
banco e perder a resposta, repetir a operação consumiria outro número e não
deixaria prova que relacionasse a tentativa original à reserva.

Numeração fiscal não pode depender de memória, lock de processo ou RabbitMQ.
Também não é seguro reutilizar ou decrementar um número já reservado, ainda que
a emissão futura não seja transmitida.

## Decisão

1. Manter uma sequência única por
   `(companyId, environment, model, series)`.
2. Representar série, próximo número e número reservado como `bigint` no
   domínio/banco e string decimal no HTTP.
3. Exigir uma `reservationKey` estável em toda reserva interna.
4. Criar `fiscal_sequence_reservations` como ledger append-only.
5. Garantir unique `(company_id, reservation_key)` e
   `(fiscal_sequence_id, number)`.
6. Persistir na reserva a sequência e comparar empresa, ambiente, modelo e série
   em todo replay. Reusar a chave para outra intenção falha com conflito seguro.
7. Executar incremento e inserção do ledger na mesma transação PostgreSQL.
8. Para chave já confirmada e mesma intenção, retornar o mesmo número com
   `isReplay=true`.
9. Para chave nova, atualizar a linha com `UPDATE ... RETURNING`, inserir o
   ledger, confirmar e somente então retornar o número.
10. Usar o lock de linha provocado pelo `UPDATE` para serializar reservas
    concorrentes. Não adicionar lock distribuído.
11. Se duas transações disputarem a mesma chave, tratar somente a violação
    `23505` da constraint esperada: executar rollback completo, abrir nova
    transação, reler a reserva e comparar a intenção. O incremento perdedor é
    desfeito pelo rollback antes da releitura.
12. Tornar série e número inicial imutáveis depois da primeira reserva.
13. Nunca remover, decrementar ou reutilizar uma reserva confirmada.
14. Manter a porta de reserva interna nesta feature, sem endpoint público ou
    fila.

## Contrato interno

```ts
type ReserveFiscalNumberInput = {
  readonly companyId: string
  readonly environment: 'homologation' | 'production'
  readonly model: 'cte'
  readonly series: bigint
  readonly reservationKey: string
}

type FiscalNumberReservation = {
  readonly sequenceId: string
  readonly number: bigint
  readonly isReplay: boolean
}
```

## Transação

1. localizar uma reserva confirmada pela chave tenant-scoped;
2. se existir, retornar o mesmo número;
3. para chave nova, executar:

```sql
UPDATE fiscal_sequences
SET last_reserved_number = next_number,
    next_number = next_number + 1,
    version = version + 1,
    updated_at = now()
WHERE company_id = :company_id
  AND environment = :environment
  AND model = :model
  AND series = :series
RETURNING id, last_reserved_number;
```

4. inserir a reserva no ledger;
5. confirmar a transação;
6. retornar o número somente após o commit.

Uma corrida na mesma `reservationKey` é resolvida pela constraint. A transação
perdedora fica abortada após `23505`, faz rollback completo — incluindo seu
incremento — e só então abre nova transação para reler a reserva vencedora. Se
empresa, ambiente, modelo ou série divergirem, retorna conflito em vez do número.

## Consequências

- retries deixam de queimar números adicionais;
- toda reserva possui evidência auditável e tenant-scoped;
- concorrência é resolvida pelo PostgreSQL, inclusive com várias instâncias;
- uma reserva pode criar lacuna se a emissão futura não chegar à transmissão;
- inutilização e tratamento legal de lacunas continuam fora desta feature;
- armazenamento cresce de forma append-only e exigirá política operacional
  futura, sem exclusão automática nesta fase.

## Segurança e testes

- 20 chaves distintas na mesma sequência produzem números únicos e monotônicos;
- 20 chamadas da mesma chave produzem um número e uma linha no ledger;
- a corrida de mesma chave prova que o incremento perdedor sofreu rollback;
- a mesma chave com ambiente, modelo ou série diferente produz conflito;
- empresas, ambientes e séries permanecem independentes;
- não aceitar `companyId` fornecido pelo cliente;
- série ou número inicial não mudam depois da primeira reserva;
- rollback antes do commit não retorna número ao chamador;
- falhas não expõem reservation key, empresa ou detalhes do banco em logs;
- constraints e queries sempre incluem `company_id`.

## Rollback

Antes de existir emissão, o rollback manual remove primeiro reservas e depois
sequências. Após dados reais, reservas não são apagadas: correções são
roll-forward e preservam o ledger.
