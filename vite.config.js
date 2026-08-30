import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Electron loads the built app from disk via file://, where absolute asset paths
// (Vite's default base "/") resolve to the filesystem root instead of the app folder.
// The web deployment keeps the default "/" since it's served from a real server root.
export default defineConfig({ plugins: [react()], base: process.env.ELECTRON_BUILD ? './' : '/' });
