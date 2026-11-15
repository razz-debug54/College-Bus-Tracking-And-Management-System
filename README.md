# 🏗️ SQL Data Warehouse & Analytics Project

[![Status](https://img.shields.io/badge/Status-Active-brightgreen.svg)]()
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapullrequest.com)
[![SQL Server](https://img.shields.io/badge/Database-Microsoft%20SQL%20Server-CC2927?logo=microsoftsqlserver&logoColor=white)]()

A modern, end-to-end **SQL Data Warehouse & Analytics** solution built using industry best practices. This repository demonstrates the design and implementation of a scalable data warehouse leveraging the **Medallion Architecture** (Bronze, Silver, and Gold layers) to ingest, cleanse, and model raw ERP and CRM data into an analytics-ready Star Schema.

---

## 🏛️ Data Architecture

The pipeline follows the **Medallion Architecture** framework, organizing data across three progressive layers of quality and structure:

1. **🥉 Bronze Layer (Raw Ingestion):**
   * Ingests raw, unaltered data directly from source systems (ERP and CRM CSV files) using `BULK INSERT`.
   * Preserves historical data lineage and acts as an immutable landing zone.
2. **🥈 Silver Layer (Cleansed & Standardized):**
   * Applies data cleansing, deduplication, null handling, and business rule standardization.
   * Normalizes data types and reconciles schema discrepancies across disparate source systems.
3. **🥇 Gold Layer (Business-Ready Star Schema):**
   * Models curated data into analytical **Fact** and **Dimension** views (`dim_customers`, `dim_products`, `fact_sales`).
   * Optimized for high-performance querying, Business Intelligence (BI) reporting, and ad-hoc SQL analytics.

---

## 🛠️ Tech Stack & Tools Used

### Core Data Engineering & Database Stack
* **Database Engine:** Microsoft SQL Server (T-SQL)
* **IDE & Query Tool:** SQL Server Management Studio (SSMS) / Azure Data Studio
* **Data Modeling & Architecture:** Draw.io / Lucidchart (ER Diagrams & Data Flow Mapping)
* **Version Control:** Git & GitHub
* **Data Sources:** Flat Files (CSV — ERP & CRM datasets)

### 🤖 AI Assistance & Productivity Tools
AI tools were leveraged throughout the development lifecycle to accelerate workflows, optimize T-SQL queries, and refine documentation:
* **Google Gemini:** Assisted with structuring project documentation, refining architectural explanations, and generating technical summaries.
* **ChatGPT / GitHub Copilot:** Used for brainstorming edge-case data cleansing logic, optimizing complex T-SQL joins and window functions, and debugging stored procedures.

---

## 📂 Repository Structure

```text
SQL-data-warehouse-project/
│
├── datasets/                   # Raw source CSV files (CRM and ERP systems)
│   ├── source_crm/             # Customer, sales, and product CRM exports
│   └── source_erp/             # Location, customer demographic, and category ERP exports
│
├── docs/                       # Architecture diagrams, data catalog, and naming conventions
│
├── scripts/                    # Modular T-SQL scripts organized by Medallion layer
│   ├── bronze/                 # DDL & bulk insert scripts for raw ingestion
│   ├── silver/                 # Data transformation, cleansing, and stored procedures
│   └── gold/                   # Views and Star Schema (Fact & Dimension) definitions
│
├── tests/                      # Data quality, referential integrity, and validation checks
│
├── LICENSE                     # Project license details
└── README.md                   # Project overview and setup instructions
