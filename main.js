////// ////// /////// ////// ////// ///////
//  // //       //    //  // //       //             //////
/////  /////    //    /////  /////    //    //   //     //
//     //       //    //     //       //    // //   //
//     //////   //    //     //////   //     //    //////

"use strict";
/* global GIF, requestInterval, clearRequestInterval */
// Global constants
const MAX_FRAME = 4;
const OUT_SIZE = 112;
const CACHE_SIZE = 256;
const DEFAULTS = Object.freeze({
  squish: 1.25,
  scale: 0.875,
  delay: 60,
  spriteX: 14,
  spriteY: 20,
  spriteWidth: 112,
  spriteHeight: 112,
  currentFrame: 0,
  flip: false,
});

const CANVAS_OPTIONS = Object.freeze({
  antialias: false,
  powerPreference: "low-power",
});

const GIF_RENDERER_OPTIONS = Object.freeze({
  workers: 2,
  workerScript: "gif.worker.js",
  width: OUT_SIZE,
  height: OUT_SIZE,
  transparent: 0x00ff00,
});

// global variables
const g = { ...DEFAULTS };

(() => {
  // utils
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selectors) => document.querySelectorAll(selectors);
  const clamp = (num, min, max) => (num < min ? min : num > max ? max : num);
  const truncateStr = (str, len) =>
    str.length < len
      ? str
      : `${str.substr(0, ~~(len / 2))}⋯${str.substr(str.length - ~~(len / 2), str.length)}`;

  /**
   * Loads and scales an image to a set size to improve performance
   * @param {(data: string) => void} load
   * @param {(error: Event | string, data: string) => void} error
   */
  const ImageLoader = (load, error) => {
    const cacheCanvas = document.createElement("canvas");
    const cacheCtx = cacheCanvas.getContext("2d");
    cacheCanvas.width = cacheCanvas.height = CACHE_SIZE;

    let dataURLCache = "";
    const image = new Image();
    // Allow loading external images into the canvas
    image.crossOrigin = "Anonymous";

    // scale image and convert to base64 on load. *probably* helps with performance
    image.onload = () => {
      cacheCanvas.height = CACHE_SIZE * (image.naturalHeight / image.naturalWidth);
      cacheCtx.clearRect(0, 0, cacheCanvas.width, cacheCanvas.height);
      cacheCtx.drawImage(image, 0, 0, cacheCanvas.width, cacheCanvas.height);
      dataURLCache = cacheCanvas.toDataURL();
      load(dataURLCache);
    };

    image.addEventListener("error", (e) => error(e, dataURLCache));

    return {
      /**
       * Load image from URL
       * @param {string} src
       */
      loadImage: (src) => {
        URL.revokeObjectURL(image.src);
        image.src = src;
      },
    };
  };

  /** Animation loop */
  let loop = null;
  // let ticker = null;

  /**
   * Animation handler
   * @param {HTMLCanvasElement} canvas
   * @param {HTMLImageElement} hand
   * @param {HTMLImageElement} sprite
   */
  const PetPetAnimation = (canvas, hand, sprite) => {
    let allowAdjust = false;
    const ctx = canvas.getContext("2d", CANVAS_OPTIONS);
    ctx.imageSmoothingEnabled = false;
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#ff0000";

    /// SPRITE
    /** Refresh sprite dimensions to match the original images proportions */
    const refreshSprite = () => {
      g.spriteHeight = g.spriteWidth * (sprite.naturalHeight / sprite.naturalWidth);
    };

    // Automatically refresh dimensions when the sprite image changes
    sprite.addEventListener("load", refreshSprite);

    /// ANIMATION
    /** Frame offset values */
    const frameOffsets = [
      { x: 0, y: 0, w: 0, h: 0 },
      { x: -4, y: 12, w: 4, h: -12 },
      { x: -12, y: 18, w: 12, h: -18 },
      { x: -8, y: 12, w: 4, h: -12 },
      { x: -4, y: 0, w: 0, h: 0 },
    ];

    /**
     * Get the sprite's positioning for a frame
     * @param {number} frame
     */
    const getSpriteFrame = (frame) => {
      const offset = frameOffsets[frame];
      return {
        dx: ~~(g.spriteX + offset.x * (g.squish * 0.4)),
        dy: ~~(g.spriteY + offset.y * (g.squish * 0.9)),
        dw: ~~((g.spriteWidth + offset.w * g.squish) * g.scale),
        dh: ~~((g.spriteHeight + offset.h * g.squish) * g.scale),
      };
    };

    /** Render animation frame */
    const renderFrame = (_frame, _ctx, _adjust) => {
      const cf = getSpriteFrame(_frame);

      // reset canvas
      if (_ctx.globalAlpha !== 1) _ctx.globalAlpha = 1;
      _ctx.clearRect(0, 0, OUT_SIZE, OUT_SIZE);

      // flipping the sprite is super annoying. first we translate canvas to where the sprite will
      // be which allows us to draw the hand sprite (and the outline for adjust mode) at (0,0). then
      // we flip the whole canvas and draw what ever we need to draw flipped, and then finally reset
      // the scale/translation and draw the hand
      _ctx.save();
      _ctx.translate(cf.dx, cf.dy);

      if (g.flip) {
        _ctx.scale(-1, 1);
        cf.dw *= -1; // invert the width or the sprite gets drawn off canvas
      }

      // draw sprite and outline
      _ctx.drawImage(sprite, 0, 0, cf.dw, cf.dh);
      if (_adjust) _ctx.strokeRect(0, 0, cf.dw, cf.dh);
      _ctx.restore();

      // draw hand
      if (_adjust) _ctx.globalAlpha = 0.75;
      _ctx.drawImage(
        hand,
        _frame * OUT_SIZE, //sx
        0, //sy
        OUT_SIZE, //sw
        OUT_SIZE, //sh
        0, //dx
        // don't ask where these numbers are from they just work....
        Math.max(0, ~~(cf.dy * 0.75 - Math.max(0, g.spriteY) - 0.5)), //dy
        OUT_SIZE, //dw
        OUT_SIZE //dh
      );
    };

    /** Render frame with request anim frame */
    const tick = () => {
      requestAnimationFrame(() => {
        renderFrame(g.currentFrame, ctx, allowAdjust);
      });
    };

    /** Animation loop */
    const play = () => {
      if (!loop) {
        loop = requestInterval(() => {
          renderFrame(g.currentFrame, ctx, allowAdjust);
          g.currentFrame = (g.currentFrame + 1) % 5;
        }, g.delay);
      }
    };

    /** Stop animation */
    const stop = () => {
      if (loop) {
        loop = clearRequestInterval(loop);
      }
      tick();
    };

    /** Seek to relative frame */
    const seek = (amount) => {
      stop();
      const newFrame = (g.currentFrame + amount) % 5;
      g.currentFrame = newFrame < 0 ? MAX_FRAME : newFrame;
      tick();
    };

    /// ADJUST SPRITE
    let offsetX = 0;
    let offsetY = 0;
    let offsetScale = 1;
    let startX = 1;
    let startY = 1;
    let dragging = false;

    /**
     * Check if mouse position is within the bounds of the sprite
     * @param {number} frame
     * @param {number} posX
     * @param {number} posY
     */
    const inSpriteBounds = (frame, posX, posY) => {
      const offset = getSpriteFrame(frame);
      const left = offset.dx;
      const right = offset.dx + offset.dw;
      const top = offset.dy;
      const bottom = offset.dy + offset.dh;
      return posX > left && posX < right && posY > top && posY < bottom;
    };

    /** Find where the canvas is right now */
    const updateRelativeOffset = () => {
      if (!allowAdjust) return;
      const bounds = canvas.getBoundingClientRect();
      offsetX = bounds.left;
      offsetY = bounds.top;
      offsetScale = OUT_SIZE / bounds.width;
    };

    /** Toggle adjust mode */
    const toggleAdjust = (force) => {
      allowAdjust = force !== undefined ? force : !allowAdjust;
      if (allowAdjust === true) {
        g.currentFrame = 0;
        stop();
      }
      updateRelativeOffset();
      tick();
    };

    // Update offsets on scroll or resize
    window.addEventListener("scroll", updateRelativeOffset);
    window.addEventListener("resize", updateRelativeOffset);
    canvas.addEventListener("resize", updateRelativeOffset);

    // Start drag
    canvas.addEventListener("pointerdown", (e) => {
      if (!allowAdjust) return;
      e.preventDefault();
      e.stopPropagation();

      // Since the canvas is being scaled on the page, get the scale of it so we can normalize the
      // positions to match the original size of the canvas
      startX = ~~((e.clientX - offsetX) * offsetScale);
      startY = ~~((e.clientY - offsetY) * offsetScale);

      // Check if we are clicking the character
      dragging = inSpriteBounds(g.currentFrame, startX, startY);
    });

    // Move on drag
    canvas.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      e.preventDefault();
      e.stopPropagation();

      // Get mouse pos
      const mouseX = ~~((e.clientX - offsetX) * offsetScale);
      const mouseY = ~~((e.clientY - offsetY) * offsetScale);

      // Get amount moved
      g.spriteX += mouseX - startX;
      g.spriteY += mouseY - startY;

      tick();

      startX = mouseX;
      startY = mouseY;
    });

    // Stop drag
    ["pointerup", "pointerout"].forEach((event) => {
      canvas.addEventListener(event, (e) => {
        if (!dragging) return;
        e.preventDefault();
        e.stopPropagation();
        dragging = false;
      });
    });

    /// KEYBOARD ADJUST
    let lastClick = null;

    // Store last clicked element so we know to handle keyboard events only when the canvas is
    // focused
    document.addEventListener("click", (e) => (lastClick = e.target));

    // Change image position with arrow keys
    document.addEventListener("keydown", (e) => {
      if (lastClick === canvas && !e.defaultPrevented) {
        switch (e.key) {
          case "Left":
          case "ArrowLeft":
            g.spriteX -= 1;
            break;
          case "Up":
          case "ArrowUp":
            g.spriteY -= 1;
            break;
          case "Right":
          case "ArrowRight":
            g.spriteX += 1;
            break;
          case "Down":
          case "ArrowDown":
            g.spriteY += 1;
            break;
          default:
            return;
        }
        e.preventDefault();
        tick();
      }
    });

    return {
      tick,
      play,
      stop,
      seek,
      renderFrame,
      toggleAdjust,
      refreshSprite,
    };
  };

  /**
   * Gif renderer
   * @param {PetPetAnimation} animation
   * @param {(startTime: number) => void} start
   * @param {(progress: number) => void} progress
   * @param {(blob: Blob, endTime: number) => void} finish
   */
  const GifRenderer = (animation, start, progress, finish) => {
    const renderCanvas = document.createElement("canvas");
    const renderCtx = renderCanvas.getContext("2d", CANVAS_OPTIONS);
    const tempCanvas = document.createElement("canvas");
    const tempCtx = tempCanvas.getContext("2d", CANVAS_OPTIONS);
    renderCanvas.width = renderCanvas.width = tempCanvas.width = tempCanvas.height = OUT_SIZE;
    renderCtx.fillStyle = "#0f0";

    /**
     * Replace transparent pixels with green since gif.js doesn't dither transparency
     * @param {Uint8ClampedArray} data
     */
    const optimizeFrameColors = (data) => {
      for (let i = 0; i < data.length; i += 4) {
        // clamp greens to avoid pure greens in the image from turning transparent
        // basically a hack and it's not really noticeable and it works
        data[i + 1] = data[i + 1] > 250 ? 250 : data[i + 1];

        // Set transparent pixels to green
        if (data[i + 3] < 120) {
          data[i + 0] = 0;
          data[i + 1] = 255;
          data[i + 2] = 0;
        }

        // No more transparent pixels
        data[i + 3] = 255;
      }
    };

    return {
      /** Render gif */
      render() {
        const gif = new GIF(GIF_RENDERER_OPTIONS);
        const frameDelay = clamp(g.delay, 20, 1000);

        // draw frames
        for (let i = 0; i <= MAX_FRAME; i++) {
          // render frame on tempCtx
          animation.renderFrame(i, tempCtx, false);

          // fix transparency
          const imgData = tempCtx.getImageData(0, 0, OUT_SIZE, OUT_SIZE);
          optimizeFrameColors(imgData.data);

          renderCtx.putImageData(imgData, 0, 0);
          gif.addFrame(renderCtx, { copy: true, delay: frameDelay });
        }

        gif.on("start", () => start(window.performance.now()));
        gif.on("progress", (p) => progress(p));
        gif.on("finished", (blob) => finish(blob, window.performance.now()));
        gif.render();
      },
    };
  };

  window.addEventListener("DOMContentLoaded", () => {
    const $canvas = $("#canvas");
    const $preview = $("#uploadPreview");
    const $hand = new Image();
    $hand.crossOrigin = "Anonymous";
    const animation = PetPetAnimation($canvas, $hand, $preview);
    const imageLoader = ImageLoader(
      /** Image load listener */
      (data) => {
        $preview.src = data;
        animation.tick();
      },
      /** Image error listener */
      (e) => {
        console.error("Error loading image", e);
        $preview.classList.add("error");
        $("#uploadError").innerText = "could not load the image!";
      }
    );

    /** Reset transformations */
    const reset = () => {
      // Reset animation
      Object.assign(g, DEFAULTS);
      animation.refreshSprite();
      if (loop) {
        loop = clearRequestInterval(loop);
        animation.play();
      } else {
        animation.tick();
      }

      // Reset inputs
      $("#squish").value = ~~(DEFAULTS.squish * 100);
      $("#scale").value = DEFAULTS.scale * 100;
      $("#fps").value = $("#fpsVal").value = ~~(1000 / DEFAULTS.delay);
      $("#toggleFlip").checked = false;
    };

    /** Reset to default values */
    $("#reset").addEventListener("click", reset);

    /// File upload
    const dropArea = $("#dropArea");
    const fileUpload = $("#uploadFile");
    const fileUploadName = $("#uploadFileName");

    const handleFiles = (file) => {
      $("#uploadError").innerText = "";
      fileUploadName.title = file.name;
      fileUploadName.innerText = truncateStr(file.name, 20);
      $preview.classList.remove("error");
      imageLoader.loadImage(URL.createObjectURL(file));
    };

    // File drop-area events
    ["dragenter", "dragover", "dragleave", "drop"].forEach((ev) => {
      dropArea.addEventListener(ev, (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
    });
    ["dragenter", "dragover"].forEach((ev) => {
      dropArea.addEventListener(ev, () => {
        dropArea.classList.add("highlight");
      });
    });
    ["dragleave", "drop"].forEach((ev) => {
      dropArea.addEventListener(ev, () => {
        dropArea.classList.remove("highlight");
      });
    });
    dropArea.addEventListener("drop", (e) => {
      const file = e.dataTransfer.files[0];
      if (!file || !file.type.startsWith("image/")) return;
      handleFiles(file);
    });
    fileUpload.addEventListener("change", () => {
      if (!fileUpload.files[0]) return;
      handleFiles(fileUpload.files[0]);
    });

    // URL upload handler
    $("#uploadUrlBtn").addEventListener("click", () => {
      const url = $("#uploadUrl").value;
      if (url === "") return;
      $("#uploadError").innerText = "";
      $preview.classList.remove("error");
      imageLoader.loadImage(url);
    });

    /// Playback controls
    // Play/pause button
    const $playButton = $("#play");
    const playPauseButton = (stop = false) => {
      if (stop || !$playButton.classList.contains("paused")) {
        animation.stop();
        $playButton.classList.add("paused");
      } else {
        animation.play();
        $playButton.classList.remove("paused");
      }
    };

    $playButton.addEventListener("click", () => playPauseButton());

    // Prev/next buttons
    $$("#prev, #next").forEach((el) => {
      el.addEventListener("click", (e) => {
        playPauseButton(true);
        animation.seek(e.target.id === "prev" ? -1 : 1);
      });
    });

    /// Customizations
    ["input", "change"].forEach((event) => {
      // Change squishiness
      $("#squish").addEventListener(
        event,
        (e) => {
          const newSquish = (clamp(parseInt(e.target.value), 100, 300) / 100).toFixed(3);
          if (g.squish !== newSquish) {
            g.squish = newSquish;
            animation.tick();
          }
        },
        { passive: true, capture: true }
      );

      // Change size
      $("#scale").addEventListener(
        event,
        (e) => {
          const newScale = (clamp(parseInt(e.target.value), 20, 200) / 100).toFixed(3);
          if (g.scale !== newScale) {
            g.scale = newScale;
            animation.tick();
          }
        },
        { passive: true, capture: true }
      );
    });

    // Change speed
    $$("#fps, #fpsVal").forEach((el) =>
      el.addEventListener("change", (e) => {
        // Round fps to nearest 10. This makes it *closer* to the actual gif output but not really
        // const newDelay = ~~(~~(1000 / clamp(parseInt(e.target.value), 2, 50) / 10) * 10);
        const newDelay = ~~(1000 / clamp(parseInt(e.target.value), 2, 60));

        // Restart animation loop with new delay, if it changed
        if (newDelay !== g.delay) {
          g.delay = newDelay;
          if (loop) {
            loop = clearRequestInterval(loop);
            animation.play();
          }
        }
      })
    );

    // update input to match slider and vice versa
    $("#fps").addEventListener("input", (e) => {
      $("#fpsVal").value = e.target.value;
    });
    $("#fpsVal").addEventListener("input", (e) => {
      $("#fps").value = e.target.value;
    });

    // flip sprite
    $("#toggleFlip").addEventListener("change", (e) => {
      g.flip = e.target.checked;
      animation.tick();
    });

    /// Adjust mode
    $("#toggleAdjust").addEventListener("click", (e) => {
      $canvas.classList.toggle("adjust-mode", e.target.checked);
      if (e.target.checked) {
        playPauseButton(true);
      }
      animation.toggleAdjust();
    });

    /// Gif export
    let btnTxt = "";
    let gifTime = 0;
    const $renderResult = $("#result");
    const $renderInfo = $("#info");
    const $exportBtn = $("#export");
    const renderer = GifRenderer(
      animation,
      /** Gif renderer start */
      (startTime) => {
        gifTime = startTime;
        URL.revokeObjectURL($renderResult.src);
        $exportBtn.disabled = true;
        btnTxt = $exportBtn.innerText;
      },
      /** Gif renderer progress */
      (progress) => {
        const p = `${Math.round(progress * 100)}%`;
        $exportBtn.innerText = p;
        $renderInfo.innerText = p;
      },
      /** Gif renderer finish */
      (blob, endTime) => {
        const timeTaken = ((endTime - gifTime) / 1000).toFixed(2);
        const fileSize = (blob.size / 1000).toFixed(2);
        $renderInfo.innerText = `100%, ${timeTaken}secs, ${fileSize}kb`;
        $exportBtn.innerText = btnTxt;
        $exportBtn.disabled = false;
        $renderResult.src = URL.createObjectURL(blob);
      }
    );

    $exportBtn.addEventListener("click", () => renderer.render());

    // Load sprites
    $hand.src = "./img/sprite.png";
    imageLoader.loadImage("./img/sample.png");

    // Play animation once everything loads
    window.addEventListener("load", () => animation.play());

    // Exposing these to the console so you can mess around with the global variables and break
    // stuff you want :)
    window.petpet = {
      // You can change the sprite of the hand using the console. Download a copy of the sprite
      // sheet (./img/sprite.png) and edit it, just make sure you dont change the size or positions
      // of the hands or it will mess up. Then you can just upload the new sprite sheet somewhere
      // (imgur works) and in the console do `petpet.$hand.src = "<url>"`
      $hand,
      reset,
      renderer,
      DEFAULTS,
      animation,
      imageLoader,
    };
  });
})();
