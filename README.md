# Dead Zone: Outpost 3D - Co-op Zombie Defense

A real-time, browser-based **3D Co-op Zombie Defense game** designed to be played with friends. 

Built with **Three.js (WebGL 3D)**, Web Audio API, and **WebRTC (PeerJS)** for 100% free serverless multiplayer. Ready to host directly on **GitHub Pages**.

---

## 🔒 Security Password Access

Access to the game is protected by a security clearance key.

* **Default Password:** `dakustowerGame69`
* Anyone visiting your game must enter this password to unlock the lobby.

### How to Change the Password:
Open [js/config.js](file:///C:/Users/Daniel/Documents/DEV/Games/js/config.js) and change line 10:
```javascript
DEFAULT_PASSWORD: "yournewpassword",
PASSWORD_LENGTH: 16, // set to your password's length
```

---

## 🎮 3D Game Features

* **Isometric 3D Apocalyptic World:** Realistic dark fog, shadows, asphalt roads, ruined barricades, and a fortified survivor blast bunker.
* **4 Anti-Zombie Weapon Emplacements:**
  * 🔫 **Sentry Minigun** (⚙️ 65): Twin rotary barrels with rapid 3D tracer fire.
  * 🔥 **Incinerator** (⚙️ 115): Pressurized napalm dealing area-of-effect fire damage.
  * ❄️ **Cryo Pylon** (⚙️ 90): Liquid nitrogen emitter chilling and freezing zombies.
  * 🚀 **Missile Silo** (⚙️ 175): Heavy cluster rockets with 3D explosive shockwaves.
* **Procedural 3D Animated Zombies:**
  * 🧟 **Decayed Shamblers**: Shambling limbs and glowing red eyes.
  * 🏃 **Infected Sprinters**: Sprints at terrifying speeds.
  * 🛡️ **Armored Juggernauts**: Heavy bullet sponges.
  * 👹 **Goliath Abominations**: Colossal mutant bosses that spawn every 5 nights!
* **Co-op Multiplayer (WebRTC P2P):**
  * **3D Holographic Cursors:** See where your teammates are aiming on the 3D ground in their team color!
  * **Shared Bunker Integrity:** 25 blast door lives.
  * **Scrap Economy:** Earn scrap metal from zombie kills + 50% assist share for teammates.
  * **Radio Comms:** In-game live team chat.
* **Procedural Sound Engine:** Minigun cracks, napalm roars, rocket booms, and zombie growls using Web Audio API.

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

## 🌐 How to Enable GitHub Pages (1-Minute Step)

All your code has already been pushed to `main`! To turn on your live URL:

1. Open your repository settings: **[GitHub Pages Settings](https://github.com/DanielWeb96/towerTower/settings/pages)**
2. Under **Build and deployment**:
   * **Source**: `Deploy from a branch`
   * **Branch**: Select `main` and `/ (root)`
   * Click **Save**
3. In ~60 seconds, your game is live for the world at:
   👉 **`https://danielweb96.github.io/towerTower/`**

---

## 🤝 Playing With Friends
1. Send your friends your live link: `https://danielweb96.github.io/towerTower/`
2. Tell them the **access password** (`dakustowerGame69`).
3. Click **Host Co-op Match** to get a 4-letter Room Code.
4. Click **Copy Link** to send them a direct invitation link (or have them enter the code).
5. Defend the Sanctum together!
