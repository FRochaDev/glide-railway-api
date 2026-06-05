import express from "express";
import cors from "cors";
import * as glide from "@glideapps/tables";

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

const gratefulPenTable = glide.table({
  token: process.env.GLIDE_TOKEN,
  app: "hscl4V0VoiMpK9mxpx17",
  table: "native-table-SA33qmMpIzkczl6DMc0e",
  columns: {
    inputNumber: { type: "number", name: "Name" },
    response: { type: "string", name: "xmPst" },
    status: { type: "string", name: "4l7aC" }
  }
});

app.get("/", (req, res) => {
  res.json({
    status: "online"
  });
});

app.post("/multiply", async (req, res) => {
  const value = Number(req.body.value || 0);
  const result = value * 2;

  const rowId = await gratefulPenTable.add({
    inputNumber: value,
    response: JSON.stringify({
      result
    }),
    status: "Done"
  });

  res.json({
    result,
    rowId
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});