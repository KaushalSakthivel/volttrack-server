const express = require('express');
const cors = require('cors');
const Datastore = require('nedb-promises');

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

// 1. Initialize our persistent file-based database
const db = Datastore.create({ filename: 'volttrack.db', autoload: true });

// Seed initial charging stations into the database if it's empty
async function initializeDatabase() {
  const count = await db.count({});
  if (count === 0) {
    const initialStations = [
      { id: 1, name: "Karur Bypass Road Hub", location: "Near Lighthouse Corner, Karur", totalSlots: 4, bookedSlots: 1, power: "50 kW", type: "DC Fast" },
      { id: 2, name: "Gandhigram Central Station", location: "Opposite Vaniyar Mahal, Pasupathipalayam", totalSlots: 3, bookedSlots: 2, power: "22 kW", type: "AC Type 2" },
      { id: 3, name: "Karur Highway Corridor Node", location: "NH-44 Bypass Junction, Karur", totalSlots: 5, bookedSlots: 5, power: "150 kW", type: "Ultra Fast" },
      { id: 4, name: "Velayuthampalayam Junction Hub", location: "Near Cauvery Bridge Access, Karur", totalSlots: 4, bookedSlots: 0, power: "50 kW", type: "DC Fast" }
    ];
    await db.insert(initialStations);
    console.log("[Database] Initial VoltTrack registry seeded successfully!");
  }
}
initializeDatabase();

// 2. Test Route to verify server link
app.get('/api/test', (req, res) => {
  res.json({ message: "VoltTrack Server Link Established Successfully!" });
});

// 3. GET Route: Fetch all stations dynamically from the database file
app.get('/api/stations', async (req, res) => {
  try {
    const allStations = await db.find({}).sort({ id: 1 });
    res.json(allStations);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch stations from database." });
  }
});

// 4. POST Route: Update slot reservation permanently inside the database
app.post('/api/stations/:id/book', async (req, res) => {
  const stationId = req.params.id;

  try {
    // 1. Fetch the current station details first
    const station = await db.findOne({ id: stationId });

    if (!station) {
      return res.status(404).json({ success: false, error: "Station node not found in registry." });
    }

    // 2. Telemetry Gating Check: Validate if slots are already fully occupied
    if (station.bookedSlots >= station.totalSlots) {
      return res.status(400).json({ success: false, error: "Grid Conflict: Selected station node is fully occupied!" });
    }

    // 3. Secure Update: Safely increment slot numbers since threshold conditions match
    await db.update(
      { id: stationId },
      { $inc: { bookedSlots: 1 } }
    );

    // 4. Fetch the refreshed data model to return back out to our UI state
    const updatedStation = await db.findOne({ id: stationId });
    console.log(`[Database] Slot locked permanently for: ${station.name}`);
    
    res.json({ success: true, updatedStation });

  } catch (error) {
    console.error("Database error during allocation booking loop:", error);
    res.status(500).json({ success: false, error: "Database transaction failed." });
  }
});

// 5. Start the Application Server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:5000`);
});