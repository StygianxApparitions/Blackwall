const form = document.querySelector("#demo-form");
const submitButton = document.querySelector("#submit-button");
const loadingPanel = document.querySelector("#loading-panel");
const loadingHeader = document.querySelector("#loading-header");
const loadingMessage = document.querySelector("#loading-message");
const cancelButton = document.querySelector("#cancel-loading");
const formStatus = document.querySelector("#form-status");
const pageTitle = document.querySelector("#page-title");
const signupCopy = document.querySelector("#signup-copy");

let activeRequest;
let lastSucceeded = false;

function showForm({ reset = true, message = "" } = {}) {
  loadingPanel.hidden = true;
  form.hidden = false;
  pageTitle.hidden = false;
  signupCopy.hidden = false;
  submitButton.disabled = false;

  if (reset) form.reset();

  formStatus.textContent = message;
  formStatus.hidden = !message;

  form.querySelector("input").focus();
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;

  const formData = new FormData(form);
  const id = String(formData.get("id") || "").trim();
  const username = String(formData.get("username") || "").trim();

  form.hidden = true;
  pageTitle.hidden = true;
  signupCopy.hidden = true;
  formStatus.hidden = true;
  loadingPanel.hidden = false;
  submitButton.disabled = true;
  lastSucceeded = false;
  loadingHeader.textContent = "Sending…";
  loadingMessage.textContent = "Sending your ID and username to Discord.";
  cancelButton.textContent = "Cancel";

  const controller = new AbortController();
  activeRequest = controller;
  cancelButton.focus();

  try {
    const response = await fetch("/api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, username }),
      signal: controller.signal,
    });

    // Don't crash if the server ever returns something that isn't JSON
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.error || `Request failed (${response.status}).`);
    }

    lastSucceeded = true;
    loadingHeader.textContent = "Posted to Discord";
    loadingMessage.textContent = "Your ID and username were sent to the configured channel.";
    cancelButton.textContent = "Send another";
  } catch (error) {
    if (error.name === "AbortError") return;

    loadingHeader.textContent = "Could not send";
    loadingMessage.textContent = error.message || "Check the local server configuration and try again.";
    cancelButton.textContent = "Back to form";
  } finally {
    if (activeRequest === controller) activeRequest = undefined;
  }
});

cancelButton.addEventListener("click", () => {
  if (activeRequest) {
    // Still waiting: stop the request
    activeRequest.abort();
    activeRequest = undefined;
    showForm({
      reset: true,
      message: "Stopped waiting. If the request already reached Discord, it may still be delivered.",
    });
  } else {
    // Finished: clear the form after success, keep the values after a failure
    showForm({ reset: lastSucceeded });
  }
});