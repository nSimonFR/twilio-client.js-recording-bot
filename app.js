'use strict';

const { Device } = require('twilio-client');

let device = null;
let conv = null;
let isClosing = false;

const indent = str => str.split('\n').map(line => `  ${line}`).join('\n');

// const recorders = new Map();
// const subscriptionCounts = new Map();

// function trackSubscribed(track, participant) {
//   if (track.kind === 'data') {
//     return;
//   }
//   let subscriptionCount = subscriptionCounts.get(track) || 0;
//   subscriptionCount++;
//   subscriptionCounts.set(track, subscriptionCount);
//   const filepath = [
//     // room.sid,
//     // room.localParticipant.sid,
//     // participant.sid,
//     track.sid,
//     `${subscriptionCount}.webm`
//   ];
//   record(track.mediaStreamTrack, filepath);
// }

// function trackUnsubscribed(track) {
//   const recorder = recorders.get(track);
//   recorders.delete(track);
//   if (recorder) {
//     info(`Stop recording ${recorder.filename}.`);
//     recorder.stop();
//   }
// }

const arrayBufferToString = (buffer) => {
  const bufView = new Uint8Array(buffer);
  const length = bufView.length;

  let result = '';
  let addition = Math.pow(2, 8) - 1;
  for (let i = 0; i < length; i += addition) {
    if (i + addition > length) addition = length - i;
    result += String.fromCharCode.apply(null, bufView.subarray(i, i + addition));
  }
  return result;
}

const record = (track, filepath) => {
  const filename = filepath.join('/');
  info(`Begining ${filename}.`);
  createRecording(filepath);

  const stream = new MediaStream([track]);

  if (track.kind === 'video') {
    // NOTE(mroberts): This is a hack to workaround the following bug:
    //
    //   https://bugs.chromium.org/p/chromium/issues/detail?id=760760
    //
    const audioContext = new AudioContext();
    const destinationNode = audioContext.createMediaStreamDestination();
    const oscillatorNode = audioContext.createOscillator();
    oscillatorNode.frequency.setValueAtTime(0, audioContext.currentTime);
    oscillatorNode.connect(destinationNode);
    const [audioTrack] = destinationNode.stream.getAudioTracks();
    stream.addTrack(audioTrack);
  }

  const mimeType = `${track.kind}/webm`;
  const recorder = new MediaRecorder(stream, { mimeType });
  recorder.filename = filename;

  // recorders.set(track, recorder);

  recorder.ondataavailable = event => {
    if (!event.data.size) {
      return;
    }
    const fileReader = new FileReader();
    fileReader.onload = event => {
      const buffer = event.target.result;
      appendRecording(filepath, arrayBufferToString(buffer));
    };
    fileReader.readAsArrayBuffer(event.data);
  };

  recorder.start(100);
}

window.addEventListener('error', event => {
  error(`\n\n${indent(event.error.stack)}\n`);
});

window.onunhandledrejection = event => {
  error(`\n\n${indent(event.reason.stack)}\n`);
};

window.main = (token, to) => {
  device = new Device(token, {
    codecPreferences: ['opus', 'pcmu'],
    fakeLocalDTMF: false,
  });
  debug('Device is being created...');

  device.on('ready', function (device) {
    debug('Device Ready.');

    info('Connecting to ' + to + '...');
    conv = device.connect({
      To: to, // TODO Handle other parameters
    });
  });

  device.on('error', function (err) {
    error('Device ' + err.message);
  });

  device.on('connect', function (conn) {
    debug('Device Connected.');
    const tracks = conn.mediaStream._remoteStream.getAudioTracks();
    for (let index = 0; index < tracks.length; index++) {
      const track = tracks[index];
      record(track, [index.toString() + '.ogg']);
    }
  });

  device.on('disconnect', function (conn) {
    info('Call ended.');
    close();
  });
}

window.close = () => {
  if (isClosing) return;
  isClosing = true;

  // recorders.forEach((recorder, track) => {
  //   trackUnsubscribed(track);
  // });

  if (device) device.destroy();

  closeBrowser();
}
