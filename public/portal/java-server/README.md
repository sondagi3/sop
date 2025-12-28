# Optional Java Local Server (recommended)

Why:
- Running the portal via `file://` can cause browser restrictions (downloads, opening local files, fetch()).
- This tiny Java server hosts the portal at `http://localhost:8787/` and avoids those issues.

Requirements:
- Java 11+
- `javac` available (JDK)

Run (Windows PowerShell):
```powershell
cd java-server
javac -d out src/main/java/com/brandm3/kioskops/StaticServer.java
java -cp out com.brandm3.kioskops.StaticServer
```

Then open:
http://localhost:8787/index.html
