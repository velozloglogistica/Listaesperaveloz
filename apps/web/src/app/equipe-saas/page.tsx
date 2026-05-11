import { AppShell } from "@/components/app-shell";
import { PlatformUserForm } from "@/components/platform-user-form";
import { SummaryCard } from "@/components/summary-card";
import { requirePlatformAdmin } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

async function getPlatformUsers() {
  const { data, error } = await supabaseServer
    .from("app_users")
    .select("id,full_name,email,role,is_platform_admin,is_active,created_at")
    .eq("is_platform_admin", true)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
}

export default async function EquipeSaasPage() {
  const currentUser = await requirePlatformAdmin();
  const platformUsers = await getPlatformUsers();
  const owners = platformUsers.filter((user) => user.role === "owner");
  const staff = platformUsers.filter((user) => user.role !== "owner");

  return (
    <AppShell
      currentPath="/equipe-saas"
      title="Equipe SaaS"
      description="Cadastre funcionarios e novos owners com o mesmo painel e funcionalidades do owner principal."
      user={currentUser}
    >
      <section className="summary-grid">
        <SummaryCard title="Equipe SaaS" value={platformUsers.length} />
        <SummaryCard title="Owners SaaS" value={owners.length} />
        <SummaryCard title="Funcionarios SaaS" value={staff.length} />
        <SummaryCard
          title="Ativos"
          value={platformUsers.filter((user) => user.is_active).length}
        />
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Novo acesso da equipe</h2>
            <p>
              Use essa area para criar funcionarios e owners do SaaS com a mesma interface que a
              sua.
            </p>
          </div>
        </div>
        <PlatformUserForm />
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Equipe cadastrada</h2>
            <p>
              Owners e funcionarios SaaS entram no mesmo painel. A diferenca aqui e apenas
              organizacional.
            </p>
          </div>
        </div>

        <div className="users-list">
          {platformUsers.map((user) => (
            <article key={user.id} className="user-card">
              <div>
                <strong>{user.full_name}</strong>
                <p>{user.email}</p>
              </div>
              <div className="user-card-meta">
                <span className="day-chip">
                  {user.role === "owner" ? "Owner SaaS" : "Funcionario SaaS"}
                </span>
                <span className="request-time">{user.is_active ? "Ativo" : "Inativo"}</span>
              </div>
            </article>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
