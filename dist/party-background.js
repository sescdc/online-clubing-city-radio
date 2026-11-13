(() => {
  const modelPath = '/party-model/';
  let modelPromise;

  function loadScript(name) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = modelPath + name;
      script.onload = resolve;
      script.onerror = () => {
        script.remove();
        reject(new Error('Could not load the background model.'));
      };
      document.head.append(script);
    });
  }

  function loadModel() {
    modelPromise ??= (async () => {
      if (!window.tf) await loadScript('tf.min.js');
      if (!window['body-pix']) await loadScript('body-pix.min.js');
      // The CPU backend also works when WebGL is unavailable.
      const graphics = document.createElement('canvas');
      const gl = graphics.getContext('webgl2') || graphics.getContext('webgl');
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
      if (!gl || !await tf.setBackend('webgl')) await tf.setBackend('cpu');
      return window['body-pix'].load({architecture: 'MobileNetV1', outputStride: 16, multiplier: .5,
        quantBytes: 2, modelUrl: modelPath + 'bodypix.json'});
    })().catch(error => {
      modelPromise = null;
      throw error;
    });
    return modelPromise;
  }

  function drawCover(context, image, width, height) {
    const imageWidth = image.naturalWidth || image.videoWidth || image.width;
    const imageHeight = image.naturalHeight || image.videoHeight || image.height;
    const scale = Math.max(width / imageWidth, height / imageHeight);
    const w = imageWidth * scale;
    const h = imageHeight * scale;
    context.drawImage(image, (width - w) / 2, (height - h) / 2, w, h);
  }

  function drawScene(context, choice, image, width, height) {
    let fill = '#16355d';
    if (choice === 'sunset') {
      fill = context.createRadialGradient(width * .65, height * .9, 0, width * .65, height * .9, width * .7);
      fill.addColorStop(0, '#ffac61');
      fill.addColorStop(.42, '#a44826');
      fill.addColorStop(.78, '#172f5d');
    }
    if (choice === 'wave' || choice === 'studio') {
      fill = context.createLinearGradient(0, 0, width, height);
      const stops = choice === 'wave' ? [[.22, '#071a38'], [.52, '#2477ce'], [.77, '#143e73']]
        : [[0, '#f7fbff'], [1, '#b2d8ff']];
      for (const [position, color] of stops) fill.addColorStop(position, color);
    }
    context.fillStyle = fill;
    context.fillRect(0, 0, width, height);
    if (image) drawCover(context, image, width, height);
  }

  window.createPartyVideoBackground = (camera, onError) => {
    const video = document.createElement('video');
    video.muted = video.playsInline = true;
    video.srcObject = new MediaStream([camera]);

    const settings = camera.getSettings();
    const portrait = settings.height > settings.width;
    const canvas = document.createElement('canvas');
    canvas.width = portrait ? 360 : 640;
    canvas.height = portrait ? 640 : 360;
    const {width, height} = canvas;
    const context = canvas.getContext('2d');
    const scene = document.createElement('canvas');
    scene.width = width;
    scene.height = height;
    const sceneContext = scene.getContext('2d');
    if (!context || !sceneContext || !canvas.captureStream) throw new Error('Video backgrounds are unavailable.');
    const [track] = canvas.captureStream(24).getVideoTracks();
    let stopped = false;
    let timer;
    let sceneVersion = 0;
    let sceneReady = false;
    let lastTime = -1;
    let lastPerson = 0;
    let resolveFirstFrame;
    const firstFrame = new Promise(resolve => { resolveFirstFrame = resolve; });
    const input = document.createElement('canvas');
    input.width = portrait ? 180 : 320;
    input.height = portrait ? 320 : 180;
    const inputContext = input.getContext('2d', {willReadFrequently: true});
    const mask = document.createElement('canvas');
    mask.width = input.width;
    mask.height = input.height;
    const maskContext = mask.getContext('2d');
    const pixels = maskContext.createImageData(mask.width, mask.height);
    const foreground = document.createElement('canvas');
    foreground.width = width;
    foreground.height = height;
    const foregroundContext = foreground.getContext('2d');

    async function drawFrame(model) {
      if (!sceneReady) return;
      drawCover(foregroundContext, video, width, height);
      inputContext.drawImage(foreground, 0, 0, input.width, input.height);
      const {data} = await model.segmentPerson(input, {internalResolution: 'medium', segmentationThreshold: .5});
      if (stopped) return;

      let personPixels = 0;
      for (let i = 0; i < data.length; i++) {
        personPixels += data[i];
        pixels.data[i * 4 + 3] = data[i] * 255;
      }
      const now = performance.now();
      if (personPixels < data.length * .005) {
        // Hold the previous composite through brief detection misses.
        if (lastPerson && now - lastPerson > 2500) throw new Error('No person detected.');
        return;
      }
      lastPerson = now;
      maskContext.putImageData(pixels, 0, 0);
      context.clearRect(0, 0, width, height);
      context.drawImage(mask, 0, 0, width, height);
      context.globalCompositeOperation = 'source-in';
      context.drawImage(foreground, 0, 0);
      context.globalCompositeOperation = 'destination-over';
      context.drawImage(scene, 0, 0);
      context.globalCompositeOperation = 'source-over';
      resolveFirstFrame();
    }

    async function nextFrame(model) {
      if (stopped) return;
      if (video.readyState >= 2 && video.videoWidth && video.currentTime !== lastTime) {
        lastTime = video.currentTime;
        await drawFrame(model);
      }
      if (!stopped) timer = setTimeout(() => {
        void nextFrame(model).catch(error => { if (!stopped) onError(error); });
      }, 50);
    }

    async function setScene(choice, photo) {
      const version = ++sceneVersion;
      const url = choice === 'custom' ? 'data:image/jpeg;base64,' + photo
        : choice === 'city' ? '/hero.webp'
        : ['wave', 'sunset', 'studio'].includes(choice) ? null : '/club-' + choice + '.webp';
      let image;
      if (url) {
        image = new Image();
        image.src = url;
        await image.decode();
      }
      if (stopped || version !== sceneVersion) return false;
      drawScene(sceneContext, choice, image, width, height);
      sceneReady = true;
      await startup;
      await firstFrame;
      return !stopped && version === sceneVersion;
    }

    const startup = (async () => {
      await video.play();
      const model = await loadModel();
      if (stopped) return;
      await nextFrame(model);
    })();
    // A scene may still be decoding when startup fails.
    void startup.catch(() => {});

    return {
      track,
      setScene,
      stop() {
        stopped = true;
        resolveFirstFrame();
        clearTimeout(timer);
        track.stop();
        video.pause();
        video.srcObject = null;
      }
    };
  };
})();
