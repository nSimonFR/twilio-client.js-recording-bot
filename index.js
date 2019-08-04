'use strict';

require('dotenv').config();

const browserify = require('browserify-middleware');
const express = require('express');
const expressWinston = require('express-winston');
const { appendFile, unlinkSync: unlink } = require('fs');
const { sync: mkdirp } = require('mkdirp');
const { join } = require('path');
const puppeteer = require('puppeteer');
const { AccessToken } = require('twilio').jwt;
const winston = require('winston');

let browser = null;
let page = null;
let server = null;
let isClosing = false;

const logger = winston.createLogger({
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(info => `${info.timestamp} ${info.level}: ${info.message}`),
  ),
  transports: [
    new winston.transports.Console({ level: 'info' }),
  ]
});

const loggerMiddleware = expressWinston.logger({ winstonInstance: logger });

const app = express();

app.use(loggerMiddleware);

app.get('/', (req, res) => res.sendFile(join(__dirname, 'index.html')));

app.get('/bundle.js', browserify([
  'twilio-client',
  { [join(__dirname, 'app.js')]: { run: true } }
]));

const close = async (error) => {
  if (isClosing) return;
  isClosing = true;

  if (error) logger.error(`\n\n${indent(error.stack)}\n`);

  if (server) {
    logger.debug('Closing HTTP server...');
    server.close();
    logger.info('Closed HTTP server.');
  }

  if (page) await page.evaluate('close()');

  if (browser) {
    logger.debug('Closing browser...');
    await browser.close();
    logger.info('Closed browser.');
  }

  process.exit(error ? 1 : 0);
}

const indent = (str, n) => str.split('\n').map(line => `  ${line}`).join('\n');

const listen = (port) => new Promise((resolve, reject) => {
  const server = app.listen(port, error => error ? reject(error) : resolve(server));
});

const main = async ({ port, token, roomSid }) => {
  logger.info(`\n
  recording-bot's PID is ${process.pid}.

  You can send SIGUSR2 to this PID to cause recording-bot to stop recording and to
  disconnect from the Room. For example,

    kill -s USR2 ${process.pid}

  Happy recording!\n`);

  logger.debug('Starting HTTP server...');
  server = await listen(port);
  logger.info(`Started HTTP server. Listening on ${port}.`);

  logger.debug('Launching browser...');
  browser = await puppeteer.launch({
    args: [
      '--disable-gesture-requirement-for-media-playback',
      '--use-fake-ui-for-media-stream',
    ]
  });
  logger.info('Launched browser.');

  logger.debug('Opening new page...');
  page = await browser.newPage();
  logger.debug('Opened new page.');

  logger.debug(`Navigating to http://localhost:${port}...`);
  await page.goto(`http://localhost:${port}`, { waitUntil: 'domcontentloaded' });
  logger.debug(`Navigated to http://localhost:${port}.`);

  logger.debug('Registering callback(s)...');
  await Promise.all([
    page.exposeFunction('closeBrowser', () => close()),
    page.exposeFunction('debug', message => { logger.debug(message); }),
    page.exposeFunction('error', message => { logger.error(message); }),
    page.exposeFunction('info', message => { logger.info(message); }),
    page.exposeFunction('createRecording', filepath => {
      mkdirp(join(...filepath.slice(0, filepath.length - 1)));
      unlink(join(...filepath));
    }),
    page.exposeFunction('appendRecording', (filepath, chunk) => {
      const filename = join(...filepath);
      const buffer = Buffer.from(stringToArrayBuffer(chunk));
      appendFile(filename, buffer, error => error
        ? logger.error(`\n\n${indent(error.stack)}\n`)
        : logger.debug(`Wrote chunk (${buffer.byteLength} bytes)`)
      );
    }),
  ]);
  logger.debug('Registered callback(s).');

  await page.evaluate(`main("${token}", "${roomSid}")`);
}

const stringToArrayBuffer = (string) => {
  const buf = new ArrayBuffer(string.length);
  const bufView = new Uint8Array(buf);

  for (let i=0; i < string.length; i++) bufView[i] = string.charCodeAt(i);

  return buf;
}

['SIGUSR2', 'SIGINT'].forEach(signal => {
  process.on(signal, () => {
    logger.debug(`Received ${signal}.`);
    close();
  });
});

const createToken = (identity) => {
  const token = new AccessToken(
    process.env.ACCOUNT_SID,
    process.env.API_KEY_SID,
    process.env.API_KEY_SECRET);
  token.identity = identity;
  token.addGrant(new AccessToken.VoiceGrant({
    outgoingApplicationSid: process.env.APP_SID,
  }));
  return token.toJwt();
}

main({
  port: 3000,
  token: createToken(process.env.IDENTITY),
  roomSid: process.argv.length > 2 ? process.argv[2] : null,
}).catch(error => close(error));
