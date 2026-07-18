const services = [
  ['API', 'Fundação pronta para health checks'],
  ['Worker', 'Processamento assíncrono isolado'],
  ['PostgreSQL', 'Persistência transacional'],
  ['Redis', 'Filas e coordenação'],
] as const

export default function Home() {
  return (
    <main>
      <section className="hero">
        <p className="eyebrow">TransportAdA · Fundação</p>
        <h1>O fluxo fiscal, sem perder o controle.</h1>
        <p className="lead">
          Plataforma multiempresa preparada para importar NF-e, calcular frete, emitir CT-e e
          faturar com rastreabilidade.
        </p>
      </section>
      <section className="grid" aria-label="Estado dos componentes">
        {services.map(([name, description]) => (
          <article key={name}>
            <span className="status" aria-label="configurado" />
            <h2>{name}</h2>
            <p>{description}</p>
          </article>
        ))}
      </section>
      <footer>Feature 001 · Nenhuma operação fiscal habilitada</footer>
    </main>
  )
}
