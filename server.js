import express from "express";
import cors from "cors";

const app = express();

app.use(cors());
app.use(express.json({ limit: "20mb" }));

const PORT = process.env.PORT || 3000;

const GLIDE_TOKEN = process.env.GLIDE_TOKEN;
const APP_ID = "OdRQ0L0u80jqFb1hqqkt";

const LINES_TABLE = "native-table-6ea5b163-55db-41a7-a2df-dff68f5f6bdc";
const INVOICES_TABLE = "native-table-58a45d53-05cf-4eea-adde-2730ba12fae7";
const DEPTS_TABLE = "native-table-21008154-b93a-4f15-b4f1-62c22ba70cd7";

// Principal
const LINE_ROW_ID = "$rowID";
const LINE_DESCRIPTION = "22PNh";
const LINE_PERIOD = "DW2Fx";
const LINE_VALUE = "yGrYk";
const LINE_INVOICE_IMPORT_ID = "waVXq";
const LINE_DATE = "WT9Iw";
const LINE_CLASSIFICATION = "WiJpe";
const LINE_STATUS = "0TgSg";

// Faturas
const INVOICE_IMPORT_ID = "5rfPu";
const INVOICE_NUMBER = "eJ2AW";
const INVOICE_CLIENT = "gXYWJ";
const INVOICE_TOTAL = "umVuQ";

// Repartições
const DEPT_LINE_ID = "NHe0i";
const DEPT_ASSIGNED_VALUE = "1mPSe";

app.get("/", (req, res) => {
  res.json({
    status: "online"
  });
});

async function queryGlide(sql, params = []) {
  const response = await fetch(
    "https://api.glideapp.io/api/function/queryTables",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GLIDE_TOKEN}`
      },
      body: JSON.stringify({
        appID: APP_ID,
        queries: [
          {
            sql,
            params
          }
        ]
      })
    }
  );

  if (!response.ok) {
    const text = await response.text();

    throw new Error(
      `Glide query failed: ${response.status} - ${text}`
    );
  }

  const data = await response.json();

  return (
    data?.[0]?.rows ||
    data?.data?.[0]?.rows ||
    data?.rows ||
    []
  );
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function buildOrWhere(field, values) {
  return values
    .map((_, index) => `"${field}" = $${index + 1}`)
    .join(" OR ");
}

function csvValue(value) {
  if (value === null || value === undefined) return "";

  return `"${String(value).replace(/"/g, '""')}"`;
}

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

