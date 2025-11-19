// server.js
require("dotenv").config();
const http = require("http");
const url = require("url");
const fs = require("fs");
const path = require("path");
const csv = require("csv-parser"); // npm install csv-parser
const pool = require("./db/pg");
const mongoClient = require("./db/mongo");

const PORT = process.env.PORT || 3000;
const BATCH_SIZE = 100;

// Helper to send JSON
function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

// POST /upload handler
async function handleUpload(req, res) {
  const contentType = req.headers["content-type"];
  if (!contentType || !contentType.includes("text/csv")) {
    sendJSON(res, 415, { message: "Unsupported Media Type" });
    return;
  }

  let batch = [];
  let totalEvents = 0;
  const client = await pool.connect();

  try {
    await client.query("BEGIN"); // Start transaction for first batch

    req
      .pipe(csv())
      .on("data", async (row) => {
        // row = { user_id, event_type, timestamp, data_payload_json }
        batch.push(row);

        if (batch.length >= BATCH_SIZE) {
          req.pause(); // pause stream to finish batch insert

          try {
            const queryText = `
              INSERT INTO events (user_id, event_type, timestamp, data_payload_json)
              VALUES ${batch
                .map(
                  (_, i) =>
                    `($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3}, $${
                      i * 4 + 4
                    }::jsonb)`
                )
                .join(", ")}
            `;
            const values = batch.flatMap((row) => [
              row.user_id,
              row.event_type,
              row.timestamp,
              row.data_payload_json || "{}",
            ]);

            await client.query(queryText, values);
            totalEvents += batch.length;
            batch = [];
            req.resume();
          } catch (err) {
            await client.query("ROLLBACK");
            console.error("Batch insert failed:", err);
            sendJSON(res, 400, { message: "Invalid CSV data" });
            req.destroy();
          }
        }
      })
      .on("end", async () => {
        // Insert remaining batch
        if (batch.length > 0) {
          try {
            const queryText = `
              INSERT INTO events (user_id, event_type, timestamp, data_payload_json)
              VALUES ${batch
                .map(
                  (_, i) =>
                    `($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3}, $${
                      i * 4 + 4
                    }::jsonb)`
                )
                .join(", ")}
            `;
            const values = batch.flatMap((row) => [
              row.user_id,
              row.event_type,
              row.timestamp,
              row.data_payload_json || "{}",
            ]);
            await client.query(queryText, values);
            totalEvents += batch.length;
          } catch (err) {
            await client.query("ROLLBACK");
            console.error("Final batch insert failed:", err);
            sendJSON(res, 400, { message: "Invalid CSV data" });
            return;
          }
        }

        await client.query("COMMIT");
        console.log(`Processed ${totalEvents} events`);

        // TODO: calculate summary and insert into MongoDB
        const summary = {
          processed_at: new Date(),
          total_events: totalEvents,
          // You can calculate unique_users, event_counts here
        };
        const db = mongoClient.db(process.env.MONGO_DB);
        await db.collection("report_summaries").insertOne(summary);

        sendJSON(res, 201, {
          message: "CSV processed successfully",
          totalEvents,
        });
      })
      .on("error", async (err) => {
        await client.query("ROLLBACK");
        console.error("CSV stream error:", err);
        sendJSON(res, 400, { message: "CSV parsing error" });
      });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Transaction error:", err);
    sendJSON(res, 500, { message: "Server error" });
  } finally {
    client.release();
  }
}

// Main server
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const method = req.method;
  const pathname = parsedUrl.pathname;

  if (method === "POST" && pathname === "/upload") {
    await handleUpload(req, res);
    return;
  }

  // ----------------------
  // GET /reports/:id
  // ----------------------
  if (req.method === "GET" && req.url.startsWith("/reports/")) {
    const reportId = req.url.split("/")[2];

    // Validate ID format
    if (!reportId || reportId.length !== 24) {
      sendJSON(res, 400, { message: "Invalid report ID" });
      return;
    }

    // Spawn child process
    const child = spawn("node", ["report-generator.js", reportId], {
      stdio: "inherit", // show logs in console
    });

    child.on("exit", (code) => {
      if (code !== 0) {
        sendJSON(res, 500, { message: "Failed to generate report" });
        return;
      }

      // Success → read file from /tmp
      const filePath = path.join("/tmp", `report-${reportId}.json`);

      if (!fs.existsSync(filePath)) {
        sendJSON(res, 500, { message: "Report file missing" });
        return;
      }

      const data = fs.readFileSync(filePath, "utf8");

      res.writeHead(200, {
        "Content-Type": "application/json",
      });
      res.end(data);
    });

    return;
  }

  sendJSON(res, 404, { message: "Route not found" });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
