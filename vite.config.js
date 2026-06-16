import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { copyFileSync, existsSync, mkdirSync } from 'fs';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'copy-files',
      closeBundle() {
        const distDir = resolve(__dirname, 'dist');
        if (!existsSync(distDir)) mkdirSync(distDir, { recursive: true });
        copyFileSync(resolve(__dirname, 'manifest.json'), resolve(distDir, 'manifest.json'));
        copyFileSync(resolve(__dirname, 'offscreen.html'), resolve(distDir, 'offscreen.html'));
        copyFileSync(resolve(__dirname, 'offscreen-recorder.js'), resolve(distDir, 'offscreen-recorder.js'));
      }
    }
  ],
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        sidepanel: resolve(__dirname, 'sidepanel.html'),
        background: resolve(__dirname, 'background.js'),
        content: resolve(__dirname, 'content.js'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]',
      },
    },
  },
});
