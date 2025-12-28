# BrandM3dia KioskOps Offline Portal (v3.2 clean structured)

## Quick Start (works on Ubuntu/Windows)
### Option A: Open directly (simple)
Open `index.html` in Chrome/Edge.

> Note: Some browsers restrict downloads/opens in `file://` mode. If a button doesn't open a local file, use Option B.

### Option B: Run the included Java local server (recommended)
This serves the portal from `http://localhost:8787/` and avoids `file://` restrictions.

**Windows PowerShell**
```powershell
cd java-server
javac -d out src/main/java/com/brandm3/kioskops/StaticServer.java
java -cp out com.brandm3.kioskops.StaticServer
```

**Ubuntu**
```bash
cd java-server
javac -d out src/main/java/com/brandm3/kioskops/StaticServer.java
java -cp out com.brandm3.kioskops.StaticServer
```

Then open:
`http://localhost:8787/index.html`

## Self-test
Open `selftest.html` to verify the portal bundle contains required files.

