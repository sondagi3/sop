BRANDM3DIA KIOSKOPS PORTAL v4.1 (FULL QA)

If you see a RED banner: "Portal script did not load (assets/app.js)" it means the browser did not execute the JavaScript.
Most common causes:
1) You opened the portal as file:// (not recommended)
2) You started a server from the WRONG folder
3) Your server served app.js with the wrong MIME type (Chrome blocks it)

RECOMMENDED START (Ubuntu):
1) Open Terminal in the portal folder
2) Run:
   ./scripts/run_server_ubuntu.sh
3) Open:
   http://localhost:8787/index.html

RECOMMENDED START (Windows):
1) Double-click:
   scripts\run_server_windows.bat
2) Open:
   http://localhost:8787/index.html

DEBUG CHECK:
Open this in the browser:
http://localhost:8787/assets/app.js
You should see JavaScript text. If you see 404, you're serving the wrong folder.

DIAGNOSTICS:
http://localhost:8787/diagnostics.html
