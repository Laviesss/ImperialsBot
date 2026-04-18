import express from 'express';
import { createServer } from 'http';
import { createProxyMiddleware, fixRequestBody } from 'http-proxy-middleware';
import compression from 'compression';
import path from 'path';
import { fileURLToPath } from 'url';
import { ConfigLoader } from '../config/ConfigLoader.js';

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

    createProxyHandler(targetPort) {
        return createProxyMiddleware({
            target: `http://127.0.0.1:${targetPort}`,
            changeOrigin: true,
            pathRewrite: (path) => path,
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

        // Only use proxy routes in cloud mode
        if (ConfigLoader.isCloud) {
            // Proxy Route for Viewer
            this.app.use('/viewer/:port', (req, res, next) => {
                const targetPort = parseInt(req.params.port);
                
                if (!targetPort || isNaN(targetPort)) {
                    return res.status(400).json({ error: 'Invalid port' });
                }

                const { botManager } = require('../core/BotManager.js');
                const authorizedPorts = botManager.getAuthorizedPorts();
                
                if (authorizedPorts.has(targetPort)) {
                    const proxy = this.createProxyHandler(targetPort);
                    proxy(req, res, next);
                } else {
                    console.log(`Viewer proxy denied: port ${targetPort} not authorized. Authorized: ${Array.from(authorizedPorts).join(', ')}`);
                    res.status(403).json({ error: 'Access Denied: Port not authorized' });
                }
            });

            // Proxy Route for Inventory
            this.app.use('/inventory/:port', (req, res, next) => {
                const targetPort = parseInt(req.params.port);
                
                if (!targetPort || isNaN(targetPort)) {
                    return res.status(400).json({ error: 'Invalid port' });
                }

                const { botManager } = require('../core/BotManager.js');
                const authorizedPorts = botManager.getAuthorizedPorts();

                if (authorizedPorts.has(targetPort)) {
                    const proxy = this.createProxyHandler(targetPort);
                    proxy(req, res, next);
                } else {
                    console.log(`Inventory proxy denied: port ${targetPort} not authorized. Authorized: ${Array.from(authorizedPorts).join(', ')}`);
                    res.status(403).json({ error: 'Access Denied: Port not authorized' });
                }
            });
        }
    }

    start() {
        this.httpServer.listen(this.port, () => {
            console.log(`Server running on http://localhost:${this.port}`);
        });
    }
}