async function generateCsv(startPeriod, endPeriod) {
  // 1. Buscar linhas principais filtradas por período, emoji vermelho e waVXq preenchido
  const lineRows = await queryGlide(
    `SELECT *
     FROM "${LINES_TABLE}"
     WHERE "${LINE_PERIOD}" >= $1
     AND "${LINE_PERIOD}" <= $2
     AND "${LINE_STATUS}" != '🟢'
     AND "${LINE_INVOICE_IMPORT_ID}" IS NOT NULL
     AND "${LINE_INVOICE_IMPORT_ID}" != ''`,
    [startPeriod, endPeriod]
  );

  // 2. Buscar faturas relacionadas
  const invoiceIds = unique(
    lineRows.map(row => row[LINE_INVOICE_IMPORT_ID])
  );

  let invoiceRows = [];

  if (invoiceIds.length > 0) {
    const whereClause = buildOrWhere(
      INVOICE_IMPORT_ID,
      invoiceIds
    );

    invoiceRows = await queryGlide(
      `SELECT *
       FROM "${INVOICES_TABLE}"
       WHERE ${whereClause}`,
      invoiceIds
    );
  }

  const invoicesByImportId = new Map();

  for (const invoice of invoiceRows) {
    invoicesByImportId.set(
      invoice[INVOICE_IMPORT_ID],
      invoice
    );
  }

  // 3. Buscar repartições relacionadas com as linhas principais
  const lineIds = unique(
    lineRows.map(row => row[LINE_ROW_ID])
  );

  let deptRows = [];

  if (lineIds.length > 0) {
    const deptWhereClause = buildOrWhere(
      DEPT_LINE_ID,
      lineIds
    );

    deptRows = await queryGlide(
      `SELECT *
       FROM "${DEPTS_TABLE}"
       WHERE ${deptWhereClause}`,
      lineIds
    );
  }

  // 4. Somar repartições por InvLine
  const deptSumByLineId = new Map();

  for (const dept of deptRows) {
    const lineId = dept[DEPT_LINE_ID];
    const value = Number(dept[DEPT_ASSIGNED_VALUE] || 0);

    deptSumByLineId.set(
      lineId,
      (deptSumByLineId.get(lineId) || 0) + value
    );
  }

  // 5. Construir linhas finais
  const csvRows = lineRows.map(line => {
    const invoice = invoicesByImportId.get(
      line[LINE_INVOICE_IMPORT_ID]
    );

    const totalDocumento = Number(invoice?.[INVOICE_TOTAL] || 0);
    const valorLinha = Number(line[LINE_VALUE] || 0);

    const hasRepartitions =
      deptSumByLineId.has(line[LINE_ROW_ID]);

    const assignedTotal = Number(
      deptSumByLineId.get(line[LINE_ROW_ID]) || 0
    );

    const diferenca = hasRepartitions
      ? roundMoney(valorLinha - assignedTotal)
      : roundMoney(valorLinha);

    return {
      Fatura: invoice?.[INVOICE_NUMBER] || "",
      Data: line[LINE_DATE] || "",
      Periodo: line[LINE_PERIOD] || "",
      Cliente: invoice?.[INVOICE_CLIENT] || "",
      Total: roundMoney(totalDocumento),
      Diferenca: diferenca,
      Classificacao: line[LINE_CLASSIFICATION] || "",
      Descricao: line[LINE_DESCRIPTION] || ""
    };
  });

  // 6. Gerar CSV
  const header = [
    "Fatura",
    "Data",
    "Periodo",
    "Cliente",
    "Total",
    "Diferença",
    "Classificação",
    "Descrição"
  ];

  const csv = [
    header.join(";"),

    ...csvRows.map(row =>
      [
        csvValue(row.Fatura),
        csvValue(row.Data),
        csvValue(row.Periodo),
        csvValue(row.Cliente),
        csvValue(row.Total),
        csvValue(row.Diferenca),
        csvValue(row.Classificacao),
        csvValue(row.Descricao)
      ].join(";")
    )
  ].join("\n");

  return csv;
}

app.get("/download-repartitions-csv", async (req, res) => {
  try {
    const startPeriod = req.query.startPeriod;
    const endPeriod = req.query.endPeriod;

    if (!startPeriod || !endPeriod) {
      return res.status(400).json({
        error: true,
        message: "startPeriod and endPeriod are required"
      });
    }

    const csv = await generateCsv(startPeriod, endPeriod);

    const filename = `LinhasRepartição-${startPeriod}-${endPeriod}.csv`;

    res.setHeader(
      "Content-Type",
      "text/csv; charset=utf-8"
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`
    );

    return res.status(200).send(csv);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: true,
      message: error.message
    });
  }
});

app.get("/download-invoices-csv", async (req, res) => {

  try {

    const startPeriod = req.query.startPeriod;
    const endPeriod = req.query.endPeriod;

    if (!startPeriod || !endPeriod) {

      return res.status(400).json({
        error: true,
        message: "startPeriod and endPeriod are required"
      });

    }

    const rows = await queryGlide(
      `SELECT *
       FROM "native-table-58a45d53-05cf-4eea-adde-2730ba12fae7"
       WHERE "262As" >= $1
       AND "262As" <= $2
       AND "5rfPu" IS NOT NULL`,
      [startPeriod, endPeriod]
    );

    const header = [
      "Periodo",
      "TotDoc",
      "IVA",
      "ClienteID",
      "Nome Cliente",
      "Data",
      "Fact Nº",
      "Descrição"
    ];

    const csv = [
      header.join(";"),

      ...rows.map(row =>
        [
          csvValue(row["262As"]),
          csvValue(row["umVuQ"]),
          csvValue(row["kEvZS"]),
          csvValue(row["biits"]),
          csvValue(row["gXYWJ"]),
          csvValue(row["AEPfz"]),
          csvValue(row["eJ2AW"]),
          csvValue(row["RkU4z"])
        ].join(";")
      )

    ].join("\n");

    const filename =
      `Faturas-${startPeriod}-${endPeriod}.csv`;

    res.setHeader(
      "Content-Type",
      "text/csv; charset=utf-8"
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`
    );

    return res.status(200).send(csv);

  } catch (error) {

    console.error(error);

    return res.status(500).json({
      error: true,
      message: error.message
    });

  }

});

