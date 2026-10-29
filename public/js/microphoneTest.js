/** Test local uniquement : aucune piste ni aucun échantillon n'est envoyé au serveur. */
export function microphoneMessage(error) {
  switch (error?.name) {
    case 'NotAllowedError': case 'SecurityError':
      return 'Microphone refusé. Autorise le micro dans les réglages du site, puis réessaie.';
    case 'NotFoundError':
      return 'Aucun microphone détecté. Branche un micro ou vérifie les réglages de ton appareil.';
    case 'NotReadableError': case 'AbortError':
      return 'Microphone indisponible. Ferme les applications qui l’utilisent puis réessaie.';
    case 'OverconstrainedError':
      return 'Ce microphone n’est plus disponible. Choisis un autre périphérique.';
    default:
      return 'Impossible d’activer le microphone. Vérifie le navigateur, la connexion HTTPS et ton appareil.';
  }
}

export class MicrophoneTest {
  constructor(onLevel = () => {}) { this.onLevel = onLevel; this.generation = 0; }
  async start(deviceId) {
    this.stop();
    const generation = this.generation;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: {
      echoCancellation: true, noiseSuppression: true,
      ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
    } });
    if (generation !== this.generation) { stream.getTracks().forEach((t) => t.stop()); return false; }
    this.stream = stream;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      await this.ctx.resume();
      if (generation !== this.generation) return false;
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.ctx.createMediaStreamSource(stream).connect(this.analyser);
      const samples = new Uint8Array(256);
      this.timer = setInterval(() => {
        this.analyser.getByteTimeDomainData(samples);
        const rms = Math.sqrt(samples.reduce((sum, x) => sum + (x - 128) ** 2, 0) / samples.length);
        this.onLevel(Math.min(1, rms / 40));
      }, 100);
      return true;
    } catch (e) { this.stop(); throw e; }
  }
  stop() {
    this.generation++;
    clearInterval(this.timer);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.onLevel(0);
  }
}

export function mountMicrophoneTest(root, beforeStart = () => {}) {
  const button = root.querySelector('button');
  const output = root.querySelector('output');
  const meter = root.querySelector('meter');
  const select = root.querySelector('select');
  const test = new MicrophoneTest((level) => { meter.value = level; });
  let active = false;
  let busy = false;
  const stop = () => {
    test.stop(); active = false; button.textContent = 'Tester mon micro';
    output.textContent = 'Test local : ta voix n’est ni enregistrée ni transmise.';
  };
  button.addEventListener('click', async () => {
    if (active) return stop();
    if (busy) return;
    busy = true;
    button.disabled = true;
    try {
      beforeStart();
      output.textContent = 'Autorise le microphone puis parle…';
      active = await test.start(select.value);
      if (!active) return;
      button.textContent = 'Arrêter le test';
      output.textContent = 'Parle : la jauge doit bouger. Teste aussi ton casque avant de rejoindre.';
      const previous = select.value;
      const devices = await navigator.mediaDevices.enumerateDevices();
      select.replaceChildren(new Option('Microphone par défaut', ''));
      for (const device of devices.filter((d) => d.kind === 'audioinput')) select.add(new Option(device.label || 'Microphone', device.deviceId));
      select.value = previous;
    } catch (e) { stop(); output.textContent = microphoneMessage(e); }
    finally { busy = false; button.disabled = false; }
  });
  select.addEventListener('change', stop);
  window.addEventListener('pagehide', stop);
  return stop;
}
