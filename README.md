<div align="center">
  <img src="https://raw.githubusercontent.com/caedesdev/moggcord/main/moggcord.ico" width="96" height="96" alt="Moggcord Logo">

  # Moggcord

  **A custom Discord client built for people who actually care about how Discord runs.**

  [![Discord](https://img.shields.io/badge/Discord-Join%20us-5865F2?logo=discord&logoColor=white)](https://discord.gg/moggcord)
  [![License](https://img.shields.io/github/license/caedesdev/moggcord?color=a855f7)](./LICENSE)
  [![Platform](https://img.shields.io/badge/platform-Windows-3b82f6.svg?logo=windows&logoColor=white)](https://github.com/caedesdev/moggcord)
  [![Website](https://img.shields.io/badge/website-moggcord.online-5865F2?logo=googlechrome&logoColor=white)](https://moggcord.online)

  ---
</div>

Moggcord is a fork of [Equicord](https://github.com/Equicord/Equicord), which itself builds on top of [Vencord](https://github.com/Vendicated/Vencord). We stripped out the obfuscation, cleaned things up, added our own stuff, and kept what works. No bloat, no nonsense.

---

## What's in it

- **Faster startup** — no obfuscation means the client loads noticeably quicker and sits lighter on your CPU and RAM.
- **Auto-updates** — checks for updates in the background on launch and applies them silently. You don't have to think about it.
- **Plugin support** — compatible with the existing plugin ecosystem. Install community plugins straight from Git links.
- **Better audio** — hardware-optimized voice modules for cleaner, louder audio out of the box.
- **Custom styling** — our own visual tweaks on top of the base: smoother UI, custom icons, a few quality-of-life details here and there.

---

## Installation (Windows)

1. Download [**`moggcord-install.ps1`**](./moggcord-install.ps1)
2. Right-click → **Run with PowerShell**
3. Follow the steps, restart Discord, done.

---

## Building from source

If you want to dig into the code or build it yourself:

**You'll need:**
- [Git](https://git-scm.com/download)
- [Node.js (LTS)](https://nodejs.dev/en/)
- [pnpm](https://pnpm.io/installation) — `npm install -g pnpm`

```bash
git clone https://github.com/caedesdev/moggcord.git
cd moggcord
pnpm install
pnpm build
```

Then inject into Discord:

```bash
pnpm inject
```

To go back to stock Discord:

```bash
pnpm uninject
```

---

## Credits

Moggcord wouldn't exist without [Equicord](https://github.com/Equicord/Equicord) and [Vencord](https://github.com/Vendicated/Vencord). A huge chunk of what makes this work comes directly from their projects. We're fully aware of that and genuinely appreciate everything they've built — we're just taking it in a different direction. Big thanks to everyone who's contributed to both.

---

## Disclaimer

*Moggcord is not affiliated with Discord Inc. in any way.*
Using third-party clients is technically against Discord's Terms of Service. You're doing this at your own risk.
