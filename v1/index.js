"use strict";

// utils
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

// constants
const SIZE = 112;
const CACHE_SIZE = 256;
const FRAMES = 5;

let lastClick;
let loop = null;

const g = {
  delay: 63,
  x: 18,
  y: 18,
  w: 112,
  h: 112,
  scale: 0.875,
  frame: 0,
};

const canvas = $("#canvas");
const ctx = canvas.getContext("2d");
const $preview = $("#uploadPreview");

const $info = $("#info");
const $result = $("#result");

// Preload sprites
const sprite = new Image();
sprite.src = "../img/sprite.png";

const placeholder = new Image();
placeholder.src = "../img/sample.png";

// Cache
const cCanvas = document.createElement("canvas");
cCanvas.width = cCanvas.height = CACHE_SIZE;
const cCtx = cCanvas.getContext("2d");

/// Image loader
placeholder.onerror = (e) => {
  console.error("error", e);
  $preview.classList.add("error");
  $("#uploadError").innerText = "Could not upload image";
  $preview.src = cCanvas.toDataURL();
};

// Used a resized version of the uploaded image for better performance
placeholder.onload = (e) => {
  const ratio = placeholder.naturalHeight / placeholder.naturalWidth;
  g.h = SIZE * ratio;

  cCanvas.width = CACHE_SIZE;
  cCanvas.height = CACHE_SIZE * ratio;
  cCtx.clearRect(0, 0, cCanvas.width, cCanvas.height);
  cCtx.drawImage(placeholder, 0, 0, cCanvas.width, cCanvas.height);

  if (!$preview.external) URL.revokeObjectURL(placeholder.src);
  $preview.src = cCanvas.toDataURL();
};

/** Remove partially transparent & #00ff00 (bg color) green pixels */
function optimizeFrameColors(data) {
  for (let i = 0; i < data.length; i += 4) {
    // clamp greens to avoid pure greens from turning transparent
    data[i + 1] = data[i + 1] > 250 ? 250 : data[i + 1];
    // clamp transparency
    data[i + 3] = data[i + 3] > 127 ? 255 : 0;
  }
}

/** Render gif */
function render(sprite, character, frames, size, delay) {
  // canvas used to render the frames for the gif
  const renderCanvas = document.createElement("canvas");
  const renderCtx = renderCanvas.getContext("2d");

  // canvas used to optimize the GIF colors
  const tempCanvas = document.createElement("canvas");
  const tempCtx = tempCanvas.getContext("2d");
  renderCanvas.width = renderCanvas.height = tempCanvas.width = tempCanvas.height = size;

  // Free object URL
  URL.revokeObjectURL($result.src);
  let startTime = null;

  // Renderer
  const gif = new GIF({
    workers: 2,
    workerScript: "../gif.worker.js",
    width: size,
    height: size,
    transparent: 0x00ff00,
  });

  gif.on("start", () => {
    startTime = window.performance.now();
  });

  gif.on("progress", (p) => {
    $info.innerText = Math.round(p * 100) + "%";
  });

  gif.on("finished", (blob) => {
    const timeTaken = ((window.performance.now() - startTime) / 1000).toFixed(2);
    const fileSize = (blob.size / 1000).toFixed(2);
    $info.innerText = `100%, ${timeTaken}secs, ${fileSize}kb`;
    $result.src = URL.createObjectURL(blob);
  });

  frames.forEach((frameData, frame) => {
    // clear canvases
    tempCtx.clearRect(0, 0, size, size);
    renderCtx.fillStyle = "#0f0";
    renderCtx.fillRect(0, 0, renderCanvas.width, renderCanvas.height);

    // draw frame
    tempCtx.drawImage(character, frameData.x, frameData.y, frameData.w, frameData.h);
    tempCtx.drawImage(sprite, frame * size, 0, size, size, 0, 0, size, size);

    // fix transparency
    const imgData = tempCtx.getImageData(0, 0, renderCanvas.width, renderCanvas.height);
    optimizeFrameColors(imgData.data);
    tempCtx.putImageData(imgData, 0, 0);

    // add frame to gif
    renderCtx.drawImage(tempCanvas, 0, 0);
    gif.addFrame(renderCtx, { copy: true, delay: delay });
  });

  gif.render();
}

