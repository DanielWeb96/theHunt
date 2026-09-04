# Siege of Sanctum - Co-op Web Tower Defense

A real-time, browser-based co-op Tower Defense game designed to be played with friends. 

Built with pure HTML5 Canvas, JavaScript (ES Modules), Web Audio API, and **WebRTC (PeerJS)** for 100% free serverless multiplayer. Ready to host directly on **GitHub Pages**.

---

## 🔒 20-Letter Security Password

Access to the game is protected by a strict **20-letter security access key**.

* **Default Password:** `cooptowerdefensepass` (exactly 20 letters)
* Anyone visiting your game must enter this password to unlock the lobby.

### How to Change the Password:
Open [js/config.js](file:///C:/Users/Daniel/Documents/DEV/Games/js/config.js) and change line 13:
```javascript
// Must be exactly 20 characters
DEFAULT_PASSWORD: "yourtwentyletterpass",
```
Save the file, and the game will immediately enforce your new 20-letter password.

---

## 🎮 Game Features

* **4 Distinct Towers:**
  * 🏹 **Archer Spire** (🪙 60): High fire rate single-target damage.
  * 💣 **Blast Cannon** (🪙 110): Artillery with area-of-effect splash damage.
  * ❄️ **Frost Obelisk** (🪙 85): Chills creeps, reducing their speed by 50%.
  * ⚡ **Storm Conductor** (🪙 160): Chain lightning strikes up to 3 targets.
* **4 Enemy Types:** Scout Goblins (fast), Orc Raiders, Armored Golems (tanky), and Chaos Drakes (Bosses with massive HP).
* **Co-op Multiplayer (WebRTC P2P):**
  * **Team Economy:** Killer gets full bounty; teammates receive a 50% co-op assist share!
  * **Teammate Cursors:** See where your friends are aiming and planning to build in real time.
  * **Shared Sanctum Health:** 20 collective lives.
  * **In-game Team Comms:** Built-in chat log.
* **Procedural Sound Engine:** Uses the browser's native Web Audio API (no missing sound files, works offline).

---

## 🚀 How to Play & Test Locally

Because the game uses ES Modules (`import`/`export`), it needs a local web server (double-clicking `index.html` directly in the file explorer blocks module imports for security reasons).

You can run any local server in this directory:

### Option 1: Using Python (already installed on Windows)
```powershell
python -m http.server 3000
```
Then open `http://localhost:3000` in your browser.

### Option 2: Using Node (`npx serve`)
```powershell
npx serve .
```

### Option 3: VS Code Live Server
If you use VS Code, right-click `index.html` and select **"Open with Live Server"**.

> **Testing Multiplayer Locally:**  
> Open `http://localhost:3000` in **two separate browser windows** (or one normal window and one Incognito window). Host in one window, copy the room code, and join in the second window!

---

## 🌐 How to Publish to GitHub Pages (100% Free Hosting)

1. **Create a new repository on GitHub** (e.g. `tower-defense`).
2. In this folder (`C:\Users\Daniel\Documents\DEV\Games`), run:
   ```powershell
   git init
   git add .
   git commit -m "Initial commit of Co-op Tower Defense"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<repo-name>.git
   git push -u origin main
   ```
3. On GitHub, go to your repository **Settings** → **Pages** (in the left sidebar).
4. Under **Branch**, select `main` and `/ (root)`, then click **Save**.
5. In ~1 minute, GitHub will give you your free public link:
   `https://<your-username>.github.io/<repo-name>/`

---

## 🤝 Playing With Friends
1. Send your friends your GitHub Pages link.
2. Tell them the **20-letter password** (`cooptowerdefensepass`).
3. Click **Host Co-op Match** to get a 4-letter Room Code.
4. Click **Copy Link** to send them a direct invitation link (or have them enter the code).
5. Defend the Sanctum together!
