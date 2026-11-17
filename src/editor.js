import { validateYaml } from "./validate.js";

if (!document.getElementById("pve-cloudinit-launcher")) {
  const launcher = document.createElement("button");
  launcher.id = "pve-cloudinit-launcher";
  launcher.type = "button";
  launcher.textContent = "Cloud-Init YAML";
  launcher.setAttribute("aria-label", "Open Cloud-Init YAML editor");

  const panel = document.createElement("section");
  panel.id = "pve-cloudinit-panel";
  panel.hidden = true;
  panel.setAttribute("aria-label", "Cloud-Init YAML editor");
  panel.innerHTML = `
    <header>
      <strong>Cloud-Init YAML editor</strong>
      <button id="pve-cloudinit-close" type="button" aria-label="Close editor">×</button>
    </header>
    <label for="pve-cloudinit-source">YAML</label>
    <textarea id="pve-cloudinit-source" spellcheck="false" aria-describedby="pve-cloudinit-result">#cloud-config
</textarea>
    <div class="pve-cloudinit-actions">
      <button id="pve-cloudinit-validate" type="button">Validate YAML</button>
    </div>
    <p id="pve-cloudinit-result" role="status" aria-live="polite"></p>
  `;

  document.body.append(launcher, panel);

  const source = panel.querySelector("#pve-cloudinit-source");
  const result = panel.querySelector("#pve-cloudinit-result");

  launcher.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) source.focus();
  });
  panel.querySelector("#pve-cloudinit-close").addEventListener("click", () => {
    panel.hidden = true;
  });
  panel.querySelector("#pve-cloudinit-validate").addEventListener("click", () => {
    const validation = validateYaml(source.value);
    result.textContent = validation.message;
    result.dataset.valid = String(validation.valid);
  });
}
