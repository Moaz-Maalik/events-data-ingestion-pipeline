# Data Ingestion Pipeline

A high-performance **Node.js data ingestion and analytics pipeline** designed to handle large-scale event processing and reporting. This project demonstrates advanced backend engineering concepts, including asynchronous I/O, relational and NoSQL databases, streaming data processing, and decoupled report generation.

## Features

- **Streaming CSV ingestion**: Efficiently handle large CSV files without loading them entirely into memory using Node.js Streams and Buffers.
- **Batch insertion with ACID compliance**: Store raw events in PostgreSQL using transactions for data integrity.
- **Aggregated analytics**: Summarize event data in MongoDB, storing flexible, schema-less documents.
- **Child-process report generation**: Generate combined SQL + NoSQL reports in JSON via a separate Node.js process.
- **Minimal HTTP server**: No frameworks used — endpoints for uploading events and retrieving reports.
- **Scalable and reliable**: Designed to handle high-volume event processing and safe reporting.

## Project Structure

````

phase1-data-ingest/
│
├── server.js              # Base HTTP server
├── csv-processor.js       # CSV streaming and batch insertion
├── report-generator.js    # Generates JSON reports from Postgres + Mongo
│
├── db/
│   ├── pg.js              # PostgreSQL connection
│   └── mongo.js           # MongoDB connection
│
├── .env                   # Environment variables
└── package.json

````

## Getting Started

### 1. Clone the repository
```bash
git clone https://github.com/YOUR_USERNAME/data-ingestion-pipeline.git
cd data-ingestion-pipeline
````

### 2. Install dependencies

```bash
npm install
```

### 3. Setup Databases

* **PostgreSQL**: Create `users` and `events` tables.
* **MongoDB**: Create a database for `report_summaries`.

### 4. Configure environment

Create a `.env` file:

```
PG_HOST=localhost
PG_USER=postgres
PG_PASSWORD=yourpassword
PG_DB=events_db
MONGO_URI=mongodb://localhost:27017
MONGO_DB=events_reports
PORT=3000
```

### 5. Start the server

```bash
node server.js
```

## Usage

### Upload events

POST `/upload` with JSON body:

```json
{
  "events": [
    { "user_id": "123", "event_type": "login", "data_payload_json": {} },
    { "user_id": "456", "event_type": "click", "data_payload_json": { "page": "home" } }
  ]
}
```

**Response**:

```json
{
  "report_id": "64a3b1c5d6f7e8a9b0c12345"
}
```

### Retrieve report

GET `/reports/:id`

* Spawns `report-generator.js` to create `/tmp/report-<id>.json`
* Returns combined summary + raw events JSON.



