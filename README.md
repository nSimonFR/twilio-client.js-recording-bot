twilio-client.js-recording-bot
=============================

twilio-client.js-recording-bot, or just "recording-bot", is a
[puppeteer](https://github.com/GoogleChrome/puppeteer)-based twilio-client.js application - based on the work of
[twilio/twilio-video.js-recording-bot](https://github.com/twilio/twilio-video.js-recording-bot) - that

1. Connects to a Client / Call, and
2. Records RemoteTracks to disk.

Caveats
-------

In almost all cases, you'll get better performance and quality using Twilio's own [recording solution](https://www.twilio.com/docs/voice/tutorials/how-to-record-phone-calls).
That being said, if regulations restrict you from using Twilio's recording
solution or **if you need to get the audio stream real-time**, you may be interested in this
approach.

### *Update 2019/08/06*: You may build an easier solution using Twilio new [Stream](https://www.twilio.com/docs/voice/twiml/stream) feature.


Installation
------------

First, you should have a recent version of [Node](https://nodejs.org/en)
installed. Then run the `yarn` command to install dependencies.

Usage
-----

### Configuring recording-bot (`.env`)

recording-bot requires an Access Token to connect to a Room. In order to
generate the Access Token, you need to provide a `.env` file. An example is
included in this project under `.env.template`. Copy this file, and provide your
own `ACCOUNT_SID`, `API_KEY_SID`, `API_KEY_SECRET`, `APP_SID` and `IDENTITY` values.
You also need an already set-up voice endpoint linked to your `APP_SID` ([Tutorial](https://www.twilio.com/docs/voice/client/tutorials/outgoing-calls)), you may add the code directly to this express server but you will need to expose it to the internet - which is not my intended use case.

### Starting recording-bot

Once configured, you can tell recording-bot to connect to a Room by passing the
Room SID or name. For example, replace `$ROOM_SID_OR_NAME` below with your
actual Room SID or name and run the command:

```
yarn start $ROOM_SID_OR_NUMBER
```

### Stopping recording-bot

Send the process `SIGUSR2` to complete any recordings and cause the
recording-bot to disconnect.

```
kill -s USR2 $PID
```

How it Works
------------

First, recording-bot starts an [Express](https://expressjs.com/) server that
loads [twilio-client.js](http://github.com/twilio/twilio-client.js). Next,
recording-bot starts puppeteer and navigates to the Express server. Finally,
recording-bot passes the Access Token and Room SID provided via the command-line
to the page served by Express using puppeteer. If successful, recording-bot will
be able to connect to the Room.

While connected to the Room, recording-bot listens for RemoteTracks and streams back the audio to the server that will save it to the disk.

Finally, when `SIGUSR2` is received, recording-bot stops recording and
disconnects from the Room.
