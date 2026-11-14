(() => {
  const byId = id => document.getElementById(id);
  const trigger = byId('photo-booth-open');
  const booth = byId('photo-booth');
  const options = byId('photo-booth-options');
  const preview = byId('photo-booth-preview');
  const camera = byId('photo-booth-camera');
  const cutout = byId('photo-booth-cutout');
  const status = byId('photo-booth-status');
  const start = byId('photo-booth-start');
  const take = byId('photo-booth-take');
  const save = byId('photo-booth-save');
  const art = window.clubBoothArt;
  let station;
  let selected;
  let revision = 0;
  let stream;
  let segmenter;
  let photoURL;
  let textures;

  function loadTextures() {
    textures ??= Promise.all(art.scenes.map((_, index) => {
      const image = new Image();
      image.src = '/booth-scene-' + index + '.webp';
      return image.decode().then(() => image);
    })).catch(error => {
      textures = null;
      throw error;
    });
    return textures;
  }

  function clearPhoto() {
    if (photoURL) URL.revokeObjectURL(photoURL);
    photoURL = null;
    save.hidden = true;
    save.removeAttribute('href');
    cutout.hidden = true;
  }

  function close() {
    revision++;
    for (const track of stream?.getTracks() ?? []) track.stop();
    stream = null;
    segmenter?.stop();
    segmenter = null;
    clearPhoto();
    camera.srcObject = null;
    camera.hidden = true;
    take.disabled = true;
    start.hidden = false;
    start.disabled = false;
    if (booth.open) booth.close();
    if (!trigger.hidden && !trigger.closest('[hidden]')) trigger.focus();
  }

  function select(index, images) {
    selected = index;
    clearPhoto();
    art.draw(preview, station, index, images[index]);
    for (const [i, button] of [...options.children].entries()) button.setAttribute('aria-pressed', String(index === i));
    status.textContent = '';
  }

  trigger.addEventListener('click', async () => {
    if (!station) return;
    const request = ++revision;
    byId('photo-booth-title').textContent = station.city + ' Photo Booth';
    options.replaceChildren();
    preview.getContext('2d').clearRect(0, 0, preview.width, preview.height);
    status.textContent = 'Loading backdrops…';
    start.disabled = true;
    if (!booth.open) booth.showModal();
    try {
      const images = await loadTextures();
      if (request !== revision) return;
      options.replaceChildren(...art.scenes.map((scene, index) => {
        const button = document.createElement('button');
        const thumbnail = document.createElement('canvas');
        thumbnail.width = 144;
        thumbnail.height = 180;
        thumbnail.setAttribute('aria-hidden', 'true');
        art.draw(thumbnail, station, index, images[index]);
        button.type = 'button';
        button.append(thumbnail, document.createTextNode(scene.name));
        button.addEventListener('click', () => select(index, images));
        return button;
      }));
      select(0, images);
      start.disabled = false;
    } catch {
      if (request === revision) status.textContent = 'Could not load the backdrops. Close the booth and try again.';
    }
  });

  start.addEventListener('click', async () => {
    const request = revision;
    start.disabled = true;
    status.textContent = 'Starting booth camera…';
    try {
      const clone = window.clubParty.cloneCamera();
      const next = clone ? new MediaStream([clone]) : await navigator.mediaDevices.getUserMedia({
        video: {width:{ideal:960},height:{ideal:720},facingMode:'user'}, audio:false
      });
      if (request !== revision) {
        for (const track of next.getTracks()) track.stop();
        return;
      }
      stream = next;
      camera.srcObject = stream;
      camera.hidden = false;
      await camera.play();
      if (request !== revision) return;
      start.hidden = true;
      take.disabled = false;
      status.textContent = 'Center yourself in the camera preview.';
    } catch {
      if (request !== revision) return;
      for (const track of stream?.getTracks() ?? []) track.stop();
      stream = null;
      camera.srcObject = null;
      camera.hidden = true;
      status.textContent = 'Could not open the camera. Check camera access and try again.';
      start.disabled = false;
    }
  });

  take.addEventListener('click', async () => {
    if (!camera.videoWidth || !stream) return;
    const request = revision;
    const index = selected;
    clearPhoto();
    take.disabled = true;
    status.textContent = 'Separating you from the room…';
    try {
      const frame = document.createElement('canvas');
      frame.width = 720;
      frame.height = 900;
      const context = frame.getContext('2d');
      const scale = Math.max(frame.width / camera.videoWidth, frame.height / camera.videoHeight);
      const width = camera.videoWidth * scale;
      const height = camera.videoHeight * scale;
      context.translate(frame.width, 0);
      context.scale(-1,1);
      context.drawImage(camera, (frame.width-width)/2, (frame.height-height)/2, width, height);
      context.setTransform(1,0,0,1,0,0);
      segmenter ??= window.createPartyPhotoCutout();
      const detected = await segmenter.apply(frame);
      if (request !== revision || index !== selected) return;
      if (!detected) {
        status.textContent = 'Move into the center and face a light, then try again.';
        return;
      }
      const images = await loadTextures();
      if (request !== revision || index !== selected) return;
      art.draw(preview, station, index, images[index]);
      const output = document.createElement('canvas');
      output.width = preview.width;
      output.height = preview.height;
      const composite = output.getContext('2d');
      composite.drawImage(preview,0,0);
      composite.drawImage(frame,30,125,660,740);
      const blob = await new Promise(resolve => output.toBlob(resolve,'image/jpeg',.93));
      if (request !== revision || index !== selected) return;
      if (!blob) throw new Error('Could not save photo.');
      cutout.getContext('2d').clearRect(0,0,cutout.width,cutout.height);
      cutout.getContext('2d').drawImage(output,0,0);
      cutout.hidden = false;
      photoURL = URL.createObjectURL(blob);
      save.href = photoURL;
      save.download = station.id + '-club-photo.jpg';
      save.hidden = false;
      status.textContent = 'Your photo is ready.';
    } catch {
      if (request === revision) status.textContent = 'Could not create the cutout. Try taking the photo again.';
    } finally {
      if (request === revision) take.disabled = false;
    }
  });

  byId('photo-booth-close').addEventListener('click',close);
  booth.addEventListener('cancel',event => { event.preventDefault(); close(); });
  window.addEventListener('club-party-left', close);
  window.addEventListener('club-meeting', ({detail}) => {
    if (detail) close();
    trigger.hidden = Boolean(detail) || !station;
  });
  window.addEventListener('pagehide', close);
  window.clubPhotoBooth = {
    select(next) {
      if (station === next) return;
      station = next;
      trigger.hidden = !next;
      if (booth.open) close();
    }
  };
})();
