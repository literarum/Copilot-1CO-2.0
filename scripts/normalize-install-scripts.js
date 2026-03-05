#!/usr/bin/env node
/**
 * Приводит окончания строк в install-скриптах к LF.
 * Вызывается при сборке, чтобы отдавать скрипты без CRLF.
 */
const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const siteDir = path.join(rootDir, 'site');
const scriptsDir = path.join(rootDir, 'scripts');
const siteFiles = ['install-mac.sh', 'install-linux.sh', 'install-windows.ps1'];
const scriptFiles = ['build-helper-mac.sh', 'build-helper-linux.sh', 'build-helper-windows.ps1'];
const desktopDir = path.join(rootDir, 'desktop-helper');
const desktopFiles = ['main.py', 'crl_helper_server.py'];
const files = [
    ...siteFiles.map((n) => path.join(siteDir, n)),
    ...scriptFiles.map((n) => path.join(scriptsDir, n)),
    ...desktopFiles.map((n) => path.join(desktopDir, n)),
];

for (const filePath of files) {
    if (!fs.existsSync(filePath)) continue;
    let content = fs.readFileSync(filePath, 'utf8');
    if (content.includes('\r')) {
        content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        fs.writeFileSync(filePath, content, 'utf8');
        console.log('[normalize]', path.basename(filePath), '-> LF');
    }
}
