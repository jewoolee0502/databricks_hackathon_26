const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const { DATABRICKS_HOST, DATABRICKS_TOKEN, DATABRICKS_WAREHOUSE_ID } =
  process.env;

// ── Databricks SQL query helper ──
async function runQuery(sql) {
  const response = await fetch(
    `${DATABRICKS_HOST}/api/2.0/sql/statements/`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${DATABRICKS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        warehouse_id: DATABRICKS_WAREHOUSE_ID,
        catalog: "montreal_hackathon",
        schema: "quebec_data",
        statement: sql,
        wait_timeout: "50s",
      }),
    }
  );

  const data = await response.json();

  if (data.status?.state !== "SUCCEEDED") {
    throw new Error(
      `Query failed: ${data.status?.state} — ${JSON.stringify(data.status?.error ?? data.message ?? "")}`
    );
  }

  const columns = data.manifest.schema.columns.map((c) => c.name);
  const rows = (data.result?.data_array ?? []).map((row) =>
    Object.fromEntries(columns.map((col, i) => [col, row[i]]))
  );

  return { rows, columns, totalRows: data.manifest.total_row_count };
}

// ── Cache layer ──
const cache = {};
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

function getCached(key) {
  const entry = cache[key];
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
  return null;
}

function setCache(key, data) {
  cache[key] = { data, ts: Date.now() };
}

// ── 1. Mapbox heatmap GeoJSON per hour ──
// Aggregates stop locations by hour, returns GeoJSON FeatureCollection
let heatmapAllHours = null;

async function loadHeatmapData() {
  if (heatmapAllHours && Date.now() - heatmapAllHours.ts < CACHE_TTL) {
    return heatmapAllHours.data;
  }

  console.log("[heatmap] Querying Databricks for stop-level aggregation...");

  const { rows } = await runQuery(`
    SELECT
      CAST(stop_lat AS DOUBLE) as lat,
      CAST(stop_lon AS DOUBLE) as lon,
      CAST(arrival_hour AS INT) as hour,
      COUNT(*) as trip_count
    FROM montreal_hackathon.quebec_data.silver_transit_stm_stop_times_enriched
    WHERE stop_lat IS NOT NULL AND stop_lon IS NOT NULL AND arrival_hour IS NOT NULL
    GROUP BY stop_lat, stop_lon, arrival_hour
    ORDER BY arrival_hour
  `);

  console.log(`[heatmap] Got ${rows.length} aggregated rows`);

  // Bucket by hour and build GeoJSON
  const hourBuckets = {};
  for (let h = 0; h < 24; h++) hourBuckets[h] = [];

  for (const row of rows) {
    const h = parseInt(row.hour, 10);
    const lat = parseFloat(row.lat);
    const lon = parseFloat(row.lon);
    const count = parseInt(row.trip_count, 10);
    if (isNaN(h) || h < 0 || h > 23 || isNaN(lat) || isNaN(lon)) continue;
    hourBuckets[h].push({ lat, lon, count });
  }

  // Build 24 GeoJSON FeatureCollections with log-normalized weights
  const result = {};
  for (let h = 0; h < 24; h++) {
    const points = hourBuckets[h];
    if (points.length === 0) {
      result[h] = { type: "FeatureCollection", features: [] };
      continue;
    }

    const counts = points.map((p) => p.count);
    const logCounts = counts.map((c) => Math.log1p(c));
    const maxLog = Math.max(...logCounts);

    const features = points.map((p, i) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [p.lon, p.lat] },
      properties: {
        weight: maxLog > 0 ? Math.round((logCounts[i] / maxLog) * 10000) / 10000 : 0,
        count: p.count,
      },
    }));

    result[h] = { type: "FeatureCollection", features };
    console.log(
      `  Hour ${String(h).padStart(2, "0")}: ${features.length} stops, max count = ${Math.max(...counts)}`
    );
  }

  heatmapAllHours = { data: result, ts: Date.now() };
  return result;
}

