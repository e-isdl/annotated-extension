let recorder = null;
let stream = null;
let chunks = [];

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.type === 'START_RECORDING') {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      chunks = [];
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = () => {
          chrome.runtime.sendMessage({
            type: 'RECORDING_COMPLETE',
            data: reader.result
          });
        };
        reader.readAsDataURL(blob);
      };
      recorder.start();
      chrome.runtime.sendMessage({ type: 'RECORDING_STARTED' });
    } catch (err) {
      chrome.runtime.sendMessage({
        type: 'RECORDING_ERROR',
        error: err.name === 'NotAllowedError'
          ? 'Microphone access denied. Please allow microphone access.'
          : err.name === 'NotFoundError'
          ? 'No microphone found.'
          : 'Could not access microphone.'
      });
    }
  }

  if (message.type === 'STOP_RECORDING') {
    if (recorder && recorder.state === 'recording') {
      recorder.stop();
      stream.getTracks().forEach(t => t.stop());
    }
  }
});
