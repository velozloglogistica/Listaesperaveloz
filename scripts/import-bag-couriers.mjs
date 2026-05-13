import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const requireFromWeb = createRequire(path.join(projectRoot, "apps", "web", "package.json"));
const { createClient } = requireFromWeb("@supabase/supabase-js");

const DEFAULT_CSV_PATH = path.join(projectRoot, "entregadores-bag.csv");
const WEB_ENV_PATH = path.join(projectRoot, "apps", "web", ".env.local");
const BOT_ENV_PATH = path.join(projectRoot, "apps", "bot", ".env");

const args = process.argv.slice(2);
const shouldApply = args.includes("--apply");
const csvArgIndex = args.findIndex((arg) => arg === "--csv");
const csvPath = csvArgIndex >= 0 ? path.resolve(args[csvArgIndex + 1]) : DEFAULT_CSV_PATH;
const tenantSlugArgIndex = args.findIndex((arg) => arg === "--tenant-slug");
const tenantSlugOverride = tenantSlugArgIndex >= 0 ? String(args[tenantSlugArgIndex + 1] || "") : "";
const fallbackOperatorArgIndex = args.findIndex((arg) => arg === "--fallback-operator");
const fallbackOperatorOverride =
  fallbackOperatorArgIndex >= 0 ? String(args[fallbackOperatorArgIndex + 1] || "") : "";

const OPERATOR_ALIAS_TO_ACTIVE_NAME = new Map([
  ["help", "Help Souza"],
  ["sindel", "Sindel Moreira"],
  ["capitao", "Rhichardson"],
  ["capitão", "Rhichardson"],
]);

const SHIFT_VALUES = [];
const WEEKDAY_VALUES = [];

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const content = fs.readFileSync(filePath, "utf8");
  const env = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }

  return env;
}

function loadEnv() {
  const sources = [parseEnvFile(WEB_ENV_PATH), parseEnvFile(BOT_ENV_PATH), process.env];
  const env = {};

  for (const source of sources) {
    for (const [key, value] of Object.entries(source)) {
      if (value && !(key in env)) {
        env[key] = value;
      }
    }
  }

  return env;
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

function createBagStatusSlug(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_{2,}/g, "_");
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}

function parseCsv(filePath) {
  const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return [];
  }

  const headers = parseCsvLine(lines[0]).map((value) => value.trim());

  return lines.slice(1).map((line, lineIndex) => {
    const values = parseCsvLine(line);
    const record = Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
    record.__line = String(lineIndex + 2);
    return record;
  });
}

function mapVehicle(value) {
  const normalized = normalizeText(value);
  if (normalized.includes("bike") || normalized.includes("bicic")) {
    return "bicicleta";
  }
  if (normalized.includes("moto")) {
    return "motocicleta";
  }
  return "";
}

function printSection(title) {
  console.log(`\n=== ${title} ===`);
}

function resolveOperator(rawOperator, operatorByName, operatorEntries, fallbackOperator) {
  const normalized = normalizeText(rawOperator);
  if (!normalized) {
    return fallbackOperator;
  }

  const aliasTarget = OPERATOR_ALIAS_TO_ACTIVE_NAME.get(normalized);
  if (aliasTarget) {
    const aliased = operatorByName.get(normalizeText(aliasTarget));
    if (aliased) {
      return aliased;
    }
  }

  const direct = operatorByName.get(normalized);
  if (direct) {
    return direct;
  }

  const fuzzy = operatorEntries.find((entry) => {
    const candidate = entry.normalized;
    return candidate.startsWith(normalized) || candidate.includes(` ${normalized}`);
  });

  return fuzzy || fallbackOperator;
}

async function fetchSingle(client, table, queryBuilder) {
  const { data, error } = await queryBuilder(client.from(table));
  if (error) {
    throw new Error(error.message);
  }
  return data;
}

