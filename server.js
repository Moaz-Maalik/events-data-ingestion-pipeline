import http from 'http';
import { parse } from 'url';
import { spawn } from 'child_process';
import { postgresClient } from './connections/postgres.js';
import { mongoClient } from './connections/mongo.js';
import fs from 'fs';
import path from 'path';

// Helper to parse JSON body
async function getJSONBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error('Invalid JSON'));
      }
    });
  });
}

// ---- Router ----
const server = http.createServer(async (req, res) => {
  const { pathname } = parse(req.url, true);

  // ------------------------------
  // 📌 1. POST /upload
  // ------------------------------
  if (req.method === 'POST' && pathname === '/upload') {
    try {
      const data = await getJSONBody(req);

      const events = data.events;
      if (!Array.isArray(events)) {
        res.writeHead(400);
        return res.end(JSON.stringify({ error: 'events must be an array' }));
      }

      // Insert events into PostgreSQL
      const pg = postgresClient;

      for (const evt of events) {
        await pg.query(
          'INSERT INTO events (user_id, action, metadata) VALUES ($1, $2, $3)',
          [evt.user_id, evt.action, evt.metadata || {}]
        );
      }

      // Create summary
      const summary = {
        created_at: new Date(),
        total_events: events.length
      };

      // Save summary in MongoDB
      const db = mongoClient.db(process.env.MONGO_DB);
      const result = await db.collection('report_summaries').insertOne(summary);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ report_id: result.insertedId }));

    } catch (err) {
      console.error(err);
      res.writeHead(500);
      res.end(JSON.stringify({ error: 'upload failed' }));
    }
    return;
  }

  // ------------------------------
  // 📌 2. GET /reports/:id
  // ------------------------------
  if (req.method === 'GET' && pathname.startsWith('/reports/')) {
    const id = pathname.split('/')[2];

    // Spawn the generator
    const subprocess = spawn('node', ['report-generator.js', id], {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let output = '';
    subprocess.stdout.on('data', chunk => (output += chunk));
    subprocess.stderr.on('data', chunk => console.error('GEN ERROR:', chunk.toString()));

    subprocess.on('close', code => {
      if (code !== 0) {
        res.writeHead(500);
        return res.end(JSON.stringify({ error: 'Report generation failed' }));
      }

      const filePath = `/tmp/report-${id}.json`;
      if (!fs.existsSync(filePath)) {
        res.writeHead(404);
        return res.end(JSON.stringify({ error: 'Report not found' }));
      }

      const fileStream = fs.createReadStream(filePath);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      fileStream.pipe(res);
    });

    return;
  }

  // Default
  res.writeHead(404);
  res.end('Not found');
});

// Start server
server.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});

