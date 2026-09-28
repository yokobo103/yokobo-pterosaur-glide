// 検査に使うブラウザを1つ選ぶ。
// puppeteer 同梱の chrome.exe が Windows の Application Control(Smart App Control) に
// 止められることがある(2026-09-28に発生。「spawn UNKNOWN」で1秒で落ちる)。
// そのときは端末に入っているブラウザへ逃がす。PUPPETEER_EXECUTABLE_PATH があればそれを優先。
import fs from 'node:fs';
import puppeteer from 'puppeteer';

// Windowsでも「/」で書く(「\」はここまで来る間に食われることがある)
const INSTALLED = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
];

const canLaunch = async executablePath => {
  try {
    const b = await puppeteer.launch({ headless: true, executablePath,
      args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    await b.close();
    return true;
  } catch (e) { return false; }
};

// 使えるブラウザの場所。見つからなければ undefined(puppeteer に任せる)
export async function browserPath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  let bundled = null;
  try { bundled = await puppeteer.executablePath(); } catch (e) { /* 無ければ入っているものを探す */ }
  for (const p of [bundled, ...INSTALLED]) {
    if (!p || !fs.existsSync(p)) continue;
    if (await canLaunch(p)) {
      if (p !== bundled) console.log(`  (同梱のChromeが使えないので ${p} で検査します)`);
      return p;
    }
  }
  return undefined;
}
