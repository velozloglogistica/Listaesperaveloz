import os
from datetime import datetime
from uuid import uuid4

import requests
from dotenv import load_dotenv
from supabase import Client, create_client


load_dotenv()


def clean_config_value(value: str | None) -> str:
    return (value or "").strip().strip("`").strip()


SUPABASE_URL = clean_config_value(os.getenv("SUPABASE_URL"))
SUPABASE_SERVICE_ROLE_KEY = clean_config_value(os.getenv("SUPABASE_SERVICE_ROLE_KEY"))
SLACK_WEBHOOK = clean_config_value(os.getenv("SLACK_WEBHOOK"))
TENANT_ID = clean_config_value(os.getenv("PERFORMANCE_TENANT_ID"))

PERFORMANCE_TABLE = clean_config_value(os.getenv("PERFORMANCE_TABLE")) or "performance"
NOTIFICATION_TABLE = clean_config_value(os.getenv("PERFORMANCE_NOTIFICATION_TABLE")) or "performance_notification_logs"

if not SUPABASE_URL:
    raise RuntimeError("SUPABASE_URL nao configurado.")

if not SUPABASE_SERVICE_ROLE_KEY:
    raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY nao configurado.")

if not SLACK_WEBHOOK:
    raise RuntimeError("SLACK_WEBHOOK nao configurado.")

if not TENANT_ID:
    raise RuntimeError("PERFORMANCE_TENANT_ID nao configurado.")


supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


def parse_percent(value) -> float | None:
    if value is None or value == "":
        return None

    if isinstance(value, (int, float)):
        parsed = float(value)
        return parsed * 100 if abs(parsed) <= 1 else parsed

    try:
        normalized = str(value).replace("%", "").replace(",", ".").strip()
        parsed = float(normalized)
        return parsed * 100 if abs(parsed) <= 1 else parsed
    except (TypeError, ValueError):
        return None


def parse_int(value) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def normalize_date(value) -> str:
    if not value:
        return datetime.now().strftime("%Y-%m-%d")

    text = str(value).strip()
    return text[:10]


def buscar_dados() -> list[dict]:
    hoje = datetime.now().strftime("%Y-%m-%d")

    response = (
        supabase.table(PERFORMANCE_TABLE)
        .select("*")
        .eq("tenant_id", TENANT_ID)
        .gte("data_coleta", hoje)
        .execute()
    )

    return response.data or []


def montar_alertas(dados: list[dict]) -> list[dict]:
    alertas: list[dict] = []

    for row in dados:
        try:
            pedidos = parse_int(row.get("pedidos"))

            if pedidos < 1:
                continue

            rejeitados = parse_int(row.get("pedidos_rejeitados"))
            cancelados = parse_int(row.get("pedidos_cancelados"))
            ofertados = parse_int(row.get("pedidos_ofertados"))

            tsh = parse_percent(row.get("tsh"))
            ar = parse_percent(row.get("ar"))
            caa = parse_percent(row.get("caa"))
            overtime = parse_percent(row.get("overtime"))

            reason_codes: list[str] = []
            motivos: list[str] = []

            if rejeitados >= 4:
                reason_codes.append("alta_rejeicao")
                motivos.append(
                    f"Alta rejeicao: {rejeitados} pedidos rejeitados (AR {row.get('ar') or 'sem dado'})"
                )

            raw_ar = str(row.get("ar") or "").strip().lower()
            if raw_ar in {"0%", "0,0%", "0.0%", "0"} or ar == 0:
                reason_codes.append("ar_zerado")
                motivos.append("AR zerado (0%) -> entregador recusando tudo")

            if cancelados >= 1:
                reason_codes.append("cancelamento_detectado")
                motivos.append(
                    f"Cancelamento detectado: {cancelados} (CAA {row.get('caa') or 'sem dado'})"
                )

            if not motivos:
                continue

            severity = "moderado"
            if "ar_zerado" in reason_codes or len(reason_codes) >= 3:
                severity = "critico"
            elif len(reason_codes) >= 2:
                severity = "alto"

            alert_message = (
                "🚨 *ALERTA DE PERFORMANCE*\n\n"
                f"👤 {row.get('nome') or 'Sem nome'}\n"
                f"📞 {row.get('telefone') or 'Sem telefone'}\n"
                f"🕐 {row.get('horario') or 'Sem horario'}\n"
                f"📍 {row.get('praca') or 'Sem praca'}\n\n"
                "❗ Motivo:\n- "
                + "\n- ".join(motivos)
            )

            alertas.append(
                {
                    "tenant_id": TENANT_ID,
                    "source_table": PERFORMANCE_TABLE,
                    "source_date": normalize_date(row.get("data_coleta")),
                    "courier_name": str(row.get("nome") or "").strip() or "Sem nome",
                    "courier_phone": str(row.get("telefone") or "").strip() or None,
                    "horario": str(row.get("horario") or "").strip() or None,
                    "praca": str(row.get("praca") or "").strip() or None,
                    "pedidos": pedidos,
                    "pedidos_ofertados": ofertados,
                    "pedidos_rejeitados": rejeitados,
                    "pedidos_cancelados": cancelados,
                    "tsh": tsh,
                    "ar": ar,
                    "caa": caa,
                    "overtime": overtime,
                    "severity": severity,
                    "reason_codes": reason_codes,
                    "reason_text": " | ".join(motivos),
                    "slack_alert_text": alert_message,
                    "payload": row,
                }
            )
        except Exception as error:
            print(f"Erro ao analisar registro: {error}")

    return alertas


