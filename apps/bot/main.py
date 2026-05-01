import logging
import os
import re
from datetime import datetime, timedelta
from typing import Optional
from zoneinfo import ZoneInfo

from dotenv import load_dotenv
from supabase import Client, create_client
from telegram import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    ReplyKeyboardMarkup,
    ReplyKeyboardRemove,
    Update,
)
from telegram.constants import ChatType
from telegram.ext import (
    Application,
    CallbackQueryHandler,
    CommandHandler,
    ContextTypes,
    ConversationHandler,
    MessageHandler,
    filters,
)


logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger(__name__)

load_dotenv()


BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
PUBLIC_BOT_USERNAME = os.getenv("TELEGRAM_BOT_USERNAME", "Velozlog_lista_bot")

if not BOT_TOKEN:
    raise RuntimeError("TELEGRAM_BOT_TOKEN nao configurado.")
if not SUPABASE_URL:
    raise RuntimeError("SUPABASE_URL nao configurado.")
if not SUPABASE_SERVICE_ROLE_KEY:
    raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY nao configurado.")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


PRACAS = {
    "chapada": "Chapada",
    "ponta_negra": "Ponta Negra",
    "santa_etelvina": "Santa Etelvina",
    "tancredo_neves": "Tancredo Neves",
}

HORARIOS = {
    "Almoço": ("11:00:00", "14:00:00"),
    "Merenda": ("14:00:00", "18:00:00"),
    "Jantar": ("18:00:00", "22:00:00"),
}

DAY_OPTIONS_BY_WEEKDAY = {
    4: ["Sexta", "Sábado", "Domingo"],
}

MANAUS_TZ = ZoneInfo("America/Manaus")

(
    ESCOLHER_PRACA,
    ESCOLHER_HORARIO,
    ESCOLHER_DIA,
    DIGITAR_NOME,
    DIGITAR_CPF,
    DIGITAR_TELEFONE,
    CONFIRMAR,
) = range(7)


def sanitize_digits(value: str) -> str:
    return re.sub(r"\D", "", value or "")


def cpf_valido(cpf: str) -> bool:
    cpf = sanitize_digits(cpf)
    return len(cpf) == 11 and len(set(cpf)) > 1


def telefone_valido(telefone: str) -> bool:
    telefone = sanitize_digits(telefone)
    return 10 <= len(telefone) <= 13


def format_cpf(cpf: str) -> str:
    cpf = sanitize_digits(cpf)
    if len(cpf) != 11:
        return cpf
    return f"{cpf[:3]}.{cpf[3:6]}.{cpf[6:9]}-{cpf[9:]}"


def format_phone(phone: str) -> str:
    phone = sanitize_digits(phone)
    if len(phone) == 11:
        return f"({phone[:2]}) {phone[2:7]}-{phone[7:]}"
    if len(phone) == 10:
        return f"({phone[:2]}) {phone[2:6]}-{phone[6:]}"
    return phone


def praca_keyboard() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        [[name] for name in PRACAS.values()],
        resize_keyboard=True,
        one_time_keyboard=True,
    )


def horario_keyboard() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        [[name] for name in HORARIOS.keys()],
        resize_keyboard=True,
        one_time_keyboard=True,
    )


def dia_keyboard(options: list[str]) -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        [[name] for name in options],
        resize_keyboard=True,
        one_time_keyboard=True,
    )


def confirmation_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        [
            [
                InlineKeyboardButton("Confirmar", callback_data="confirmar"),
                InlineKeyboardButton("Cancelar", callback_data="cancelar"),
            ]
        ]
    )


def deep_link(praca_slug: str) -> str:
    return f"https://t.me/{PUBLIC_BOT_USERNAME}?start={praca_slug}"


def group_links_message() -> str:
    return (
        "Links prontos para fixar nos grupos:\n\n"
        f"Santa Etelvina\n{deep_link('santa_etelvina')}\n\n"
        f"Ponta Negra\n{deep_link('ponta_negra')}\n\n"
        f"Tancredo Neves\n{deep_link('tancredo_neves')}\n\n"
        f"Chapada\n{deep_link('chapada')}"
    )


def summary_text(data: dict) -> str:
    return (
        "Confirme seus dados:\n\n"
        f"Nome: {data['nome']}\n"
        f"CPF: {format_cpf(data['cpf'])}\n"
        f"Telefone: {format_phone(data['telefone'])}\n"
        f"Praça: {data['praca']}\n"
        f"Horário: {data['horario_label']}\n"
        f"Dia da escala: {data['escala_dia_label']}\n"
        f"Data da escala: {format_scale_date(data['escala_data'])}"
    )


def now_manaus() -> datetime:
    return datetime.now(MANAUS_TZ)


def format_scale_date(value: str) -> str:
    try:
        return datetime.fromisoformat(value).strftime("%d/%m/%Y")
    except ValueError:
        return value


