import "./style.css";
const el = document.getElementById("app");
if (!el) throw new Error("Missing #app");
el.innerHTML = `
  <main style="font-family: system-ui; padding: 24px;">
    <h1>KioskOps Portal (TypeScript + Vite)</h1>
    <p><a href="/portal/" style="font-size:18px;">Open KioskOps Offline Portal →</a></p>
  </main>
`;
