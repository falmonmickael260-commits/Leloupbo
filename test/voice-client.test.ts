import assert from 'node:assert/strict';
import { describe, it, before } from 'node:test';
import { EventEmitter } from 'node:events';

let VoiceMesh: any;
let VoiceSFU: any;
let Voice: any;
let MicrophoneTest: any;
let microphoneMessage: any;
let capture: any;
const track = () => ({ readyState: 'live', muted: false, enabled: true, stop() { this.readyState = 'ended'; } });
const stream = (t = track()) => ({ getTracks: () => [t], getAudioTracks: () => [t] });
class Client extends EventTarget {
  stale = false;
  status = 'connected';
  socket = new EventEmitter();
  view = { me: { id: 'a' }, voice: { canSpeak: true, speakTo: ['b'], hearFrom: ['b'] } };
  request = async () => ({ mode: 'mesh', peers: [] });
  resume = async () => {};
}
class PC {
  connectionState = 'connected'; signalingState = 'stable'; remoteDescription: any = null;
  transceivers: any[] = [];
  candidates: any[] = [];
  restarts = 0;
  ontrack: any; onconnectionstatechange: any;
  addTransceiver() { this.transceivers.push({ direction: 'sendrecv', sender: {
    track: null, replaceTrack: async function(t: any) { this.track = t; }, getParameters: () => ({ encodings: [] }),
  } }); }
  getTransceivers() { return this.transceivers; }
  async setRemoteDescription(d: any) { this.remoteDescription = d; this.addTransceiver(); }
  async addIceCandidate(c: any) { assert.ok(this.remoteDescription); this.candidates.push(c); }
  async createAnswer() { return { sdp: '' }; }
  async setLocalDescription(_d: any) {}
  restartIce() { this.restarts++; }
  close() { this.connectionState = 'closed'; }
}
class Room extends EventEmitter {
  state = 'connected'; remoteParticipants = new Map(); canPlaybackAudio = true;
  localParticipant: any;
  constructor() { super(); this.localParticipant = {
    permissions: { canPublish: true }, audioTrackPublications: new Map(),
    publishTrack: async (t: any) => { this.localParticipant.audioTrackPublications.set('mic', { track: t }); },
  }; }
  async connect() { this.state = 'connected'; }
  async startAudio() {}
  async disconnect() { this.state = 'disconnected'; }
}
let localTrack: any;
before(async () => {
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {
    userAgent: 'iPhone OS 17_0 Safari', platform: 'iPhone', maxTouchPoints: 1,
    mediaDevices: { getUserMedia: () => capture(), addEventListener() {}, removeEventListener() {} },
  } });
  Object.assign(globalThis, {
    RTCPeerConnection: PC,
    MediaStream: class { constructor(public tracks: any[]) {} getAudioTracks() { return this.tracks; } },
    Audio: class { muted = true; srcObject: any; setAttribute() {} async play() {} },
    document: { addEventListener() {}, removeEventListener() {}, body: { appendChild() {} } },
    window: { LivekitClient: {
      Room, RoomEvent: Object.fromEntries(['TrackSubscribed','TrackUnsubscribed','ActiveSpeakersChanged','ParticipantPermissionsChanged','AudioPlaybackStatusChanged','ParticipantConnected','ParticipantDisconnected','Reconnected','Reconnecting','ConnectionStateChanged','MediaDevicesError','LocalTrackUnpublished','Disconnected'].map((e) => [e,e])),
      AudioPresets: { speech: {} }, Track: { Source: { Microphone: 'microphone' } },
      createLocalAudioTrack: async () => localTrack,
    } },
  });
  const meshPath = '../public/js/voice.js';
  const sfuPath = '../public/js/voiceSfu.js';
  const managerPath = '../public/js/voiceManager.js';
  const testPath = '../public/js/microphoneTest.js';
  ({ VoiceMesh } = await import(meshPath));
  ({ VoiceSFU } = await import(sfuPath));
  ({ Voice } = await import(managerPath));
  ({ MicrophoneTest, microphoneMessage } = await import(testPath));
});
const settle = () => new Promise((resolve) => setImmediate(resolve));

