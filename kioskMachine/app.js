import { createKioskServer } from './src/server.js';
import { loadConfig } from './src/config.js';

const config = loadConfig();
const { server } = await createKioskServer(config);

console.log(`Kiosk app running at http://localhost:${config.port}`);
console.log(`Kiosk location: ${config.kioskLocation}`);

server.on('close', () => process.exit(0));