def calculate_scale_date(label: str) -> str:
    current_date = now_manaus().date()
    if label == "Hoje":
        return current_date.isoformat()

    target_weekday = {
        "Sexta": 4,
        "Sábado": 5,
        "Domingo": 6,
    }.get(label)

    if target_weekday is None:
        return current_date.isoformat()

    result = current_date
    while result.weekday() != target_weekday:
        result += timedelta(days=1)

    return result.isoformat()


def set_scale_day(context: ContextTypes.DEFAULT_TYPE, label: str) -> None:
    context.user_data["escala_dia_label"] = label
    context.user_data["escala_data"] = calculate_scale_date(label)


def default_scale_day_label() -> str:
    weekday = now_manaus().weekday()
    if weekday == 5:
        return "Sábado"
    if weekday == 6:
        return "Domingo"
    return "Hoje"


def available_day_options() -> list[str]:
    return DAY_OPTIONS_BY_WEEKDAY.get(now_manaus().weekday(), [])


def has_conflicting_request(context: ContextTypes.DEFAULT_TYPE) -> bool:
    response = (
        supabase.table("waitlist_requests")
        .select("id")
        .eq("cpf", context.user_data["cpf"])
        .eq("praca", context.user_data["praca"])
        .eq("horario_label", context.user_data["horario_label"])
        .eq("escala_data", context.user_data["escala_data"])
        .execute()
    )

    return bool(response.data)


async def ensure_private_chat(update: Update) -> bool:
    message = update.effective_message
    chat = update.effective_chat
    if not message or not chat:
        return False

    if chat.type == ChatType.PRIVATE:
        return True

    await message.reply_text(
        "Para preencher a lista de espera com privacidade, clique no link do bot e continue no privado."
    )
    return False


def set_praca_from_param(context: ContextTypes.DEFAULT_TYPE, param: Optional[str]) -> bool:
    if not param:
        return False

    praca = PRACAS.get(param.strip().lower())
    if not praca:
        return False

    context.user_data["praca"] = praca
    context.user_data["praca_slug"] = param.strip().lower()
    return True


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    if not await ensure_private_chat(update):
        return ConversationHandler.END

    context.user_data.clear()

    start_param = context.args[0] if context.args else None
    if set_praca_from_param(context, start_param):
        await update.message.reply_text(
            f"Praça selecionada: {context.user_data['praca']}\n\nEscolha o horário:",
            reply_markup=horario_keyboard(),
        )
        return ESCOLHER_HORARIO

    await update.message.reply_text(
        "Bem-vindo a lista de espera da VelozLog.\n\nEscolha a praça:",
        reply_markup=praca_keyboard(),
    )
    return ESCOLHER_PRACA


