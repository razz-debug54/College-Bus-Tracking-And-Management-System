# 🚌 CampusRide — College Bus Tracking & Fleet Management System

![Status](https://img.shields.io/badge/Status-Active-success?style=flat-square)
![Node.js](https://img.shields.io/badge/Node.js-v18%2B-339933?style=flat-square&logo=nodedotjs)
![Express.js](https://img.shields.io/badge/Express.js-4.x-000000?style=flat-square&logo=express)
![MongoDB](https://img.shields.io/badge/MongoDB-Mongoose%20%2B%20JSON%20Fallback-47A248?style=flat-square&logo=mongodb)
![PRs Welcome](https://img.shields.io/badge/PRs-Welcome-brightgreen?style=flat-square)
![License: MIT](https://img.shields.io/badge/License-MIT-blue?style=flat-square)

**CampusRide** is a full-stack web application designed to streamline college campus transit without requiring expensive GPS hardware. It provides real-time stop-based bus tracking and dynamic ETAs for students, a one-tap trip progression console for drivers, and automated location-based route allocation for transport administrators.

---

## ✨ Key Features

### 🎓 Student Live Tracker (`student.html`)
* **Real-Time Proximity & ETA:** Automatically polls bus status every 5 seconds to calculate stops remaining and estimated arrival time (`5 mins/stop` baseline).
* **Visual Stop Timeline:** Displays the complete route sequence with clear indicators for passed stops, current bus position, and the student's boarding stop.
* **Driver & Route Info:** Quick access to assigned bus number, route timings, and driver contact details.

### 🚍 Driver Trip Console (`driver.html`)
* **Zero-Hardware Workflow:** Mobile-friendly interface allowing drivers to update trip progress in one tap (**Start Trip**, **Next Stop**, **End Trip**).
* **Delay & Traffic Remarks:** Ability to log custom remarks (e.g., traffic delays, breakdowns) directly into the location audit log.
* **Auto-Completion:** Automatically updates bus status to `Reached Destination` upon arriving at the final stop.

### 🛠️ Admin Control Center (`admin.html`)
* **1-Click Auto-Match by Location:** Intelligent keyword-scoring algorithm that parses student residential addresses, matches them to the closest route stop, and enforces bus seating capacity limits.
* **Fleet & Route Management:** Create and manage buses, assign drivers, and define ordered stop lists and schedules.
* **Live Fleet Overview:** Monitor active buses, seat allocations, and student assignments from a unified dashboard.

---

## 🏗️ System Architecture & Tech Stack

* **Frontend:** HTML5, Tailwind CSS (CDN), Vanilla JavaScript (`index.html`, `admin.html`, `driver.html`, `student.html`)
* **Backend:** Node.js, Express.js (`server.js`)
* **Authentication & Security:** JWT (`jsonwebtoken`) role-based access control (RBAC) & password hashing (`bcryptjs`)
* **Database Layer:** MongoDB via Mongoose ODM with an automatic **Hybrid Model Adapter** (`utils/hybridmodel.js`) that seamlessly falls back to local JSON persistence (`data/local-db.json`) when no `MONGODB_URI` is configured.

---

## 📁 Project Structure

```text
├── config/
│   └── db.js                 # MongoDB & local JSON fallback connection handler
├── data/
│   └── local-db.json         # Auto-generated local database store
├── models/
│   ├── Allocation.js         # Student-to-route & stop assignment schema
│   ├── Bus.js                # Bus fleet & live status schema
│   ├── LocationLog.js        # Stop progression & remarks audit log schema
│   ├── Route.js              # Ordered stops & timings schema
│   └── User.js               # Admin, Driver & Student user schema
├── Public/
│   ├── index.html            # Landing page, login & account registration
│   ├── admin.html            # Admin fleet & auto-match dashboard
│   ├── driver.html           # Driver 1-tap trip console
│   └── student.html          # Student live bus tracker & ETA view
├── utils/
│   └── hybridmodel.js        # Dual Mongoose / Local JSON persistence adapter
├── .env.example              # Environment variable template
├── package.json              # Project metadata & dependencies
├── seed.js                   # Database seeder with demo accounts & routes
└── server.js                 # Express API server & RBAC middleware
