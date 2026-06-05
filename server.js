import express from "express";
import cors from "cors";
import * as glide from "@glideapps/tables";

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.json({
    status: "online"
  });
});

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

app.post("/multiply", async (req, res) => {

  try {

    const value = Number(req.body.value || 0);
    const result = value * 2;

    const rowId = await gratefulPenTable.add({
      inputNumber: value,
      response: JSON.stringify({
        result
      }),
      status: "200"
    });

    return res.status(200).json({
      result,
      rowId
    });

  } catch (error) {

    console.error("Error in /multiply:", error);

    try {

      await gratefulPenTable.add({
        inputNumber: Number(req.body?.value || 0),
        response: error.message,
        status: String(error.status || 500)
      });

    } catch (glideError) {

      console.error("Failed to write error to Glide:", glideError);

    }

    return res.status(error.status || 500).json({
      error: true,
      message: error.message
    });

  }

});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});