# Nodeino ⚡

> **AST-Based Visual Architecture Mapping & Flow Inspector for Arduino C++**

Nodeino is a modern, code-centric visual architecture mapping tool designed for embedded developers, roboticists, and Arduino programmers. Rather than trying to replace text-based coding with restrictive visual blocks, Nodeino maps imperative C++ source code to a live, interactive, and modular electronic schematic diagram.

---

## 🌟 Key Architectural Principles

### 1. `loop()` as an Execution Sequencer
In Arduino C++, `loop()` is not a dataflow node or a domino caller; it is strictly an **orchestrator / sequencer**. It dispatches requests in chronological order (`Adım 1, Adım 2, Adım 3`), manages cadence (`delay(50ms)`), and executes branching logic (`if/else`).

### 2. Değerler Kutusu (Scope Memory & Variable Store)
Independent function blocks (`readDistance`, `smoothFilter`, `controlMotor`) have **no direct horizontal wiring** between one another unless one calls the other internally. Instead:
- Function return values write directly to named variable slots in the **Scope Memory** (`raw`, `clean`).
- Subsequent functions read their arguments from this central store.
- Built-in static linter detects dead variables (e.g. `temp_c` written but never consumed).

### 3. Hardware Pin Registry
Physical MCU peripherals and GPIO pins are tracked in a dedicated hardware conflict-free registry (`D9`, `D10`, `D5 PWM`, `D6`), distinguishing hardware side-effects from pure algorithmic data flow.

### 4. Zero-Collision PCB Trace Router
- **Manhattan 90° Orthogonal Routing** inspired by electronic circuit schematics (EDA/PCB).
- **Guaranteed Outward Departures**: All traces exit and enter card ports straight outward ($\ge 30\text{ px}$) before filleting or bending.
- **Dynamic Obstacle Avoidance (A*)**: Wires route strictly through vertical corridors and highways, never penetrating card bodies.
- **Parallel Line Separation**: Dedicated channel lanes with 15–20px pitch prevent overlapping traces.
- **Adjustable Corner Radius**: Toggle between sharp PCB 90°, filleted corners, Bézier curves, or linear wiring.

### 5. Interactive Bidirectional Highlighting
- **Click any Trace**: The wire and its connected source/target cards glow brightly; all unrelated nodes dim out.
- **Click any Card**: The card and **all** connected incoming/outgoing wires illuminate.
- **Interactive Collision Repulsion**: Dragging a card smoothly pushes neighboring cards away with a 60px safety gap to prevent overlaps.

---

## 🚀 Getting Started

No build tools or heavy installations required. Nodeino is fully self-contained!

1. Clone this repository:
   ```bash
   git clone https://github.com/<your-username>/nodeino.git
   cd nodeino
   ```
2. Open `index.html` in any modern web browser:
   - On Windows: double-click `index.html` or run `start index.html`
   - On macOS: `open index.html`
   - On Linux: `xdg-open index.html`

---

## 🗺️ Roadmap & Future Phases

- [x] **Phase 1: Conceptual Interactive Canvas & Zero-Collision Router** (Complete)
- [ ] **Phase 2: Tree-sitter AST Parser Engine** (Live parsing of arbitrary `.ino` / `.cpp` sketches)
- [ ] **Phase 3: Bidirectional Visual-to-Code Editor** (Drag-and-drop port connections that synthesize clean C++ code)
- [ ] **Phase 4: PlatformIO / Arduino IDE Extension** (VS Code & Web sidecar panel)

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
