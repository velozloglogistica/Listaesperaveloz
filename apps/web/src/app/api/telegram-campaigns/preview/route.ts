import { NextResponse } from "next/server";

import { canAccessModule, getCurrentAppUser } from "@/lib/auth";
import { buildSpreadsheetPreview, getWaitlistMatches, parseSpreadsheet } from "@/lib/telegram-campaigns";

export async function POST(request: Request) {
  const user = await getCurrentAppUser();

  if (!user) {
    return NextResponse.json({ error: "Sessao expirada. Entre novamente." }, { status: 401 });
  }

  if (!canAccessModule(user, "telegram_campaigns")) {
    return NextResponse.json({ error: "Sem permissao para analisar campanhas Telegram." }, { status: 403 });
  }

  try {
    const formData = await request.formData();
    const spreadsheet = formData.get("planilha");

    if (!(spreadsheet instanceof File) || spreadsheet.size === 0) {
      return NextResponse.json({ error: "Anexe a planilha com nome e CPF." }, { status: 400 });
    }

    const importedRecipients = await parseSpreadsheet(spreadsheet);
    const cpfs = importedRecipients.map((item) => item.cpf);
    const { latestWithChat, latestAny } = await getWaitlistMatches(user.current_tenant.id, cpfs);
    const preview = buildSpreadsheetPreview(importedRecipients, latestWithChat, latestAny);

    return NextResponse.json(preview);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Nao foi possivel analisar a planilha.",
      },
      { status: 400 },
    );
  }
}