async function main() {
  if (!fs.existsSync(csvPath)) {
    throw new Error(`Arquivo CSV nao encontrado: ${csvPath}`);
  }

  const env = loadEnv();
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || "";
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || "";
  const tenantSlug = tenantSlugOverride || env.DEFAULT_TENANT_SLUG || "velozlog";

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Credenciais do Supabase nao encontradas em apps/web/.env.local ou apps/bot/.env.");
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const rows = parseCsv(csvPath);
  console.log(`Modo: ${shouldApply ? "APPLY" : "DRY-RUN"}`);
  console.log(`Arquivo: ${csvPath}`);
  console.log(`Linhas: ${rows.length}`);
  console.log(`Tenant slug: ${tenantSlug}`);

  const tenant = await fetchSingle(client, "tenants", (table) =>
    table.select("id,name,slug").eq("slug", tenantSlug).maybeSingle(),
  );

  if (!tenant?.id) {
    throw new Error(`Tenant nao encontrado para o slug: ${tenantSlug}`);
  }

  const [cities, regions, statuses, memberships] = await Promise.all([
    fetchSingle(client, "tenant_cities", (table) =>
      table.select("id,name").eq("tenant_id", tenant.id).eq("is_active", true).order("name"),
    ),
    fetchSingle(client, "tenant_regions", (table) =>
      table
        .select("id,name,city_id,tenant_cities!inner(name)")
        .eq("tenant_id", tenant.id)
        .eq("is_active", true)
        .order("name"),
    ),
    fetchSingle(client, "tenant_bag_statuses", (table) =>
      table
        .select("id,slug,label,sort_order")
        .eq("tenant_id", tenant.id)
        .eq("is_active", true)
        .order("sort_order")
        .order("label"),
    ),
    fetchSingle(client, "tenant_memberships", (table) =>
      table
        .select("user_id,app_users!tenant_memberships_user_id_fkey!inner(full_name)")
        .eq("tenant_id", tenant.id)
        .eq("is_active", true),
    ),
  ]);

  const cityList = cities || [];
  const singleCityId = cityList.length === 1 ? cityList[0].id : null;

  const regionByName = new Map();
  for (const region of regions || []) {
    const city = Array.isArray(region.tenant_cities) ? region.tenant_cities[0] : region.tenant_cities;
    regionByName.set(normalizeText(region.name), {
      id: region.id,
      name: region.name,
      cityId: region.city_id,
      cityName: city?.name || "",
    });
  }

  const statusByNormalizedLabel = new Map();
  let maxSortOrder = 0;
  for (const status of statuses || []) {
    statusByNormalizedLabel.set(normalizeText(status.label), status);
    statusByNormalizedLabel.set(normalizeText(status.slug), status);
    maxSortOrder = Math.max(maxSortOrder, Number(status.sort_order || 0));
  }

  const operatorByName = new Map();
  const operatorEntries = [];
  for (const membership of memberships || []) {
    const user = Array.isArray(membership.app_users) ? membership.app_users[0] : membership.app_users;
    if (!user?.full_name) {
      continue;
    }
    const operatorRecord = {
      id: membership.user_id,
      fullName: user.full_name,
      normalized: normalizeText(user.full_name),
    };
    operatorByName.set(operatorRecord.normalized, operatorRecord);
    operatorEntries.push(operatorRecord);
  }

  const fallbackOperator = fallbackOperatorOverride
    ? resolveOperator(fallbackOperatorOverride, operatorByName, operatorEntries, null)
    : null;

  const uniqueStatusesFromCsv = [...new Set(rows.map((row) => String(row.BAG || "").trim()).filter(Boolean))];
  const missingStatuses = uniqueStatusesFromCsv.filter(
    (label) => !statusByNormalizedLabel.has(normalizeText(label)),
  );

  printSection("Resumo do CSV");
  console.log(`Cidades ativas no tenant: ${cityList.map((city) => city.name).join(", ") || "nenhuma"}`);
  console.log(
    `Hot Zones ativas no tenant: ${(regions || []).map((region) => region.name).join(", ") || "nenhuma"}`,
  );
  console.log(
    `Operadores ativos no tenant: ${[...operatorByName.values()].map((item) => item.fullName).join(", ") || "nenhum"}`,
  );
  console.log(`Status do CSV: ${uniqueStatusesFromCsv.join(", ")}`);

  if (missingStatuses.length > 0) {
    printSection("Status ausentes");
    console.log(missingStatuses.join(", "));

    if (shouldApply) {
      const payload = missingStatuses.map((label, index) => ({
        tenant_id: tenant.id,
        slug: createBagStatusSlug(label),
        label,
        sort_order: maxSortOrder + index + 1,
        is_active: true,
      }));

      const { error } = await client.from("tenant_bag_statuses").insert(payload);
      if (error) {
        throw new Error(`Falha ao criar status ausentes: ${error.message}`);
      }

      for (const item of payload) {
        const created = {
          id: "",
          slug: item.slug,
          label: item.label,
          sort_order: item.sort_order,
        };
        statusByNormalizedLabel.set(normalizeText(item.label), created);
        statusByNormalizedLabel.set(normalizeText(item.slug), created);
      }
    } else {
      for (const [index, label] of missingStatuses.entries()) {
        const simulated = {
          id: "",
          slug: createBagStatusSlug(label),
          label,
          sort_order: maxSortOrder + index + 1,
        };
        statusByNormalizedLabel.set(normalizeText(label), simulated);
        statusByNormalizedLabel.set(normalizeText(simulated.slug), simulated);
      }
    }
  }

  const errors = [];
  const prepared = [];

  for (const row of rows) {
    const partnerDeliveryId = String(row.ID || "").trim();
    const fullName = String(row.NOME || "").trim();
    const phoneNumber = digitsOnly(row["NÚMERO"] || row.NUMERO || "");
    const identityNumber = digitsOnly(row.CPF || "");
    const rawStatus = String(row.BAG || "").trim();
    const rawVehicle = String(row.TRANSPORTE || "").trim();
    const rawHotZone = String(row["Hot zone"] || "").trim();
    const rawOperator = String(row.Operador || "").trim();

    const resolvedStatus = statusByNormalizedLabel.get(normalizeText(rawStatus));
    const resolvedVehicle = mapVehicle(rawVehicle);
    const resolvedRegion = rawHotZone ? regionByName.get(normalizeText(rawHotZone)) : null;
    const resolvedOperator = resolveOperator(rawOperator, operatorByName, operatorEntries, fallbackOperator);

    let cityId = singleCityId;
    if (resolvedRegion?.cityId) {
      cityId = resolvedRegion.cityId;
    }

    const rowErrors = [];
    if (!partnerDeliveryId) rowErrors.push("ID vazio");
    if (fullName.length < 3) rowErrors.push("Nome invalido");
    if (phoneNumber.length < 10) rowErrors.push("Telefone invalido");
    if (!identityNumber) rowErrors.push("CPF vazio");
    if (!resolvedStatus?.slug) rowErrors.push(`Status BAG nao resolvido: ${rawStatus || "(vazio)"}`);
    if (!resolvedVehicle) rowErrors.push(`Transporte nao reconhecido: ${rawVehicle || "(vazio)"}`);
    if (rawOperator && !resolvedOperator) rowErrors.push(`Operador nao encontrado: ${rawOperator}`);
    if (!rawOperator) rowErrors.push("Operador vazio");
    if (rawHotZone && !resolvedRegion) rowErrors.push(`Hot Zone nao encontrada: ${rawHotZone}`);
    if (!cityId) rowErrors.push("Nao foi possivel resolver a cidade");

    if (rowErrors.length > 0) {
      errors.push({
        line: row.__line,
        partnerDeliveryId,
        fullName,
        errors: rowErrors,
      });
      continue;
    }

    prepared.push({
      line: row.__line,
      partnerDeliveryId,
      fullName,
      phoneNumber,
      identityNumber,
      cityId,
      regionId: resolvedRegion?.id || null,
      regionName: resolvedRegion?.name || "",
      operatorUserId: resolvedOperator.id,
      operatorName: resolvedOperator.fullName,
      deliveryVehicle: resolvedVehicle,
      bagStatus: resolvedStatus.slug,
      bagStatusLabel: resolvedStatus.label,
    });
  }

  printSection("Resultado do preparo");
  console.log(`Prontos para importar: ${prepared.length}`);
  console.log(`Com erro: ${errors.length}`);

  if (errors.length > 0) {
    console.log("\nPrimeiros erros:");
    for (const error of errors.slice(0, 20)) {
      console.log(
        `Linha ${error.line} | ${error.fullName || error.partnerDeliveryId || "sem identificacao"} | ${error.errors.join("; ")}`,
      );
    }
  }

  if (!shouldApply) {
    console.log("\nDry-run finalizado. Use --apply para gravar no banco.");
    return;
  }

  if (errors.length > 0) {
    throw new Error("Existem linhas com erro. Corrija o mapeamento antes de usar --apply.");
  }

  let importedCount = 0;
  for (const item of prepared) {
    const upsertPayload = {
      tenant_id: tenant.id,
      partner_delivery_id: item.partnerDeliveryId,
      full_name: item.fullName,
      phone_number: item.phoneNumber,
      whatsapp_web_link: null,
      identity_number: item.identityNumber,
      city_id: item.cityId,
      delivery_vehicle: item.deliveryVehicle,
      operator_user_id: item.operatorUserId,
      joined_telegram_group: false,
      preferred_shifts: SHIFT_VALUES,
      preferred_weekdays: WEEKDAY_VALUES,
      observation: `Importado da planilha inicial de BAG. Operador original: ${item.operatorName}.`,
      bag_status: item.bagStatus,
    };

    const { data: courierData, error: courierError } = await client
      .from("bag_couriers")
      .upsert(upsertPayload, { onConflict: "tenant_id,partner_delivery_id" })
      .select("id")
      .single();

    if (courierError || !courierData?.id) {
      throw new Error(
        `Falha ao importar linha ${item.line} (${item.fullName}): ${courierError?.message || "sem id retornado"}`,
      );
    }

    const { error: deleteRegionsError } = await client
      .from("bag_courier_regions")
      .delete()
      .eq("bag_courier_id", courierData.id);

    if (deleteRegionsError) {
      throw new Error(
        `Falha ao limpar Hot Zones da linha ${item.line} (${item.fullName}): ${deleteRegionsError.message}`,
      );
    }

    if (item.regionId) {
      const { error: regionInsertError } = await client.from("bag_courier_regions").insert({
        bag_courier_id: courierData.id,
        region_id: item.regionId,
      });

      if (regionInsertError) {
        throw new Error(
          `Falha ao vincular Hot Zone da linha ${item.line} (${item.fullName}): ${regionInsertError.message}`,
        );
      }
    }

    importedCount += 1;
  }

  printSection("Importacao concluida");
  console.log(`Entregadores importados: ${importedCount}`);
}

main().catch((error) => {
  console.error("\nERRO:", error.message);
  process.exitCode = 1;
});