app.get("/download-repartitions-done-csv", async (req, res) => {
  try {

    const startPeriod = req.query.startPeriod;
    const endPeriod = req.query.endPeriod;
    const type = req.query.type;

    if (!startPeriod || !endPeriod) {
      return res.status(400).json({
        error: true,
        message: "startPeriod and endPeriod are required"
      });
    }

    let sql = `
      SELECT *
      FROM "native-table-21008154-b93a-4f15-b4f1-62c22ba70cd7"
      WHERE "dRT14" >= $1
      AND "dRT14" <= $2
    `;

    if (type === "billing") {
      sql += ` AND "YsKXL" = true`;
    }

    if (type === "costs") {
      sql += ` AND "YsKXL" = false`;
    }

    const rows = await queryGlide(
      sql,
      [startPeriod, endPeriod]
    );

    // Buscar direct lines
    const directIds = unique(
      rows.map(row => row["7gBfB"])
    );

    let directRows = [];

    if (directIds.length > 0) {

      const whereClause = buildOrWhere(
        "$rowID",
        directIds
      );

      directRows = await queryGlide(
        `
    SELECT *
    FROM "native-table-26edbc4a-60e2-4aed-942b-40e2cca7ef5c"
    WHERE ${whereClause}
    `,
        directIds
      );

    }

    const directById = new Map();

    for (const row of directRows) {
      directById.set(row["$rowID"], row);
    }

    // Buscar departamentos
    const departmentIds = unique(
      directRows.map(row => row["R8oF7"])
    );

    let departmentRows = [];

    if (departmentIds.length > 0) {

      const whereClause = buildOrWhere(
        "$rowID",
        departmentIds
      );

      departmentRows = await queryGlide(
        `
    SELECT *
    FROM "native-table-ChvXMAl4B9Bhpvye4TWl"
    WHERE ${whereClause}
    `,
        departmentIds
      );

    }

    const departmentsById = new Map();

    for (const row of departmentRows) {
      departmentsById.set(
        row["$rowID"],
        row["Name"]
      );
    }

    // Buscar classificações
    const classificationIds = unique(
      directRows.map(row => row["YwFZZ"])
    );

    let classificationRows = [];

    if (classificationIds.length > 0) {

      const whereClause = buildOrWhere(
        "$rowID",
        classificationIds
      );

      classificationRows = await queryGlide(
        `
    SELECT *
    FROM "native-table-pPpr36loCWcPL0dAbQJO"
    WHERE ${whereClause}
    `,
        classificationIds
      );

    }

    const classificationsById = new Map();

    for (const row of classificationRows) {
      classificationsById.set(
        row["$rowID"],
        row["Name"]
      );
    }

    const header = [
      "Periodo",
      "Data",
      "%",
      "Valor Atribuído",
      "TotalDoc",
      "DocNum",
      "Descrição",
      "Departamento",
      "Partner",
      "Classificação",
      "Natureza"
    ];

    const csv = [
      header.join(";"),

      ...rows.map(row => {

        const directLine =
          directById.get(row["7gBfB"]);

        const department = directLine
          ? departmentsById.get(
            directLine["R8oF7"]
          ) || ""
          : row["Y85OH"];

        const classification = directLine
          ? classificationsById.get(
            directLine["YwFZZ"]
          ) || ""
          : row["Zra8A"];

        return [
          csvValue(row["dRT14"]),
          csvValue(row["QJWoS"]),
          csvValue(row["Gka0L"]),
          csvValue(row["1mPSe"]),
          csvValue(row["R3XPM"]),
          csvValue(row["z5Cgv"]),
          csvValue(row["X5aUs"]),
          csvValue(department),
          csvValue(row["PfsKA"]),
          csvValue(classification),
          csvValue(row["ksFIZ"])
        ].join(";");

      })
   ].join("\n");

    const filename =
      `Repartições-${type || "all"}-${startPeriod}-${endPeriod}.csv`;

    res.setHeader(
      "Content-Type",
      "text/csv; charset=utf-8"
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`
    );

    return res.status(200).send(csv);

  } catch (error) {

    console.error(error);

    return res.status(500).json({
      error: true,
      message: error.message
    });

  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});