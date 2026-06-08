import express from "express";
import cors from "cors";

const app = express();

app.use(cors());
app.use(express.json({ limit: "20mb" }));

const PORT = process.env.PORT || 3000;

const GLIDE_TOKEN = process.env.GLIDE_TOKEN;
const APP_ID = "OdRQ0L0u80jqFb1hqqkt";

const LINES_TABLE =
  "native-table-6ea5b163-55db-41a7-a2df-dff68f5f6bdc";

const INVOICES_TABLE =
  "native-table-58a45d53-05cf-4eea-adde-2730ba12fae7";

// Principal
const LINE_DESCRIPTION = "22PNh";
const LINE_PERIOD = "DW2Fx";
const LINE_VALUE = "yGrYk";
const LINE_INVOICE_IMPORT_ID = "waVXq";
const LINE_DATE = "WT9Iw";
const LINE_CLASSIFICATION = "WiJpe";

// Faturas
const INVOICE_IMPORT_ID = "5rfPu";
const INVOICE_CLIENT = "gXYWJ";
const INVOICE_NUMBER = "eJ2AW";

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

  if (value === null || value === undefined)
    return "";

  return `"${String(value).replace(/"/g, '""')}"`;

}

async function generateCsv(startPeriod, endPeriod) {

const lineRows = await queryGlide(
  `SELECT *
   FROM "${LINES_TABLE}"
   WHERE "${LINE_PERIOD}" >= $1
   AND "${LINE_PERIOD}" <= $2
   AND "0TgSg" = '🔴'`,
  [startPeriod, endPeriod]
);

  const invoiceIds = unique(
    lineRows.map(
      row => row[LINE_INVOICE_IMPORT_ID]
    )
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

  const csvRows = lineRows.map(line => {

    const invoice =
      invoicesByImportId.get(
        line[LINE_INVOICE_IMPORT_ID]
      );

    return {
      Fatura:
        invoice?.[INVOICE_NUMBER] || "",

      Data:
        line[LINE_DATE] || "",

      Periodo:
        line[LINE_PERIOD] || "",

      Cliente:
      invoice?.[INVOICE_CLIENT] || "",

      Total:
        line[LINE_VALUE] || "",

      Diferenca:
        "",

      Classificacao:
        line[LINE_CLASSIFICATION] || "",

      Descricao:
        line[LINE_DESCRIPTION] || ""
    };

  });

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

app.get("/download-csv", async (req, res) => {

  try {

    const startPeriod =
      req.query.startPeriod;

    const endPeriod =
      req.query.endPeriod;

    if (!startPeriod || !endPeriod) {

      return res.status(400).json({
        error: true,
        message:
          "startPeriod and endPeriod are required"
      });

    }

    const csv = await generateCsv(
      startPeriod,
      endPeriod
    );

    const filename =
      `export-${startPeriod}-${endPeriod}.csv`;

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

  console.log(
    `Server running on port ${PORT}`
  );

});