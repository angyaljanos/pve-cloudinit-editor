const openButton = document.querySelector("#open-editor");
const status = document.querySelector("#status");

openButton.addEventListener("click", async () => {
  status.textContent = "";
  openButton.disabled = true;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tab?.url ? new URL(tab.url) : null;
    if (!tab?.id || url?.protocol !== "https:" || url.port !== "8006") {
      throw new Error("Open a Proxmox VE tab on HTTPS port 8006 first.");
    }

    await chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ["dist/editor.css"],
    });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["dist/editor.js"],
    });
    window.close();
  } catch (error) {
    status.textContent = error.message;
    openButton.disabled = false;
  }
});
