export default function LoadingInformacoesBagPage() {
  return (
    <>
      <section className="dashboard-grid">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Painel de entregadores</h2>
              <p>Carregando dados da base e indicadores operacionais...</p>
            </div>
            <span className="loading-chip">Carregando...</span>
          </div>

          <div className="entregadores-loading-bars">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={`bar-${index}`} className="loading-block loading-block-line" />
            ))}
          </div>

          <div className="entregadores-loading-notes">
            <div className="loading-block loading-block-card" />
            <div className="loading-block loading-block-card" />
          </div>

          <div className="status-chip-grid">
            {Array.from({ length: 5 }).map((_, index) => (
              <span key={`chip-${index}`} className="loading-chip-placeholder" />
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Graficos e tendencia</h2>
              <p>Montando leitura recente da operacao.</p>
            </div>
          </div>

          <div className="entregadores-loading-chart loading-block" />
          <div className="entregadores-loading-chart-grid">
            <div className="entregadores-loading-mini-chart loading-block" />
            <div className="entregadores-loading-mini-chart loading-block" />
          </div>
        </section>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Painel de entregadores</h2>
            <p>Preparando filtros, ranking e shortlist.</p>
          </div>
        </div>

        <section className="courier-filter-panel entregadores-loading-filter-panel">
          <div className="courier-filter-copy">
            <strong>Busca e filtros operacionais</strong>
            <p>Carregando campos do filtro...</p>
          </div>

          <div className="courier-toolbar courier-toolbar-stack">
            <div className="courier-toolbar-row courier-toolbar-row-primary">
              <div className="loading-block loading-block-input" />
              <div className="loading-block loading-block-input" />
            </div>

            <div className="courier-toolbar-row courier-toolbar-row-secondary">
              <div className="loading-block loading-block-input" />
              <div className="loading-block loading-block-input" />
              <div className="loading-block loading-block-input" />
            </div>

            <div className="courier-toolbar-row courier-toolbar-row-tertiary">
              <div className="loading-block loading-block-input" />
              <div className="courier-toolbar-actions">
                <div className="loading-block loading-block-button" />
                <div className="loading-block loading-block-button loading-block-button-secondary" />
              </div>
            </div>
          </div>
        </section>

        <div className="entregadores-loading-list">
          {Array.from({ length: 3 }).map((_, index) => (
            <article key={`courier-${index}`} className="user-card user-card-stack">
              <div className="entregadores-loading-card-top">
                <div className="loading-block loading-block-title" />
                <div className="loading-block loading-block-badge" />
              </div>
              <div className="entregadores-loading-lines">
                <div className="loading-block loading-block-text" />
                <div className="loading-block loading-block-text loading-block-text-short" />
                <div className="loading-block loading-block-text" />
              </div>
              <div className="entregadores-loading-stats">
                {Array.from({ length: 4 }).map((__, statIndex) => (
                  <div key={`stat-${index}-${statIndex}`} className="loading-block loading-block-stat" />
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