async def links(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await ensure_private_chat(update):
        return
    await update.message.reply_text(group_links_message(), disable_web_page_preview=True)


async def escolher_praca(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    praca = (update.message.text or "").strip()
    if praca not in PRACAS.values():
        await update.message.reply_text(
            "Escolha uma praça válida usando os botões.", reply_markup=praca_keyboard()
        )
        return ESCOLHER_PRACA

    context.user_data["praca"] = praca
    await update.message.reply_text(
        f"Praça selecionada: {praca}\n\nAgora escolha o horário:",
        reply_markup=horario_keyboard(),
    )
    return ESCOLHER_HORARIO


async def escolher_horario(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    horario_label = (update.message.text or "").strip()
    if horario_label not in HORARIOS:
        await update.message.reply_text(
            "Escolha um horário válido usando os botões.", reply_markup=horario_keyboard()
        )
        return ESCOLHER_HORARIO

    contexto = context.user_data
    contexto["horario_label"] = horario_label
    contexto["horario_inicio"], contexto["horario_fim"] = HORARIOS[horario_label]

    day_options = available_day_options()
    if day_options:
        await update.message.reply_text(
            "Essa solicitação é para qual dia?",
            reply_markup=dia_keyboard(day_options),
        )
        return ESCOLHER_DIA

    set_scale_day(context, default_scale_day_label())
    await update.message.reply_text(
        "Digite seu nome completo:",
        reply_markup=ReplyKeyboardRemove(),
    )
    return DIGITAR_NOME


async def escolher_dia(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    dia_label = (update.message.text or "").strip()
    allowed_options = available_day_options()
    if dia_label not in allowed_options:
        await update.message.reply_text(
            "Escolha um dia válido usando os botões.",
            reply_markup=dia_keyboard(allowed_options),
        )
        return ESCOLHER_DIA

    set_scale_day(context, dia_label)
    await update.message.reply_text(
        "Digite seu nome completo:",
        reply_markup=ReplyKeyboardRemove(),
    )
    return DIGITAR_NOME


async def digitar_nome(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    nome = re.sub(r"\s+", " ", (update.message.text or "")).strip()
    if len(nome) < 5:
        await update.message.reply_text("Digite um nome completo válido.")
        return DIGITAR_NOME

    context.user_data["nome"] = nome
    await update.message.reply_text("Digite seu CPF com 11 números:")
    return DIGITAR_CPF


async def digitar_cpf(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    cpf = sanitize_digits(update.message.text or "")
    if not cpf_valido(cpf):
        await update.message.reply_text("CPF inválido. Digite novamente com 11 números.")
        return DIGITAR_CPF

    context.user_data["cpf"] = cpf
    await update.message.reply_text("Digite seu telefone com DDD:")
    return DIGITAR_TELEFONE


async def digitar_telefone(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    telefone = sanitize_digits(update.message.text or "")
    if not telefone_valido(telefone):
        await update.message.reply_text("Telefone inválido. Digite novamente com DDD.")
        return DIGITAR_TELEFONE

    context.user_data["telefone"] = telefone
    await update.message.reply_text(
        summary_text(context.user_data),
        reply_markup=confirmation_keyboard(),
    )
    return CONFIRMAR


def save_waitlist_request(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    payload = {
        "nome": context.user_data["nome"],
        "cpf": context.user_data["cpf"],
        "telefone": context.user_data["telefone"],
        "praca": context.user_data["praca"],
        "horario_label": context.user_data["horario_label"],
        "horario_inicio": context.user_data["horario_inicio"],
        "horario_fim": context.user_data["horario_fim"],
        "escala_dia_label": context.user_data.get("escala_dia_label", "Hoje"),
        "escala_data": context.user_data["escala_data"],
        "status": "pendente",
        "origem": "telegram",
        "telegram_user_id": update.effective_user.id if update.effective_user else None,
        "telegram_username": update.effective_user.username if update.effective_user else None,
        "telegram_chat_id": update.effective_chat.id if update.effective_chat else None,
        "observacao": None,
    }
    supabase.table("waitlist_requests").insert(payload).execute()


async def confirmar_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()

    if query.data == "cancelar":
        await query.edit_message_text("Cadastro cancelado. Envie /start para tentar novamente.")
        return ConversationHandler.END

    try:
        if has_conflicting_request(context):
            await query.edit_message_text(
                "Você já possui uma solicitação para essa hotzone, horário e dia."
            )
            return ConversationHandler.END

        save_waitlist_request(update, context)
        created_at = datetime.now().strftime("%d/%m %H:%M")
        await query.edit_message_text(
            "Pedido salvo com sucesso.\n\n"
            f"Praça: {context.user_data['praca']}\n"
            f"Horário: {context.user_data['horario_label']}\n"
            f"Dia da escala: {context.user_data.get('escala_dia_label', 'Hoje')}\n"
            f"Data da escala: {format_scale_date(context.user_data['escala_data'])}\n"
            f"Recebido em: {created_at}"
        )
    except Exception as exc:
        logger.exception("Erro ao salvar no Supabase")
        message = str(exc).lower()
        if "duplicate" in message or "unique" in message:
            await query.edit_message_text(
                "Você já possui uma solicitação para essa praça, horário e data."
            )
        else:
            await query.edit_message_text(
                "Não foi possível salvar sua solicitação agora. Tente novamente mais tarde."
            )

    return ConversationHandler.END


async def cancelar(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text(
        "Operação cancelada.",
        reply_markup=ReplyKeyboardRemove(),
    )
    return ConversationHandler.END


def main() -> None:
    app = Application.builder().token(BOT_TOKEN).build()

    conv_handler = ConversationHandler(
        entry_points=[CommandHandler("start", start)],
        states={
            ESCOLHER_PRACA: [MessageHandler(filters.TEXT & ~filters.COMMAND, escolher_praca)],
            ESCOLHER_HORARIO: [MessageHandler(filters.TEXT & ~filters.COMMAND, escolher_horario)],
            ESCOLHER_DIA: [MessageHandler(filters.TEXT & ~filters.COMMAND, escolher_dia)],
            DIGITAR_NOME: [MessageHandler(filters.TEXT & ~filters.COMMAND, digitar_nome)],
            DIGITAR_CPF: [MessageHandler(filters.TEXT & ~filters.COMMAND, digitar_cpf)],
            DIGITAR_TELEFONE: [MessageHandler(filters.TEXT & ~filters.COMMAND, digitar_telefone)],
            CONFIRMAR: [CallbackQueryHandler(confirmar_callback)],
        },
        fallbacks=[CommandHandler("cancelar", cancelar)],
        per_chat=True,
        per_user=True,
        per_message=False,
    )

    app.add_handler(CommandHandler("links", links))
    app.add_handler(conv_handler)

    logger.info("Bot iniciado com sucesso.")
    app.run_polling(drop_pending_updates=True)


if __name__ == "__main__":
    main()
