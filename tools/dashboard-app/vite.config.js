import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'index.html'),
          release: resolve(__dirname, 'release.html'),
        },
      },
    },
    server: {
      proxy: {
        '/api/jira': {
          target: env.VITE_JIRA_URL || 'https://credo-ai.atlassian.net',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/jira/, ''),
          configure: (proxy, options) => {
            proxy.on('proxyReq', (proxyReq, req, res) => {
              // Add JIRA authentication headers
              const email = env.VITE_JIRA_EMAIL;
              const token = env.VITE_JIRA_TOKEN;

              if (email && token) {
                const auth = Buffer.from(`${email}:${token}`).toString('base64');

                // Remove browser-specific headers that trigger XSRF checks
                const hadCookie = !!proxyReq.getHeader('cookie');
                proxyReq.removeHeader('cookie');
                proxyReq.removeHeader('Cookie');
                proxyReq.removeHeader('origin');
                proxyReq.removeHeader('Origin');
                proxyReq.removeHeader('referer');
                proxyReq.removeHeader('Referer');
                proxyReq.removeHeader('sec-fetch-site');
                proxyReq.removeHeader('sec-fetch-mode');
                proxyReq.removeHeader('sec-fetch-dest');

                // Set our headers to make it look like a direct API call (not from browser)
                proxyReq.setHeader('Authorization', `Basic ${auth}`);
                proxyReq.setHeader('Accept', 'application/json');
                proxyReq.setHeader('Content-Type', 'application/json');
                proxyReq.setHeader('X-Atlassian-Token', 'no-check');

                console.log('[Proxy] Request:', {
                  method: proxyReq.method,
                  path: proxyReq.path,
                  target: env.VITE_JIRA_URL,
                  hasEmail: !!email,
                  hasToken: !!token,
                  email: email,
                  authHeaderSet: proxyReq.getHeader('Authorization') ? 'YES' : 'NO',
                  authHeaderStart: proxyReq.getHeader('Authorization')?.substring(0, 15),
                  hadCookie: hadCookie,
                  hasCookieNow: !!proxyReq.getHeader('cookie'),
                  hasOrigin: !!proxyReq.getHeader('origin')
                });
              } else {
                console.log('[Proxy] Missing credentials:', {
                  hasEmail: !!email,
                  hasToken: !!token
                });
              }
            });
            proxy.on('proxyRes', (proxyRes, req, res) => {
              console.log('[Proxy] Response:', {
                status: proxyRes.statusCode,
                statusMessage: proxyRes.statusMessage,
                path: req.url,
                method: req.method
              });
            });
            proxy.on('error', (err, req, res) => {
              console.error('[Proxy] Error:', err.message);
            });
          },
        },
      },
    },
  }
})
