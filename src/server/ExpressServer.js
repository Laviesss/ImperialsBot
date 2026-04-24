import express from 'express';
import { createServer } from 'http';
import { createRequire } from 'module';
import { createProxyMiddleware, fixRequestBody } from 'http-proxy-middleware';
import httpProxy from 'http-proxy';
import compression from 'compression';
import path from 'path';
import { fileURLToPath } from 'url';
import { ProxyAgent } from 'proxy-agent';
import { ConfigLoader } from '../config/ConfigLoader.js';

const require = createRequire(import.meta.url);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class ExpressServer {
    constructor(port = 3000) {
        this.app = express();
        this.httpServer = createServer(this.app);
        this.port = port;

        this.setupMiddleware();
        this.setupRoutes();
    }

    setupMiddleware() {
        this.app.use(compression());
        this.app.use(express.json());

        // Comprehensive Viewer Asset Proxy (Fixes Render Black Screen)
        this.app.use((req, res, next) => {
            const referer = req.headers.referer;
            if (!referer) return next();

            const match = referer.match(/\/viewer\/(\d+)/);
            if (match) {
                const targetPort = parseInt(match[1]);
                const { botManager } = require('../core/BotManager.js');
                
                if (botManager.getAuthorizedPorts().has(targetPort)) {
                    // Proxy any request that looks like a viewer asset or socket
                    if (req.url.startsWith('/socket.io') || 
                        req.url.includes('.js') || 
                        req.url.includes('.css') || 
                        req.url.startsWith('/assets')) {
                        return this.createProxyHandler(targetPort)(req, res, next);
                    }
                }
            }
            next();
        });

        // Security Headers
        this.app.use((req, res, next) => {
            res.setHeader('X-Content-Type-Options', 'nosniff');
            res.setHeader('X-Frame-Options', 'SAMEORIGIN');
            res.setHeader('X-XSS-Protection', '1; mode=block');
            next();
        });

        this.app.use(express.static(path.join(__dirname, '../../public'), {
            maxAge: '1d'
        }));
    }

    createProxyHandler(targetPort, rewritePath = false) {
        return createProxyMiddleware({
            target: `http://127.0.0.1:${targetPort}`,
            changeOrigin: true,
            pathRewrite: (path) => {
                if (rewritePath) {
                    return path.replace(/^\/viewer\/\d+/, '');
                }
                return path;
            },
            onProxyReq: (proxyReq, req, res) => {
                fixRequestBody(proxyReq, req);
            },
            onError: (err, req, res) => {
                console.error(`Proxy error for port ${targetPort}: ${err.message}`);
                if (!res.headersSent) {
                    res.status(500).json({ error: 'Connection to internal service failed' });
                }
            },
            logLevel: 'silent'
        });
    }

    setupRoutes() {
        this.app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, '../../public/index.html'));
        });

        // CAPTCHA Bridge Proxy (Available in all modes)
        this.app.get('/bridge/solve', async (req, res) => {
            const { target, bot: botName } = req.query;
            if (!target) return res.status(400).send('Target URL required');

            try {
                let agent = null;
                const { botManager } = require('../core/BotManager.js');
                const bot = botManager.getBot(botName);
                
                if (bot && bot.config && bot.config.proxy) {
                    agent = new ProxyAgent(bot.config.proxy);
                }

                const response = await fetch(target, { 
                    agent, 
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' }
                });

                const body = await response.text();
                const baseTag = `<base href="${new URL(target).origin}/">`;
                const modifiedBody = body.replace('<head>', `<head>${baseTag}`);
                
                res.send(modifiedBody);
            } catch (err) {
                res.status(500).send(`Bridge error: ${err.message}`);
            }
        });

        // Only use proxy routes in cloud mode
        if (ConfigLoader.isCloud) {
            // Proxy Route for Viewer
            this.app.use('/viewer/:port', (req, res, next) => {
                const targetPort = parseInt(req.params.port);
                if (!targetPort || isNaN(targetPort)) return res.status(400).json({ error: 'Invalid port' });

                const { botManager } = require('../core/BotManager.js');
                const authorizedPorts = botManager.getAuthorizedPorts();
                
                if (authorizedPorts.has(targetPort)) {
                    const proxy = this.createProxyHandler(targetPort);
                    proxy(req, res, next);
                } else {
                    res.status(403).json({ error: 'Access Denied: Port not authorized' });
                }
            });

            // Proxy Route for Inventory
            this.app.use('/inventory/:port', (req, res, next) => {
                const targetPort = parseInt(req.params.port);
                if (!targetPort || isNaN(targetPort)) return res.status(400).json({ error: 'Invalid port' });

                const { botManager } = require('../core/BotManager.js');
                const authorizedPorts = botManager.getAuthorizedPorts();

                if (authorizedPorts.has(targetPort)) {
                    const proxy = this.createProxyHandler(targetPort, true);
                    proxy(req, res, next);
                } else {
    }

    start() {
        // WebSocket Upgrade Proxy (Critical for Prismarine Viewer on Render)
        this.httpServer.on('upgrade', (req, socket, head) => {
            if (req.url.startsWith('/socket.io')) {
                const referer = req.headers.referer;
                if (referer) {
                    const match = referer.match(/\/viewer\/(\d+)/);
                    if (match) {
                        const targetPort = parseInt(match[1]);
                        const { botManager } = require('../core/BotManager.js');
                        if (botManager.getAuthorizedPorts().has(targetPort)) {
                            const proxy = httpProxy.createProxyServer({ ws: true });
                            proxy.ws(req, socket, head, { target: `http://127.0.0.1:${targetPort}` });
                            return;
                        }
                    }
                }
            }
        });

        this.httpServer.listen(this.port, () => {
            console.log(`Server running on http://localhost:${this.port}`);
        });
    }
}