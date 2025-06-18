const { createFFmpeg, fetchFile } = FFmpeg;

const ffmpeg = createFFmpeg({
  log: true,
  progress: ({ ratio }) => {
    const bar = document.getElementById('bar');
    bar.style.width = Math.min(Math.floor(ratio * 100), 100) + "%";
  }
});

const log = (msg) => console.log(msg);

const inputPreview = document.getElementById('inputPreview');
const outputPreview = document.getElementById('outputPreview');
const inputMeta = document.getElementById('inputMeta');
const outputMeta = document.getElementById('outputMeta');

// Remove H.265 if not supported
const h265Supported = MediaSource.isTypeSupported('video/mp4; codecs="hev1.1.6.L93.B0"');
if (!h265Supported) {
  const option = document.querySelector('#codec option[value="libx265"]');
  if (option) option.remove();
}

document.getElementById('qualityMode').addEventListener('change', () => {
  const mode = document.getElementById('qualityMode').value;
  document.getElementById('bitrateInputs').style.display = mode === 'bitrate' ? 'block' : 'none';
  document.getElementById('cqInputs').style.display = mode === 'cq' ? 'block' : 'none';
});

document.getElementById('inputVideo').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  inputPreview.src = URL.createObjectURL(file);
  inputPreview.load();

  if (!ffmpeg.isLoaded()) {
    await ffmpeg.load();
  }

  const fileName = file.name;
  ffmpeg.FS('writeFile', fileName, await fetchFile(file));

  try {
    await ffmpeg.run('-i', fileName);
  } catch (err) {
    // We expect an error here because -i alone doesn't produce output
    const logText = ffmpeg._ffmpeg.FS('readFile', 'ffmpeg.log')?.toString() ?? '';
    inputMeta.textContent = extractMetadata(logText);
  }
});

document.getElementById('convertBtn').onclick = async () => {
  const fileInput = document.getElementById('inputVideo');
  const codec = document.getElementById('codec').value;
  const framerate = document.getElementById('framerate').value;
  const audioBitrate = document.getElementById('audioBitrate').value;
  const qualityMode = document.getElementById('qualityMode').value;

  const bitrate = document.getElementById('bitrate').value;
  const cq = document.getElementById('cq').value;

  const file = fileInput.files[0];
  if (!file) {
    alert("Please upload a video file.");
    return;
  }

  document.getElementById('bar').style.width = "0%";
  outputPreview.src = '';
  outputMeta.textContent = '';

  if (!ffmpeg.isLoaded()) await ffmpeg.load();

  const inputName = file.name;
  const ext = codec.includes('libx26') ? 'mp4' : 'webm';
  const outputName = `output.${ext}`;

  ffmpeg.FS('writeFile', inputName, await fetchFile(file));

  const args = [
    '-i', inputName,
    '-c:v', codec,
    '-r', `${framerate}`,
    '-c:a', 'aac',
    '-b:a', `${audioBitrate}k`
  ];

  if (qualityMode === 'bitrate') {
    args.push('-b:v', `${bitrate}k`);
  } else {
    args.push('-crf', `${cq}`);
  }

  args.push(outputName);

  try {
    await ffmpeg.run(...args);
  } catch (err) {
    alert("Encoding failed: " + err.message);
    return;
  }

  const outputData = ffmpeg.FS('readFile', outputName);
  const outputBlob = new Blob([outputData.buffer], { type: `video/${ext}` });
  const outputURL = URL.createObjectURL(outputBlob);

  outputPreview.src = outputURL;
  outputPreview.load();

  const a = document.createElement('a');
  a.href = outputURL;
  a.download = outputName;
  a.textContent = '⬇ Download Converted Video';
  a.style.display = 'block';
  document.body.appendChild(a);

  // Extract metadata for output
  ffmpeg.FS('writeFile', outputName, outputData);
  try {
    await ffmpeg.run('-i', outputName);
  } catch (err) {
    const logText = ffmpeg._ffmpeg.FS('readFile', 'ffmpeg.log')?.toString() ?? '';
    outputMeta.textContent = extractMetadata(logText);
  }
};

function extractMetadata(logText) {
  // Try to extract resolution, framerate, duration, bitrate
  const lines = logText.split('\n');
  const info = [];

  const resolution = lines.find(l => l.includes('Video:'))?.match(/\d{3,5}x\d{3,5}/)?.[0];
  if (resolution) info.push(`Resolution: ${resolution}`);

  const fps = lines.find(l => l.includes('fps'))?.match(/(\d+(\.\d+)?)(?= fps)/)?.[0];
  if (fps) info.push(`Framerate: ${fps} fps`);

  const bitrate = lines.find(l => l.includes('bitrate:'))?.match(/bitrate:\s+(\d+\s+kb\/s)/)?.[1];
  if (bitrate) info.push(`Bitrate: ${bitrate}`);

  const duration = lines.find(l => l.includes('Duration:'))?.match(/Duration: (\d+:\d+:\d+\.\d+)/)?.[1];
  if (duration) info.push(`Duration: ${duration}`);

  return info.join('\n');
}
