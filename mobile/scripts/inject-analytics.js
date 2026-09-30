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
