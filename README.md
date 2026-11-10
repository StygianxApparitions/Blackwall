# Definitely Not a Login

A local-only joke demo. The form sends its two harmless fields to a Discord channel through the local Node server.

## Run locally

1. Revoke the previously shared Discord webhook and create a replacement. A webhook URL is a secret and should not be committed or pasted into source files.
2. Set the Windows user environment variable `DISCORD_WEBHOOK_URL` to the replacement webhook URL, then open a new PowerShell terminal.
3. From this folder, run `node .\server.js`.
4. Open `http://127.0.0.1:3000`.

The server binds to loopback only. It does not expose the webhook URL to the browser. The supplied background image is used unchanged from `assets/game-collage.png`.
