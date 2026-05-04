import { redirect } from "next/navigation";

import { bootstrapOwnerAction, signInAction } from "@/app/auth-actions";
import { LogoutForm } from "@/components/logout-form";
import { getCurrentAppUser, ownerExists } from "@/lib/auth";

function loginErrorMessage(error?: string) {
  switch (error) {
    case "credenciais_obrigatorias":
      return "Preencha email e senha para entrar.";
    case "login_invalido":
      return "Email ou senha invalidos.";
    case "owner_ja_existe":
      return "Ja existe um owner cadastrado neste painel.";
    case "dados_bootstrap_invalidos":
      return "Preencha corretamente os dados do primeiro owner.";
    case "erro_ao_criar_owner":
      return "Nao foi possivel criar o owner no Auth.";
    case "erro_ao_salvar_owner":
      return "Nao foi possivel salvar o perfil do owner.";
    case "sem_permissao":
      return "Seu login nao tem acesso ao painel.";
    default:
      return "";
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const currentUser = await getCurrentAppUser();

  if (currentUser?.can_access_waitlist) {
    redirect("/");
  }

  const hasOwner = await ownerExists();
  const resolvedParams = (await searchParams) || {};
  const errorParam = Array.isArray(resolvedParams.error)
    ? resolvedParams.error[0]
    : resolvedParams.error;
  const errorMessage = loginErrorMessage(errorParam);

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="eyebrow">VelozLog</p>
        <h1>{hasOwner ? "Entrar no painel" : "Criar primeiro owner"}</h1>
        <p className="hero-copy">
          {hasOwner
            ? "Acesso restrito ao time autorizado. Entre com seu login para abrir os modulos."
            : "Primeira configuracao do painel. Esse login owner vai gerenciar os acessos das areas."}
        </p>

        {errorMessage ? <p className="auth-error">{errorMessage}</p> : null}

        {currentUser && !currentUser.can_access_waitlist ? (
          <div className="auth-block">
            <p className="auth-error">
              Seu login existe, mas ainda nao tem acesso ao modulo Lista de espera.
            </p>
            <LogoutForm />
          </div>
        ) : null}

        {hasOwner && !currentUser ? (
          <form action={signInAction} className="auth-form">
            <input className="text-input" type="email" name="email" placeholder="Email" required />
            <input
              className="text-input"
              type="password"
              name="password"
              placeholder="Senha"
              required
            />
            <button type="submit" className="primary-button">
              Entrar
            </button>
          </form>
        ) : !hasOwner ? (
          <form action={bootstrapOwnerAction} className="auth-form">
            <input
              className="text-input"
              type="text"
              name="full_name"
              placeholder="Nome completo do owner"
              required
            />
            <input
              className="text-input"
              type="email"
              name="email"
              placeholder="Email do owner"
              required
            />
            <input
              className="text-input"
              type="password"
              name="password"
              placeholder="Senha inicial"
              minLength={8}
              required
            />
            <button type="submit" className="primary-button">
              Criar owner
            </button>
          </form>
        ) : null}
      </section>
    </main>
  );
}