def montar_mensagem_slack(alertas: list[dict]) -> str:
    cabecalho = (
        "📊 *Monitoramento de Performance*\n\n"
        f"📅 {datetime.now().strftime('%d/%m/%Y')}\n"
        f"⏰ {datetime.now().strftime('%H:%M:%S')}\n\n"
        f"🚨 Total de alertas: {len(alertas)}\n"
    )

    detalhes = "\n\n".join(alerta["slack_alert_text"] for alerta in alertas)
    return cabecalho + "\n" + detalhes


def salvar_notificacoes(
    alertas: list[dict],
    run_reference: str,
    slack_message: str,
    was_sent: bool,
    status_code: int | None,
    response_body: str,
) -> None:
    if not alertas:
        return

    rows = []
    timestamp = datetime.now().isoformat()

    for alerta in alertas:
        rows.append(
            {
                "tenant_id": alerta["tenant_id"],
                "source_table": alerta["source_table"],
                "source_date": alerta["source_date"],
                "notified_at": timestamp,
                "run_reference": run_reference,
                "courier_name": alerta["courier_name"],
                "courier_phone": alerta["courier_phone"],
                "horario": alerta["horario"],
                "praca": alerta["praca"],
                "pedidos": alerta["pedidos"],
                "pedidos_ofertados": alerta["pedidos_ofertados"],
                "pedidos_rejeitados": alerta["pedidos_rejeitados"],
                "pedidos_cancelados": alerta["pedidos_cancelados"],
                "tsh": alerta["tsh"],
                "ar": alerta["ar"],
                "caa": alerta["caa"],
                "overtime": alerta["overtime"],
                "severity": alerta["severity"],
                "reason_codes": alerta["reason_codes"],
                "reason_text": alerta["reason_text"],
                "slack_status_code": status_code,
                "slack_response_body": response_body[:4000],
                "slack_message": slack_message,
                "was_sent": was_sent,
                "payload": alerta["payload"],
            }
        )

    supabase.table(NOTIFICATION_TABLE).insert(rows).execute()


def enviar_slack(alertas: list[dict]) -> None:
    if not alertas:
        print("Nenhum alerta encontrado.")
        return

    run_reference = str(uuid4())
    slack_message = montar_mensagem_slack(alertas)

    try:
        response = requests.post(
            SLACK_WEBHOOK,
            json={"text": slack_message},
            timeout=20,
        )
        was_sent = response.ok and response.text.strip().lower() == "ok"

        salvar_notificacoes(
            alertas=alertas,
            run_reference=run_reference,
            slack_message=slack_message,
            was_sent=was_sent,
            status_code=response.status_code,
            response_body=response.text,
        )

        if was_sent:
            print(f"Slack enviado com sucesso. Alertas salvos em {NOTIFICATION_TABLE}.")
        else:
            print(
                f"Slack retornou falha ({response.status_code}): {response.text}"
            )
    except Exception as error:
        salvar_notificacoes(
            alertas=alertas,
            run_reference=run_reference,
            slack_message=slack_message,
            was_sent=False,
            status_code=None,
            response_body=str(error),
        )
        print(f"Erro ao enviar para o Slack: {error}")


def main() -> None:
    print("Buscando dados de performance no Supabase...")
    dados = buscar_dados()
    print(f"Total de registros encontrados: {len(dados)}")

    alertas = montar_alertas(dados)
    print(f"Total de alertas gerados: {len(alertas)}")

    enviar_slack(alertas)
    print("Processo finalizado.")


if __name__ == "__main__":
    main()