describe('Navigateur voix — régressions avec transports simulés', () => {
  it('mesh : perte réseau ferme immédiatement le micro et l’écoute ; nouvelle vue restaure les droits', async () => {
    capture = async () => stream();
    const c = new Client(); const v = new VoiceMesh(c);
    await v.start({ peers: ['b'] }); await settle();
    const p = v.peers.get('b');
    assert.ok(p.pc.getTransceivers()[0].sender.track);
    assert.equal(p.audio.muted, false);
    c.stale = true; c.status = 'disconnected'; c.dispatchEvent(new CustomEvent('status'));
    assert.equal(v.stream.getAudioTracks()[0].enabled, false);
    await settle();
    assert.equal(p.pc.getTransceivers()[0].sender.track, null);
    assert.equal(p.audio.muted, true);
    assert.equal(v.state().sending, false);
    c.stale = false; c.status = 'connected'; c.dispatchEvent(new CustomEvent('view')); await settle();
    assert.equal(v.state().sending, true);
    c.view.voice = { canSpeak: false, speakTo: [], hearFrom: [] };
    c.dispatchEvent(new CustomEvent('view')); await settle();
    assert.equal(v.state().sending, false); assert.equal(p.audio.muted, true);
    v.stop();
  });
  it('mesh : ICE précoce mis en attente, piste reçue audible seulement après autorisation', async () => {
    capture = async () => stream(); const c = new Client(); const v = new VoiceMesh(c);
    await v.start({ peers: [] });
    c.socket.emit('voice:signal', { from: 'b', data: { candidate: { candidate: 'test' } } }); await settle();
    const p = v.peers.get('b'); assert.equal(p.pc.candidates.length, 0);
    c.socket.emit('voice:signal', { from: 'b', data: { description: { type: 'offer', sdp: '' } } }); await settle();
    assert.equal(p.pc.candidates.length, 1);
    p.pc.ontrack({ track: track() }); assert.equal(p.audio.muted, false);
    c.view.voice.hearFrom = []; c.dispatchEvent(new CustomEvent('view'));
    p.pc.ontrack({ track: track() }); assert.equal(p.audio.muted, true);
    p.pc.connectionState = 'failed'; p.pc.onconnectionstatechange(); assert.equal(p.pc.restarts, 1);
    v.stop();
  });
  it('permission refusée : écoute seule, diagnostic précis, pas de faux micro actif', async () => {
    capture = async () => { throw Object.assign(new Error('denied'), { name: 'NotAllowedError' }); };
    const v = new VoiceMesh(new Client()); await v.start({ peers: [] });
    assert.equal(v.state().hasMic, false); assert.equal(v.state().sending, false);
    assert.match(microphoneMessage({ name: v.state().micError }), /refusé/); v.stop();
    assert.match(microphoneMessage({ name: 'NotFoundError' }), /Aucun/);
    assert.match(microphoneMessage({ name: 'NotReadableError' }), /applications/);
  });
  it('changement de périphérique mesh : ancienne capture libérée, droits conservés', async () => {
    capture = async () => stream(); const c = new Client(); const v = new VoiceMesh(c);
    await v.start({ peers: ['b'] }); const old = v.stream.getAudioTracks()[0];
    c.view.voice.canSpeak = false;
    await v.setInputDevice('headset'); await settle();
    assert.equal(old.readyState, 'ended'); assert.equal(v.stream.getAudioTracks()[0].enabled, false);
    assert.equal(v.state().sending, false); v.stop();
  });
  it('annulation pendant la demande de permission : aucun micro conservé après arrêt', async () => {
    let release: any; const t = track();
    capture = () => new Promise((resolve) => { release = resolve; });
    const v = new Voice(new Client()); const starting = v.start(); await settle();
    v.stop(); release(stream(t)); await starting;
    assert.equal(t.readyState, 'ended'); assert.equal(v.state().active, false);
  });
  it('test préalable annulé : capture tardive arrêtée sans analyser ni transmettre', async () => {
    let release: any; const t = track();
    capture = () => new Promise((resolve) => { release = resolve; });
    const test = new MicrophoneTest(); const pending = test.start(); test.stop(); release(stream(t));
    assert.equal(await pending, false); assert.equal(t.readyState, 'ended');
  });
  it('SFU : publication, refus serveur, changement de phase et reconnexion reflètent l’état réel', async () => {
    localTrack = { mediaStreamTrack: track(), isMuted: false,
      async mute() { this.isMuted = true; }, async unmute() { this.isMuted = false; },
      async restartTrack() { this.mediaStreamTrack = track(); }, stop() { this.mediaStreamTrack.stop(); },
    };
    const c = new Client(); const v = new VoiceSFU(c); await v.start({}); await settle();
    assert.equal(v.state().sending, true);
    c.view.voice.canSpeak = false; c.dispatchEvent(new CustomEvent('view')); await settle();
    assert.equal(v.state().sending, false); assert.equal(localTrack.isMuted, true);
    c.view.voice.canSpeak = true; v.room.localParticipant.permissions.canPublish = false;
    c.dispatchEvent(new CustomEvent('view')); await settle();
    assert.equal(v.state().sending, false);
    v.room.localParticipant.permissions.canPublish = true;
    v.room.emit('ParticipantPermissionsChanged'); await settle(); assert.equal(v.state().sending, true);
    v.room.state = 'reconnecting'; v.room.emit('Reconnecting'); await settle(); assert.equal(v.state().sending, false);
    v.room.state = 'connected'; v.room.emit('Reconnected'); await settle(); assert.equal(v.state().sending, true);
    c.stale = true; c.status = 'disconnected'; c.dispatchEvent(new CustomEvent('status')); await settle();
    assert.equal(v.state().sending, false); assert.equal(localTrack.mediaStreamTrack.enabled, false);
    v.stop(); assert.equal(localTrack.mediaStreamTrack.readyState, 'ended');
  });
});
