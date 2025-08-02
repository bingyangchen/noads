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

5. Build the extension:

   ```bash
   npm run build
   ```
