# EZCP (Easy Copy/Paste) is a small Expo React Native app that turns your phone into a local “text clipboard” over Wi‑Fi / hotspot.

- Paste any text into the app.
- Other devices connected to your hotspot/Wi‑Fi can open a URL shown in the app.
- The web page updates automatically and provides a one-tap **Copy** button.
- The receiver web page can also edit/paste text and sync it back to the phone.

## How it works (offline)
Your phone runs a tiny local web server (LAN only). A receiving device opens the shown `http://<ip>:8080` URL over the same Wi‑Fi / hotspot — no internet required.

Two-way sync: the receiver web page also sends edits back to the phone using a small local API on port `8081` (same IP).

## Setup
Prereqs: Node.js + npm (or pnpm/yarn), and the Expo CLI tooling.

1) Install dependencies:
```bash
npm install
```

If the text area is hidden by the keyboard, this app uses `react-native-keyboard-aware-scroll-view` to keep it visible.

2) This project uses a native module (`react-native-static-server`), so it **will not run in Expo Go**.
Create native projects and run a development build:
```bash
npx expo prebuild
npx expo run:android
# or
npx expo run:ios
```

If `npx expo prebuild` fails with CocoaPods errors, run:
```bash
npx expo install --fix
```
then rerun prebuild with:
```bash
npx expo prebuild --clean
```

## Use
1) Open the app on the device that will host the text.
2) Turn on Personal Hotspot / Wi‑Fi hotspot on that device.
3) Connect the receiving device to that hotspot/Wi‑Fi.
4) On the receiving device, open the URL shown in the app.
5) Tap **Copy** on the web page.

## Notes / troubleshooting
- If the receiver can’t load the page, confirm both devices are on the same Wi‑Fi/hotspot and try re-opening the URL.
- iOS may prompt for “Local Network” permission (required).
- The receiver page refreshes automatically (polling `data.json`).
- Anyone connected to the same network/hotspot can open the URL and view the shared text.
- To change the port, edit `DEFAULT_PORT` in `src/screens/HomeScreen.tsx`.
- Android builds apply a small compatibility patch to `react-native-static-server` via `patch-package` (runs in `postinstall`).
  - If `patch-package` complains, delete `node_modules` and reinstall.

--- 

### Version 1.2.26 (Alpha)
[Visit More From Developer](https://muhammedgasal.com)