/**
 * report-generator.js
 *
 * This script is executed via child_process.spawn from server.js.
 * It receives a MongoDB report ID as argv[2].
 *
 * It:
 *  1. Loads summary from MongoDB
 *  2. Loads raw events from PostgreSQL
 *  3. Writes combined result to /tmp/report-{id}.json
 *  4. Exits with 0 (success) or 1 (failure)
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { ObjectId } = require('mongodb');
const { pgClient } = require('./db/pg');     // your Postgres connection
const { mongoClient } = require('./db/mongo'); // your Mongo client

async function generateReport() {
  const reportId = process.argv[2];

  if (!reportId) {
    console.error("No report ID passed");
    process.exit(1);
  }

  try {
    // 1. Connect DBs
    await pgClient.connect();
    await mongoClient.connect();

    const db = mongoClient.db(process.env.MONGO_DB);

    // 2. Load summary document
    const summary = await db
      .collection('report_summaries')
      .findOne({ _id: new ObjectId(reportId) });

    if (!summary) {
      console.error("No summary found for ID:", reportId);
      process.exit(1);
    }

    // 3. Load raw events from PostgreSQL
    const { rows: events } = await pgClient.query(
      `SELECT user_id, event_type, timestamp, data_payload_json
       FROM events
       ORDER BY timestamp ASC`
    );

    // 4. Build final report object
    const reportData = {
      report_id: reportId,
      generated_at: new Date(),
      summary,
      total_events: events.length,
      events,
    };

    // 5. Write to /tmp
    const filePath = path.join('/tmp', `report-${reportId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(reportData, null, 2));

    console.log("Report created:", filePath);

    process.exit(0);
  } catch (error) {
    console.error("Error generating report:", error);
    process.exit(1);
  }
}

generateReport();