app.get("/api/heatmap/:hour", async (req, res) => {
  try {
    const hour = parseInt(req.params.hour, 10);
    if (isNaN(hour) || hour < 0 || hour > 23) {
      return res.status(400).json({ error: "Hour must be 0-23" });
    }
    const allHours = await loadHeatmapData();
    res.json(allHours[hour]);
  } catch (err) {
    console.error("[heatmap] Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── 2. Route-hour heatmap matrix ──
app.get("/api/route-hour-matrix", async (req, res) => {
  try {
    const cached = getCached("route-hour-matrix");
    if (cached) return res.json(cached);

    console.log("[route-hour] Querying...");

    const { rows } = await runQuery(`
      WITH route_totals AS (
        SELECT
          route_id,
          route_long_name,
          CAST(arrival_hour AS INT) as hour,
          COUNT(*) as trips
        FROM montreal_hackathon.quebec_data.silver_transit_stm_stop_times_enriched
        WHERE arrival_hour IS NOT NULL
        GROUP BY route_id, route_long_name, arrival_hour
      ),
      ranked AS (
        SELECT *, SUM(trips) OVER (PARTITION BY route_id) as total_trips
        FROM route_totals
      )
      SELECT CONCAT(route_id, ' ', route_long_name) as route_label, hour, trips
      FROM ranked
      ORDER BY total_trips DESC, route_id, hour
    `);

    // Build matrix: unique routes (ordered by total trips desc) × 24 hours
    const routeMap = new Map();
    for (const row of rows) {
      const label = row.route_label;
      const h = parseInt(row.hour, 10);
      const trips = parseInt(row.trips, 10);
      if (!routeMap.has(label)) routeMap.set(label, new Array(24).fill(0));
      routeMap.get(label)[h] = trips;
    }

    const routeLabels = [...routeMap.keys()].slice(0, 30); // top 30 routes
    const values = routeLabels.map((r) => routeMap.get(r));
    const hourLabels = Array.from({ length: 24 }, (_, i) =>
      String(i).padStart(2, "0")
    );

    const result = {
      id: "route-hour",
      title: "Transit Trip Intensity by Route and Hour",
      description:
        "STM bus routes by hour — real data from Databricks. Ranked by total daily trips.",
      xLabels: hourLabels,
      yLabels: routeLabels,
      values,
      valueLabel: "Trips",
    };

    setCache("route-hour-matrix", result);
    console.log(`[route-hour] ${routeLabels.length} routes`);
    res.json(result);
  } catch (err) {
    console.error("[route-hour] Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── 3. Stop-sequence-hour heatmap matrix ──
app.get("/api/stop-hour-matrix", async (req, res) => {
  try {
    const cached = getCached("stop-hour-matrix");
    if (cached) return res.json(cached);

    console.log("[stop-hour] Querying...");

    const { rows } = await runQuery(`
      SELECT
        CAST(stop_sequence AS INT) as seq,
        CAST(arrival_hour AS INT) as hour,
        COUNT(*) as departures
      FROM montreal_hackathon.quebec_data.silver_transit_stm_stop_times_enriched
      WHERE stop_sequence IS NOT NULL AND stop_sequence <= 40 AND arrival_hour IS NOT NULL
      GROUP BY stop_sequence, arrival_hour
      ORDER BY stop_sequence, arrival_hour
    `);

    // Build matrix
    const maxSeq = Math.min(
      40,
      Math.max(...rows.map((r) => parseInt(r.seq, 10)).filter((n) => !isNaN(n)))
    );
    const seqLabels = Array.from({ length: maxSeq }, (_, i) => `Stop ${i + 1}`);
    const values = Array.from({ length: maxSeq }, () => new Array(24).fill(0));

    for (const row of rows) {
      const seq = parseInt(row.seq, 10) - 1; // 0-indexed
      const h = parseInt(row.hour, 10);
      const deps = parseInt(row.departures, 10);
      if (seq >= 0 && seq < maxSeq && h >= 0 && h < 24) {
        values[seq][h] = deps;
      }
    }

    const hourLabels = Array.from({ length: 24 }, (_, i) =>
      String(i).padStart(2, "0")
    );

    const result = {
      id: "stop-sequence-hour",
      title: "Departure Activity by Stop Sequence and Hour",
      description:
        "Departures by stop position and hour — real data from Databricks.",
      xLabels: hourLabels,
      yLabels: seqLabels,
      values,
      valueLabel: "Departures",
    };

    setCache("stop-hour-matrix", result);
    console.log(`[stop-hour] ${seqLabels.length} stop positions`);
    res.json(result);
  } catch (err) {
    console.error("[stop-hour] Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── 4. Route list ──
app.get("/api/routes", async (req, res) => {
  try {
    const cached = getCached("routes");
    if (cached) return res.json(cached);

    const { rows } = await runQuery(`
      SELECT DISTINCT
        route_id,
        route_long_name,
        COUNT(*) as trip_count
      FROM montreal_hackathon.quebec_data.silver_transit_stm_stop_times_enriched
      WHERE route_id IS NOT NULL
      GROUP BY route_id, route_long_name
      ORDER BY trip_count DESC
    `);

    const result = rows.map((r) => ({
      route_id: r.route_id,
      route_long_name: r.route_long_name,
      label: `${r.route_id} ${r.route_long_name}`,
      trip_count: parseInt(r.trip_count, 10),
    }));

    setCache("routes", result);
    console.log(`[routes] ${result.length} routes`);
    res.json(result);
  } catch (err) {
    console.error("[routes] Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── 5. Summary stats ──
app.get("/api/summary", async (req, res) => {
  try {
    const cached = getCached("summary");
    if (cached) return res.json(cached);

    const { rows } = await runQuery(`
      SELECT
        COUNT(*) as total_events,
        COUNT(DISTINCT route_id) as total_routes,
        COUNT(DISTINCT stop_id) as total_stops
      FROM montreal_hackathon.quebec_data.silver_transit_stm_stop_times_enriched
    `);

    const { rows: peakRows } = await runQuery(`
      SELECT CAST(arrival_hour AS INT) as hour, COUNT(*) as cnt
      FROM montreal_hackathon.quebec_data.silver_transit_stm_stop_times_enriched
      WHERE arrival_hour IS NOT NULL
      GROUP BY arrival_hour
      ORDER BY cnt DESC
      LIMIT 1
    `);

    // Busiest stops
    const { rows: busyStops } = await runQuery(`
      SELECT stop_name, stop_id, COUNT(*) as trip_count
      FROM montreal_hackathon.quebec_data.silver_transit_stm_stop_times_enriched
      WHERE stop_name IS NOT NULL
      GROUP BY stop_name, stop_id
      ORDER BY trip_count DESC
      LIMIT 10
    `);

    const result = {
      totalEvents: parseInt(rows[0]?.total_events ?? "0", 10),
      totalRoutes: parseInt(rows[0]?.total_routes ?? "0", 10),
      totalStops: parseInt(rows[0]?.total_stops ?? "0", 10),
      peakHour: peakRows[0]
        ? `${String(parseInt(peakRows[0].hour, 10)).padStart(2, "0")}:00`
        : "--:--",
      busiestStops: busyStops.map((s) => ({
        stop_name: s.stop_name,
        stop_id: s.stop_id,
        trip_count: parseInt(s.trip_count, 10),
      })),
    };

    setCache("summary", result);
    console.log(`[summary] ${result.totalEvents} total events`);
    res.json(result);
  } catch (err) {
    console.error("[summary] Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── 6. Raw stop times (paginated) ──
app.get("/api/stop-times", async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 10000);
  const offset = parseInt(req.query.offset) || 0;

  try {
    const { rows, columns, totalRows } = await runQuery(`
      SELECT *
      FROM montreal_hackathon.quebec_data.silver_transit_stm_stop_times_enriched
      LIMIT ${limit} OFFSET ${offset}
    `);

    res.json({ data: rows, totalRows, columns });
  } catch (err) {
    console.error("[stop-times] Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Health check ──
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", host: DATABRICKS_HOST });
});

app.listen(process.env.PORT || 3001, () => {
  console.log(`STM API proxy running on port ${process.env.PORT || 3001}`);
  console.log(`Databricks host: ${DATABRICKS_HOST}`);
});
