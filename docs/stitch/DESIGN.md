# Project Brief: PrintOps Studio

## 1. Project Overview
**PrintOps Studio** is a high-fidelity, offline-first desktop application designed for personal 3D printing business management. It provides a technical, industrial interface for hobbyists and small-scale sellers to manage their design library, track multi-material inventory (filaments and hardware), calculate precise production costs, and log business operations.

### Core Value Proposition
- **Technical Precision**: Deep integration with HueForge-style multi-color printing workflows.
- **Operational Efficiency**: Streamlined logging of production runs and inventory deduction.
- **Financial Clarity**: Granular costing that accounts for labor, electricity, and failure rates.
- **Privacy & Speed**: Fully offline, local-only database for a fast, secure user experience.

---

## 2. Target Audience
Individual 3D print entrepreneurs (e.g., Bambu Lab owners) who sell small-batch products like bookmarks, clickers, and keychains through various channels (home, online, local cafes).

---

## 3. Visual Identity & Design System
The application utilizes the **Industrial Precision** design system, available in both **Dark** and **Light** modes.

- **Aesthetic**: Premium, industrial, clean, and futuristic. Inspired by 3D printer control systems.
- **Typography**: Geist (Sans-serif) for high legibility and a technical feel.
- **Color Palette**:
    - **Primary**: Neon Green (#00C853) for actions and positive statuses.
    - **Neutral**: Deep charcoals and blacks (Dark mode) or crisp whites and soft grays (Light mode).
    - **Semantic**: Amber for warnings (Low stock, license issues), Red for errors or risks (Expired licenses, failed prints).
- **Components**: High-density tables, technical badges (TD values, hex swatches), and metric cards with large numeric indicators.

---

## 4. Feature Requirements & User Flows

### 4.1 Design & Recipe Management
- **Design Library**: Centralized hub for tracking STL sources, designer licenses, and commercial permissions.
- **HueForge Match Checker**: A specialized tool to compare author-required filaments (Hex/TD) against owned inventory to predict print feasibility.
- **Product Recipes**: Defined multi-material stacks with estimated gram usage per piece.

### 4.2 Inventory Management
- **Filament Tracking**: Real-time tracking of open and sealed spools, including Transmission Distance (TD) data and cost-per-gram.
- **Add-ons & Hardware**: Inventory for non-printed parts (magnets, tassels, packaging).
- **Finished Goods**: Tracking "ready-to-sell" stock levels at home.

### 4.3 Operations & Logging
- **Production Logging**: Form to record completed print jobs. Automatically deducts filament/hardware from inventory and adds products to finished stock.
- **Sales Tracking**: Transaction log with profit calculation per sale and channel-based reporting.
- **Costing Calculator**: A parametric analysis tool for batch setups, including overheads like wear-and-tear and labor.

### 4.4 Analytics & Administration
- **Business Analytics**: Monthly telemetry for revenue, expenses, and profit-per-print-hour.
- **Procurement Queue**: A dynamic shopping list based on inventory minimums and required filaments for new designs.
- **Local Data Management**: Manual backup/restore and CSV export functionality.

---

## 5. Technical Constraints
- **Platform**: Desktop (optimised for macOS/Tauri).
- **Database**: Local-only (no cloud sync, no Firebase).
- **Performance**: High-density UI must remain responsive and fast.
- **Modality**: Supports piece, set, pair, and pack units.

---

## 6. Screen Inventory
1.  **Dashboard**: Operations overview and quick metrics.
2.  **Design Library**: Product and license management.
3.  **Product Detail**: Deep dive into recipes and production history.
4.  **HueForge Match Checker**: Technical filament matching workflow.
5.  **Filament Inventory**: Spool telemetry and stock levels.
6.  **Add-ons & Hardware**: Peripheral part tracking.
7.  **Print Costing**: Technical batch cost analysis.
8.  **Production Runs**: History and logging interface.
9.  **Sales Overview**: Transaction tracking.
10. **Expenses & Licenses**: Membership and overhead tracking.
11. **Business Reports**: Performance analytics.
12. **Shopping List**: Procurement management.
13. **Settings**: Parametric thresholds and app preferences.
14. **Backup & Export**: Data safety management.