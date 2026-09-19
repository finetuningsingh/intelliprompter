# IntelliPrompter

A teleprompter of talking points, not a script. You talk in your own words
and in any order, and each point is checked off once you have covered it.

**Try it: https://finetuningsingh.github.io/intelliprompter/** (paste an
[OpenRouter key](https://openrouter.ai/keys); for a TypeSafe key, run it
locally, see below).

The idea and design come from Allie at [TypeSafe](https://typesafe.ai). She
built the original IntelliPrompter so she would not forget anything in the
long list of announcements that opens her stage shows. She demoed it at a
TypeSafe Discord town hall. It was her first app with AI inside, and running it
on LLMs cost about $40 an hour. With
[Jev](https://typesafe.ai/blog/introducing-system-one-models-and-jev) it
costs at most about $0.50 an hour (two calls a second at about $0.00007 each),
and less in practice, since calls stop while you are silent and checked
points are no longer sent. This is an independent rebuild of her design, as
she described it.

## How it works

Every talking point is a separate Jev **Score** question, and all the open
points are scored in parallel, in one request, against everything you have
said so far:

```js
state: { transcript: "…what you have said so far…" }
questions: {
  p0: { type: 'score', instructions: 'How much has the speaker covered this talking point: "Where the emergency exits are"?',
        criteria: ['No mention of this topic at all',
                   'Topic is mentioned but not expanded upon at all',
                   'Topic is discussed',
                   'Topic is thoroughly discussed'] },
  p1: { … one per open point … },
}
```

Jev returns a `score` from 0 to 3 for each point: the probability-weighted
level, so it can fall between levels. The code owns the rules:

- A point is **checked off when its score reaches the threshold** (1.0 by
  default, adjustable on the page from 0.5 to 2.5). Allie's version also uses
  a low threshold: the goal is to remind you to mention a point, not to grade
  how well you covered it.
- **Order does not matter**, because every open point is scored on every call.
- **Checked points stay checked** and are no longer sent. You can also click a
  point to check or uncheck it yourself.
- **Confidence is shown but ignored**, as in Allie's version. It measures how
  concentrated Jev's probabilities are, not whether a point was covered.
- The page sends an update **every 500 ms**, but only when the transcript has
  changed and no request is already waiting. Only the last 6,000 characters
  are sent.

The shared logic is in [`prompter.js`](prompter.js). Allie used ElevenLabs for
live transcription; this page uses the browser's built-in speech recognition
(Chrome, Edge or Safari). "Start without microphone" lets you type or paste
what you say instead.

## Keys: OpenRouter or TypeSafe

Jev is available two ways, with the same questions and answers:

| Key | Endpoint | Works on the hosted page | Works locally |
| --- | --- | --- | --- |
| OpenRouter (`sk-or-…`) | `openrouter.ai/api/alpha/decisions`, model `typesafe/jev-1.13` | yes | yes |
| TypeSafe | `api.typesafe.ai/v1/systemone`, model `jev-latest` | no | yes |

The page tells the two apart by the `sk-or-` prefix. api.typesafe.ai does not
accept calls from web pages (CORS), so a TypeSafe key needs the small local
server in `server.js`. The server serves the page and passes the page's
TypeSafe requests on to the API. OpenRouter calls always go straight from your
browser to openrouter.ai.

A key you paste stays in the tab (session storage), or in local storage if you
tick "Remember on this device". "Forget key" removes it. With the local
server, you can instead put `TYPESAFE_API_KEY` in `.env`. The page then needs
no key and never sees it.

## Run locally

Requires Node 18+. There is nothing to install.

```sh
git clone https://github.com/finetuningsingh/intelliprompter.git
cd intelliprompter
cp .env.example .env    # optional: add TYPESAFE_API_KEY and/or OPENROUTER_API_KEY
npm start               # http://127.0.0.1:8787/
```

The microphone needs `localhost` or HTTPS, so open the page through the server
rather than as a file.

### Replay a talk in the terminal

```sh
npm run replay                                   # examples/show-opening-*.txt
node replay.js --every=10 --threshold=1.5
node replay.js --transcript=talk.txt --points=points.txt
```

This feeds a transcript to Jev 15 words at a time, as live speech would
arrive, and prints when each point is checked off. It uses `TYPESAFE_API_KEY`
if it is set, and `OPENROUTER_API_KEY` otherwise.

## Results (2026-09-18, OpenRouter, `typesafe/jev-1.13`)

`npm run replay` on the example show opening (383 words, 7 points). The talk
covers the points in a different order from the list and never mentions the
bar:

| Point | Checked at word | Score |
| --- | ---: | ---: |
| Welcome everyone and introduce yourself as the host | 30 | 1.87 |
| Where the emergency exits are | 120 | 1.84 |
| Phones on silent, no flash photography | 165 | 1.69 |
| Tip the performers, and bring cash | 240 | 1.34 |
| Thank the theater and the staff | 300 | 1.44 |
| Introduce the first performer | 345 | 1.35 |
| The bar is open during intermission | never | best 0.02 |

This took 26 calls averaging 269 ms and cost $0.0011 in total. On a longer
recorded talk (1,581 words, 7 points), all 6 points covered were checked off
within 15 words of being said, and the point never mentioned peaked at 0.26.
That run took 106 calls averaging 245 ms, for $0.0073 in total.

## License

[MIT](LICENSE)
