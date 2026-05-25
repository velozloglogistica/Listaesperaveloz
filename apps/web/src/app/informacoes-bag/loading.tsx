export default function LoadingInformacoesBagPage() {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Entregadores</h2>
          <p>Abrindo o painel e conectando os indicadores operacionais.</p>
        </div>
        <span className="loading-chip">Carregando...</span>
      </div>
      <div className="entregadores-loading-bars">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={`bar-${index}`} className="loading-block loading-block-line" />
        ))}
      </div>
    </section>
  );
}
