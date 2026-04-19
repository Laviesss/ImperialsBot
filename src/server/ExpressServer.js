import express from 'express';
import { createServer } from 'http';
import { createRequire } from 'module';
import { createProxyMiddleware, fixRequestBody } from 'http-proxy-middleware';
import compression from 'compression';
import path from 'path';
import { fileURLToPath } from 'url';
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
        console.log(`[EXPRESS-PROXY] Creating proxy handler for port ${targetPort}`);
        return createProxyMiddleware({
            target: `http://127.0.0.1:${targetPort}`,
            changeOrigin: true,
            pathRewrite: (path) => path,
            onProxyReq: (proxyReq, req, res) => {
                fixRequestBody(proxyReq, req);
                console.log(`[EXPRESS-PROXY] Proxying request to http://127.0.0.1:${targetPort}${req.url}`);
            },
            onError: (err, req, res) => {
                console.error(`[EXPRESS-PROXY] ❌ Proxy error for port ${targetPort}:`, err.code, err.message);
                if (!res.headersSent) {
                    res.status(500).json({ error: 'Connection to internal service failed', details: err.message });
                }
            },
            logLevel: 'debug'
        });
    }

    setupRoutes() {
        this.app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, '../../public/index.html'));
        });

        // Only use proxy routes in cloud mode
        if (ConfigLoader.isCloud) {
            console.log('[EXPRESS] Cloud mode detected - setting up proxy routes');
            
            // Proxy Route for Viewer
            this.app.use('/viewer/:port', (req, res, next) => {
                const targetPort = parseInt(req.params.port);
                console.log(`[EXPRESS] Viewer request received: port=${targetPort}, url=${req.url}`);
                
                if (!targetPort || isNaN(targetPort)) {
                    console.log('[EXPRESS] ❌ Invalid port in viewer request');
                    return res.status(400).json({ error: 'Invalid port' });
                }

                try {
                    console.log('[EXPRESS] Attempting to import BotManager...');
                    const { botManager } = require('../core/BotManager.js');
                    console.log('[EXPRESS] BotManager imported successfully');
                    
                    const authorizedPorts = botManager.getAuthorizedPorts();
                    console.log(`[EXPRESS] Authorized ports: ${Array.from(authorizedPorts).join(', ') || '(empty)'}`);
                    console.log(`[EXPRESS] Checking if ${targetPort} is in authorized ports...`);
                    
                    if (authorizedPorts.has(targetPort)) {
                        console.log(`[EXPRESS] ✅ Port ${targetPort} IS authorized - creating proxy`);
                        const proxy = this.createProxyHandler(targetPort);
                        proxy(req, res, next);
                    } else {
                        console.log(`[EXPRESS] ❌ Port ${targetPort} NOT authorized - returning 403`);
                        
                        // Debug: list all bots and their ports
                        const allBots = botManager.getAllBots();
                        console.log('[EXPRESS] Debug - All bots:', JSON.stringify(allBots.map(b => ({
                            username: b.username,
                            status: b.status,
                            inventoryPort: b.inventoryPort,
                            viewerPort: b.config?.viewerPort
                        })), null, 2));
                        
                        res.status(403).json({ 
                            error: 'Access Denied: Port not authorized',
                            requestedPort: targetPort,
                            authorizedPorts: Array.from(authorizedPorts),
                            debug: {
                                totalBots: allBots.length,
                                bots: allBots.map(b => ({
                                    username: b.username,
                                    status: b.status,
                                    inventoryPort: b.inventoryPort,
                                    viewerPort: b.config?.viewerPort
                                }))
                            }
                        });
                    }
                } catch (err) {
                    console.error('[EXPRESS] ❌ Error in viewer proxy route:', err.message, err.stack);
                    res.status(500).json({ error: 'Internal server error', details: err.message });
                }
            });

            // Proxy Route for Inventory
            this.app.use('/inventory/:port', (req, res, next) => {
                const targetPort = parseInt(req.params.port);
                console.log(`[EXPRESS] Inventory request received: port=${targetPort}, url=${req.url}`);
                
                if (!targetPort || isNaN(targetPort)) {
                    console.log('[EXPRESS] ❌ Invalid port in inventory request');
                    return res.status(400).json({ error: 'Invalid port' });
                }

                try {
                    console.log('[EXPRESS] Attempting to import BotManager for inventory...');
                    const { botManager } = require('../core/BotManager.js');
                    console.log('[EXPRESS] BotManager imported for inventory');
                    
                    const authorizedPorts = botManager.getAuthorizedPorts();
                    console.log(`[EXPRESS] Inventory authorized ports: ${Array.from(authorizedPorts).join(', ') || '(empty)'}`);
                    
                    if (authorizedPorts.has(targetPort)) {
                        console.log(`[EXPRESS] ✅ Inventory port ${targetPort} authorized - creating proxy`);
                        const proxy = this.createProxyHandler(targetPort);
                        proxy(req, res, next);
                    } else {
                        console.log(`[EXPRESS] ❌ Inventory port ${targetPort} NOT authorized`);
                        
                        const allBots = botManager.getAllBots();
                        console.log('[EXPRESS] Debug - Inventory bots:', JSON.stringify(allBots.map(b => ({
                            username: b.username,
                            status: b.status,
                            inventoryPort: b.inventoryPort,
                            viewerPort: b.config?.viewerPort
                        })), null, 2));
                        
                        res.status(403).json({ 
                            error: 'Access Denied: Port not authorized',
                            requestedPort: targetPort,
                            authorizedPorts: Array.from(authorizedPorts),
                            debug: {
                                totalBots: allBots.length,
                                bots: allBots.map(b => ({
                                    username: b.username,
                                    status: b.status,
                                    inventoryPort: b.inventoryPort,
                                    viewerPort: b.config?.viewerPort
                                }))
                            }
                        });
                    }
                } catch (err) {
                    console.error('[EXPRESS] ❌ Error in inventory proxy route:', err.message, err.stack);
                    res.status(500).json({ error: 'Internal server error', details: err.message });
                }
            });
        } else {
            console.log('[EXPRESS] Cloud mode NOT detected - proxy routes disabled');
        }
    }

    start() {
        this.httpServer.listen(this.port, () => {
            console.log(`Server running on http://localhost:${this.port}`);
        });
    }
}