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

  function createSegmenter() {
    let worker;
    let pending;
    try {
      worker = new Worker('/party-segmentation-worker.js');
      worker.onmessage = ({data}) => {
        if (data.error) {
          pending?.reject(new Error(data.error));
        } else {
          pending?.resolve(data.mask);
        }
      };
      worker.onerror = () => pending?.reject(new Error('Background worker unavailable.'));
    } catch {
      // Older browsers can still run the model on the main thread.
    }
    return {
      async predict(rgba) {
        if (worker) {
          try {
            return await new Promise((resolve, reject) => {
              pending = {resolve, reject};
              worker.postMessage(rgba);
            });
          } catch {
            if (!worker) throw new Error('Background processing stopped.');
            worker.terminate();
            worker = null;
          } finally {
            pending = null;
          }
        }
        const model = await loadModel();
        const prediction = tf.tidy(() => {
          const rgb = tf.browser.fromPixels({data: new Uint8Array(rgba.buffer, rgba.byteOffset, rgba.byteLength), width: 256, height: 256});
          return model.predict(rgb.toFloat().div(255).expandDims());
        });
        try { return await prediction.data(); }
        finally { prediction.dispose(); }
      },
      stop() {
        worker?.terminate();
        worker = null;
        pending?.reject(new Error('Background processing stopped.'));
      }
    };
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
    const [track] = canvas.captureStream(30).getVideoTracks();
    video.srcObject = new MediaStream([camera]);
    document.body.append(video);
    let stopped = false;
    let frameCallback;
    let timer;
    let sceneVersion = 0;
    let sceneReady = false;
    let lastTime = -1;
    let lastPerson = 0;
    let previousState;
    const segmenter = createSegmenter();
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

    const softMask = new Float32Array(mask.width * mask.height);
    const stride = input.width;
    const neighborOffsets = [-1, 1, -stride, stride];
    let previousRgba;

    async function drawFrame() {
      if (!sceneReady) return;
      // Keep the exact source frame until its mask arrives, even if a newer frame is ready.
      drawCover(foregroundContext, video, width, height);
      inputContext.fillStyle = '#000';
      inputContext.fillRect(0, 0, input.width, input.height);
      inputContext.drawImage(foreground, inputX, inputY, inputWidth, inputHeight);
      const inputPixels = inputContext.getImageData(0, 0, input.width, input.height);
      const rgba = inputPixels.data;
      const confidence = await segmenter.predict(rgba);
      if (stopped) return;

      const right = inputX + inputWidth - 1;
      const bottom = inputY + inputHeight - 1;
      let personPixels = 0;
      for (let y = inputY; y <= bottom; y++) {
        for (let x = inputX; x <= right; x++) {
          const i = y * stride + x;
          const probability = confidence[i];
          if (probability >= .86) personPixels++;
          let refined = probability;
          if (probability > .08 && probability < .98) {
            // Smooth the mask along nearby pixels of similar color to preserve camera edges.
            let total = probability * 2;
            let weightSum = 2;
            for (const offset of neighborOffsets) {
              const neighbor = i + offset;
              if ((offset === -1 && x === inputX) || (offset === 1 && x === right)
                || (offset === -stride && y === inputY) || (offset === stride && y === bottom)) continue;
              const colorDelta = Math.abs(rgba[i * 4] - rgba[neighbor * 4])
                + Math.abs(rgba[i * 4 + 1] - rgba[neighbor * 4 + 1])
                + Math.abs(rgba[i * 4 + 2] - rgba[neighbor * 4 + 2]);
              const weight = 1 / (1 + colorDelta * colorDelta / 900);
              total += confidence[neighbor] * weight;
              weightSum += weight;
            }
            refined = Math.min(probability + .045, total / weightSum);
          }
          if (previousRgba && refined > .56 && refined < .96) {
            const offset = i * 4;
            const movement = Math.abs(rgba[offset] - previousRgba[offset])
              + Math.abs(rgba[offset + 1] - previousRgba[offset + 1])
              + Math.abs(rgba[offset + 2] - previousRgba[offset + 2]);
            if (movement < 25 && Math.abs(softMask[i] - refined) < .22) {
              refined = refined * .72 + softMask[i] * .28;
            }
          }
          softMask[i] = refined;
          // Suppress color spill where an adjacent model pixel is clearly background.
          const neighborFloor = Math.min(confidence[y * stride + Math.max(inputX, x - 1)],
            confidence[y * stride + Math.min(right, x + 1)],
            confidence[Math.max(inputY, y - 1) * stride + x],
            confidence[Math.min(bottom, y + 1) * stride + x]);
          const alphaConfidence = Math.min(refined, neighborFloor + .06);
          const edge = Math.max(0, Math.min(1, (alphaConfidence - .68) / .21));
          pixels.data[i * 4 + 3] = Math.round(255 * edge * edge * (3 - 2 * edge));
        }
      }
      const now = performance.now();
      if (personPixels < inputWidth * inputHeight * .005) {
        previousRgba = null;
        // Allow a brief miss before clearing the last safe composite.
        if (now - lastPerson > 350 || !lastPerson) {
          context.drawImage(scene, 0, 0);
          report('searching');
        }
        return;
      }
      lastPerson = now;
      previousRgba = rgba;
      maskContext.putImageData(pixels, 0, 0);
      foregroundContext.globalCompositeOperation = 'destination-in';
      foregroundContext.drawImage(mask, inputX, inputY, inputWidth, inputHeight, 0, 0, width, height);
      foregroundContext.globalCompositeOperation = 'source-over';
      context.drawImage(scene, 0, 0);
      context.drawImage(foreground, 0, 0);
      report('detected');
      resolveFirstFrame();
    }

    function scheduleFrame() {
      if (stopped) return;
      if (video.requestVideoFrameCallback) {
        frameCallback = video.requestVideoFrameCallback(() => { void nextFrame(); });
      } else {
        timer = setTimeout(() => { void nextFrame(); }, 1000 / 30);
      }
    }

    async function nextFrame() {
      if (stopped) return;
      if (video.readyState >= 2 && video.videoWidth && video.currentTime !== lastTime) {
        lastTime = video.currentTime;
        try { await drawFrame(); }
        catch (error) {
          if (!stopped) onError(error);
          return;
        }
      }
      scheduleFrame();
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

    const startup = (async () => {
      await video.play();
      scheduleFrame();
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
        if (frameCallback !== undefined) video.cancelVideoFrameCallback?.(frameCallback);
        segmenter.stop();
        track.stop();
        video.pause();
        video.srcObject = null;
        video.remove();
      }
    };
  };
})();
