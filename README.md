# Logseq AI Plugin

A Logseq plugin that adds AI assistance to enhance your note-taking and knowledge management experience.

## Overview

This plugin integrates AI capabilities into your Logseq workflow, allowing you to leverage artificial intelligence directly within your knowledge graph.

## Development

### Prerequisites

- Node.js (version specified in `.nvmrc` or `package.json`)
- npm or yarn

### Installation

```bash
npm install
```

### Development Commands

#### Browser Development

To develop and test in the browser:

```bash
npm run dev
```

This starts the development server and allows you to test the plugin in a browser environment.

#### Build for Logseq

To build the plugin for use in Logseq:

```bash
npm run build
```

This compiles TypeScript and builds the plugin bundle that Logseq will use.

#### Build for Browser (there if you need it)

If you need to build exclusively for the browser (generally not needed):

```bash
npm run build-browser
```

**Note:** This command is mainly kept for compatibility and is rarely used.

### Other Commands

- `npm run lint` - Run ESLint to check code quality
- `npm run preview` - Preview the production build

## Project Structure

- `src/` - Source code
  - `main-logseq.tsx` - Entry point for Logseq plugin
  - `main-browser.tsx` - Entry point for browser development
  - `App.tsx` - Main React component
- `vite-logseq.config.ts` - Vite configuration for Logseq builds
- `vite-browser.config.ts` - Vite configuration for browser builds
- `dist/` - Built output (generated)

## Features

- AI-powered assistance within your Logseq notes
- Seamless integration with Logseq's UI
- Custom UI components for AI interactions

## Building the Plugin

After running `npm run build`, the plugin will be built in the `dist/` directory and can be installed in Logseq by:

1. Opening Logseq
2. Going to Settings > Plugins
3. Loading the plugin from the `dist/` folder

## Technologies

- React 19
- TypeScript
- Vite
- Logseq Plugin API
- ESLint
