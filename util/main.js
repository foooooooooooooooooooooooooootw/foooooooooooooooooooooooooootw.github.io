window.onload = () => {
  async function fetchFile(file) {
    return new Uint8Array(await file.arrayBuffer());
  }
  
  const FFmpeg = window.FFmpegWASM.FFmpeg;

  const ffmpeg = new FFmpeg({
    log: true,
    corePath: 'util/ffmpeg-core.js'
  });

  const inputVideo = document.getElementById('inputVideo');
  const convertBtn = document.getElementById('convertBtn');
  const inputPreview = document.getElementById('inputPreview');
  const outputPreview = document.getElementById('outputPreview');
  const inputMeta = document.getElementById('inputMeta');
  const outputMeta = document.getElementById('outputMeta');
  const downloadLink = document.getElementById('downloadLink');
  const progressBar = document.getElementById('bar');
  const logBox = document.getElementById('log');

  let inputFileName = '';

  ffmpeg.on('log', ({ message }) => {
    logBox.textContent += message + '\n';
    logBox.scrollTop = logBox.scrollHeight;
  });

  async function loadFFmpeg() {
    if (!ffmpeg.loaded) {
      logBox.textContent += 'Loading FFmpeg core...\n';
      await ffmpeg.load({
        coreURL: 'ffmpeg-core.js',       
        wasmURL: 'ffmpeg-core.wasm',     
        workerURL: '814.ffmpeg.js'  
      });
      logBox.textContent += 'FFmpeg core loaded successfully.\n';
      
    }
  }

  inputVideo.addEventListener('change', async () => {
    if (inputVideo.files.length === 0) {
      convertBtn.disabled = true;
      inputPreview.src = '';
      inputMeta.textContent = '';
      return;
    }

    const file = inputVideo.files[0];
    inputFileName = file.name;
    inputPreview.src = URL.createObjectURL(file);
    inputPreview.load();

    convertBtn.disabled = true;
    inputMeta.textContent = 'Loading video metadata...';
    logBox.textContent = 'Loading video metadata...\n';

    await loadFFmpeg();

    ffmpeg.FS('writeFile', inputFileName, await fetchFile(file));

    try {
      await ffmpeg.run('-i', inputFileName);
    } catch {
      // Expected error since no output file is specified
    }

    const logs = ffmpeg.FS('readFile', 'ffmpeg.log')?.toString() || '';
    inputMeta.textContent = parseMetadata(logs);

    convertBtn.disabled = false;
  });

  convertBtn.addEventListener('click', async () => {
    convertBtn.disabled = true;
    outputPreview.src = '';
    outputMeta.textContent = '';
    downloadLink.style.display = 'none';
    progressBar.style.width = '0%';
    logBox.textContent = 'Encoding started...\n';

    await loadFFmpeg();

    const codec = document.getElementById('codec').value;
    const framerate = document.getElementById('framerate').value;
    const audioBitrate = document.getElementById('audioBitrate').value;
    const qualityMode = document.getElementById('qualityMode').value;
    const bitrate = document.getElementById('bitrate').value;
    const cq = document.getElementById('cq').value;

    const ext = codec.includes('264') || codec.includes('265') ? 'mp4' : 'webm';
    const outputFileName = `output.${ext}`;

    const args = [
      '-i', inputFileName,
      '-c:v', codec,
      '-r', framerate,
      '-c:a', 'aac',
      '-b:a', `${audioBitrate}k`
    ];

    if (qualityMode === 'bitrate') {
      args.push('-b:v', `${bitrate}k`);
    } else {
      args.push('-crf', cq);
    }

    args.push(outputFileName);

    ffmpeg.setProgress(({ ratio }) => {
      progressBar.style.width = `${(ratio * 100).toFixed(2)}%`;
    });

    try {
      await ffmpeg.run(...args);
    } catch (e) {
      alert('Encoding failed: ' + e.message);
      convertBtn.disabled = false;
      return;
    }

    const data = ffmpeg.FS('readFile', outputFileName);
    const videoBlob = new Blob([data.buffer], { type: `video/${ext}` });
    const videoURL = URL.createObjectURL(videoBlob);

    outputPreview.src = videoURL;
    outputPreview.load();

    downloadLink.href = videoURL;
    downloadLink.style.display = 'block';
    downloadLink.download = outputFileName;

    try {
      await ffmpeg.run('-i', outputFileName);
    } catch {
      // Expected error from probe
    }

    const logs = ffmpeg.FS('readFile', 'ffmpeg.log')?.toString() || '';
    outputMeta.textContent = parseMetadata(logs);

    convertBtn.disabled = false;
  });

  function parseMetadata(logText) {
    const lines = logText.split('\n');
    const info = [];

    const durLine = lines.find(line => line.includes('Duration:'));
    if (durLine) {
      const m = durLine.match(/Duration: ([\d:.]+)/);
      if (m) info.push(`Duration: ${m[1]}`);
    }

    const videoLine = lines.find(line => line.includes('Video:'));
    if (videoLine) {
      const resMatch = videoLine.match(/\b(\d{2,5}x\d{2,5})\b/);
      if (resMatch) info.push(`Resolution: ${resMatch[1]}`);

      const fpsMatch = videoLine.match(/, (\d+(?:\.\d+)?) fps/);
      if (fpsMatch) info.push(`Framerate: ${fpsMatch[1]} fps`);

      const bitrateMatch = videoLine.match(/, (\d+) kb\/s/);
      if (bitrateMatch) info.push(`Bitrate: ${bitrateMatch[1]} kbps`);
    }

    return info.join('\n') || 'Metadata not found';
  }
};
