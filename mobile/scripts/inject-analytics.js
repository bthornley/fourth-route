#!/usr/bin/env node
// Injects Vercel Web Analytics + Speed Insights scripts into web-build/index.html
// Run after `expo export:web`

const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '../web-build/index.html');
let html = fs.readFileSync(htmlPath, 'utf8');

const analyticsScript = `<script defer src="/_vercel/insights/script.js"></script>`;
const speedScript = `<script defer src="/_vercel/speed-insights/script.js"></script>`;

if (!html.includes('/_vercel/insights')) {
  html = html.replace('</head>', `${analyticsScript}${speedScript}</head>`);
  fs.writeFileSync(htmlPath, html);
  console.log('✅ Injected Vercel Analytics + Speed Insights into index.html');
} else {
  console.log('ℹ️  Analytics already present, skipping');
}
