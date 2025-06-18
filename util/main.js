window.onload = () => {
  const { createFFmpeg, fetchFile } = FFmpeg;

  const ffmpeg = createFFmpeg({
    log: true,
    corePath: 'dist/ffmpeg-core.js' // adjust if your path differs
  });

  const inputVideo = document.getElementById('inputVideo');
  const convertBtn = document.getElementById('convertBtn');
  const inputPreview = document.getElementById('inputPreview');
  const outputPreview = document.getElementById('outputPreview');
  const inputMeta = document.getElementById('inputMeta');
  const outputMeta = document.getElementById('outputMeta');
  const downloadLink = document.getElementById('downloadLink');
  const progressBar = document.getElementById('bar');

  let inputFileName = '';

  async function loadFFmpeg() {
    if (!ffmpeg.isLoaded()) {
      await ffmpeg.load();
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

    await loadFFmpeg();

    ffmpeg.FS('writeFile', inputFileName, await fetchFile(file));

    try {
      // Probe metadata by running -i (will throw but fills ffmpeg logs)
      await ffmpeg.run('-i', inputFileName);
    } catch {
      // Expected error since no output specified
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
      // expected error from probe
    }
    const logs = ffmpeg.FS('readFile', 'ffmpeg.log')?.toString() || '';
    outputMeta.textContent = parseMetadata(logs);

    convertBtn.disabled = false;
  });

  function parseMetadata(logText) {
    const lines = logText.split('\n');
    const info = [];

    // Extract duration
    const durLine = lines.find(line => line.includes('Duration:'));
    if (durLine) {
      const m = durLine.match(/Duration: ([\d:.]+)/);
      if (m) info.push(`Duration: ${m[1]}`);
    }

    // Extract resolution and fps
    const videoLine = lines.find(line => line.includes('Video:'));
    if (videoLine) {
      // Resolution like 1920x1080
      const resMatch = videoLine.match(/\b(\d{2,5}x\d{2,5})\b/);
      if (resMatch) info.push(`Resolution: ${resMatch[1]}`);

      // FPS (frames per second)
      const fpsMatch = videoLine.match(/, (\d+(?:\.\d+)?) fps/);
      if (fpsMatch) info.push(`Framerate: ${fpsMatch[1]} fps`);

      // Bitrate
      const bitrateMatch = videoLine.match(/, (\d+) kb\/s/);
      if (bitrateMatch) info.push(`Bitrate: ${bitrateMatch[1]} kbps`);
    }

    return info.join('\n') || 'Metadata not found';
  }
};