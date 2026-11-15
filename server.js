require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const { connectDB, isMongoConnected } = require('./config/db');
const User = require('./models/User');
const Bus = require('./models/Bus');
const Route = require('./models/Route');
const Allocation = require('./models/Allocation');
const LocationLog = require('./models/LocationLog');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'hackathon_college_bus_super_secret_key_2026';
const MINUTES_PER_STOP = 5;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// Helper Utilities
// ==========================================
function generateId(prefix) {
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `${prefix}-${rand}`;
}

function sanitizeUser(user) {
  if (!user) return null;
  const copy = { ...user };
  delete copy.password;
  return copy;
}

function signToken(user) {
  return jwt.sign(
    {
      userId: user.userId,
      role: user.role,
      email: user.email,
      name: user.name
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please provide a Bearer token.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Access denied. Required role: ${roles.join(' or ')}.`
      });
    }
    next();
  };
}

function normalizeWords(text) {
  const stopWords = new Set([
    'road', 'rd', 'street', 'st', 'lane', 'nagar', 'colony', 'cross',
    'phase', 'sector', 'block', 'main', 'near', 'opp', 'opposite', 'behind',
    'bus', 'stop', 'circle', 'gate', 'area', 'layout', 'enclave', 'city'
  ]);
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !stopWords.has(w));
}

function findBestRouteMatch(studentAddress, routes, busMap, routeAllocCountMap) {
  const rawAddr = String(studentAddress || '').toLowerCase();
  const addrWords = new Set(normalizeWords(studentAddress));

  let bestMatch = null;
  let bestScore = 0;

  for (const route of routes) {
    if (!Array.isArray(route.stops) || route.stops.length === 0) continue;

    // Respect bus capacity if a bus is linked to this route
    const linkedBus = route.busId ? busMap.get(route.busId) : null;
    if (linkedBus) {
      const currentCount = routeAllocCountMap.get(route.routeId) || 0;
      if (currentCount >= linkedBus.capacity) {
        continue;
      }
    }

    const routeNameWords = normalizeWords(route.routeName);
    const routeNameHits = routeNameWords.filter((w) => addrWords.has(w)).length;

    for (const stop of route.stops) {
      let score = 0;
      const stopLower = stop.toLowerCase();

      // Exact phrase match inside student's address
      if (rawAddr.includes(stopLower)) {
        score += 100;
      }

      // Word-level overlap between stop and address
      const stopWords = normalizeWords(stop);
      for (const word of stopWords) {
        if (addrWords.has(word)) {
          score += 30;
        } else {
          // Partial prefix/substring match for keywords >= 4 chars
          for (const aWord of addrWords) {
            if (aWord.length >= 4 && word.length >= 4 && (aWord.includes(word) || word.includes(aWord))) {
              score += 15;
            }
          }
        }
      }

      // Slight bonus if route name also matches address keyword
      if (score > 0) {
        score += routeNameHits * 10;
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = { route, assignedStop: stop, score };
      }
    }
  }

  return bestMatch;
}

function buildTrackingStatus(bus, route, assignedStop = null) {
  const stops = route && Array.isArray(route.stops) ? route.stops : [];
  const timings = route && Array.isArray(route.timings) ? route.timings : [];
  const totalStops = stops.length;

  const currentStopIndex = stops.findIndex(
    (s) => s.toLowerCase() === String(bus.currentStop || '').toLowerCase()
  );

  const nextStop =
    currentStopIndex >= 0 && currentStopIndex < totalStops - 1
      ? stops[currentStopIndex + 1]
      : bus.status === 'Reached Destination'
      ? 'Final Destination Reached'
      : stops[0] || '';

  let assignedStopIndex = -1;
  let stopsRemaining = null;
  let etaMinutes = null;
  let message = '';

  if (assignedStop && totalStops > 0) {
    assignedStopIndex = stops.findIndex(
      (s) => s.toLowerCase() === String(assignedStop).toLowerCase()
    );
  }

  if (bus.status === 'Maintenance') {
    message = `Bus ${bus.busNumber} is currently under maintenance.`;
  } else if (bus.status === 'Reached Destination') {
    stopsRemaining = 0;
    etaMinutes = 0;
    message = `Bus ${bus.busNumber} has reached the final destination (${bus.currentStop || stops[totalStops - 1] || 'Campus'}).`;
  } else if (assignedStopIndex !== -1) {
    if (currentStopIndex === -1) {
      stopsRemaining = assignedStopIndex + 1;
      etaMinutes = stopsRemaining * MINUTES_PER_STOP;
      message = `Bus is starting soon. ${stopsRemaining} stop(s) away from your stop (${assignedStop}).`;
    } else {
      stopsRemaining = assignedStopIndex - currentStopIndex;
      if (stopsRemaining > 1) {
        etaMinutes = stopsRemaining * MINUTES_PER_STOP;
        message = `Bus is ${stopsRemaining} stops away from your location (${assignedStop}).`;
      } else if (stopsRemaining === 1) {
        etaMinutes = MINUTES_PER_STOP;
        message = `Bus is 1 stop away from your location (${assignedStop}) — please be ready!`;
      } else if (stopsRemaining === 0) {
        etaMinutes = 0;
        message = `Bus has arrived at your stop (${assignedStop})!`;
      } else {
        etaMinutes = 0;
        message = `Bus has already passed your stop (${assignedStop}) and is currently at ${bus.currentStop}.`;
      }
    }
  } else {
    message = bus.currentStop
      ? `Bus is currently ${bus.status} at ${bus.currentStop}.`
      : `Bus ${bus.busNumber} is ${bus.status}.`;
  }

  const progressPercent =
    totalStops > 1 && currentStopIndex >= 0
      ? Math.round((currentStopIndex / (totalStops - 1)) * 100)
      : bus.status === 'Reached Destination'
      ? 100
      : 0;

  return {
    busId: bus.busId,
    busNumber: bus.busNumber,
    busStatus: bus.status,
    currentStop: bus.currentStop || (stops[0] || 'Depot'),
    nextStop,
    currentStopIndex,
    totalStops,
    progressPercent,
    assignedStop: assignedStop || null,
    assignedStopIndex,
    stopsRemaining,
    etaMinutes,
    estimatedArrivalText:
      etaMinutes === null ? 'N/A' : etaMinutes === 0 ? 'Arrived / Completed' : `~${etaMinutes} mins`,
    message,
    stops,
    timings
  };
}

// ==========================================
// Health & System Status
// ==========================================
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    databaseMode: isMongoConnected() ? 'MongoDB' : 'Local JSON Fallback',
    timestamp: new Date().toISOString()
  });
});

// ==========================================
// 1. Auth APIs (All Roles)
// ==========================================
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, role, email, password, contact, address } = req.body;

    if (!name || !role || !email || !password || !contact) {
      return res.status(400).json({
        error: 'Fields name, role, email, password, and contact are required.'
      });
    }

    const validRoles = ['admin', 'student', 'driver'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: 'Role must be admin, student, or driver.' });
    }

    const existing = await User.findOne({ email: email.toLowerCase().trim() }).lean();
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const prefix = role === 'admin' ? 'ADM' : role === 'driver' ? 'DRV' : 'STU';
    const userId = generateId(prefix);
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await User.create({
      userId,
      name: name.trim(),
      role,
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      contact: contact.trim(),
      address: (address || '').trim()
    });

    const token = signToken(newUser);
    res.status(201).json({
      message: 'Registration successful.',
      token,
      user: sanitizeUser(newUser)
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Registration failed.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() }).lean();
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = signToken(user);
    res.json({
      message: 'Login successful.',
      token,
      user: sanitizeUser(user)
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Login failed.' });
  }
});

app.get('/api/auth/me', authenticate, async (req, res) => {
  try {
    const user = await User.findOne({ userId: req.user.userId }).lean();
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }
    res.json({ user: sanitizeUser(user) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper endpoint for Admin dashboard dropdowns (students, drivers)
app.get('/api/users', authenticate, authorize('admin'), async (req, res) => {
  try {
    const filter = req.query.role ? { role: req.query.role } : {};
    const users = await User.find(filter).lean();
    const allocations = await Allocation.find({}).lean();
    const allocMap = new Map(allocations.map((a) => [a.studentId, a]));

    const sanitized = users.map((u) => ({
      ...sanitizeUser(u),
      allocation: u.role === 'student' ? allocMap.get(u.userId) || null : undefined
    }));
    res.json({ users: sanitized });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 2. Bus APIs (Admin / Driver)
// ==========================================
app.post('/api/buses', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { busId, busNumber, capacity, driverId, status, currentStop } = req.body;

    if (!busNumber || !capacity) {
      return res.status(400).json({ error: 'busNumber and capacity are required.' });
    }

    const duplicate = await Bus.findOne({ busNumber: busNumber.trim() }).lean();
    if (duplicate) {
      return res.status(409).json({ error: `Bus number "${busNumber}" already exists.` });
    }

    if (driverId) {
      const driver = await User.findOne({ userId: driverId, role: 'driver' }).lean();
      if (!driver) {
        return res.status(404).json({ error: `Driver with userId "${driverId}" not found.` });
      }
    }

    const newBus = await Bus.create({
      busId: busId ? busId.trim() : generateId('BUS'),
      busNumber: busNumber.trim(),
      capacity: Number(capacity),
      driverId: driverId || null,
      status: status || 'Active',
      currentStop: currentStop || ''
    });

    res.status(201).json({
      message: 'Bus created successfully.',
      bus: newBus
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to create bus.' });
  }
});

app.get('/api/buses', authenticate, authorize('admin', 'driver'), async (req, res) => {
  try {
    const [buses, drivers, routes] = await Promise.all([
      Bus.find({}).lean(),
      User.find({ role: 'driver' }).lean(),
      Route.find({}).lean()
    ]);

    const driverMap = new Map(drivers.map((d) => [d.userId, sanitizeUser(d)]));
    const routeByBusMap = new Map(routes.filter((r) => r.busId).map((r) => [r.busId, r]));

    // If a driver calls this, return all or highlight theirs
    const enrichedBuses = buses.map((bus) => {
      const driver = bus.driverId ? driverMap.get(bus.driverId) || null : null;
      const route = routeByBusMap.get(bus.busId) || null;
      return {
        ...bus,
        driver,
        route: route
          ? {
              routeId: route.routeId,
              routeName: route.routeName,
              stops: route.stops,
              timings: route.timings
            }
          : null
      };
    });

    res.json({ buses: enrichedBuses });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to fetch buses.' });
  }
});

// ==========================================
// 3. Route APIs (Admin / All)
// ==========================================
app.post('/api/routes', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { routeId, routeName, stops, timings, busId, driverId } = req.body;

    if (!routeName || !Array.isArray(stops) || stops.length === 0) {
      return res.status(400).json({ error: 'routeName and a non-empty stops array are required.' });
    }

    const cleanedStops = stops.map((s) => String(s).trim()).filter(Boolean);
    const cleanedTimings = Array.isArray(timings)
      ? cleanedStops.map((_, i) => (timings[i] ? String(timings[i]).trim() : 'TBD'))
      : cleanedStops.map(() => 'TBD');

    let resolvedDriverId = driverId || null;

    if (busId) {
      const bus = await Bus.findOne({ busId }).lean();
      if (!bus) {
        return res.status(404).json({ error: `Bus "${busId}" not found.` });
      }
      if (!resolvedDriverId && bus.driverId) {
        resolvedDriverId = bus.driverId;
      }
      if (!bus.currentStop && cleanedStops.length > 0) {
        await Bus.findOneAndUpdate({ busId }, { currentStop: cleanedStops[0] }, { new: true });
      }
    }

    if (resolvedDriverId) {
      const driver = await User.findOne({ userId: resolvedDriverId, role: 'driver' }).lean();
      if (!driver) {
        return res.status(404).json({ error: `Driver "${resolvedDriverId}" not found.` });
      }
    }

    const newRoute = await Route.create({
      routeId: routeId ? routeId.trim() : generateId('RTE'),
      routeName: routeName.trim(),
      stops: cleanedStops,
      timings: cleanedTimings,
      busId: busId || null,
      driverId: resolvedDriverId
    });

    res.status(201).json({
      message: 'Route created successfully.',
      route: newRoute
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to create route.' });
  }
});

app.get('/api/routes', async (req, res) => {
  try {
    const [routes, buses, drivers, allocations] = await Promise.all([
      Route.find({}).lean(),
      Bus.find({}).lean(),
      User.find({ role: 'driver' }).lean(),
      Allocation.find({}).lean()
    ]);

    const busMap = new Map(buses.map((b) => [b.busId, b]));
    const driverMap = new Map(drivers.map((d) => [d.userId, sanitizeUser(d)]));
    const allocCountMap = new Map();
    for (const a of allocations) {
      allocCountMap.set(a.routeId, (allocCountMap.get(a.routeId) || 0) + 1);
    }

    const enrichedRoutes = routes.map((route) => ({
      ...route,
      bus: route.busId ? busMap.get(route.busId) || null : null,
      driver: route.driverId ? driverMap.get(route.driverId) || null : null,
      allocatedStudents: allocCountMap.get(route.routeId) || 0
    }));

    res.json({ routes: enrichedRoutes });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to fetch routes.' });
  }
});

// ==========================================
// 4. Route Assignment (Manual + Auto-Match)
// ==========================================
app.post('/api/routes/assign', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { studentId, routeId, assignedStop, autoMatch, reassignAll } = req.body;

    // Mode A: Auto-Match Students based on Address / Location Keywords
    if (autoMatch) {
      const [routes, buses, existingAllocations] = await Promise.all([
        Route.find({}).lean(),
        Bus.find({}).lean(),
        Allocation.find({}).lean()
      ]);

      if (routes.length === 0) {
        return res.status(400).json({ error: 'No routes available for auto-matching.' });
      }

      const busMap = new Map(buses.map((b) => [b.busId, b]));
      const allocByStudent = new Map(existingAllocations.map((a) => [a.studentId, a]));
      const routeAllocCountMap = new Map();
      for (const a of existingAllocations) {
        routeAllocCountMap.set(a.routeId, (routeAllocCountMap.get(a.routeId) || 0) + 1);
      }

      let targetStudents = [];
      if (studentId) {
        const student = await User.findOne({ userId: studentId, role: 'student' }).lean();
        if (!student) {
          return res.status(404).json({ error: `Student "${studentId}" not found.` });
        }
        targetStudents = [student];
      } else {
        const allStudents = await User.find({ role: 'student' }).lean();
        targetStudents = reassignAll
          ? allStudents
          : allStudents.filter((s) => !allocByStudent.has(s.userId));
      }

      const matched = [];
      const unmatched = [];

      for (const student of targetStudents) {
        const best = findBestRouteMatch(student.address, routes, busMap, routeAllocCountMap);
        if (!best) {
          unmatched.push({
            studentId: student.userId,
            name: student.name,
            address: student.address,
            reason: 'No matching stop keyword found or bus capacity reached.'
          });
          continue;
        }

        const prevAlloc = allocByStudent.get(student.userId);
        if (prevAlloc) {
          routeAllocCountMap.set(
            prevAlloc.routeId,
            Math.max(0, (routeAllocCountMap.get(prevAlloc.routeId) || 1) - 1)
          );
        }

        const allocation = await Allocation.findOneAndUpdate(
          { studentId: student.userId },
          {
            allocationId: prevAlloc ? prevAlloc.allocationId : generateId('ALC'),
            studentId: student.userId,
            routeId: best.route.routeId,
            assignedStop: best.assignedStop,
            createdAt: new Date()
          },
          { upsert: true, new: true }
        );

        routeAllocCountMap.set(
          best.route.routeId,
          (routeAllocCountMap.get(best.route.routeId) || 0) + 1
        );

        matched.push({
          studentId: student.userId,
          studentName: student.name,
          address: student.address,
          routeId: best.route.routeId,
          routeName: best.route.routeName,
          assignedStop: best.assignedStop,
          matchScore: best.score,
          allocation
        });
      }

      return res.json({
        message: `Auto-match completed: ${matched.length} student(s) assigned, ${unmatched.length} unmatched.`,
        matched,
        unmatched
      });
    }

    // Mode B: Manual Assignment
    if (!studentId || !routeId) {
      return res.status(400).json({
        error: 'For manual assignment, studentId and routeId are required (or pass autoMatch: true).'
      });
    }

    const [student, route] = await Promise.all([
      User.findOne({ userId: studentId, role: 'student' }).lean(),
      Route.findOne({ routeId }).lean()
    ]);

    if (!student) {
      return res.status(404).json({ error: `Student "${studentId}" not found.` });
    }
    if (!route) {
      return res.status(404).json({ error: `Route "${routeId}" not found.` });
    }

    let resolvedStop = assignedStop ? assignedStop.trim() : '';
    if (resolvedStop) {
      const canonical = route.stops.find((s) => s.toLowerCase() === resolvedStop.toLowerCase());
      if (!canonical) {
        return res.status(400).json({
          error: `Stop "${resolvedStop}" does not exist on route "${route.routeName}". Valid stops: ${route.stops.join(', ')}`
        });
      }
      resolvedStop = canonical;
    } else {
      // Auto-pick best stop on the chosen route based on student address, or fallback to first stop
      const singleRouteMatch = findBestRouteMatch(student.address, [route], new Map(), new Map());
      resolvedStop = singleRouteMatch ? singleRouteMatch.assignedStop : route.stops[0];
    }

    // Capacity check if route has an assigned bus
    if (route.busId) {
      const [bus, routeAllocs] = await Promise.all([
        Bus.findOne({ busId: route.busId }).lean(),
        Allocation.find({ routeId: route.routeId }).lean()
      ]);
      const alreadyOnThisRoute = routeAllocs.some((a) => a.studentId === studentId);
      if (bus && !alreadyOnThisRoute && routeAllocs.length >= bus.capacity) {
        return res.status(409).json({
          error: `Bus ${bus.busNumber} on route "${route.routeName}" has reached full capacity (${bus.capacity}).`
        });
      }
    }

    const existing = await Allocation.findOne({ studentId }).lean();
    const allocation = await Allocation.findOneAndUpdate(
      { studentId },
      {
        allocationId: existing ? existing.allocationId : generateId('ALC'),
        studentId,
        routeId: route.routeId,
        assignedStop: resolvedStop,
        createdAt: new Date()
      },
      { upsert: true, new: true }
    );

    res.status(201).json({
      message: `Student ${student.name} assigned to ${route.routeName} at stop "${resolvedStop}".`,
      allocation
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Route assignment failed.' });
  }
});

// ==========================================
// 5. Student Route & Live Status Lookup
// ==========================================
app.get('/api/routes/student/:studentId', authenticate, authorize('student', 'admin'), async (req, res) => {
  try {
    const { studentId } = req.params;

    if (req.user.role === 'student' && req.user.userId !== studentId) {
      return res.status(403).json({ error: 'Students can only view their own route details.' });
    }

    const student = await User.findOne({ userId: studentId, role: 'student' }).lean();
    if (!student) {
      return res.status(404).json({ error: `Student "${studentId}" not found.` });
    }

    const allocation = await Allocation.findOne({ studentId }).lean();
    if (!allocation) {
      return res.json({
        allocated: false,
        student: sanitizeUser(student),
        allocation: null,
        route: null,
        bus: null,
        driver: null,
        assignedStop: null,
        liveStatus: null,
        message: 'No bus route allocated yet. Please contact the transport admin.'
      });
    }

    const route = await Route.findOne({ routeId: allocation.routeId }).lean();
    const bus = route && route.busId ? await Bus.findOne({ busId: route.busId }).lean() : null;
    const driverId = (bus && bus.driverId) || (route && route.driverId) || null;
    const driver = driverId ? await User.findOne({ userId: driverId }).lean() : null;

    const latestLogs = bus
      ? await LocationLog.find({ busId: bus.busId }).sort({ timestamp: -1 }).limit(5).lean()
      : [];

    const liveStatus = bus ? buildTrackingStatus(bus, route, allocation.assignedStop) : null;

    res.json({
      allocated: true,
      student: sanitizeUser(student),
      allocation,
      route,
      bus,
      driver: driver
        ? {
            userId: driver.userId,
            name: driver.name,
            contact: driver.contact,
            email: driver.email
          }
        : null,
      assignedStop: allocation.assignedStop,
      liveStatus,
      recentLogs: latestLogs
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to retrieve student route.' });
  }
});

// ==========================================
// 6. Bus Location Update (Driver / Admin)
// ==========================================
app.put('/api/buses/:id/location', authenticate, authorize('driver', 'admin'), async (req, res) => {
  try {
    const busIdentifier = req.params.id;
    const { remarks, reset, status: requestedStatus, targetStop } = req.body || {};

    const bus = await Bus.findOne({
      $or: [{ busId: busIdentifier }, { _id: busIdentifier }]
    }).lean();

    if (!bus) {
      return res.status(404).json({ error: `Bus "${busIdentifier}" not found.` });
    }

    if (req.user.role === 'driver' && bus.driverId && bus.driverId !== req.user.userId) {
      return res.status(403).json({ error: 'You are not assigned as the driver for this bus.' });
    }

    const route = await Route.findOne({ busId: bus.busId }).lean();
    if (!route || !Array.isArray(route.stops) || route.stops.length === 0) {
      return res.status(400).json({
        error: `No route with stops is assigned to bus ${bus.busNumber}. Assign a route first.`
      });
    }

    const stops = route.stops;
    let newStop = bus.currentStop;
    let newStatus = bus.status;
    let nextStop = '';
    let logRemarks = remarks || '';

    // Support resetting trip back to Stop #1 for live demo / next shift
    if (reset === true) {
      newStop = stops[0];
      newStatus = 'En Route';
      nextStop = stops.length > 1 ? stops[1] : 'Final Destination';
      logRemarks = logRemarks || `Trip started/reset at ${newStop}`;
    } else if (requestedStatus === 'Maintenance' || requestedStatus === 'Active') {
      newStatus = requestedStatus;
      const idx = stops.findIndex((s) => s.toLowerCase() === String(bus.currentStop || '').toLowerCase());
      newStop = idx >= 0 ? stops[idx] : stops[0];
      nextStop = idx >= 0 && idx < stops.length - 1 ? stops[idx + 1] : '';
      logRemarks = logRemarks || `Status updated to ${newStatus}`;
    } else if (targetStop) {
      const targetIdx = stops.findIndex((s) => s.toLowerCase() === String(targetStop).toLowerCase());
      if (targetIdx === -1) {
        return res.status(400).json({ error: `Stop "${targetStop}" is not on route "${route.routeName}".` });
      }
      newStop = stops[targetIdx];
      newStatus = targetIdx === stops.length - 1 ? 'Reached Destination' : 'En Route';
      nextStop = targetIdx < stops.length - 1 ? stops[targetIdx + 1] : 'Final Destination Reached';
      logRemarks = logRemarks || `Moved to ${newStop}`;
    } else {
      // Standard progression: advance bus.currentStop to the next stop in route.stops
      const currentIdx = stops.findIndex(
        (s) => s.toLowerCase() === String(bus.currentStop || '').toLowerCase()
      );

      if (currentIdx === -1) {
        // Bus hasn't started yet -> start at first stop
        newStop = stops[0];
        newStatus = stops.length === 1 ? 'Reached Destination' : 'En Route';
        nextStop = stops.length > 1 ? stops[1] : 'Final Destination Reached';
        logRemarks = logRemarks || `Departed from starting stop: ${newStop}`;
      } else if (currentIdx < stops.length - 1) {
        const nextIdx = currentIdx + 1;
        newStop = stops[nextIdx];
        if (nextIdx === stops.length - 1) {
          newStatus = 'Reached Destination';
          nextStop = 'Final Destination Reached';
          logRemarks = logRemarks || `Arrived at final destination: ${newStop}`;
        } else {
          newStatus = 'En Route';
          nextStop = stops[nextIdx + 1];
          logRemarks = logRemarks || `Arrived at ${newStop}`;
        }
      } else {
        // Already at last stop
        newStop = stops[stops.length - 1];
        newStatus = 'Reached Destination';
        nextStop = 'Final Destination Reached';
        logRemarks = logRemarks || `Already at final destination: ${newStop}`;
      }
    }

    const updatedBus = await Bus.findOneAndUpdate(
      { busId: bus.busId },
      { currentStop: newStop, status: newStatus },
      { new: true }
    );

    const log = await LocationLog.create({
      logId: generateId('LOG'),
      busId: bus.busId,
      timestamp: new Date(),
      currentStop: newStop,
      nextStop,
      remarks: logRemarks
    });

    const tracking = buildTrackingStatus(updatedBus, route);

    res.json({
      message: `Bus ${updatedBus.busNumber} updated: ${updatedBus.currentStop} (${updatedBus.status}).`,
      bus: updatedBus,
      log,
      tracking
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to update bus location.' });
  }
});

// ==========================================
// 7. Live Bus Status & ETA (Student / All)
// ==========================================
app.get('/api/buses/:id/status', authenticate, async (req, res) => {
  try {
    const busIdentifier = req.params.id;
    const bus = await Bus.findOne({
      $or: [{ busId: busIdentifier }, { _id: busIdentifier }]
    }).lean();

    if (!bus) {
      return res.status(404).json({ error: `Bus "${busIdentifier}" not found.` });
    }

    const [route, driver, recentLogs] = await Promise.all([
      Route.findOne({ busId: bus.busId }).lean(),
      bus.driverId ? User.findOne({ userId: bus.driverId }).lean() : Promise.resolve(null),
      LocationLog.find({ busId: bus.busId }).sort({ timestamp: -1 }).limit(10).lean()
    ]);

    // Determine student's stop via query param or logged-in student allocation
    let assignedStop = req.query.stop || null;
    const studentId = req.query.studentId || (req.user.role === 'student' ? req.user.userId : null);

    if (!assignedStop && studentId) {
      const allocation = await Allocation.findOne({ studentId }).lean();
      if (allocation && route && allocation.routeId === route.routeId) {
        assignedStop = allocation.assignedStop;
      } else if (allocation) {
        assignedStop = allocation.assignedStop;
      }
    }

    const tracking = buildTrackingStatus(bus, route, assignedStop);

    res.json({
      ...tracking,
      routeId: route ? route.routeId : null,
      routeName: route ? route.routeName : null,
      driver: driver
        ? { userId: driver.userId, name: driver.name, contact: driver.contact }
        : null,
      recentLogs
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to fetch bus status.' });
  }
});

// ==========================================
// 8. Admin Summary Dashboard API
// ==========================================
app.get('/api/admin/summary', authenticate, authorize('admin'), async (req, res) => {
  try {
    const [buses, routes, allocations, students, recentLogs] = await Promise.all([
      Bus.find({}).lean(),
      Route.find({}).lean(),
      Allocation.find({}).lean(),
      User.find({ role: 'student' }).lean(),
      LocationLog.find({}).sort({ timestamp: -1 }).limit(10).lean()
    ]);

    const totalBuses = buses.length;
    const activeRoutes = routes.length;
    const studentsAllocated = allocations.length;
    const totalStudents = students.length;
    const busesEnRoute = buses.filter((b) => b.status === 'En Route').length;

    const statusBreakdown = {
      Active: buses.filter((b) => b.status === 'Active').length,
      'En Route': busesEnRoute,
      'Reached Destination': buses.filter((b) => b.status === 'Reached Destination').length,
      Maintenance: buses.filter((b) => b.status === 'Maintenance').length
    };

    const routeUtilization = routes.map((r) => {
      const bus = buses.find((b) => b.busId === r.busId);
      const count = allocations.filter((a) => a.routeId === r.routeId).length;
      return {
        routeId: r.routeId,
        routeName: r.routeName,
        busNumber: bus ? bus.busNumber : 'Unassigned',
        busStatus: bus ? bus.status : 'N/A',
        capacity: bus ? bus.capacity : 0,
        studentsAllocated: count
      };
    });

    res.json({
      summary: {
        totalBuses,
        activeRoutes,
        studentsAllocated,
        totalStudents,
        unallocatedStudents: Math.max(0, totalStudents - studentsAllocated),
        busesEnRoute
      },
      statusBreakdown,
      routeUtilization,
      recentLogs
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to load admin summary.' });
  }
});

// ==========================================
// 404 & Error Handling
// ==========================================
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: `API endpoint ${req.method} ${req.originalUrl} not found.` });
});

app.use((err, req, res, next) => {
  console.error('[Server Error]', err);
  res.status(500).json({ error: 'Internal server error.' });
});

// ==========================================
// Start Server
// ==========================================
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`=========================================================`);
    console.log(`  College Bus Tracking System API running on port ${PORT}`);
    console.log(`  Health check: http://localhost:${PORT}/api/health`);
    console.log(`=========================================================`);
  });
});