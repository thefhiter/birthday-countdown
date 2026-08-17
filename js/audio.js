/* =========================================================
   audio.js — every sound on the page is synthesized here.
   No audio files, so nothing to load and nothing to 404.
   ========================================================= */
(function (global) {
  'use strict';

  var ctx = null;
  var master = null;
  var enabled = false;
  var unlocked = false;
  var ambientNodes = null;

  var NOTE = { C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00, A4: 440.00,
               Bb4: 466.16, B4: 493.88, C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.00 };

  function ensure() {
    if (ctx) return ctx;
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.0001;
    master.connect(ctx.destination);
    return ctx;
  }

  /* Browsers only allow audio after a gesture; app.js calls this from the gate. */
  function unlock() {
    if (!ensure()) return false;
    if (ctx.state === 'suspended') ctx.resume();
    unlocked = true;
    return true;
  }

  function setEnabled(on) {
    enabled = !!on;
    if (!ctx) { if (enabled) ensure(); }
    if (!master) return;
    var now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setTargetAtTime(enabled ? 0.9 : 0.0001, now, 0.08);
    if (enabled) { if (ctx.state === 'suspended') ctx.resume(); startAmbient(); }
  }

  function isEnabled() { return enabled; }

  function live() { return enabled && unlocked && ctx && master; }

  /* ---------- primitives ---------- */

  /**
   * One shaped oscillator note.
   * opts: freq, dur, type, gain, attack, release, detune, glideTo, delay, pan
   */
  function tone(opts) {
    if (!live()) return;
    var o = opts || {};
    var t0 = ctx.currentTime + (o.delay || 0);
    var dur = o.dur == null ? 0.18 : o.dur;
    var peak = o.gain == null ? 0.22 : o.gain;
    var attack = o.attack == null ? 0.008 : o.attack;

    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.freq || 440, t0);
    if (o.glideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.glideTo), t0 + dur);
    if (o.detune) osc.detune.setValueAtTime(o.detune, t0);

    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    var tail = gain;
    if (o.pan && ctx.createStereoPanner) {
      var pan = ctx.createStereoPanner();
      pan.pan.value = Math.max(-1, Math.min(1, o.pan));
      gain.connect(pan);
      tail = pan;
    }
    osc.connect(gain);
    tail.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  /** Filtered white noise — the basis of every percussive/whoosh sound. */
  function noise(opts) {
    if (!live()) return;
    var o = opts || {};
    var dur = o.dur == null ? 0.3 : o.dur;
    var t0 = ctx.currentTime + (o.delay || 0);
    var frames = Math.max(1, Math.floor(ctx.sampleRate * dur));
    var buf = ctx.createBuffer(1, frames, ctx.sampleRate);
    var chan = buf.getChannelData(0);
    for (var i = 0; i < frames; i++) chan[i] = Math.random() * 2 - 1;

    var src = ctx.createBufferSource();
    src.buffer = buf;

    var filter = ctx.createBiquadFilter();
    filter.type = o.filter || 'bandpass';
    filter.frequency.setValueAtTime(o.freq || 1200, t0);
    if (o.sweepTo) filter.frequency.exponentialRampToValueAtTime(Math.max(20, o.sweepTo), t0 + dur);
    filter.Q.value = o.q == null ? 1.1 : o.q;

    var gain = ctx.createGain();
    var peak = o.gain == null ? 0.22 : o.gain;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    src.connect(filter); filter.connect(gain); gain.connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  /* ---------- the sound set ---------- */
  var sfx = {
    tick: function () { tone({ freq: 1180, dur: 0.035, type: 'square', gain: 0.045 }); },

    pop: function () {
      tone({ freq: 420, glideTo: 1000, dur: 0.11, type: 'triangle', gain: 0.24 });
      noise({ freq: 2400, dur: 0.06, gain: 0.1, q: 0.6 });
    },

    click: function () { tone({ freq: 660, dur: 0.05, type: 'square', gain: 0.09 }); },

    hover: function () { tone({ freq: 900, dur: 0.04, type: 'sine', gain: 0.05 }); },

    whoosh: function () { noise({ freq: 260, sweepTo: 3600, dur: 0.42, gain: 0.16, filter: 'bandpass', q: 0.7 }); },

    chime: function () {
      [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C5 * 2].forEach(function (f, i) {
        tone({ freq: f, dur: 0.5 - i * 0.05, type: 'sine', gain: 0.16, delay: i * 0.06 });
      });
    },

    correct: function () {
      [NOTE.E5, NOTE.G5, NOTE.C5 * 2].forEach(function (f, i) {
        tone({ freq: f, dur: 0.26, type: 'triangle', gain: 0.2, delay: i * 0.075 });
      });
    },

    wrong: function () {
      tone({ freq: 190, glideTo: 88, dur: 0.42, type: 'sawtooth', gain: 0.15 });
      tone({ freq: 143, glideTo: 70, dur: 0.42, type: 'square', gain: 0.09, delay: 0.02 });
    },

    boom: function (pan) {
      noise({ freq: 900, sweepTo: 90, dur: 0.85, gain: 0.3, filter: 'lowpass', q: 0.4 });
      tone({ freq: 90, glideTo: 34, dur: 0.6, type: 'sine', gain: 0.34, pan: pan || 0 });
    },

    launch: function () { tone({ freq: 240, glideTo: 1500, dur: 0.5, type: 'sawtooth', gain: 0.06 }); },

    sparkle: function () {
      for (var i = 0; i < 5; i++) {
        tone({
          freq: 1400 + Math.random() * 2200, dur: 0.12 + Math.random() * 0.14,
          type: 'sine', gain: 0.07, delay: i * 0.045, pan: Math.random() * 2 - 1
        });
      }
    },

    confetti: function () {
      noise({ freq: 1800, sweepTo: 600, dur: 0.35, gain: 0.18, q: 0.5 });
      for (var i = 0; i < 4; i++) {
        tone({ freq: 700 + i * 260, dur: 0.16, type: 'triangle', gain: 0.1, delay: i * 0.03 });
      }
    },

    blow: function () { noise({ freq: 700, sweepTo: 160, dur: 0.55, gain: 0.24, filter: 'lowpass', q: 0.3 }); },

    /** The tune, played with a simple lead + a fifth underneath. */
    melody: function () {
      if (!live()) return;
      var q = 0.34;
      var song = [
        [NOTE.C4, 0.5], [NOTE.C4, 0.5], [NOTE.D4, 1], [NOTE.C4, 1], [NOTE.F4, 1], [NOTE.E4, 2],
        [NOTE.C4, 0.5], [NOTE.C4, 0.5], [NOTE.D4, 1], [NOTE.C4, 1], [NOTE.G4, 1], [NOTE.F4, 2],
        [NOTE.C4, 0.5], [NOTE.C4, 0.5], [NOTE.C5, 1], [NOTE.A4, 1], [NOTE.F4, 1], [NOTE.E4, 1], [NOTE.D4, 2],
        [NOTE.Bb4, 0.5], [NOTE.Bb4, 0.5], [NOTE.A4, 1], [NOTE.F4, 1], [NOTE.G4, 1], [NOTE.F4, 2]
      ];
      var at = 0;
      song.forEach(function (step) {
        var dur = step[1] * q;
        tone({ freq: step[0], dur: dur * 0.92, type: 'triangle', gain: 0.2, delay: at, attack: 0.02 });
        tone({ freq: step[0] * 1.5, dur: dur * 0.9, type: 'sine', gain: 0.07, delay: at, attack: 0.03 });
        at += dur;
      });
      return at;
    }
  };

  /* ---------- ambient pad ---------- */
  function startAmbient() {
    if (!live() || ambientNodes) return;
    var nodes = { oscs: [], gain: ctx.createGain() };
    nodes.gain.gain.value = 0.0001;
    nodes.gain.connect(master);
    nodes.gain.gain.setTargetAtTime(0.035, ctx.currentTime, 2.5);

    [NOTE.C4 / 2, NOTE.G4 / 2, NOTE.E4].forEach(function (f, i) {
      var osc = ctx.createOscillator();
      var lfo = ctx.createOscillator();
      var lfoGain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      lfo.frequency.value = 0.06 + i * 0.03;
      lfoGain.gain.value = 1.6 + i;
      lfo.connect(lfoGain); lfoGain.connect(osc.frequency);
      osc.connect(nodes.gain);
      osc.start(); lfo.start();
      nodes.oscs.push(osc, lfo);
    });
    ambientNodes = nodes;
  }

  function stopAmbient() {
    if (!ambientNodes) return;
    var nodes = ambientNodes;
    ambientNodes = null;
    try {
      nodes.gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.4);
      nodes.oscs.forEach(function (o) { o.stop(ctx.currentTime + 1.4); });
    } catch (err) { /* already stopped */ }
  }

  function play(name, arg) {
    var fn = sfx[name];
    if (typeof fn === 'function') return fn(arg);
  }

  global.BD = global.BD || {};
  global.BD.audio = {
    unlock: unlock,
    setEnabled: setEnabled,
    isEnabled: isEnabled,
    play: play,
    tone: tone,
    noise: noise,
    startAmbient: startAmbient,
    stopAmbient: stopAmbient
  };
})(window);
