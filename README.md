# Noads - A Simple Ad Blocker Chrome Extension

Noads is a lightweight Chrome extension that removes specific DOM elements using CSS selectors, effectively blocking ads on web pages.

## Contributing

We welcome contributions to Noads! If you have suggestions or improvements, please open an issue or submit a pull request.

These instructions will get you a copy of the project up and running on your local machine for development and testing purposes.

### Prerequisites for Development

- Node.js (LTS version recommended)
- npm
- Google Chrome browser

### Quick Start

1. Clone the repository:

   ```bash
   git clone https://github.com/bingyangchen/noads.git
   cd noads
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Start the development server:

   ```bash
   npm run dev
   ```

4. Load and test the extension in Chrome:
   - Open Chrome and navigate to `chrome://extensions`
   - Enable "Developer mode" in the top right corner
   - Click "Load unpacked" and select the root directory of this project (noads)

## Release the Extension

Use the following steps when publishing a new version of the Chrome extension:

1. Update the version number in both `package.json` and `manifest.json`.
   Make sure the two files use the same version.

2. Install dependencies if needed:

   ```bash
   npm install
   ```

3. Build the release package:

   ```bash
   npm run build
   ```

   This command creates `build.zip`, which is the archive you should upload to the Chrome Web Store.

4. Publish the new version in the Chrome Web Store:

   - Open the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
   - Select this extension
   - Upload the generated `build.zip`
   - Review the store listing, screenshots, and release notes if anything changed
   - Submit the update for review and publication

5. After the release is approved, create a git tag or GitHub release if you want to keep the repository history aligned with published versions.
