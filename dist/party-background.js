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
      // Use the CPU backend so the effect also works without WebGL.
      await tf.setBackend('cpu');
      return tf.loadGraphModel(modelPath + 'selfie.json');
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

  window.createPartyVideoBackground = (camera, onState, onError) => {
    const video = document.createElement('video');
    video.muted = video.playsInline = true;
    video.setAttribute('aria-hidden', 'true');
    video.className = 'party-camera-source';

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
    video.srcObject = new MediaStream([camera]);
    document.body.append(video);
    let stopped = false;
    let timer;
    let sceneVersion = 0;
    let sceneReady = false;
    let lastTime = -1;
    let lastPerson = 0;
    let previousState;
    let model;
    let resolveFirstFrame;
    const firstFrame = new Promise(resolve => { resolveFirstFrame = resolve; });
    const input = document.createElement('canvas');
    input.width = input.height = 256;
    // Preserve the camera aspect ratio in the square model input.
    const scale = input.width / Math.max(width, height);
    const inputWidth = Math.round(width * scale);
    const inputHeight = Math.round(height * scale);
    const inputX = Math.floor((input.width - inputWidth) / 2);
    const inputY = Math.floor((input.height - inputHeight) / 2);
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

    function report(state) {
      if (previousState === state) return;
      previousState = state;
      onState(state);
    }

    async function drawFrame(model) {
      if (!sceneReady || !model) return;
      drawCover(foregroundContext, video, width, height);
      inputContext.fillStyle = '#000';
      inputContext.fillRect(0, 0, input.width, input.height);
      inputContext.drawImage(foreground, inputX, inputY, inputWidth, inputHeight);
      const prediction = tf.tidy(() => {
        const rgb = tf.browser.fromPixels(input).toFloat().div(255).expandDims();
        return model.predict(rgb);
      });
      let confidence;
      try { confidence = await prediction.data(); }
      finally { prediction.dispose(); }
      if (stopped) return;

      let personPixels = 0;
      for (let y = inputY; y < inputY + inputHeight; y++) {
        for (let x = inputX; x < inputX + inputWidth; x++) {
          const i = y * input.width + x;
          // Pull the mask inward by one model pixel to reduce color spill, then feather the edge.
          const inward = Math.min(confidence[i],
            confidence[y * input.width + Math.max(inputX, x - 1)],
            confidence[y * input.width + Math.min(inputX + inputWidth - 1, x + 1)],
            confidence[Math.max(inputY, y - 1) * input.width + x],
            confidence[Math.min(inputY + inputHeight - 1, y + 1) * input.width + x]);
          const edge = Math.max(0, Math.min(1, (inward - .58) / .28));
          pixels.data[i * 4 + 3] = Math.round(255 * edge * edge * (3 - 2 * edge));
          if (confidence[i] >= .86) personPixels++;
        }
      }
      const now = performance.now();
      if (personPixels < inputWidth * inputHeight * .005) {
        // Hold the previous composite through brief detection misses.
        if (!lastPerson || now - lastPerson > 2500) report('searching');
        return;
      }
      lastPerson = now;
      maskContext.putImageData(pixels, 0, 0);
      context.clearRect(0, 0, width, height);
      context.drawImage(mask, inputX, inputY, inputWidth, inputHeight, 0, 0, width, height);
      context.globalCompositeOperation = 'source-in';
      context.drawImage(foreground, 0, 0);
      context.globalCompositeOperation = 'destination-over';
      context.drawImage(scene, 0, 0);
      context.globalCompositeOperation = 'source-over';
      report('detected');
      resolveFirstFrame();
    }

    async function nextFrame() {
      if (stopped) return;
      if (video.readyState >= 2 && video.videoWidth && video.currentTime !== lastTime) {
        lastTime = video.currentTime;
        try { await drawFrame(model); }
        catch (error) {
          model = null;
          if (!stopped) onError(error);
        }
      }
      if (!stopped) timer = setTimeout(() => {
        void nextFrame();
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
      previousState = null;
      sceneReady = true;
      await startup;
      await firstFrame;
      return !stopped && version === sceneVersion;
    }

    async function prepareModel() {
      try { model = await loadModel(); }
      catch (error) { if (!stopped) onError(error); }
    }

    const startup = (async () => {
      await video.play();
      if (stopped) return;
      void prepareModel();
      await nextFrame();
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
        video.remove();
      }
    };
  };
})();
