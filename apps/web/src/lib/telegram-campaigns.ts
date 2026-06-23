import "server-only";

import * as XLSX from "xlsx";

import { supabaseServer } from "@/lib/supabase-server";

export type ImportedRecipient = {
  cpf: string;
  nome: string;
  telefone: string;
  hotzone: string;
  turno: string;
};

export type WaitlistMatch = {
  id: string;
  cpf: string;
  nome: string | null;
  telefone: string | null;
  praca: string | null;
  horario_label: string | null;
  telegram_chat_id: number | null;
  created_at: string;
};

export type SpreadsheetPreviewRow = {
  cpf: string;
  nome: string;
  status: "com_chat_id" | "sem_chat_id" | "cpf_nao_encontrado";
  nome_base: string | null;
  hotzone: string | null;
  turno: string | null;
};

export type SpreadsheetPreview = {
  totalPlanilha: number;
  totalComChatId: number;
  totalSemChatId: number;
  totalCpfNaoEncontrado: number;
  totalEncontradoSemChatId: number;
  rows: SpreadsheetPreviewRow[];
};

export function sanitizeDigits(value: string) {
  return value.replace(/\D/g, "");
}

export function normalizeCpf(value: string) {
  const digits = sanitizeDigits(value);

  if (!digits) {
    return "";
  }

  if (digits.length > 11) {
    return digits;
  }

  return digits.padStart(11, "0");
}

export function normalizeHeader(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function normalizeCell(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveSpreadsheetValue(row: Record<string, unknown>, candidates: string[]) {
  const normalizedEntries = Object.entries(row).map(([key, value]) => [normalizeHeader(key), value] as const);

  for (const candidate of candidates) {
    const entry = normalizedEntries.find(([key]) => key === candidate);
    if (entry) {
      return normalizeCell(entry[1]);
    }
  }

  return "";
}

export function buildTelegramMessage(template: string, recipient: ImportedRecipient) {
  const variables: Record<string, string> = {
    nome: recipient.nome,
    telefone: recipient.telefone,
    cpf: recipient.cpf,
    hotzone: recipient.hotzone,
    turno: recipient.turno,
  };

  return template.replace(/\{(nome|telefone|cpf|hotzone|turno)\}/gi, (_, key: string) => {
    return variables[key.toLowerCase()] || "";
  });
}

export function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

export async function parseSpreadsheet(file: File): Promise<ImportedRecipient[]> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const firstSheet = workbook.SheetNames[0];

  if (!firstSheet) {
    throw new Error("A planilha nao possui abas validas.");
  }

  const sheet = workbook.Sheets[firstSheet];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  });

  if (rows.length === 0) {
    throw new Error("A planilha esta vazia.");
  }

  const imported: ImportedRecipient[] = [];
  const invalidRows: number[] = [];
  const duplicateCpfs = new Set<string>();
  const seenCpfs = new Set<string>();

  rows.forEach((row, index) => {
    const cpf = normalizeCpf(
      resolveSpreadsheetValue(row, ["cpf", "numero_da_identidade", "numero_identidade", "identidade"]),
    );
    const nome = resolveSpreadsheetValue(row, ["nome", "nome_completo", "nome_do_entregador_parceiro"]);
    const rowHasAnyData = [cpf, nome].some(Boolean);

    if (!rowHasAnyData) {
      return;
    }

    if (!cpf || cpf.length !== 11 || !nome) {
      invalidRows.push(index + 2);
      return;
    }

    if (seenCpfs.has(cpf)) {
      duplicateCpfs.add(cpf);
      return;
    }

    seenCpfs.add(cpf);
    imported.push({
      cpf,
      nome,
      telefone: "",
      hotzone: "",
      turno: "",
    });
  });

  if (invalidRows.length > 0) {
    throw new Error(
      `A planilha tem linha(s) invalida(s). Use apenas nome e CPF. Confira as linhas ${invalidRows.slice(0, 8).join(", ")}.`,
    );
  }

  if (duplicateCpfs.size > 0) {
    throw new Error(
      `A planilha possui CPF duplicado. Ajuste antes de enviar: ${Array.from(duplicateCpfs).slice(0, 5).join(", ")}.`,
    );
  }

  if (imported.length === 0) {
    throw new Error("Nenhuma linha valida foi encontrada na planilha.");
  }

  return imported;
}

export async function getWaitlistMatches(tenantId: string, cpfs: string[]) {
  const latestWithChat = new Map<string, WaitlistMatch>();
  const latestAny = new Map<string, WaitlistMatch>();
  const candidateCpfs = Array.from(
    new Set(
      cpfs.flatMap((cpf) => {
        const normalized = normalizeCpf(cpf);
        const trimmed = normalized.replace(/^0+/, "");

        return [normalized, trimmed].filter(Boolean);
      }),
    ),
  );

  for (const cpfChunk of chunkArray(candidateCpfs, 200)) {
    const { data, error } = await supabaseServer
      .from("waitlist_requests")
      .select("id,cpf,nome,telefone,praca,horario_label,telegram_chat_id,created_at")
      .eq("tenant_id", tenantId)
      .in("cpf", cpfChunk)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    for (const rawItem of (data || []) as WaitlistMatch[]) {
      const normalizedCpf = normalizeCpf(rawItem.cpf);

      if (!normalizedCpf) {
        continue;
      }

      if (!latestAny.has(normalizedCpf)) {
        latestAny.set(normalizedCpf, {
          ...rawItem,
          cpf: normalizedCpf,
        });
      }

      if (rawItem.telegram_chat_id !== null && !latestWithChat.has(normalizedCpf)) {
        latestWithChat.set(normalizedCpf, {
          ...rawItem,
          cpf: normalizedCpf,
        });
      }
    }
  }

  return { latestWithChat, latestAny };
}

export function buildSpreadsheetPreview(
  importedRecipients: ImportedRecipient[],
  latestWithChat: Map<string, WaitlistMatch>,
  latestAny: Map<string, WaitlistMatch>,
): SpreadsheetPreview {
  const rows: SpreadsheetPreviewRow[] = importedRecipients.map((item) => {
    const matchedWithChat = latestWithChat.get(item.cpf);
    const matchedAny = latestAny.get(item.cpf);

    if (matchedWithChat?.telegram_chat_id) {
      return {
        cpf: item.cpf,
        nome: item.nome,
        status: "com_chat_id",
        nome_base: matchedWithChat.nome,
        hotzone: matchedWithChat.praca,
        turno: matchedWithChat.horario_label,
      };
    }

    if (matchedAny) {
      return {
        cpf: item.cpf,
        nome: item.nome,
        status: "sem_chat_id",
        nome_base: matchedAny.nome,
        hotzone: matchedAny.praca,
        turno: matchedAny.horario_label,
      };
    }

    return {
      cpf: item.cpf,
      nome: item.nome,
      status: "cpf_nao_encontrado",
      nome_base: null,
      hotzone: null,
      turno: null,
    };
  });

  return {
    totalPlanilha: importedRecipients.length,
    totalComChatId: rows.filter((item) => item.status === "com_chat_id").length,
    totalSemChatId: rows.filter((item) => item.status !== "com_chat_id").length,
    totalCpfNaoEncontrado: rows.filter((item) => item.status === "cpf_nao_encontrado").length,
    totalEncontradoSemChatId: rows.filter((item) => item.status === "sem_chat_id").length,
    rows,
  };
}
