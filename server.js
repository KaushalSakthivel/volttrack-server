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
  await db.remove({}, { multi: true }); // Wipe old data cleanly on start
  const count = await db.count({});
  if (count === 0) {
    const initialStations = [
      { id: 1, name: "Karur Bypass Road Hub", location: "Near Lighthouse Corner, Karur", totalSlots: 4, bookedSlots: 1, power: "50 kW", type: "DC Fast" },
      { id: 2, name: "Gandhigramam Central Station", location: "Opposite Vaniyar Mahal, Pasupathipalayam", totalSlots: 3, bookedSlots: 2, power: "22 kW", type: "AC Type 2" },
      { id: 3, name: "Karur Highway Corridor Node", location: "NH-44 Bypass Junction, Karur", totalSlots: 5, bookedSlots: 2, power: "150 kW", type: "Ultra Fast" },
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
  const { user } = req.body;
  const userName = user ? user.name : "Quick Sign In Driver";

  try {
    const station = await db.findOne({ 
      $or: [ { id: Number(stationId) }, { id: stationId } ] 
    });

    if (!station) {
      console.log(`[Audit Loop Failure] Booking rejected. Station ID ${stationId} missing from node registry.`);
      return res.status(404).json({ success: false, error: "Station node not found in registry" });
    }

    console.log(`[IoT Allocation Request] Booking initiated for ${station.name} by user: ${userName}`);

    if (station.bookedSlots >= station.totalSlots) {
      console.log(`[Grid Conflict] Allocation rejected. ${station.name} is fully occupied.`);
      return res.status(400).json({ success: false, error: "Grid Conflict: Selected station node is fully occupied!" });
    }

    await db.update(
      { $or: [ { id: Number(stationId) }, { id: stationId } ] },
      { $inc: { bookedSlots: 1 } }
    );

    const updatedStation = await db.findOne({ 
      $or: [ { id: Number(stationId) }, { id: stationId } ] 
    });
    
    console.log(`[Database] Slot locked permanently for: ${station.name} by user: ${userName}`);
    res.json({ success: true, updatedStation });

  } catch (error) {
    console.error("Database error during allocation booking loop:", error);
    res.status(500).json({ success: false, error: "Database transaction failed." });
  }
});

// 5. POST Route: Release slot reservation cleanly upon cancellation/void operations
app.post('/api/stations/:id/cancel', async (req, res) => {
  const stationId = req.params.id;
  const { user, type, fine } = req.body;
  const userName = user ? user.name : "Driver";

  try {
    const station = await db.findOne({ 
      $or: [ { id: Number(stationId) }, { id: stationId } ] 
    });

    if (!station) {
      return res.status(404).json({ success: false, error: "Station node not found in registry" });
    }

    if (type === 'HARD_EXPIRY') {
      console.log(`[Telemetry Timeout] 15-Minute buffer exhausted. Allocation dropped for user: ${userName}`);
    } else if (type === 'BUFFER_CANCEL') {
      console.log(`[Buffer Cancel Activity] Cancelled during buffer by ${userName}. Fine of ₹${fine} registered.`);
    } else if (type === 'MANUAL_VOID') {
      console.log(`[Freeze Advantage Voided] Manual link bypass action triggered by user: ${userName} for ${station.name}`);
    } else {
      console.log(`[Core Cancellation Activity] Standard Core Window release executed by user: ${userName} for ${station.name}`);
    }

    const newBookedSlots = Math.max(0, station.bookedSlots - 1);

    await db.update(
      { $or: [ { id: Number(stationId) }, { id: stationId } ] },
      { $set: { bookedSlots: newBookedSlots } }
    );

    const updatedStation = await db.findOne({ 
      $or: [ { id: Number(stationId) }, { id: stationId } ] 
    });

    console.log(`[Database] Slot released clean in memory for: ${station.name}. Updated slots: ${updatedStation.totalSlots - updatedStation.bookedSlots} free.`);
    res.json({ success: true, updatedStation });

  } catch (error) {
    console.error("Database error during cancellation loop:", error);
    res.status(500).json({ success: false, error: "Cancellation database transaction failed." });
  }
});

// 6. POST Route: Log live user registrations
app.post('/api/register', async (req, res) => {
  try {
    const record = req.body;
    console.log(`[User Node Registration Log] New driver recorded -> Name: ${record.name}, EV ID: ${record.evNo}, Phone: ${record.phone}, Hub Zone: ${record.city}, Route Settler: ${record.preference}`);
    res.json({ success: true, message: "User registered safely inside database logs!" });
  } catch (error) {
    console.error("Registration route error:", error);
    res.status(500).json({ error: "Failed to process registration" });
  }
});

// 7. POST Route: Log continuous stream metrics for buffer tracking fine states
app.post('/api/audit/fine', (req, res) => {
  const { name, minutes, fineAmount } = req.body;
  console.log(`[Fine Tracking Metric Loop] Driver: ${name || 'Guest'} | Elapsed: ${minutes} Min | Accrued Balance: ₹${fineAmount}`);
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:5000`);
});