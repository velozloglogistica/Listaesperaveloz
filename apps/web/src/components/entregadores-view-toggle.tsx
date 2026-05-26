"use client";

import { type ReactNode, useEffect, useState } from "react";

type EntregadoresView = "entregadores" | "performance";

type EntregadoresViewToggleProps = {
  initialView: EntregadoresView;
  entregadoresContent: ReactNode;
  performanceContent: ReactNode;
};

function syncViewInUrl(view: EntregadoresView) {
  const url = new URL(window.location.href);

  if (view === "performance") {
    url.searchParams.set("painel", "performance");
  } else {
    url.searchParams.delete("painel");
  }

  const nextUrl = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState(window.history.state, "", nextUrl);
}

export function EntregadoresViewToggle({
  initialView,
  entregadoresContent,
  performanceContent,
}: EntregadoresViewToggleProps) {
  const [activeView, setActiveView] = useState<EntregadoresView>(initialView);

  useEffect(() => {
    setActiveView(initialView);
  }, [initialView]);

  useEffect(() => {
    syncViewInUrl(activeView);
  }, [activeView]);

  return (
    <>
      {activeView === "performance" ? (
        <>
          {performanceContent}

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Painel de entregadores</h2>
                <p>Volte para a base operacional sem recarregar a pagina inteira.</p>
              </div>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setActiveView("entregadores")}
              >
                Voltar aos entregadores
              </button>
            </div>
          </section>
        </>
      ) : (
        <>
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Performance dos entregadores</h2>
                <p>Abra essa visao sem recarregar a tela e confira as regras de alerta.</p>
              </div>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setActiveView("performance")}
              >
                Verificar Performance
              </button>
            </div>
          </section>

          {entregadoresContent}
        </>
      )}
    </>
  );
}
