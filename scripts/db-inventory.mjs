import pg from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
const client = await pool.connect();
const report = {
  generatedAt: new Date().toISOString(),
  scope: "aggregate-only; no row identifiers or personal values",
};

const quote = pg.escapeIdentifier;

try {
  await client.query("BEGIN READ ONLY");
  await client.query("SET LOCAL statement_timeout = '30s'");

  report.database = (await client.query(
    "SELECT current_database() AS name, current_setting('server_version') AS server_version",
  )).rows[0];
  const columns = (await client.query(
    `SELECT table_name, column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position`,
  )).rows;
  const tableNames = [...new Set(columns.map(({ table_name }) => table_name))];
  const columnSet = new Set(columns.map(({ table_name, column_name }) => `${table_name}.${column_name}`));
  report.structure = { tables: tableNames, columns };

  report.rowCounts = {};
  for (const table of tableNames) {
    report.rowCounts[table] = Number((await client.query(
      `SELECT count(*)::int AS count FROM public.${quote(table)}`,
    )).rows[0].count);
  }

  report.emailQuality = {};
  for (const table of ["users", "user_profiles"]) {
    if (columnSet.has(`${table}.email`)) {
      report.emailQuality[table] = (await client.query(
        `SELECT count(*) FILTER (WHERE email IS NULL OR btrim(email) = '')::int AS missing,
                (count(email) FILTER (WHERE btrim(email) <> '')
                  - count(DISTINCT lower(btrim(email))) FILTER (WHERE btrim(email) <> ''))::int AS duplicate_excess
           FROM public.${quote(table)}`,
      )).rows[0];
    }
  }

  report.identityMapping = {};
  if (columnSet.has("users.id")) {
    report.identityMapping.usersWithoutProfile = columnSet.has("user_profiles.user_id")
      ? Number((await client.query(
        "SELECT count(*)::int AS count FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id WHERE p.user_id IS NULL",
      )).rows[0].count)
      : null;
  }
  for (const providerColumn of ["google_id", "clerk_id"]) {
    const ownerTable = columnSet.has(`users.${providerColumn}`) ? "users"
      : columnSet.has(`user_profiles.${providerColumn}`) ? "user_profiles" : null;
    if (ownerTable) {
      report.identityMapping[providerColumn] = (await client.query(
        `SELECT count(*) FILTER (WHERE ${quote(providerColumn)} IS NOT NULL AND btrim(${quote(providerColumn)}) <> '')::int AS present,
                count(*) FILTER (WHERE ${quote(providerColumn)} IS NULL OR btrim(${quote(providerColumn)}) = '')::int AS missing,
                (count(${quote(providerColumn)}) FILTER (WHERE btrim(${quote(providerColumn)}) <> '')
                  - count(DISTINCT ${quote(providerColumn)}) FILTER (WHERE btrim(${quote(providerColumn)}) <> ''))::int AS duplicate_excess
           FROM public.${quote(ownerTable)}`,
      )).rows[0];
    }
  }

  report.eligibilityDecisions = {};
  for (const [table, column] of [
    ["user_profiles", "is_verified"],
    ["user_details", "is_verified"],
    ["vehicles", "is_verified"],
  ]) {
    if (columnSet.has(`${table}.${column}`)) {
      report.eligibilityDecisions[`${table}.${column}`] = (await client.query(
        `SELECT count(*) FILTER (WHERE ${quote(column)} IS TRUE)::int AS approved,
                count(*) FILTER (WHERE ${quote(column)} IS FALSE)::int AS "notApproved",
                count(*) FILTER (WHERE ${quote(column)} IS NULL)::int AS unknown
           FROM public.${quote(table)}`,
      )).rows[0];
    }
  }

  report.statusCounts = {};
  const statusCandidates = {
    ride_offers: ["status", "ride_offer_status"],
    ride_requests: ["status", "ride_request_status"],
    bookings: ["status", "booking_status"],
    student_verifications: ["status"],
    driver_eligibility: ["status"],
    booking_settlements: ["status"],
    payments: ["status"],
    payment_orders: ["status"],
    transactions: ["payment_status"],
  };
  for (const [table, candidates] of Object.entries(statusCandidates)) {
    const statusColumn = candidates.find((column) => columnSet.has(`${table}.${column}`));
    if (statusColumn) {
      report.statusCounts[table] = (await client.query(
        `SELECT ${quote(statusColumn)}::text AS status, count(*)::int AS count
           FROM public.${quote(table)} GROUP BY 1 ORDER BY 1`,
      )).rows;
    }
  }

  report.financialTotals = {};
  const moneyColumns = {
    payments: ["amount"],
    transactions: ["amount", "platform_fee", "driver_earnings"],
    payment_orders: ["amount_paise"],
    booking_settlements: ["ride_fare_paise", "platform_fee_paise", "total_due_paise", "paid_amount_paise"],
  };
  for (const [table, candidates] of Object.entries(moneyColumns)) {
    const available = candidates.filter((column) => columnSet.has(`${table}.${column}`));
    if (available.length > 0) {
      const selections = available.map((column) => `coalesce(sum(${quote(column)}), 0)::text AS ${quote(column)}`);
      report.financialTotals[table] = (await client.query(
        `SELECT ${selections.join(", ")} FROM public.${quote(table)}`,
      )).rows[0];
    }
  }

  report.legacyPaymentHistory = {};
  if (columnSet.has("bookings.payment_status")) {
    const identifierCount = async (column) => columnSet.has(`bookings.${column}`)
      ? Number((await client.query(
        `SELECT count(*) FILTER (WHERE ${quote(column)} IS NOT NULL AND btrim(${quote(column)}) <> '')::int AS count
           FROM public.bookings`,
      )).rows[0].count)
      : null;
    report.legacyPaymentHistory.bookings = {
      paymentStatusCounts: (await client.query(
        `SELECT payment_status AS status, count(*)::int AS count
           FROM public.bookings GROUP BY payment_status ORDER BY payment_status`,
      )).rows,
      razorpayOrderIdsPresent: await identifierCount("razorpay_order_id"),
      razorpayPaymentIdsPresent: await identifierCount("razorpay_payment_id"),
    };
  }

  const foreignKeyColumns = (await client.query(
    `SELECT tc.table_name, tc.constraint_name, child.column_name,
            parent.table_name AS referenced_table, parent.column_name AS referenced_column,
            child.ordinal_position
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage child
         ON tc.constraint_name = child.constraint_name AND tc.constraint_schema = child.constraint_schema
       JOIN information_schema.referential_constraints reference
         ON tc.constraint_name = reference.constraint_name AND tc.constraint_schema = reference.constraint_schema
       JOIN information_schema.key_column_usage parent
         ON parent.constraint_name = reference.unique_constraint_name
        AND parent.constraint_schema = reference.unique_constraint_schema
        AND parent.ordinal_position = child.position_in_unique_constraint
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
      ORDER BY tc.table_name, tc.constraint_name, child.ordinal_position`,
  )).rows;
  report.foreignKeys = [];
  const groupedForeignKeys = Map.groupBy(
    foreignKeyColumns,
    (key) => `${key.table_name}.${key.constraint_name}`,
  );
  for (const columnsForKey of groupedForeignKeys.values()) {
    const key = columnsForKey[0];
    const join = columnsForKey.map(({ column_name, referenced_column }) =>
      `child.${quote(column_name)} = parent.${quote(referenced_column)}`).join(" AND ");
    const populated = columnsForKey.map(({ column_name }) =>
      `child.${quote(column_name)} IS NOT NULL`).join(" AND ");
    const orphanCount = (await client.query(
      `SELECT count(*)::int AS count
         FROM public.${quote(key.table_name)} child
         LEFT JOIN public.${quote(key.referenced_table)} parent
           ON ${join}
        WHERE ${populated}
          AND parent.${quote(columnsForKey[0].referenced_column)} IS NULL`,
    )).rows[0].count;
    report.foreignKeys.push({
      table_name: key.table_name,
      constraint_name: key.constraint_name,
      columns: columnsForKey.map(({ column_name }) => column_name),
      referenced_table: key.referenced_table,
      referenced_columns: columnsForKey.map(({ referenced_column }) => referenced_column),
      orphanCount,
    });
  }

  const ledgerColumns = columns
    .filter(({ table_name }) => table_name === "schema_migrations")
    .map(({ column_name }) => column_name);
  if (ledgerColumns.length === 0) {
    report.migrationHistory = null;
  } else if (["name", "checksum", "applied_at"].every((column) => ledgerColumns.includes(column))) {
    report.migrationHistory = {
      compatible: true,
      entries: (await client.query(
        "SELECT name, checksum, applied_at FROM public.schema_migrations ORDER BY name",
      )).rows,
    };
  } else {
    report.migrationHistory = {
      compatible: false,
      columns: ledgerColumns,
      rowCount: report.rowCounts.schema_migrations,
    };
  }

  await client.query("ROLLBACK");
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  throw error;
} finally {
  client.release();
  await pool.end();
}
