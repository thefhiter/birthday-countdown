# Birthday Countdown 🎂

Count down to someone's birthday, and collect everyone's wishes as a word cloud.

Add a name and a date — that's the whole setup. No accounts, no server, no build step. Open `index.html` in a browser and it works.

## What it does

**The countdown.** A clock ticking down days, hours, minutes and seconds to the next birthday, with the age they're turning and the date. Leap-day birthdays roll to March 1 in common years, so February 29 people still get a countdown every year.

**Wishes as a word cloud.** Everyone sends their wish as a single word. The more people send the same word, the bigger it grows — three people saying "joy" makes JOY tower over the rest. Words are packed along a spiral, biggest first, with every candidate position checked against the words already placed so nothing collides. The finished cluster is scaled and centred to fill its panel, and the spiral follows the panel's shape, so a phone gets a tall cloud instead of a thin strip in a lot of empty space. Each word keeps a stable colour taken from its own text, so it doesn't change colour every time the cloud redraws.

Under the cloud, each wish is listed with who sent it, their mood, and an optional longer message.

**On the day.** When the countdown reaches zero the page says so, and a cake appears with candles you blow out by pressing it — with confetti and fireworks to go with it.

**A colour per person.** The accent is derived from the name, so every person's countdown has its own colour without anyone having to pick one. How that survives contact with contrast requirements is the interesting part — see below.

## Sound

Sound is off by default. Turn it on with the 🔊 button and you get ticks, pops, the correct/wrong stings, firework booms and the birthday melody itself — all generated in the browser with the Web Audio API. There are no audio files in the repo, so there's nothing to download and nothing to 404.

## Where the data lives

In your browser, and nowhere else. Wishes and the birthday itself are kept in `localStorage` on the device that entered them — there's no backend, no database, no network request. That also means wishes don't travel between devices: if you want a group to fill the same cloud, they need to be on the same browser, or each person ends up with their own copy. **Change** in the header clears the person and every wish, and asks first.

## Accessibility

The target is WCAG 2.2 AA, and it is checked rather than claimed. Two things do the checking:

```
node tools/contrast-check.js     # every colour, every hue, both themes
```

and an axe-core + keyboard pass in a real browser, run against the setup screen, the countdown, and the birthday itself, in light and dark. Current state: **no axe violations**, and every contrast pair clears its ratio — including the ones measured off rendered pixels rather than computed styles.

**Colour is solved, not chosen.** The accent hue comes from a hash of the name, so it can land anywhere on the wheel. A fixed HSL lightness cannot survive that: at `L=52%` a blue sits near 7:1 against white and a yellow near 1.8:1, which would have meant half of all names getting a hero name, a focus ring and a button nobody could read. So no lightness is hardcoded. `js/color.js` states the ratio each token owes — 4.5:1 for text, 3:1 for borders and large display text — and solves numerically for the most vivid lightness that clears it, against every background the colour can land on (the panel, the page, and the wash of accent behind them). The label on a filled button is white or near-black depending on which one actually passes, so a yellow accent takes black text and a navy one takes white. `tools/contrast-check.js` re-runs all 360 hues in both themes, so this cannot drift.

**Two themes.** Light and dark, following `prefers-color-scheme` until you touch the toggle, after which your choice wins in both directions and is remembered. There is also a `prefers-contrast: more` pass and a `forced-colors` (Windows High Contrast) pass.

**Screen readers.** The clock is `aria-live="off"` on purpose — four numbers a second is not something anyone can listen to — and a separate polite region says "45 days until Sam's birthday on 12 March" once, when the day count changes. The word cloud is a scatter of absolutely positioned text, useless read in DOM order, so it is hidden and mirrored underneath as a plain list sorted by count. That mirror is deliberately *not* a live region: it is rebuilt on every redraw, and a live region rebuilt from scratch reads itself out in full — including when all that changed was the width of the window. Everything the page wants to say goes through one polite region in `js/notify.js`, so it is said once rather than once per element that happened to update.

**Keyboard.** A skip link, a visible focus ring drawn in `--ink` rather than the accent (an indicator whose contrast changes with the guest list is not an indicator), and no control that only appears on hover. Moods are real radio inputs, so arrow-key movement and the "3 of 6" announcement come free instead of being reimplemented with `role="radio"` and a roving tabindex. Deleting a wish moves focus to the next one rather than dropping it on `<body>`, announces what went, and offers Undo.

**Forms.** Every field is labelled, errors are written next to the field and pointed at with `aria-describedby`, the first bad field takes focus, and messages say what to do rather than that something is wrong. Errors carry an icon and a heavier border as well as colour.

**Motion.** `prefers-reduced-motion` is respected — the confetti, fireworks and entrance animations are cut automatically, delays included, not just durations. The ✨ button turns animations off by hand and the choice is remembered. The candle flicker runs at about 1.1 cycles per second, well under the three-per-second photosensitivity threshold.

**Layout.** No horizontal scrolling at 320px or at 200% text. Interactive targets are 44px, comfortably over the 24px minimum.

## Structure

```
index.html                markup
css/styles.css            all styling; two themes from one token set
js/color.js               contrast maths — the ratios, and solving for them
js/data.js                the person, the wishes, localStorage
js/notify.js              the toast and the one polite live region
js/audio.js               the synthesizer — every sound on the page
js/fx.js                  canvas confetti and fireworks
js/countdown.js           birthday maths and the clock
js/wordcloud.js           spiral packing and sizing for the cloud
js/wishes.js              the wish form, cloud and list
js/app.js                 theme, setup screen, countdown loop, the day itself
tools/contrast-check.js   the contrast audit
tools/build-single.js     optional: squash it all into one file
```

No framework, no package manager, no dependencies. Plain scripts in dependency order at the bottom of `index.html`.

## Hosting it

It's a static site, so anything that serves files will do. For GitHub Pages: push, then under **Settings → Pages** pick the branch and the root folder. The `.nojekyll` file is already there so nothing gets filtered on the way out.

To hand someone a single file instead — to email, or open straight off a USB stick:

```
node tools/build-single.js              # dist/index.html, fully self-contained
node tools/build-single.js --fragment   # dist/fragment.html, no document shell
```

Both inline the stylesheet and every script. The script reads the tags out of `index.html` rather than hardcoding a file list, so adding a script to the page is enough to get it into the build. `dist/` is generated and gitignored — build it when you need it.

## Licence

MIT — see [LICENSE](LICENSE).
