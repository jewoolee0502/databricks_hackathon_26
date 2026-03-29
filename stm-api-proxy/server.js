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
      COUNT(*) as trip_count,
      FIRST(stop_name) as stop_name,
      FIRST(stop_id) as stop_id,
      CONCAT_WS(', ', COLLECT_SET(CONCAT(route_id, ' ', route_long_name))) as routes
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
    hourBuckets[h].push({
      lat, lon, count,
      stop_name: row.stop_name || '',
      stop_id: row.stop_id || '',
      routes: row.routes || '',
    });
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
        stop_name: p.stop_name,
        stop_id: p.stop_id,
        routes: p.routes,
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

// ── 7. Suggestions engine ──

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function rageScore(ridersAffected, waitMinutes, frequency) {
  return ridersAffected * Math.pow(Math.max(waitMinutes, 0.5), 1.5) * frequency;
}

app.get("/api/suggestions", async (req, res) => {
  try {
    const cached = getCached("suggestions");
    if (cached) return res.json(cached);

    console.log("[suggestions] Running 4 queries in parallel...");

    const TABLE =
      "montreal_hackathon.quebec_data.silver_transit_stm_stop_times_enriched";

    const [bottleneckResult, stopVolumeResult, routeDepResult, routeTotalsResult] =
      await Promise.all([
        // Query A: Bottleneck stops (3+ routes converging at same hour)
        runQuery(`
          SELECT stop_id, FIRST(stop_name) AS stop_name,
            CAST(stop_lat AS DOUBLE) AS lat, CAST(stop_lon AS DOUBLE) AS lon,
            CAST(arrival_hour AS INT) AS hour,
            COUNT(DISTINCT route_id) AS route_count,
            COUNT(*) AS trip_count,
            CONCAT_WS(', ', COLLECT_SET(route_id)) AS route_ids
          FROM ${TABLE}
          WHERE stop_lat IS NOT NULL AND stop_lon IS NOT NULL AND arrival_hour IS NOT NULL
          GROUP BY stop_id, stop_lat, stop_lon, arrival_hour
          HAVING COUNT(DISTINCT route_id) >= 3
          ORDER BY trip_count DESC
          LIMIT 200
        `),
        // Query B: Stop-level hourly volumes for proximity matching
        runQuery(`
          SELECT stop_id, FIRST(stop_name) AS stop_name,
            CAST(stop_lat AS DOUBLE) AS lat, CAST(stop_lon AS DOUBLE) AS lon,
            route_id, FIRST(route_long_name) AS route_long_name,
            CAST(arrival_hour AS INT) AS hour,
            COUNT(*) AS trip_count
          FROM ${TABLE}
          WHERE stop_lat IS NOT NULL AND stop_lon IS NOT NULL AND arrival_hour IS NOT NULL
          GROUP BY stop_id, stop_lat, stop_lon, route_id, arrival_hour
          HAVING COUNT(*) >= 5
          ORDER BY trip_count DESC
          LIMIT 2000
        `),
        // Query C: Route hourly departures for headway estimation
        runQuery(`
          SELECT route_id, FIRST(route_long_name) AS route_long_name,
            CAST(arrival_hour AS INT) AS hour,
            COUNT(*) AS departures,
            COUNT(DISTINCT stop_id) AS stop_count
          FROM ${TABLE}
          WHERE arrival_hour IS NOT NULL
          GROUP BY route_id, arrival_hour
          ORDER BY departures DESC
          LIMIT 500
        `),
        // Query D: Route totals for underused line detection
        runQuery(`
          SELECT route_id, FIRST(route_long_name) AS route_long_name,
            COUNT(*) AS total_trips,
            COUNT(DISTINCT stop_id) AS stop_count,
            COUNT(DISTINCT arrival_hour) AS active_hours
          FROM ${TABLE}
          WHERE arrival_hour IS NOT NULL
          GROUP BY route_id
          ORDER BY total_trips ASC
          LIMIT 100
        `),
      ]);

    const suggestions = [];

    // ── Build headway lookup from Query C ──
    const headwayMap = {};
    const routeNameMap = {};
    for (const r of routeDepResult.rows) {
      const hour = parseInt(r.hour, 10);
      const key = `${r.route_id}-${hour}`;
      const deps = parseInt(r.departures, 10);
      const stops = parseInt(r.stop_count, 10);
      headwayMap[key] = 60 / Math.max(deps / Math.max(stops, 1), 1);
      if (!routeNameMap[r.route_id]) routeNameMap[r.route_id] = r.route_long_name;
    }

    // ── Build route-hour map for gap detection ──
    const routeHourMap = {};
    for (const r of routeDepResult.rows) {
      const rid = r.route_id;
      const hour = parseInt(r.hour, 10);
      const deps = parseInt(r.departures, 10);
      const stops = parseInt(r.stop_count, 10);
      if (!routeHourMap[rid]) routeHourMap[rid] = {};
      routeHourMap[rid][hour] = { departures: deps, stopCount: stops };
    }

    // ── Step 1: Bottleneck suggestions ──
    const bottlenecks = bottleneckResult.rows
      .map((r) => ({
        stopId: r.stop_id,
        stopName: r.stop_name,
        lat: parseFloat(r.lat),
        lon: parseFloat(r.lon),
        hour: parseInt(r.hour, 10),
        routeCount: parseInt(r.route_count, 10),
        tripCount: parseInt(r.trip_count, 10),
        routeIds: r.route_ids,
      }))
      .sort((a, b) => b.tripCount * b.routeCount - a.tripCount * a.routeCount)
      .slice(0, 4);

    for (const b of bottlenecks) {
      const estHeadway = 60 / Math.max(b.tripCount / b.routeCount, 1);
      suggestions.push({
        id: `bottleneck-${b.stopId}-${b.hour}`,
        category: "bottleneck",
        action: `Add capacity at ${b.stopName} during ${String(b.hour).padStart(2, "0")}:00`,
        projectedOutcome: `Reduce overload at ${b.routeCount}-route junction serving ${b.tripCount} trips/hr (routes: ${b.routeIds})`,
        rageScore: rageScore(b.tripCount, estHeadway, b.routeCount),
        hour: b.hour,
        ridersAffected: b.tripCount,
      });
    }

    // ── Step 2: Connection pairs & misses ──
    const stopVolumes = stopVolumeResult.rows.map((r) => ({
      stopId: r.stop_id,
      stopName: r.stop_name,
      lat: parseFloat(r.lat),
      lon: parseFloat(r.lon),
      routeId: r.route_id,
      routeName: r.route_long_name,
      hour: parseInt(r.hour, 10),
      tripCount: parseInt(r.trip_count, 10),
    }));

    const byHour = {};
    for (const sv of stopVolumes) {
      if (!byHour[sv.hour]) byHour[sv.hour] = [];
      byHour[sv.hour].push(sv);
    }

    const connectionPairs = [];
    const GRID_SIZE = 0.005;

    for (const hour of Object.keys(byHour)) {
      const stops = byHour[hour];
      const grid = {};
      for (const s of stops) {
        const gx = Math.floor(s.lat / GRID_SIZE);
        const gy = Math.floor(s.lon / GRID_SIZE);
        const key = `${gx},${gy}`;
        if (!grid[key]) grid[key] = [];
        grid[key].push(s);
      }

      const checked = new Set();
      for (const key of Object.keys(grid)) {
        const [gx, gy] = key.split(",").map(Number);
        const neighbors = [];
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            const nk = `${gx + dx},${gy + dy}`;
            if (grid[nk]) neighbors.push(...grid[nk]);
          }
        }

        for (const a of grid[key]) {
          for (const b of neighbors) {
            if (a.routeId === b.routeId) continue;
            if (a.stopId === b.stopId) continue;
            const pairKey = [a.stopId, b.stopId, a.routeId, b.routeId, hour]
              .sort()
              .join("|");
            if (checked.has(pairKey)) continue;
            checked.add(pairKey);

            const dist = haversineMeters(a.lat, a.lon, b.lat, b.lon);
            if (dist <= 500) {
              connectionPairs.push({
                stopA: a,
                stopB: b,
                hour: parseInt(hour, 10),
                distance: Math.round(dist),
                combinedTrips: a.tripCount + b.tripCount,
              });
            }
          }
        }
      }
    }

    connectionPairs.sort((a, b) => b.combinedTrips - a.combinedTrips);
    const topPairs = connectionPairs.slice(0, 6);

    for (const pair of topPairs) {
      const headwayB =
        headwayMap[`${pair.stopB.routeId}-${pair.hour}`] || 15;
      const avgWait = headwayB / 2;

      if (avgWait < 2) {
        suggestions.push({
          id: `miss-${pair.stopA.stopId}-${pair.stopB.stopId}-${pair.hour}`,
          category: "connection-miss",
          action: `Shift Route ${pair.stopB.routeId} departure by 3-5 min at ${pair.stopB.stopName} (${String(pair.hour).padStart(2, "0")}:00)`,
          projectedOutcome: `Eliminates connection miss for ${pair.combinedTrips} riders between Route ${pair.stopA.routeId} and Route ${pair.stopB.routeId} (current gap: ${avgWait.toFixed(1)} min)`,
          rageScore: rageScore(pair.combinedTrips, Math.max(avgWait, 0.5), 2),
          hour: pair.hour,
          ridersAffected: pair.combinedTrips,
        });
      }
    }

    // ── Step 3: Schedule gaps — routes with huge headways (bus won't come for 1hr+) ──
    for (const rid of Object.keys(routeHourMap)) {
      const hours = routeHourMap[rid];
      const activeHours = Object.keys(hours).map(Number).sort((a, b) => a - b);
      if (activeHours.length < 2) continue;

      for (let i = 0; i < activeHours.length - 1; i++) {
        const gap = activeHours[i + 1] - activeHours[i];
        if (gap >= 2) {
          // There's a gap of 2+ hours with no service
          const beforeHour = activeHours[i];
          const afterHour = activeHours[i + 1];
          const beforeData = hours[beforeHour];
          const ridersWaiting = Math.round(beforeData.departures * 0.3); // estimate 30% need onward travel
          const name = routeNameMap[rid] || rid;

          suggestions.push({
            id: `gap-${rid}-${beforeHour}-${afterHour}`,
            category: "schedule-gap",
            action: `Add bus to Route ${rid} between ${String(beforeHour).padStart(2, "0")}:00-${String(afterHour).padStart(2, "0")}:00`,
            projectedOutcome: `Fills ${gap}-hour service gap on ${name}; ~${ridersWaiting} riders currently stranded with no bus for ${gap} hours`,
            rageScore: rageScore(ridersWaiting, gap * 30, 1), // gap in half-hours as wait proxy
            hour: beforeHour,
            ridersAffected: ridersWaiting,
          });
        }
      }
    }

    // ── Step 4: Late schedule / congestion bunching ──
    // Routes where a peak hour has far more trips than surrounding hours = bunching
    for (const rid of Object.keys(routeHourMap)) {
      const hours = routeHourMap[rid];
      const hourEntries = Object.entries(hours).map(([h, d]) => ({
        hour: parseInt(h, 10),
        deps: d.departures,
        stops: d.stopCount,
      }));
      if (hourEntries.length < 4) continue;

      const avgDeps = hourEntries.reduce((s, e) => s + e.deps, 0) / hourEntries.length;

      for (const entry of hourEntries) {
        // If this hour has 3x+ the average = severe bunching, spread them out
        if (entry.deps > avgDeps * 3 && entry.deps > 20) {
          const name = routeNameMap[rid] || rid;
          const excess = Math.round(entry.deps - avgDeps * 2);
          suggestions.push({
            id: `late-${rid}-${entry.hour}`,
            category: "late-schedule",
            action: `Redistribute Route ${rid} buses at ${String(entry.hour).padStart(2, "0")}:00 to adjacent hours`,
            projectedOutcome: `Spread ${excess} excess departures on ${name} to reduce bunching and fill gaps in neighboring hours`,
            rageScore: rageScore(entry.deps, 60 / Math.max(entry.deps / entry.stops, 1), 1),
            hour: entry.hour,
            ridersAffected: entry.deps,
          });
        }
      }
    }

    // ── Mixed sort: group by category, interleave, then sort within groups by rage ──
    const byCategory = {};
    for (const s of suggestions) {
      if (!byCategory[s.category]) byCategory[s.category] = [];
      byCategory[s.category].push(s);
    }
    for (const cat of Object.keys(byCategory)) {
      byCategory[cat].sort((a, b) => b.rageScore - a.rageScore);
    }

    // Interleave categories: take top from each in round-robin
    const categoryOrder = ["bottleneck", "connection-miss", "schedule-gap", "late-schedule"];
    const mixed = [];
    let round = 0;
    while (mixed.length < 15) {
      let added = false;
      for (const cat of categoryOrder) {
        if (byCategory[cat] && byCategory[cat][round]) {
          mixed.push(byCategory[cat][round]);
          added = true;
        }
      }
      if (!added) break;
      round++;
    }

    // ── Step 5: Underused lines → available resources (separate table) ──
    const allRouteTotals = routeTotalsResult.rows.map((r) => ({
      routeId: r.route_id,
      routeName: r.route_long_name,
      totalTrips: parseInt(r.total_trips, 10),
      stopCount: parseInt(r.stop_count, 10),
      activeHours: parseInt(r.active_hours, 10),
    }));

    // Compute median to find underused
    const sortedTotals = [...allRouteTotals].sort((a, b) => a.totalTrips - b.totalTrips);
    const median = sortedTotals.length > 0
      ? sortedTotals[Math.floor(sortedTotals.length / 2)].totalTrips
      : 0;

    // Montreal STM depots (synthesized based on route geography)
    const depots = [
      "Anjou Depot", "Saint-Denis Depot", "Frontenac Depot",
      "LaSalle Depot", "Mont-Royal Depot", "Legendre Depot",
    ];

    const availableResources = allRouteTotals
      .filter((r) => r.totalTrips < median * 0.35 && r.totalTrips > 0)
      .slice(0, 8)
      .map((r, i) => {
        const tripsPerHour = r.activeHours > 0 ? r.totalTrips / r.activeHours : 0;
        const busesAvail = Math.max(1, Math.floor((median * 0.35 - r.totalTrips) / Math.max(r.activeHours, 1) / 3));
        return {
          routeId: r.routeId,
          routeName: r.routeName,
          hour: 0,
          currentTrips: r.totalTrips,
          avgTrips: Math.round(median),
          depot: depots[i % depots.length],
          busesAvailable: busesAvail,
        };
      });

    const result = {
      suggestions: mixed.slice(0, 12),
      availableResources,
      generatedAt: new Date().toISOString(),
    };

    setCache("suggestions", result);
    console.log(
      `[suggestions] Generated ${result.suggestions.length} suggestions, ${availableResources.length} available resources`
    );
    res.json(result);
  } catch (err) {
    console.error("[suggestions] Error:", err.message);
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
