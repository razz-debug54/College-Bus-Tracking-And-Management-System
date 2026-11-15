require('dotenv').config();

const bcrypt = require('bcryptjs');
const { connectDB } = require('./config/db');
const User = require('./models/User');
const Bus = require('./models/Bus');
const Route = require('./models/Route');
const Allocation = require('./models/Allocation');
const LocationLog = require('./models/LocationLog');

async function seedDatabase() {
  await connectDB();

  console.log('[Seed] Clearing existing data...');
  await Promise.all([
    User.deleteMany({}),
    Bus.deleteMany({}),
    Route.deleteMany({}),
    Allocation.deleteMany({}),
    LocationLog.deleteMany({})
  ]);

  const hashedPassword = await bcrypt.hash('password123', 10);

  // 1. Seed Users (1 Admin, 3 Drivers, 8 Students)
  console.log('[Seed] Creating users...');
  await User.insertMany([
    {
      userId: 'ADM-001',
      name: 'Dr. Rajesh Sharma',
      role: 'admin',
      email: 'admin@college.edu',
      password: hashedPassword,
      contact: '9876500001',
      address: 'Admin Block, Main Campus'
    },
    {
      userId: 'DRV-001',
      name: 'Ramesh Kumar',
      role: 'driver',
      email: 'driver1@college.edu',
      password: hashedPassword,
      contact: '9876511101',
      address: 'Transport Depot Quarters'
    },
    {
      userId: 'DRV-002',
      name: 'Suresh Verma',
      role: 'driver',
      email: 'driver2@college.edu',
      password: hashedPassword,
      contact: '9876511102',
      address: 'Transport Depot Quarters'
    },
    {
      userId: 'DRV-003',
      name: 'Mahesh Yadav',
      role: 'driver',
      email: 'driver3@college.edu',
      password: hashedPassword,
      contact: '9876511103',
      address: 'East Ring Transport Yard'
    },
    {
      userId: 'STU-001',
      name: 'Aarav Mehta',
      role: 'student',
      email: 'aarav@college.edu',
      password: hashedPassword,
      contact: '9811100001',
      address: '14 Green Park Extension, New Delhi'
    },
    {
      userId: 'STU-002',
      name: 'Priya Nair',
      role: 'student',
      email: 'priya@college.edu',
      password: hashedPassword,
      contact: '9811100002',
      address: '22 Sector 15 Market, Gurgaon'
    },
    {
      userId: 'STU-003',
      name: 'Kabir Malhotra',
      role: 'student',
      email: 'kabir@college.edu',
      password: hashedPassword,
      contact: '9811100003',
      address: 'Plot 8, Indiranagar 2nd Stage'
    },
    {
      userId: 'STU-004',
      name: 'Sneha Iyer',
      role: 'student',
      email: 'sneha@college.edu',
      password: hashedPassword,
      contact: '9811100004',
      address: '45 Koramangala 4th Block'
    },
    {
      userId: 'STU-005',
      name: 'Rohan Kulkarni',
      role: 'student',
      email: 'rohan@college.edu',
      password: hashedPassword,
      contact: '9811100005',
      address: 'Flat 302, Whitefield Main Road'
    },
    {
      userId: 'STU-006',
      name: 'Ananya Das',
      role: 'student',
      email: 'ananya@college.edu',
      password: hashedPassword,
      contact: '9811100006',
      address: '19 Marathahalli Bridge Road'
    },
    // Intentionally left unallocated so Admin can test Auto-Match & Manual Assign immediately!
    {
      userId: 'STU-007',
      name: 'Vikram Singh',
      role: 'student',
      email: 'vikram@college.edu',
      password: hashedPassword,
      contact: '9811100007',
      address: 'Near Silk Board Junction, Outer Ring Road'
    },
    {
      userId: 'STU-008',
      name: 'Meera Joshi',
      role: 'student',
      email: 'meera@college.edu',
      password: hashedPassword,
      contact: '9811100008',
      address: '88 MG Road Metro Station Area'
    }
  ]);

  // 2. Seed Buses
  console.log('[Seed] Creating buses...');
  await Bus.insertMany([
    {
      busId: 'BUS-101',
      busNumber: 'KA-01-CB-101',
      capacity: 40,
      driverId: 'DRV-001',
      status: 'En Route',
      currentStop: 'Green Park'
    },
    {
      busId: 'BUS-102',
      busNumber: 'KA-01-CB-102',
      capacity: 40,
      driverId: 'DRV-002',
      status: 'En Route',
      currentStop: 'Indiranagar'
    },
    {
      busId: 'BUS-103',
      busNumber: 'KA-01-CB-103',
      capacity: 35,
      driverId: 'DRV-003',
      status: 'Active',
      currentStop: 'Whitefield'
    }
  ]);

  // 3. Seed Routes
  console.log('[Seed] Creating routes...');
  await Route.insertMany([
    {
      routeId: 'RTE-01',
      routeName: 'North Campus Express',
      stops: ['City Central', 'Green Park', 'MG Road', 'Sector 15', 'Main Campus'],
      timings: ['07:30 AM', '07:45 AM', '08:00 AM', '08:15 AM', '08:35 AM'],
      busId: 'BUS-101',
      driverId: 'DRV-001'
    },
    {
      routeId: 'RTE-02',
      routeName: 'South Metro Shuttle',
      stops: ['Silk Board', 'Koramangala', 'Indiranagar', 'Domlur Flyover', 'Main Campus'],
      timings: ['07:25 AM', '07:40 AM', '07:55 AM', '08:10 AM', '08:30 AM'],
      busId: 'BUS-102',
      driverId: 'DRV-002'
    },
    {
      routeId: 'RTE-03',
      routeName: 'East Tech Corridor',
      stops: ['Whitefield', 'Marathahalli', 'Bellandur', 'HSR Layout', 'Main Campus'],
      timings: ['07:20 AM', '07:40 AM', '07:55 AM', '08:10 AM', '08:35 AM'],
      busId: 'BUS-103',
      driverId: 'DRV-003'
    }
  ]);

  // 4. Seed Allocations (6 allocated, 2 unallocated for demo)
  console.log('[Seed] Creating allocations...');
  await Allocation.insertMany([
    {
      allocationId: 'ALC-001',
      studentId: 'STU-001',
      routeId: 'RTE-01',
      assignedStop: 'Green Park',
      createdAt: new Date()
    },
    {
      allocationId: 'ALC-002',
      studentId: 'STU-002',
      routeId: 'RTE-01',
      assignedStop: 'Sector 15',
      createdAt: new Date()
    },
    {
      allocationId: 'ALC-003',
      studentId: 'STU-003',
      routeId: 'RTE-02',
      assignedStop: 'Indiranagar',
      createdAt: new Date()
    },
    {
      allocationId: 'ALC-004',
      studentId: 'STU-004',
      routeId: 'RTE-02',
      assignedStop: 'Koramangala',
      createdAt: new Date()
    },
    {
      allocationId: 'ALC-005',
      studentId: 'STU-005',
      routeId: 'RTE-03',
      assignedStop: 'Whitefield',
      createdAt: new Date()
    },
    {
      allocationId: 'ALC-006',
      studentId: 'STU-006',
      routeId: 'RTE-03',
      assignedStop: 'Marathahalli',
      createdAt: new Date()
    }
  ]);

  // 5. Seed Initial LocationLogs
  console.log('[Seed] Creating initial location logs...');
  await LocationLog.insertMany([
    {
      logId: 'LOG-001',
      busId: 'BUS-101',
      timestamp: new Date(Date.now() - 10 * 60000),
      currentStop: 'City Central',
      nextStop: 'Green Park',
      remarks: 'Morning shift departed on time'
    },
    {
      logId: 'LOG-002',
      busId: 'BUS-101',
      timestamp: new Date(Date.now() - 2 * 60000),
      currentStop: 'Green Park',
      nextStop: 'MG Road',
      remarks: 'Arrived at Green Park'
    },
    {
      logId: 'LOG-003',
      busId: 'BUS-102',
      timestamp: new Date(Date.now() - 3 * 60000),
      currentStop: 'Indiranagar',
      nextStop: 'Domlur Flyover',
      remarks: 'Normal traffic conditions'
    }
  ]);

  console.log('\n=================================================');
  console.log('  Seed completed successfully!');
  console.log('  Sample Login Credentials (password: password123)');
  console.log('  - Admin:   admin@college.edu   (ADM-001)');
  console.log('  - Driver:  driver1@college.edu (DRV-001, Bus: BUS-101)');
  console.log('  - Student: priya@college.edu   (STU-002, Stop: Sector 15 on BUS-101)');
  console.log('  - Unassigned Students for Auto-Match Demo: STU-007, STU-008');
  console.log('=================================================\n');

  process.exit(0);
}

seedDatabase().catch((err) => {
  console.error('[Seed] Error:', err);
  process.exit(1);
});