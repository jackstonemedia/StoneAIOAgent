import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    build: {
      outDir: 'dist',
      rollupOptions: {
        output: {
          manualChunks: {
            firebase: [
              'firebase/app',
              'firebase/auth',
              'firebase/firestore',
              'firebase/functions'
            ]
          }
        }
      }
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
    },
  };
});
