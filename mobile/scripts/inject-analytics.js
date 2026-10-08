#!/usr/bin/env node
// Injects Vercel Web Analytics + Speed Insights scripts into web-build/index.html
// Run after `expo export:web`

const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '../web-build/index.html');
let html = fs.readFileSync(htmlPath, 'utf8');

const analyticsScript = `<script>window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };</script><script defer src="/_vercel/insights/script.js"></script>`;
const speedScript = `<script defer src="/_vercel/speed-insights/script.js"></script>`;

if (!html.includes('/_vercel/insights')) {
  html = html.replace('</head>', `${analyticsScript}${speedScript}</head>`);
  fs.writeFileSync(htmlPath, html);
  console.log('✅ Injected Vercel Analytics + Speed Insights into index.html');
} else {
  // Ensure the window.va queue is present even if insights script was previously injected
  if (!html.includes('window.va = window.va')) {
    html = html.replace('<script defer src="/_vercel/insights/script.js">', '<script>window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };</script><script defer src="/_vercel/insights/script.js">');
    fs.writeFileSync(htmlPath, html);
    console.log('✅ Injected window.va queue snippet into index.html');
  } else {
    console.log('ℹ️  Analytics already present, skipping');
  }
}

// Social link previews (Facebook, Messenger, iMessage, X, Slack...).
// Without these, shared links render as a bare URL. og:image must be an absolute URL.
// Regenerate the image with: python3 scripts/generate_og_image.py
const SITE = 'https://www.fourthroute.org';
const OG_TITLE = 'Fourth Route: route around license plate cameras';
const OG_DESC = 'See the ALPR (Flock) cameras on your drive and find a route that passes fewer. Free and open source. No account, no tracking.';
const ogTags = [
  `<meta name="description" content="${OG_DESC}">`,
  `<meta property="og:type" content="website">`,
  `<meta property="og:site_name" content="Fourth Route">`,
  `<meta property="og:title" content="${OG_TITLE}">`,
  `<meta property="og:description" content="${OG_DESC}">`,
  `<meta property="og:url" content="${SITE}/">`,
  `<meta property="og:image" content="${SITE}/og-image.png">`,
  `<meta property="og:image:width" content="1200">`,
  `<meta property="og:image:height" content="630">`,
  `<meta property="og:image:alt" content="Fourth Route: a fastest route passing license plate cameras versus a route that goes around them">`,
  `<meta name="twitter:card" content="summary_large_image">`,
  `<meta name="twitter:title" content="${OG_TITLE}">`,
  `<meta name="twitter:description" content="${OG_DESC}">`,
  `<meta name="twitter:image" content="${SITE}/og-image.png">`,
].join('');
if (!html.includes('property="og:title"')) {
  html = html.replace('</head>', `${ogTags}</head>`);
  fs.writeFileSync(htmlPath, html);
  console.log('✅ Injected Open Graph / Twitter preview tags');
}
const ogSrc = path.join(__dirname, '../assets/og-image.png');
if (fs.existsSync(ogSrc)) {
  fs.copyFileSync(ogSrc, path.join(__dirname, '../web-build/og-image.png'));
  console.log('✅ Copied og-image.png to web-build');
}

// Ensure manifest.json has full PWA icon definitions
const manifestPath = path.join(__dirname, '../web-build/manifest.json');
if (fs.existsSync(manifestPath)) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.theme_color = '#0d0d1e';
  manifest.icons = [
    {
      src: '/favicon-32.png',
      sizes: '32x32',
      type: 'image/png'
    },
    {
      src: '/pwa/apple-touch-icon/apple-touch-icon-180.png',
      sizes: '180x180',
      type: 'image/png'
    },
    {
      src: '/icon-192.png',
      sizes: '192x192',
      type: 'image/png',
      purpose: 'any maskable'
    },
    {
      src: '/icon-512.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'any maskable'
    }
  ];
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log('✅ Updated manifest.json with Fourth Route PWA icons');
}

// Copy tailored PWA & Favicon assets into web-build
const pwaDir = path.join(__dirname, '../assets/pwa');
if (fs.existsSync(pwaDir)) {
  const pwaDestDir = path.join(__dirname, '../web-build');
  const appleTouchDestDir = path.join(__dirname, '../web-build/pwa/apple-touch-icon');
  fs.mkdirSync(appleTouchDestDir, { recursive: true });

  fs.copyFileSync(path.join(pwaDir, 'icon-192.png'), path.join(pwaDestDir, 'icon-192.png'));
  fs.copyFileSync(path.join(pwaDir, 'icon-512.png'), path.join(pwaDestDir, 'icon-512.png'));
  fs.copyFileSync(path.join(pwaDir, 'favicon-32.png'), path.join(pwaDestDir, 'favicon-32.png'));
  fs.copyFileSync(path.join(pwaDir, 'favicon-16.png'), path.join(pwaDestDir, 'favicon-16.png'));
  fs.copyFileSync(path.join(pwaDir, 'favicon.ico'), path.join(pwaDestDir, 'favicon.ico'));
  fs.copyFileSync(path.join(pwaDir, 'apple-touch-icon-180.png'), path.join(appleTouchDestDir, 'apple-touch-icon-180.png'));
  console.log('✅ Synchronized tailored Fourth Route icons to web-build');
}

// Copy vercel.json (with rewrites) into web-build so we can deploy from there directly
const srcVercel = path.join(__dirname, '../vercel.json');
const dstVercel = path.join(__dirname, '../web-build/vercel.json');
const vConfig = JSON.parse(fs.readFileSync(srcVercel, 'utf8'));
// When deploying from web-build/, no outputDirectory needed
delete vConfig.outputDirectory;
fs.writeFileSync(dstVercel, JSON.stringify(vConfig, null, 2));

// Copy .vercel/project.json so CLI knows which project to deploy to
const srcProj = path.join(__dirname, '../.vercel/project.json');
const dstDir  = path.join(__dirname, '../web-build/.vercel');
fs.mkdirSync(dstDir, { recursive: true });
fs.copyFileSync(srcProj, path.join(dstDir, 'project.json'));

console.log('✅ Copied vercel config to web-build/');

