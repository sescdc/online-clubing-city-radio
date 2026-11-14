const modelPath = '/party-model/';
let model;

async function predict(rgba) {
  const pixels = {data: new Uint8Array(rgba.buffer, rgba.byteOffset, rgba.byteLength), width: 256, height: 256};
  const prediction = tf.tidy(() => {
    const input = tf.browser.fromPixels(pixels).toFloat().div(255).expandDims();
    return model.predict(input);
  });
  try { return await prediction.data(); }
  finally { prediction.dispose(); }
}

async function segment(rgba) {
  if (model) return predict(rgba);
  importScripts(modelPath + 'tf.min.js');
  try {
    importScripts(modelPath + 'tf-backend-wasm.min.js');
    tf.wasm.setWasmPaths(modelPath);
    await tf.setBackend('wasm');
    model = await tf.loadGraphModel(modelPath + 'selfie.json');
    return await predict(rgba);
  } catch {
    model?.dispose();
    model = null;
    await tf.setBackend('cpu');
    model = await tf.loadGraphModel(modelPath + 'selfie.json');
    return predict(rgba);
  }
}

self.onmessage = async ({data: rgba}) => {
  try {
    const confidence = await segment(rgba);
    // Own the buffer independently of the model backend's tensor storage.
    const mask = new Float32Array(confidence);
    self.postMessage({mask}, [mask.buffer]);
  } catch (error) {
    self.postMessage({error: error.message || 'Background segmentation failed.'});
  }
};
