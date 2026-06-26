const express = require('express');
const cors = require('cors');
const Datastore = require('nedb-promises');

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

// Initialize persistent file-based database
const db = Datastore.create({ filename: 'volttrack.db', autoload: true });

// Seed initial charging stations dynamically into the database file
async function initializeDatabase() {
  await db.remove({}, { multi: true }); // Clean start slate on initialization
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

// Test Route to verify server link
app.get('/api/test', (req, res) => {
  res.json({ message: "VoltTrack Server Link Established Successfully!" });
});

// GET Route: Fetch all stations dynamically from database
app.get('/api/stations', async (req, res) => {
  try {
    const allStations = await db.find({}).sort({ id: 1 });
    res.json(allStations);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch stations from database." });
  }
});

// POST Route: Update slot reservation permanently inside database with absolute user profile details
app.post('/api/stations/:id/book', async (req, res) => {
  const stationId = req.params.id;
  const { user, isRebook } = req.body;
  
  const userName = user ? user.name : "Quick Sign In Driver";
  const userPhone = user ? user.phone : "9474747474";
  const userEv = user ? user.evNo : "TN-47-XX-9999";

  try {
    const station = await db.findOne({ 
      $or: [ { id: Number(stationId) }, { id: stationId } ] 
    });

    if (!station) {
      console.log(`[Audit Loop Failure] Booking rejected. Station ID ${stationId} missing from node registry.`);
      return res.status(404).json({ success: false, error: "Station node not found in registry" });
    }

    // Inspect phase telemetry footprint
    console.log(`[Allocation Request Triggered] Booking initiated for ${station.name} by user: ${userName} (EV ID: ${userEv}, Phone: ${userPhone})`);

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
    
    if (isRebook) {
      console.log(`[Database Sync Lock] Slot rebooked by ${userName} (EV ID: ${userEv}, Phone: ${userPhone}) for ${station.name}`);
    } else {
      console.log(`[Database Sync Lock] Slot locked permanently for ${station.name} by user: ${userName} (EV ID: ${userEv}, Phone: ${userPhone})`);
    }
    
    res.json({ success: true, updatedStation });

  } catch (error) {
    console.error("Database error during allocation booking loop:", error);
    res.status(500).json({ success: false, error: "Database transaction failed." });
  }
});

// POST Route: Release slot reservation cleanly upon cancellation/void/expiry operations
app.post('/api/stations/:id/cancel', async (req, res) => {
  const stationId = req.params.id;
  const { user, type, fine, cancelCount } = req.body;
  
  const userName = user ? user.name : "Driver";
  const userPhone = user ? user.phone : "9474747474";
  const userEv = user ? user.evNo : "TN-47-XX-9999";

  try {
    const station = await db.findOne({ 
      $or: [ { id: Number(stationId) }, { id: stationId } ] 
    });

    if (!station) {
      return res.status(404).json({ success: false, error: "Station node not found in registry" });
    }

    // Comprehensive context tracking metrics logs
    if (type === 'HARD_EXPIRY') {
      console.log(`[Telemetry Timeout Expiry] Booking hard-cancelled. ₹75 fine detected and deducted for ${userName} (EV ID: ${userEv})`);
    } else if (type === 'BUFFER_CANCEL') {
      console.log(`[Buffer Cancel Activity] Cancelled during buffer phase by ${userName} (EV ID: ${userEv}). Final fine of ₹${fine} registered and locked.`);
    } else if (type === 'MANUAL_VOID') {
      console.log(`[Freeze Advantage Voided] Manual link bypass action triggered by user: ${userName} for ${station.name}. Pipeline exposed.`);
    } else {
      if (cancelCount > 1) {
        console.log(`[Core Cancellation Activity] Slot cancelled again by ${userName} (EV ID: ${userEv}, Phone: ${userPhone}) for ${station.name}`);
      } else {
        console.log(`[Core Cancellation Activity] It is cancelled by ${userName} (EV ID: ${userEv}, Phone: ${userPhone}) for ${station.name}`);
      }
    }

    const newBookedSlots = Math.max(0, station.bookedSlots - 1);

    await db.update(
      { $or: [ { id: Number(stationId) }, { id: stationId } ] },
      { $set: { bookedSlots: newBookedSlots } }
    );

    const updatedStation = await db.findOne({ 
      $or: [ { id: Number(stationId) }, { id: stationId } ] 
    });

    console.log(`[Database Transaction Complete] Slot released clean in registry file for: ${station.name}. Updated availability: ${updatedStation.totalSlots - updatedStation.bookedSlots}/${updatedStation.totalSlots} free.`);
    res.json({ success: true, updatedStation });

  } catch (error) {
    console.error("Database error during cancellation loop:", error);
    res.status(500).json({ success: false, error: "Cancellation database transaction failed." });
  }
});

// POST Route: Log live user profile registration telemetry
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

// POST Route: Log continuous stream metrics for rolling minute-by-minute buffer tracking fine states
app.post('/api/audit/fine', (req, res) => {
  const { name, minutes, fineAmount, evNo } = req.body;
  const identifier = name ? `${name} (EV ID: ${evNo || 'TN-47-XX-9999'})` : 'Guest Driver';
  console.log(`[Fine Tracking Metric Loop] ₹${fineAmount} fine is held for ${identifier} | Continuous Elapsed: ${minutes} Min`);
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:5000`);
});
