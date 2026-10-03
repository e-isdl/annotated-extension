// MV3 forbids inline scripts on extension pages (default CSP is script-src
// 'self'), so this used to live inline in permission.html and never executed.
// It is loaded as an external file now; the behaviour is unchanged.
const status = document.getElementById('status');
const detail = document.getElementById('detail');
const allowBtn = document.getElementById('allow');
const settingsBtn = document.getElementById('settings');
const retryBtn = document.getElementById('retry');

const constraints = { audio: { echoCancellation: true, noiseSuppression: true } };
const SETTINGS_URL = 'chrome://settings/content/siteDetails?site='
  + encodeURIComponent('chrome-extension://' + location.host + '/');

function show(text, granted) {
  status.className = granted ? 'granted' : '';
  status.textContent = text;
}

function showDetail(html) {
  detail.hidden = false;
  detail.innerHTML = html;
}

function hideDetail() { detail.hidden = true; }

function setButtons({ allow, settings, retry }) {
  allowBtn.hidden = !allow;
  settingsBtn.hidden = !settings;
  retryBtn.hidden = !retry;
}

function openSettings() {
  try {
    chrome.tabs.create({ url: SETTINGS_URL });
  } catch (err) {
    showDetail('Open <code>' + SETTINGS_URL + '</code> and set Microphone to Allow.');
  }
}

async function permissionState() {
  try {
    const result = await navigator.permissions.query({ name: 'microphone' });
    return result.state;
  } catch {
    return 'unknown';
  }
}

async function grant() {
  hideDetail();
  setButtons({ allow: false, settings: false, retry: false });
  show('Waiting for Chrome…');

  const request = navigator.mediaDevices.getUserMedia(constraints);
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error('no prompt'), { name: 'PromptTimeout' })), 10000);
  });

  try {
    const stream = await Promise.race([request, timeout]);
    stream.getTracks().forEach((track) => track.stop());
    show('Microphone access granted.', true);
    setTimeout(() => window.close(), 400);
  } catch (err) {
    // Whatever happens, do not leave a stream dangling if Chrome answers late.
    request.then((late) => late.getTracks().forEach((track) => track.stop())).catch(() => {});

    if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
      show('No microphone found.');
      showDetail('Connect a microphone, then try again.');
      setButtons({ retry: true });
    } else if (err.name === 'PromptTimeout') {
      show("Chrome didn't show a permission prompt.");
      showDetail('Set Microphone to Allow for this extension in Chrome settings, then come back here.');
      setButtons({ settings: true, retry: true });
    } else {
      const state = await permissionState();
      if (state === 'denied') {
        show("Microphone access is blocked.");
        showDetail('Set Microphone to <strong>Allow</strong> for this extension in Chrome settings, then try again.');
        setButtons({ settings: true, retry: true });
      } else {
        show('Microphone access was not granted.');
        showDetail('Click <strong>Allow microphone</strong> again, or set Microphone to Allow in Chrome settings.');
        setButtons({ allow: true, settings: true });
      }
    }
  } finally {
    clearTimeout(timer);
  }
}

async function start() {
  const state = await permissionState();
  if (state === 'granted') {
    grant();
    return;
  }
  if (state === 'denied') {
    show("Microphone access is blocked.");
    showDetail('Set Microphone to <strong>Allow</strong> for this extension in Chrome settings, then try again.');
    setButtons({ settings: true });
    return;
  }
  show('Chrome needs your permission to use the microphone.');
  setButtons({ allow: true });
}

allowBtn.addEventListener('click', grant);
retryBtn.addEventListener('click', grant);
settingsBtn.addEventListener('click', openSettings);
start();