/** Get current frame */
const getFrame = (i) =>
  [
    {
      x: g.x,
      y: g.y,
      w: g.w * g.scale,
      h: g.h * g.scale,
    },
    {
      x: g.x - 4,
      y: g.y + 12,
      w: g.w * g.scale + 4,
      h: g.h * g.scale - 12,
    },
    {
      x: g.x - 12,
      y: g.y + 18,
      w: g.w * g.scale + 12,
      h: g.h * g.scale - 18,
    },
    {
      x: g.x - 12,
      y: g.y + 12,
      w: g.w * g.scale + 4,
      h: g.h * g.scale - 12,
    },
    {
      x: g.x - 4,
      y: g.y,
      w: g.w * g.scale,
      h: g.h * g.scale,
    },
  ][i];

/** Clamp frame number so that it doesn't go below 0 or above the total */
function frameClamp(num) {
  return num <= 0 ? 0 : num > FRAMES - 1 ? 0 : num;
}

/** Animate frame */
function anim() {
  g.frame = frameClamp(g.frame);
  const frameData = getFrame(g.frame);

  ctx.clearRect(0, 0, SIZE, SIZE);
  ctx.drawImage($preview, frameData.x, frameData.y, frameData.w, frameData.h);
  ctx.drawImage(sprite, g.frame * SIZE, 0, SIZE, SIZE, 0, 0, SIZE, SIZE);
}

/** Play animation */
function play() {
  if (!loop) {
    loop = requestInterval(() => {
      anim();
      g.frame += 1;
    }, g.delay);
  }
}

/** Stop animation */
function stop() {
  loop = clearRequestInterval(loop);
  anim();
}

/** Seek animation */
function seek(amount) {
  if (loop) stop();
  g.frame = frameClamp(g.frame + amount);
  anim();
}

window.addEventListener("DOMContentLoaded", () => {
  // Events
  // store last clicked target to help with canvas
  document.addEventListener("click", (e) => {
    lastClick = e.target;
  });

  /** Change image position with arrow keys */
  document.addEventListener("keydown", (e) => {
    if (lastClick === canvas && !e.defaultPrevented) {
      switch (e.key) {
        case "Left":
        case "ArrowLeft":
          g.x -= 1;
          break;
        case "Up":
        case "ArrowUp":
          g.y -= 1;
          break;
        case "Right":
        case "ArrowRight":
          g.x += 1;
          break;
        case "Down":
        case "ArrowDown":
          g.y += 1;
          break;
        default:
          return;
      }
      e.preventDefault();
      anim();
    }
  });

  /** Local file upload handler */
  $("#uploadFile").addEventListener("change", (e) => {
    $preview.classList.remove("error");
    $("#uploadError").innerText = "";
    placeholder.src = URL.createObjectURL(e.target.files[0]);
  });

  // URL upload handler
  // $("#uploadUrlBtn").addEventListener("click", (e) => {
  //  $("#uploadError").innerText = "";
  //  $preview.src = $urlUpload.value;
  // });

  /** Play button */
  $("#play").addEventListener("click", (e) => {
    if (e.target.paused) {
      e.target.paused = undefined;
      e.target.innerText = "⏸";
      play();
    } else {
      e.target.paused = true;
      e.target.innerText = "▶";
      stop();
    }
  });

  /** Seek buttons */
  $$("#prev, #next").forEach((el) => {
    el.addEventListener("click", (e) => {
      seek(e.target.id == "prev" ? -1 : 1);
    });
  });

  /** FPS Change */
  $("#fps").addEventListener("change", (e) => {
    g.delay = parseInt(1000 / parseInt(e.target.value));
    if (loop) {
      loop = clearRequestInterval(loop);
      play();
    }
  });

  /** Scale change */
  ["input", "change"].forEach((event) => {
    $("#scale").addEventListener(event, (e) => {
      g.scale = parseInt(e.target.value) / 100;
      anim();
    });
  });

  /** Export button */
  $("#export").addEventListener("click", () => {
    render(sprite, $preview, [0, 1, 2, 3, 4].map(getFrame), SIZE, g.delay);
  });

  // Play animation when all images, etc on the page load
  window.addEventListener("load", play);
});

// do whatever u want with the code
// show me on twitter.com/stvpvd if u do something cool with it tho
