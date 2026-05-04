import { UsedToggleForm } from "@/components/used-toggle-form";
import type { WaitlistRequest } from "@/lib/types";

const horarioOrder: Record<string, number> = {
  "Almoço": 1,
  Merenda: 2,
  Jantar: 3,
};

const pracaOrder = ["Chapada", "Ponta Negra", "Santa Etelvina", "Tancredo Neves"];

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Manaus",
  }).format(new Date(value));
}

function formatPhone(phone: string) {
  const clean = phone.replace(/\D/g, "");
  if (clean.length === 11) {
    return `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7)}`;
  }
  if (clean.length === 10) {
    return `(${clean.slice(0, 2)}) ${clean.slice(2, 6)}-${clean.slice(6)}`;
  }
  return phone;
}

function rawCpf(cpf: string) {
  return cpf.replace(/\D/g, "");
}

function formatScaleDate(value: string) {
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}`;
}

function displayScaleLabel(request: WaitlistRequest) {
  if (request.origem !== "manual") {
    return request.escala_dia_label;
  }

  const date = new Date(`${request.escala_data}T12:00:00Z`);
  const label = new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    timeZone: "UTC",
  }).format(date);

  return label.replace(".", "");
}

function sortRequests(items: WaitlistRequest[]) {
  return [...items].sort((a, b) => {
    if (Boolean(a.is_used) !== Boolean(b.is_used)) {
      return Number(Boolean(a.is_used)) - Number(Boolean(b.is_used));
    }
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });
}

function buildMatrix(requests: WaitlistRequest[]) {
  const grouped = requests.reduce<Record<string, Record<string, WaitlistRequest[]>>>((acc, item) => {
    const horario = item.horario_label;
    const praca = item.praca;

    if (!acc[horario]) acc[horario] = {};
    if (!acc[horario][praca]) acc[horario][praca] = [];

    acc[horario][praca].push(item);
    return acc;
  }, {});

  return Object.entries(grouped)
    .map(([horario, pracas]) => ({
      horario,
      pracas: pracaOrder.map((praca) => ({
        praca,
        items: sortRequests(pracas[praca] || []),
      })),
    }))
    .sort((a, b) => (horarioOrder[a.horario] || 99) - (horarioOrder[b.horario] || 99));
}

export function GroupedBoard({ requests }: { requests: WaitlistRequest[] }) {
  if (requests.length === 0) {
    return (
      <div className="empty-state">
        <h2>Nenhum nome na fila</h2>
        <p>Quando alguém entrar pela lista de espera, vai aparecer aqui.</p>
      </div>
    );
  }

  const grouped = buildMatrix(requests);

  return (
    <div className="board-sections">
      <div className="overview-grid">
        {grouped.map((group) => (
          <section key={`overview-${group.horario}`} className="overview-card">
            <div className="overview-header">
              <h3>{group.horario}</h3>
              <span>
                {group.pracas.reduce((acc, item) => acc + item.items.filter((req) => !req.is_used).length, 0)}{" "}
                disponível(is)
              </span>
            </div>
            <div className="overview-slots">
              {group.pracas.map((slot) => {
                const usedCount = slot.items.filter((item) => item.is_used).length;
                const availableCount = slot.items.length - usedCount;
                return (
                  <a key={`${group.horario}-${slot.praca}`} href={`#${group.horario}-${slot.praca}`} className="overview-slot">
                    <strong>{slot.praca}</strong>
                    <span>{availableCount} livres</span>
                    <small>{usedCount} usados</small>
                  </a>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {grouped.map((group) => (
        <section key={group.horario} className="time-section">
          <div className="time-section-header">
            <div>
              <h3>{group.horario}</h3>
              <p>Organizado por hotzone para bater o olho e puxar o próximo nome.</p>
            </div>
          </div>

          <div className="time-grid">
            {group.pracas.map((slot) => {
              const usedCount = slot.items.filter((item) => item.is_used).length;
              const availableCount = slot.items.length - usedCount;

              return (
                <div
                  key={`${group.horario}-${slot.praca}`}
                  id={`${group.horario}-${slot.praca}`}
                  className="zone-column"
                >
                  <div className="zone-header">
                    <div>
                      <h3>{slot.praca}</h3>
                      <span>{availableCount} disponível(is)</span>
                    </div>
                    <span>{usedCount} usado(s)</span>
                  </div>

                  <div className="zone-body">
                    {slot.items.length === 0 ? (
                      <div className="slot-empty">Sem nomes nesta combinação.</div>
                    ) : (
                      slot.items.map((request) => (
                        <article
                          key={request.id}
                          className={`request-card${request.is_used ? " request-card-used" : ""}`}
                        >
                          <div className="request-card-top">
                            <div>
                              <strong>{request.nome}</strong>
                              <p>{formatPhone(request.telefone)}</p>
                              <p>{rawCpf(request.cpf)}</p>
                            </div>
                            <div className="request-meta">
                              <span className="day-chip">{displayScaleLabel(request)}</span>
                              <span className="request-time">{formatScaleDate(request.escala_data)}</span>
                              <span className="request-time">{formatDate(request.created_at)}</span>
                            </div>
                          </div>

                          <div className="request-card-bottom">
                            <div className="request-note">
                              {request.is_used
                                ? `Ja usado${request.used_at ? ` as ${formatDate(request.used_at)}` : ""}`
                                : "Aguardando substituicao"}
                            </div>
                            <UsedToggleForm id={request.id} isUsed={Boolean(request.is_used)} />
                          </div>
                        </article>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
