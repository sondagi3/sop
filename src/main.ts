import "./style.css";
const el = document.getElementById("app");
if (!el) throw new Error("Missing #app");
el.innerHTML = `<main style="font-family:system-ui;padding:24px">
  <h1>KioskOps Portal (TypeScript + Vite)</h1>
  <p>Corporate QA gates enabled via GitHub Actions.</p>
</main>`;
