# Odometer Logbook: install on your Android phone

This app installs on your phone and works offline. Your trips are stored only on the phone and leave it only when you tap **Export → Save Excel file**.

GitHub Pages is used once, to deliver the app to your phone. It hosts only the app itself, never your trips.

## 1. Put the app on GitHub Pages (on your PC, about 10 minutes, one time only)

1. Unzip **odometer-app.zip** on your PC.
2. Go to https://github.com and create a free account, or sign in.
3. Click **+** (top right) and choose **New repository**.
   - Repository name: `odometer`
   - Choose **Public**. Free GitHub Pages needs this. Only the app code is public, never your trips.
   - Click **Create repository**.
4. On the new page, click the **uploading an existing file** link.
5. Open the unzipped folder and select **everything inside it**: `index.html`, `app.js`, `sw.js`, `ocr-worker.js`, `manifest.webmanifest`, `INSTALL.md` and the **icons** folder. Drag them all onto the GitHub page, then click **Commit changes**.
   - Check that the list on GitHub shows an `icons` folder. If it doesn't, click **Add file → Upload files**, drag the `icons` folder in, and commit again.
6. Go to **Settings → Pages** (in the left menu).
   - Under *Build and deployment*, set Source to **Deploy from a branch**, Branch to **main**, and folder to **/ (root)**. Click **Save**.
7. Wait 1–2 minutes, then refresh the page. It shows your app link, which looks like
   `https://YOUR-USERNAME.github.io/odometer/`

## 2. Install it on your Android phone

1. Open the link in **Chrome** on your phone. Send it to yourself by email or WhatsApp, then open it in Chrome, not inside WhatsApp.
2. Tap the **Install** button at the top of the app, or Chrome's **⋮ → Install app** (or **Add to Home screen**).
3. Open **Odometer** from your home screen.
4. While you still have signal, take one odometer photo. This downloads the photo reader (a few MB, one time only). After that, everything works offline.

## Using it

- **Start trip:** take a photo of the odometer. The app reads the number, and you check it or type it. Confirm where you're leaving from and tap **Start trip**.
- **End trip:** take a photo and check the number. Answer **What was this trip for?** and **Where did you go?**, then tap **Save trip**.
- **Fix a mistake:** tap any trip to edit or delete it. Use **+ Add missed trip** for a trip you forgot to log.
- **Export:** tap **Export**, pick the dates (This month, Last month, This tax year, Last tax year, All trips, or your own dates), and tap **Save Excel file**. The file goes to your phone's **Downloads** folder. Open it with Excel or Google Sheets, or send it by email or WhatsApp.

The Excel file has these columns: Date, From, To, Reason for trip, Odometer start (km), Odometer end (km), Distance (km), Start time, End time. There is a total km row at the bottom.

## Important

- Trips live only in the app on this phone. They are deleted if you uninstall the app or clear Chrome's data for the site, and they don't move to a new phone. **Export to Excel regularly as your backup.**
- Photos are used only to read the number. They are not kept, to save space on your phone.
- **Updating the app later:** upload the changed files to the same GitHub repository. If you edit `sw.js`, change `odo-v1` to `odo-v2`. The phone picks up the new version the next time you open the app with signal. Your trips are kept.
