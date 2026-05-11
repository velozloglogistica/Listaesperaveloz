import { AppShell } from "@/components/app-shell";
import { ProfilePasswordForm } from "@/components/profile-password-form";
import { requireAppUser } from "@/lib/auth";

export default async function PerfilPage() {
  const currentUser = await requireAppUser();

  return (
    <AppShell
      currentPath="/perfil"
      title="Perfil"
      description="Atualize sua senha de acesso ao painel. A nova senha passa a valer no seu login oficial."
      user={currentUser}
    >
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Minha conta</h2>
            <p>Esses dados identificam o usuario logado no sistema.</p>
          </div>
        </div>

        <div className="profile-summary">
          <div className="profile-summary-card">
            <span>Nome</span>
            <strong>{currentUser.full_name}</strong>
          </div>
          <div className="profile-summary-card">
            <span>Email</span>
            <strong>{currentUser.email}</strong>
          </div>
          <div className="profile-summary-card">
            <span>Empresa atual</span>
            <strong>{currentUser.current_tenant.name}</strong>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Seguranca</h2>
            <p>Troque sua senha quando quiser. A partir da alteracao, o login passa a usar a nova senha.</p>
          </div>
        </div>

        <ProfilePasswordForm />
      </section>
    </AppShell>
  );
}
