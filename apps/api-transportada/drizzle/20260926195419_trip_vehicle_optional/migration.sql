-- Spec 216: a viagem pode nascer sem veículo, quando o motorista/agregado ainda não está pronto
-- (`status: 'awaiting_crew'`, adicionado em migration própria). Aditiva por inteiro — dado existente
-- não muda, e o FK composto `trips_company_vehicle_fk` não se aplica a uma coluna nula (MATCH
-- SIMPLE), então nenhuma viagem já gravada perde a checagem que tinha.
ALTER TABLE "trips" ALTER COLUMN "vehicle_id" DROP NOT NULL;
