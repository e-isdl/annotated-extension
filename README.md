# Annotated Extension

Chrome extension for clipping and annotating content from the web.

## Features

- Clip YouTube videos with custom time ranges
- Clip text from articles
- Add text annotations to clips
- Upload audio annotations
- Share clips to the Annotated community

## Installation (Developer Mode)

Since this extension is not yet on the Chrome Web Store, you can install it in developer mode:

1. **Download this repository**
   - Click the green "Code" button above → "Download ZIP"
   - Extract the ZIP file

2. **Download the latest release**
   - Go to [Releases](../../releases)
   - Download the `annotated-extension.zip` from the latest release

3. **Load in Chrome**
   - Open Chrome and go to `chrome://extensions`
   - Enable **Developer mode** (toggle in top right)
   - Click **Load unpacked**
   - Select the extracted `annotated-extension` folder from the release

4. **Pin the extension**
   - Click the puzzle piece icon in Chrome's toolbar
   - Pin "Annotated" for easy access

## Usage

1. Click the Annotated icon in your toolbar
2. Sign in with your Google account
3. Navigate to any YouTube video or article
4. Click the Annotated icon to start clipping
5. Select your clip range and add an annotation
6. Publish to share with the community

## Links

- [Web App](https://annotated-2ec.pages.dev)
- [Report Issues](https://github.com/e-isdl/annotated-extension/issues)

## Tech Stack

- React 18 + Vite
- Tailwind CSS
- Chrome Extension Manifest V3
- Supabase (backend)
