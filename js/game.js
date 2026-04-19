(() => {
  "use strict";

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas ? canvas.getContext("2d") : null;

  if (!canvas || !ctx) {
    return;
  }

  const ui = {
    mission: document.getElementById("missionText"),
    status: document.getElementById("statusText"),
    intro: document.getElementById("introOverlay")
  };

  const CONFIG = {
    gravity: 2100,
    playerSpeed: 270,
    jumpVelocity: 780,
    interactionRange: 86,
    tileSize: 48,
    tileRemoveDuration: 0.7,
    timeScale: 10,
    guardIntervalGameSec: 5 * 60,
    guardDurationGameSec: 30,
    guardWarningGameSec: 25,
    guardInspectStepGameSec: 6,
    dayIntervalGameSec: 1800,
    dailyIncome: 10,
    vendingCost: 25,
    trainingDuration: 2.4,
    fightingDuration: 1.25,
    diggingActionDuration: 0.25,
    tunnelTarget: 100,
    worldWidth: 80 * 48,
    worldHeight: canvas.height
  };

  const TOOL_DATA = [
    { level: 0, name: "Ekipman Yok", digPower: 0, baseCost: 0, reqStrength: 0 },
    { level: 1, name: "Basit Kaşık", digPower: 1.1, baseCost: 0, reqStrength: 0 },
    { level: 2, name: "Geliştirilmiş Kazma", digPower: 2.3, baseCost: 70, reqStrength: 6 },
    { level: 3, name: "Profesyonel Kazma", digPower: 4.4, baseCost: 185, reqStrength: 14 }
  ];

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function intersects(a, b) {
    return (
      a.x < b.x + b.width &&
      a.x + a.width > b.x &&
      a.y < b.y + b.height &&
      a.y + a.height > b.y
    );
  }

  function noise2d(x, y) {
    const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return value - Math.floor(value);
  }

  function drawRoundedRect(context, x, y, width, height, radius) {
    const r = Math.min(radius, width * 0.5, height * 0.5);
    context.beginPath();
    context.moveTo(x + r, y);
    context.lineTo(x + width - r, y);
    context.quadraticCurveTo(x + width, y, x + width, y + r);
    context.lineTo(x + width, y + height - r);
    context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    context.lineTo(x + r, y + height);
    context.quadraticCurveTo(x, y + height, x, y + height - r);
    context.lineTo(x, y + r);
    context.quadraticCurveTo(x, y, x + r, y);
    context.closePath();
  }

  class InputManager {
    constructor() {
      this.keys = new Set();
      this.jumpQueued = false;
      this.interactQueued = false;
      this.pickupQueued = false;
      this.digQueued = false;
      this.attackQueued = false;
      this.startQueued = false;
      this.registerEvents();
    }

    registerEvents() {
      const gameKeys = new Set([
        "KeyA",
        "KeyD",
        "ArrowLeft",
        "ArrowRight",
        "Space",
        "KeyQ",
        "KeyE",
        "KeyW",
        "KeyR",
        "Enter"
      ]);

      window.addEventListener("keydown", (event) => {
        if (gameKeys.has(event.code)) {
          event.preventDefault();
        }

        this.keys.add(event.code);

        if (event.repeat) {
          return;
        }

        if (event.code === "Space") {
          this.jumpQueued = true;
        }

        if (event.code === "KeyQ") {
          this.interactQueued = true;
        }

        if (event.code === "KeyE") {
          this.pickupQueued = true;
        }

        if (event.code === "KeyW") {
          this.digQueued = true;
        }

        if (event.code === "KeyR") {
          this.attackQueued = true;
        }

        if (event.code === "Enter") {
          this.startQueued = true;
        }
      });

      window.addEventListener("keyup", (event) => {
        this.keys.delete(event.code);
      });

      window.addEventListener("blur", () => {
        this.keys.clear();
        this.jumpQueued = false;
        this.interactQueued = false;
        this.pickupQueued = false;
        this.digQueued = false;
        this.attackQueued = false;
      });
    }

    horizontalAxis() {
      const left = this.keys.has("KeyA") || this.keys.has("ArrowLeft");
      const right = this.keys.has("KeyD") || this.keys.has("ArrowRight");

      if (left === right) {
        return 0;
      }

      return left ? -1 : 1;
    }

    consumeJump() {
      const pressed = this.jumpQueued;
      this.jumpQueued = false;
      return pressed;
    }

    consumeInteract() {
      const pressed = this.interactQueued;
      this.interactQueued = false;
      return pressed;
    }

    consumePickup() {
      const pressed = this.pickupQueued;
      this.pickupQueued = false;
      return pressed;
    }

    consumeDig() {
      const pressed = this.digQueued;
      this.digQueued = false;
      return pressed;
    }

    consumeAttack() {
      const pressed = this.attackQueued;
      this.attackQueued = false;
      return pressed;
    }

    consumeStart() {
      const pressed = this.startQueued;
      this.startQueued = false;
      return pressed;
    }
  }

  class Player {
    constructor(x, y) {
      this.x = x;
      this.y = y;
      this.width = 40;
      this.height = 80;
      this.vx = 0;
      this.vy = 0;
      this.onGround = false;
      this.facing = 1;
      this.hasSpoon = false;
    }

    get centerX() {
      return this.x + this.width * 0.5;
    }

    get centerY() {
      return this.y + this.height * 0.5;
    }

    get bottom() {
      return this.y + this.height;
    }

    toRect() {
      return {
        x: this.x,
        y: this.y,
        width: this.width,
        height: this.height
      };
    }

    update(dt, input, collisionRects) {
      const moveDir = input.horizontalAxis();
      this.vx = moveDir * CONFIG.playerSpeed;

      if (moveDir !== 0) {
        this.facing = moveDir;
      }

      if (this.onGround && input.consumeJump()) {
        this.vy = -CONFIG.jumpVelocity;
        this.onGround = false;
      }

      this.vy += CONFIG.gravity * dt;
      this.vy = Math.min(this.vy, 1500);

      this.moveHorizontally(dt, collisionRects);
      this.moveVertically(dt, collisionRects);
    }

    moveHorizontally(dt, collisionRects) {
      this.x += this.vx * dt;

      const playerRect = this.toRect();

      for (const rect of collisionRects) {
        if (!intersects(playerRect, rect)) {
          continue;
        }

        if (this.vx > 0) {
          this.x = rect.x - this.width;
        } else if (this.vx < 0) {
          this.x = rect.x + rect.width;
        }

        playerRect.x = this.x;
      }
    }

    moveVertically(dt, collisionRects) {
      this.y += this.vy * dt;
      this.onGround = false;

      const playerRect = this.toRect();

      for (const rect of collisionRects) {
        if (!intersects(playerRect, rect)) {
          continue;
        }

        if (this.vy > 0) {
          this.y = rect.y - this.height;
          this.vy = 0;
          this.onGround = true;
        } else if (this.vy < 0) {
          this.y = rect.y + rect.height;
          this.vy = 0;
        }

        playerRect.y = this.y;
      }

      if (this.y > CONFIG.worldHeight) {
        this.y = CONFIG.worldHeight - this.height;
        this.vy = 0;
        this.onGround = true;
      }
    }

    draw(context, cameraX, elapsed, playerX = this.x, playerY = this.y) {
      const x = playerX - cameraX;
      const y = playerY - 5;

      const groundShadowAlpha = 0.14 + (Math.sin(elapsed * 8) + 1) * 0.02;
      context.fillStyle = `rgba(0, 0, 0, ${groundShadowAlpha.toFixed(3)})`;
      context.beginPath();
      context.ellipse(x + 20, playerY + this.height + 3, 17, 6, 0, 0, Math.PI * 2);
      context.fill();

      // Kafa
      context.fillStyle = "#f1c27d";
      context.beginPath();
      context.arc(x + 20, y - 10, 12, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = "#d7a66c";
      context.lineWidth = 1.2;
      context.stroke();

      // Gozler
      context.fillStyle = "black";
      context.fillRect(x + 15, y - 15, 3, 3);
      context.fillRect(x + 22, y - 15, 3, 3);

      // Agiz
      context.strokeStyle = "#5a2a20";
      context.lineWidth = 1.6;
      context.beginPath();
      context.moveTo(x + 16, y - 8);
      context.quadraticCurveTo(x + 20, y - 5, x + 24, y - 8);
      context.stroke();
      context.lineWidth = 1;

      // Govde
      context.fillStyle = "red";
      context.fillRect(x, y, 40, 50);

      // Kollar
      context.fillStyle = "#f1c27d";
      context.fillRect(x - 5, y + 5, 5, 30);
      context.fillRect(x + 40, y + 5, 5, 30);

      // Bacaklar
      context.fillStyle = "blue";
      context.fillRect(x + 5, y + 50, 10, 30);
      context.fillRect(x + 25, y + 50, 10, 30);

      // Ayaklar
      context.fillStyle = "black";
      context.fillRect(x + 3, y + 80, 12, 5);
      context.fillRect(x + 23, y + 80, 12, 5);
    }
  }

  class StoneTile {
    constructor(x, y, size, kind = "floor") {
      this.x = x;
      this.y = y;
      this.size = size;
      this.kind = kind;
    }

    toRect() {
      return {
        x: this.x,
        y: this.y,
        width: this.size,
        height: this.size
      };
    }

    draw(context, cameraX, elapsed) {
      const sx = this.x - cameraX;
      const sy = this.y;

      let baseColor = "#566780";
      let topGlow = "#93a9c9";

      if (this.kind === "ceiling") {
        baseColor = "#4a5b73";
        topGlow = "#879dbb";
      }

      if (this.kind === "wall") {
        baseColor = "#51637a";
        topGlow = "#90a6c4";
      }

      context.fillStyle = baseColor;
      context.fillRect(sx, sy, this.size, this.size);

      const grit = noise2d(this.x * 0.03, this.y * 0.03);
      const brightAlpha = 0.09 + grit * 0.09;
      const darkAlpha = 0.02 + (1 - grit) * 0.04;
      context.fillStyle = `rgba(212, 224, 242, ${brightAlpha.toFixed(3)})`;
      context.fillRect(sx + 5, sy + 7, this.size * 0.36, this.size * 0.18);
      context.fillStyle = `rgba(29, 38, 52, ${darkAlpha.toFixed(3)})`;
      context.fillRect(sx + this.size * 0.46, sy + this.size * 0.42, this.size * 0.44, this.size * 0.34);

      context.strokeStyle = "rgba(25, 35, 50, 0.45)";
      context.strokeRect(sx + 0.5, sy + 0.5, this.size - 1, this.size - 1);

      context.fillStyle = topGlow;
      context.fillRect(sx + 2, sy + 2, this.size - 4, 5);

      context.strokeStyle = "rgba(24, 32, 45, 0.22)";
      context.beginPath();
      context.moveTo(sx + 5, sy + this.size * 0.58);
      context.lineTo(sx + this.size - 7, sy + this.size * 0.62);
      context.moveTo(sx + this.size * 0.4, sy + 8);
      context.lineTo(sx + this.size * 0.32, sy + this.size - 8);
      context.stroke();

      if (this.kind === "floor") {
        context.strokeStyle = "rgba(26, 35, 50, 0.26)";
        context.beginPath();
        context.moveTo(sx + 3, sy + this.size * 0.5);
        context.lineTo(sx + this.size - 3, sy + this.size * 0.5);
        context.moveTo(sx + this.size * 0.5, sy + 4);
        context.lineTo(sx + this.size * 0.5, sy + this.size - 4);
        context.stroke();

        const crackOffset = 8 + noise2d(this.x * 0.08, this.y * 0.09) * 10;
        context.strokeStyle = "rgba(24, 34, 49, 0.31)";
        context.beginPath();
        context.moveTo(sx + crackOffset, sy + this.size * 0.26);
        context.lineTo(sx + crackOffset - 6, sy + this.size * 0.46);
        context.lineTo(sx + crackOffset + 2, sy + this.size * 0.7);
        context.stroke();

        const puddlePulse = 0.05 + (Math.sin(elapsed * 2.8 + this.x * 0.02) + 1) * 0.03;
        context.fillStyle = `rgba(119, 165, 182, ${puddlePulse.toFixed(3)})`;
        context.fillRect(sx + 10, sy + this.size - 10, this.size - 20, 4);
      }

      if (this.kind === "wall") {
        context.strokeStyle = "rgba(28, 37, 52, 0.34)";
        context.beginPath();
        context.moveTo(sx + this.size * 0.24, sy + 6);
        context.lineTo(sx + this.size * 0.2, sy + this.size - 10);
        context.moveTo(sx + this.size * 0.72, sy + 8);
        context.lineTo(sx + this.size * 0.68, sy + this.size - 7);
        context.stroke();
      }
    }
  }

  class RemovableTile extends StoneTile {
    constructor(id, x, y, size, revealsEscape) {
      super(x, y, size, "floor");
      this.id = id;
      this.revealsEscape = revealsEscape;
      this.type = "tile";
      this.underType = "dirt";
      this.breakState = "idle";
      this.breakProgress = 0;
      this.dirtHealth = 10;
      this.currentDirtHealth = this.dirtHealth;
      this.digPulse = 0;
      this.toDirtEvent = false;
      this.toEmptyEvent = false;
    }

    isSolid() {
      return this.type !== "empty";
    }

    canBreak() {
      return this.type === "tile" && this.breakState === "idle";
    }

    canDig() {
      return this.type === "dirt";
    }

    beginBreak() {
      if (!this.canBreak()) {
        return false;
      }

      this.breakState = "breaking";
      this.breakProgress = 0;
      return true;
    }

    dig(power = 1) {
      if (!this.canDig()) {
        return "invalid";
      }

      this.currentDirtHealth -= power;
      this.digPulse = 0.3;

      if (this.currentDirtHealth <= 0) {
        this.currentDirtHealth = 0;
        this.type = "empty";
        this.toEmptyEvent = true;
        return "done";
      }

      return "progress";
    }

    update(dt) {
      if (this.breakState === "breaking") {
        this.breakProgress += dt / CONFIG.tileRemoveDuration;

        if (this.breakProgress >= 1) {
          this.breakProgress = 1;
          this.breakState = "idle";
          this.type = this.underType;
          this.currentDirtHealth = this.dirtHealth;
          this.toDirtEvent = true;
        }
      }

      if (this.digPulse > 0) {
        this.digPulse = Math.max(0, this.digPulse - dt);
      }
    }

    consumeToDirtEvent() {
      const occurred = this.toDirtEvent;
      this.toDirtEvent = false;
      return occurred;
    }

    consumeToEmptyEvent() {
      const occurred = this.toEmptyEvent;
      this.toEmptyEvent = false;
      return occurred;
    }

    getDigProgressRatio() {
      const ratio = 1 - this.currentDirtHealth / this.dirtHealth;
      return clamp(ratio, 0, 1);
    }

    drawStoneTileBody(context, x, y, size, alphaMultiplier = 1) {
      context.save();
      context.globalAlpha *= alphaMultiplier;
      context.fillStyle = "#6982a7";
      context.fillRect(x, y, size, size);

      context.strokeStyle = "rgba(28, 39, 56, 0.5)";
      context.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);

      context.fillStyle = "#aec4e8";
      context.fillRect(x + 2, y + 2, size - 4, 5);

      context.strokeStyle = "rgba(26, 36, 52, 0.44)";
      context.beginPath();
      context.moveTo(x + 8, y + size * 0.35);
      context.lineTo(x + size * 0.52, y + size * 0.6);
      context.lineTo(x + size - 8, y + size * 0.42);
      context.stroke();

      context.restore();
    }

    drawDirtBody(context, x, y, elapsed, preview = false) {
      const dirtGradient = context.createLinearGradient(x, y, x, y + this.size);
      dirtGradient.addColorStop(0, "#876040");
      dirtGradient.addColorStop(0.5, "#6f4f33");
      dirtGradient.addColorStop(1, "#5d4028");
      context.fillStyle = dirtGradient;
      context.fillRect(x, y, this.size, this.size);

      context.fillStyle = "rgba(168, 126, 86, 0.42)";
      context.fillRect(x + 1, y + 1, this.size - 2, 5);
      context.fillStyle = "rgba(48, 30, 18, 0.34)";
      context.fillRect(x + 1, y + this.size - 7, this.size - 2, 6);

      context.strokeStyle = "rgba(66, 43, 27, 0.44)";
      context.beginPath();
      context.moveTo(x + 7, y + this.size * 0.26);
      context.lineTo(x + this.size * 0.43, y + this.size * 0.48);
      context.lineTo(x + this.size - 8, y + this.size * 0.37);
      context.moveTo(x + 9, y + this.size * 0.67);
      context.lineTo(x + this.size - 10, y + this.size * 0.61);
      context.stroke();

      for (let i = 0; i < 7; i += 1) {
        const nx = noise2d(this.x * 0.08 + i * 0.9, this.y * 0.06 + i * 0.3);
        const ny = noise2d(this.x * 0.05 + i * 0.4, this.y * 0.09 + i * 0.6);
        const px = x + 5 + nx * (this.size - 10);
        const py = y + 8 + ny * (this.size - 16);
        context.fillStyle = i % 2 === 0 ? "rgba(132, 98, 65, 0.45)" : "rgba(83, 58, 36, 0.4)";
        context.fillRect(px, py, 2 + (i % 3), 2 + ((i + 1) % 2));
      }

      if (!preview) {
        const progressRatio = this.getDigProgressRatio();
        context.fillStyle = `rgba(55, 34, 20, ${(0.12 + progressRatio * 0.18).toFixed(3)})`;
        context.fillRect(
          x + 5,
          y + this.size * (0.62 - progressRatio * 0.16),
          this.size - 10,
          this.size * (0.28 + progressRatio * 0.16)
        );

        if (this.digPulse > 0) {
          const alpha = this.digPulse * 1.25;
          context.fillStyle = `rgba(198, 164, 122, ${alpha.toFixed(3)})`;
          for (let i = 0; i < 4; i += 1) {
            const dx = Math.sin(elapsed * 9 + i * 1.7) * (4 + i * 2);
            const dy = i * -3;
            context.beginPath();
            context.arc(x + this.size * 0.5 + dx, y + this.size * 0.62 + dy, 2.2 - i * 0.2, 0, Math.PI * 2);
            context.fill();
          }
        }
      }
    }

    drawEmptyBody(context, x, y, elapsed) {
      if (this.revealsEscape) {
        context.fillStyle = "#0b111a";
        context.fillRect(x + 2, y + 2, this.size - 4, this.size - 4);
        context.strokeStyle = "#37567c";
        context.strokeRect(x + 2.5, y + 2.5, this.size - 5, this.size - 5);

        const glow = 0.08 + (Math.sin(elapsed * 4) + 1) * 0.05;
        context.fillStyle = `rgba(141, 213, 193, ${glow.toFixed(3)})`;
        context.fillRect(x + 3, y + 3, this.size - 6, this.size - 6);
      } else {
        context.fillStyle = "#2f2418";
        context.fillRect(x + 4, y + 10, this.size - 8, this.size - 10);
        context.fillStyle = "#5c4129";
        context.fillRect(x + 7, y + 13, this.size - 14, 5);
      }
    }

    draw(context, cameraX, elapsed, highlighted, highlightMode) {
      const sx = this.x - cameraX;
      const sy = this.y;

      if (this.type === "tile" && this.breakState === "breaking") {
        const t = this.breakProgress;
        const scale = 1 - t * 0.38;
        const alpha = 1 - t * 0.62;

        this.drawDirtBody(context, sx, sy, elapsed, true);

        context.save();
        context.translate(sx + this.size * 0.5, sy + this.size * 0.5 + t * 8);
        context.scale(scale, scale);
        this.drawStoneTileBody(context, -this.size * 0.5, -this.size * 0.5, this.size, alpha);
        context.restore();

        context.fillStyle = "rgba(178, 191, 212, 0.42)";
        for (let i = 0; i < 4; i += 1) {
          const angle = elapsed * 5 + i * 1.7;
          const dx = Math.sin(angle) * (6 + i * 2);
          const dy = -t * 15 + i * 4;
          context.beginPath();
          context.arc(sx + this.size * 0.5 + dx, sy + this.size * 0.5 + dy, 2 + i * 0.35, 0, Math.PI * 2);
          context.fill();
        }
      } else if (this.type === "tile") {
        this.drawStoneTileBody(context, sx, sy, this.size, 1);
      } else if (this.type === "dirt") {
        this.drawDirtBody(context, sx, sy, elapsed);
      } else {
        this.drawEmptyBody(context, sx, sy, elapsed);
      }

      if (highlighted) {
        const pulse = 0.35 + (Math.sin(elapsed * 7) + 1) * 0.2;
        const color =
          highlightMode === "dig"
            ? `rgba(139, 221, 191, ${pulse.toFixed(3)})`
            : `rgba(247, 201, 128, ${pulse.toFixed(3)})`;
        context.strokeStyle = color;
        context.lineWidth = 2;
        context.strokeRect(sx + 1.5, sy + 1.5, this.size - 3, this.size - 3);
        context.lineWidth = 1;
      }
    }
  }

  class Level {
    constructor() {
      this.width = CONFIG.worldWidth;
      this.height = CONFIG.worldHeight;
      this.tileSize = CONFIG.tileSize;

      this.upperFloorY = 336;
      this.tunnelCeilingY = 384;
      this.tunnelFloorY = 528;

      this.staticTiles = [];
      this.staticRects = [];
      this.removableTiles = [];
      this.escapeTile = null;
      this.escapeOpened = false;
      this.escapeOpenedEvent = false;
      this.spoonTaken = false;

      this.areaRanges = [
        {
          id: "cell",
          label: "HUCRE",
          startX: 0,
          endX: this.tileSize * 20,
          guardRate: 0.82,
          risk: 0.85
        },
        {
          id: "corridor",
          label: "KORIDOR",
          startX: this.tileSize * 20,
          endX: this.tileSize * 35,
          guardRate: 1.02,
          risk: 1.08
        },
        {
          id: "yard",
          label: "BAHCE",
          startX: this.tileSize * 35,
          endX: this.tileSize * 50,
          guardRate: 1.28,
          risk: 1.35
        },
        {
          id: "cafeteria",
          label: "YEMEKHANE",
          startX: this.tileSize * 50,
          endX: this.tileSize * 66,
          guardRate: 1.48,
          risk: 1.68
        },
        {
          id: "secret",
          label: "GIZLI ALAN",
          startX: this.tileSize * 66,
          endX: this.width,
          guardRate: 1.88,
          risk: 2.06
        }
      ];

      const doorWidth = Math.round(this.tileSize * 0.52);
      const doorHeight = this.upperFloorY + this.tileSize - 188;
      this.areaDoors = [
        {
          id: "cellToCorridor",
          x: this.tileSize * 20 - Math.floor(doorWidth * 0.5),
          y: 188,
          width: doorWidth,
          height: doorHeight,
          from: "cell",
          to: "corridor",
          label: "Hucre Kapisi"
        },
        {
          id: "corridorToYard",
          x: this.tileSize * 35 - Math.floor(doorWidth * 0.5),
          y: 188,
          width: doorWidth,
          height: doorHeight,
          from: "corridor",
          to: "yard",
          label: "Yard Kapisi"
        },
        {
          id: "yardToCafeteria",
          x: this.tileSize * 50 - Math.floor(doorWidth * 0.5),
          y: 188,
          width: doorWidth,
          height: doorHeight,
          from: "yard",
          to: "cafeteria",
          label: "Yemekhane Kapisi"
        },
        {
          id: "cafeteriaToSecret",
          x: this.tileSize * 66 - Math.floor(doorWidth * 0.5),
          y: 188,
          width: doorWidth,
          height: doorHeight,
          from: "cafeteria",
          to: "secret",
          label: "Servis Gecidi"
        }
      ];
      this.cellGateRect = this.areaDoors[0];

      this.bedRect = {
        x: 112,
        y: 280,
        width: 125,
        height: 54
      };
      this.spoonPos = {
        x: this.bedRect.x + 20,
        y: this.bedRect.y + 14
      };
      this.vendingRect = {
        x: this.tileSize * 26,
        y: 252,
        width: 58,
        height: 118
      };
      this.trainingRect = {
        x: this.tileSize * 41,
        y: 272,
        width: 170,
        height: 72
      };

      this.prisoners = {
        cell: [
          {
            id: "riza",
            area: "cell",
            x: this.tileSize * 12,
            y: 278,
            width: 38,
            height: 72,
            name: "Riza",
            role: "weak",
            power: 4.5,
            offerLevel: 2,
            reqStrength: 4,
            priceFactor: 0.84,
            rewardMoney: 14
          }
        ],
        yard: [
          {
            id: "kaya",
            area: "yard",
            x: this.tileSize * 43,
            y: 278,
            width: 38,
            height: 72,
            name: "Kaya",
            role: "mid",
            power: 8.4,
            offerLevel: 2,
            reqStrength: 7,
            priceFactor: 1,
            rewardMoney: 24
          }
        ],
        cafeteria: [
          {
            id: "demir",
            area: "cafeteria",
            x: this.tileSize * 57,
            y: 278,
            width: 38,
            height: 72,
            name: "Demir",
            role: "strong",
            power: 12.2,
            offerLevel: 3,
            reqStrength: 12,
            priceFactor: 1.08,
            rewardMoney: 34
          }
        ],
        secret: [
          {
            id: "golge",
            area: "secret",
            x: this.tileSize * 72,
            y: 278,
            width: 38,
            height: 72,
            name: "Golge",
            role: "rare",
            power: 16.4,
            offerLevel: 3,
            reqStrength: 14,
            priceFactor: 0.94,
            rewardMoney: 46,
            rareReward: "tunnel_map"
          }
        ]
      };
      this.inmateRects = Object.values(this.prisoners).flat();

      this.build();
    }

    build() {
      const t = this.tileSize;
      const removableColumns = [6, 8, 10];
      const escapeColumn = 10;

      for (let col = 1; col <= 78; col += 1) {
        const x = col * t;

        if (col <= 17 && removableColumns.includes(col)) {
          const tile = new RemovableTile(`cell-${col}`, x, this.upperFloorY, t, col === escapeColumn);
          this.removableTiles.push(tile);

          if (col === escapeColumn) {
            this.escapeTile = tile;
          }
        } else {
          this.staticTiles.push(new StoneTile(x, this.upperFloorY, t, "floor"));
        }
      }

      for (let col = 0; col <= 79; col += 1) {
        this.staticTiles.push(new StoneTile(col * t, 96, t, "ceiling"));
      }

      for (let row = 2; row <= 7; row += 1) {
        this.staticTiles.push(new StoneTile(0, row * t, t, "wall"));
      }

      for (let col = 5; col <= 78; col += 1) {
        if (col !== escapeColumn) {
          this.staticTiles.push(new StoneTile(col * t, this.tunnelCeilingY, t, "ceiling"));
        }

        this.staticTiles.push(new StoneTile(col * t, this.tunnelFloorY, t, "floor"));
      }

      for (let row = 8; row <= 11; row += 1) {
        this.staticTiles.push(new StoneTile(79 * t, row * t, t, "wall"));
      }

      this.staticRects = this.staticTiles.map((tile) => tile.toRect());
      this.staticRects.push({ x: -72, y: 0, width: 72, height: this.height });
      this.staticRects.push({ x: this.width, y: 0, width: 72, height: this.height });
    }

    isVisible(worldX, width, cameraX, viewportWidth) {
      return worldX + width > cameraX - 80 && worldX < cameraX + viewportWidth + 80;
    }

    getCollisionRects(lockedDoorIds = []) {
      const activeRemovableRects = [];

      for (const tile of this.removableTiles) {
        if (tile.isSolid()) {
          activeRemovableRects.push(tile.toRect());
        }
      }

      const lockedDoors = this.areaDoors
        .filter((door) => lockedDoorIds.includes(door.id))
        .map((door) => ({
          x: door.x,
          y: door.y,
          width: door.width,
          height: door.height
        }));

      return this.staticRects.concat(activeRemovableRects, lockedDoors);
    }

    getNearbyTileByType(player, type) {
      let closest = null;
      let bestDistance = Number.POSITIVE_INFINITY;

      for (const tile of this.removableTiles) {
        if (tile.type !== type) {
          continue;
        }

        if (type === "tile" && !tile.canBreak()) {
          continue;
        }

        const dx = player.centerX - (tile.x + tile.size * 0.5);
        const dy = player.bottom - (tile.y + tile.size * 0.5);
        const distance = Math.hypot(dx, dy);

        if (distance <= CONFIG.interactionRange && distance < bestDistance) {
          bestDistance = distance;
          closest = tile;
        }
      }

      return closest;
    }

    getNearbyBreakableTile(player) {
      return this.getNearbyTileByType(player, "tile");
    }

    getNearbyDirtTile(player) {
      return this.getNearbyTileByType(player, "dirt");
    }

    isNearBed(player) {
      const bedCenterX = this.bedRect.x + this.bedRect.width * 0.5;
      const bedCenterY = this.bedRect.y + this.bedRect.height * 0.5;
      const dx = player.centerX - bedCenterX;
      const dy = player.centerY - bedCenterY;
      return Math.hypot(dx, dy) <= CONFIG.interactionRange + 30;
    }

    tryPickupSpoon(player) {
      if (this.spoonTaken || !this.isNearBed(player)) {
        return false;
      }

      this.spoonTaken = true;
      return true;
    }

    hasExposedDirt() {
      return this.removableTiles.some((tile) => tile.type === "dirt" || tile.type === "empty");
    }

    getEntryTile() {
      return this.escapeTile;
    }

    isNearRect(player, rect, extraRange = 26) {
      const cx = rect.x + rect.width * 0.5;
      const cy = rect.y + rect.height * 0.5;
      const dx = player.centerX - cx;
      const dy = player.centerY - cy;
      return Math.hypot(dx, dy) <= CONFIG.interactionRange + extraRange;
    }

    isNearVending(player) {
      return this.isNearRect(player, this.vendingRect, 24);
    }

    isNearTrainingZone(player) {
      return this.isNearRect(player, this.trainingRect, 30);
    }

    getNearbyInmateIndex(player, currentArea = null) {
      let foundIndex = -1;
      let bestDistance = Number.POSITIVE_INFINITY;

      for (let index = 0; index < this.inmateRects.length; index += 1) {
        const rect = this.inmateRects[index];
        if (currentArea && rect.area !== currentArea) {
          continue;
        }
        const cx = rect.x + rect.width * 0.5;
        const cy = rect.y + rect.height * 0.5;
        const distance = Math.hypot(player.centerX - cx, player.centerY - cy);
        if (distance <= CONFIG.interactionRange + 20 && distance < bestDistance) {
          bestDistance = distance;
          foundIndex = index;
        }
      }

      return foundIndex;
    }

    getAreaByX(worldX) {
      for (const area of this.areaRanges) {
        if (worldX >= area.startX && worldX < area.endX) {
          return area;
        }
      }
      return this.areaRanges[this.areaRanges.length - 1];
    }

    getAreaById(areaId) {
      return this.areaRanges.find((area) => area.id === areaId) || this.areaRanges[0];
    }

    getDoorById(doorId) {
      return this.areaDoors.find((door) => door.id === doorId) || null;
    }

    getNearbyDoor(player) {
      let foundDoor = null;
      let bestDistance = Number.POSITIVE_INFINITY;

      for (const door of this.areaDoors) {
        const cx = door.x + door.width * 0.5;
        const cy = door.y + door.height * 0.5;
        const distance = Math.hypot(player.centerX - cx, player.centerY - cy);
        if (distance <= CONFIG.interactionRange + 28 && distance < bestDistance) {
          bestDistance = distance;
          foundDoor = door;
        }
      }

      return foundDoor;
    }

    isNearTunnelEntry(player) {
      if (!this.escapeTile || this.escapeTile.type !== "empty") {
        return false;
      }

      const tx = this.escapeTile.x + this.escapeTile.size * 0.5;
      const ty = this.tunnelCeilingY + 28;
      const distance = Math.hypot(player.centerX - tx, player.centerY - ty);
      return distance <= CONFIG.interactionRange + 24 && player.y > this.upperFloorY + 20;
    }

    update(dt) {
      for (const tile of this.removableTiles) {
        tile.update(dt);
      }

      if (!this.escapeOpened && this.escapeTile && this.escapeTile.type === "empty") {
        this.escapeOpened = true;
        this.escapeOpenedEvent = true;
      }
    }

    consumeEscapeOpenedEvent() {
      const occurred = this.escapeOpenedEvent;
      this.escapeOpenedEvent = false;
      return occurred;
    }

    drawBackdrop(context, cameraX, viewportWidth, elapsed) {
      const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
      gradient.addColorStop(0, "#243750");
      gradient.addColorStop(0.56, "#1b2d45");
      gradient.addColorStop(1, "#152539");
      context.fillStyle = gradient;
      context.fillRect(0, 0, viewportWidth, canvas.height);

      const blockWidth = 126;
      const blockHeight = 52;
      const baseOffset = ((-cameraX * 0.24) % blockWidth) - blockWidth;

      for (let row = 64; row < canvas.height - 28; row += blockHeight) {
        const rowIndex = Math.floor((row - 64) / blockHeight);
        const rowOffset = rowIndex % 2 === 1 ? blockWidth * 0.5 : 0;

        for (let col = 0; col < Math.ceil(viewportWidth / blockWidth) + 3; col += 1) {
          const x = baseOffset + rowOffset + col * blockWidth;
          const worldX = x + cameraX * 0.24;
          const grit = noise2d(worldX * 0.02, row * 0.03);
          const shade = Math.floor(92 + grit * 34);
          context.fillStyle = `rgba(${shade}, ${shade + 12}, ${shade + 24}, 0.54)`;
          context.fillRect(x, row, blockWidth - 6, blockHeight - 8);
          context.strokeStyle = "rgba(20, 30, 44, 0.3)";
          context.strokeRect(x + 0.5, row + 0.5, blockWidth - 7, blockHeight - 9);

          context.fillStyle = "rgba(192, 210, 234, 0.13)";
          context.fillRect(x + 3, row + 3, blockWidth - 12, 4);
          context.fillStyle = "rgba(20, 29, 42, 0.06)";
          context.fillRect(x + 3, row + blockHeight - 15, blockWidth - 12, 6);
        }
      }

      context.strokeStyle = "rgba(43, 59, 80, 0.2)";
      for (let y = 118; y < canvas.height - 20; y += blockHeight) {
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(viewportWidth, y);
        context.stroke();
      }

      for (let i = 0; i < 16; i += 1) {
        const x = ((i * 171 - cameraX * 0.16) % (viewportWidth + 260)) - 120;
        const stainLength = 96 + noise2d(i * 0.77, elapsed * 0.22 + i) * 120;
        const stainWidth = 10 + (i % 3) * 4;
        const stainAlpha = 0.02 + (i % 4) * 0.006;
        context.fillStyle = `rgba(42, 62, 84, ${stainAlpha.toFixed(3)})`;
        context.fillRect(x, 116, stainWidth, stainLength);
      }

      const mistAlpha = 0.13 + (Math.sin(elapsed * 1.35) + 1) * 0.04;
      context.fillStyle = `rgba(166, 188, 214, ${mistAlpha.toFixed(3)})`;
      context.fillRect(0, 150, viewportWidth, 58);

      for (let i = 0; i < 4; i += 1) {
        const beamCenter = ((i * 270 - cameraX * 0.12) % (viewportWidth + 340)) - 170;
        const beam = context.createLinearGradient(beamCenter, 80, beamCenter, 360);
        beam.addColorStop(0, "rgba(214, 227, 246, 0.2)");
        beam.addColorStop(0.5, "rgba(192, 210, 236, 0.1)");
        beam.addColorStop(1, "rgba(160, 186, 220, 0)");
        context.fillStyle = beam;
        context.beginPath();
        context.moveTo(beamCenter - 40, 70);
        context.lineTo(beamCenter + 40, 70);
        context.lineTo(beamCenter + 150, 360);
        context.lineTo(beamCenter - 150, 360);
        context.closePath();
        context.fill();
      }
    }

    drawWorldRect(context, worldX, worldY, width, height, cameraX, color) {
      const sx = worldX - cameraX;
      context.fillStyle = color;
      context.fillRect(sx, worldY, width, height);
    }

    drawInmate(context, cameraX, inmate, highlighted, elapsed) {
      const x = inmate.x - cameraX;
      const y = inmate.y;
      const torsoPalette = {
        weak: "#6f86a6",
        mid: "#7a7fa7",
        strong: "#936f86",
        rare: "#7f658f"
      };
      const legPalette = {
        weak: "#5a708c",
        mid: "#646a90",
        strong: "#7a5f77",
        rare: "#6f5a80"
      };
      const glowPalette = {
        weak: "rgba(230, 204, 130, 0.2)",
        mid: "rgba(147, 198, 236, 0.2)",
        strong: "rgba(235, 147, 147, 0.22)",
        rare: "rgba(175, 140, 239, 0.24)"
      };
      const role = inmate.role || "weak";

      context.fillStyle = "#d9b884";
      context.beginPath();
      context.arc(x + inmate.width * 0.5, y + 10, 8, 0, Math.PI * 2);
      context.fill();

      context.fillStyle = torsoPalette[role] || torsoPalette.weak;
      context.fillRect(x + 8, y + 18, inmate.width - 16, 26);
      context.fillStyle = legPalette[role] || legPalette.weak;
      context.fillRect(x + 10, y + 44, 7, 22);
      context.fillRect(x + inmate.width - 17, y + 44, 7, 22);
      context.fillStyle = "#111926";
      context.fillRect(x + 9, y + 66, 8, 4);
      context.fillRect(x + inmate.width - 17, y + 66, 8, 4);

      context.fillStyle = "rgba(10, 15, 24, 0.5)";
      context.fillRect(x + 6, y + 74, inmate.width - 12, 2);
      context.fillStyle = glowPalette[role] || glowPalette.weak;
      context.fillRect(x + 7, y + 20, inmate.width - 14, 6);
      context.fillStyle = "rgba(220, 231, 245, 0.9)";
      context.font = '10px "Share Tech Mono", monospace';
      context.textAlign = "center";
      context.fillText(inmate.name, x + inmate.width * 0.5, y - 4);

      if (highlighted) {
        const pulse = 0.35 + (Math.sin(elapsed * 8) + 1) * 0.18;
        context.strokeStyle = `rgba(239, 208, 130, ${pulse.toFixed(3)})`;
        context.lineWidth = 2;
        context.strokeRect(x - 3, y - 3, inmate.width + 6, inmate.height + 6);
        context.lineWidth = 1;
      }
    }

    drawAreaLabels(context, cameraX, viewportWidth, interaction) {
      context.font = '13px "Share Tech Mono", monospace';
      context.textAlign = "center";
      for (const area of this.areaRanges) {
        const centerX = (area.startX + area.endX) * 0.5 - cameraX;
        if (centerX < -120 || centerX > viewportWidth + 120) {
          continue;
        }

        const isCurrent = interaction && interaction.currentArea === area.id;
        context.fillStyle = isCurrent ? "rgba(106, 182, 203, 0.24)" : "rgba(24, 34, 48, 0.32)";
        context.fillRect(centerX - 58, 108, 116, 20);
        context.strokeStyle = isCurrent ? "rgba(151, 214, 230, 0.64)" : "rgba(96, 122, 155, 0.5)";
        context.strokeRect(centerX - 58, 108, 116, 20);
        context.fillStyle = isCurrent ? "#d8f1ff" : "#bdd1ea";
        context.fillText(area.label, centerX, 122);
      }
    }

    drawPrisonDetails(context, cameraX, viewportWidth, elapsed, interaction) {
      const rearBarSpacing = 120;
      const rearOffset = ((-cameraX * 0.64) % rearBarSpacing) - rearBarSpacing;
      const barTop = 108;
      const barBottom = 382;
      context.fillStyle = "rgba(52, 69, 92, 0.46)";
      for (let x = rearOffset; x < viewportWidth + rearBarSpacing; x += rearBarSpacing) {
        context.fillRect(x + 18, barTop, 8, barBottom - barTop);
        context.fillRect(x + 44, barTop, 8, barBottom - barTop);
        context.fillRect(x + 70, barTop, 8, barBottom - barTop);
      }
      context.fillStyle = "rgba(79, 101, 130, 0.34)";
      context.fillRect(0, barTop, viewportWidth, 8);
      context.fillRect(0, barBottom - 8, viewportWidth, 8);
      this.drawAreaLabels(context, cameraX, viewportWidth, interaction);

      this.drawWorldRect(context, this.bedRect.x, this.bedRect.y + 12, this.bedRect.width, 16, cameraX, "#566276");
      this.drawWorldRect(context, this.bedRect.x + 10, this.bedRect.y, this.bedRect.width - 20, 14, cameraX, "#6f7e94");
      this.drawWorldRect(context, this.bedRect.x - 40, this.bedRect.y + 22, 34, 32, cameraX, "#768397");
      this.drawWorldRect(context, this.bedRect.x - 35, this.bedRect.y + 18, 24, 8, cameraX, "#a7b5c8");

      if (interaction && interaction.nearBed && !interaction.hasSpoon) {
        const hx = this.bedRect.x - cameraX;
        const pulse = 0.28 + (Math.sin(elapsed * 7) + 1) * 0.15;
        context.strokeStyle = `rgba(241, 196, 126, ${pulse.toFixed(3)})`;
        context.lineWidth = 2;
        context.strokeRect(hx - 2, this.bedRect.y - 2, this.bedRect.width + 4, this.bedRect.height + 4);
        context.lineWidth = 1;
      }

      if (!this.spoonTaken) {
        const spoonX = this.spoonPos.x - cameraX;
        const spoonY = this.spoonPos.y;
        context.fillStyle = "#d9e3f2";
        context.beginPath();
        context.ellipse(spoonX + 4, spoonY, 4, 3, 0, 0, Math.PI * 2);
        context.fill();
        context.fillRect(spoonX + 4, spoonY - 1, 12, 2);
      }

      const vendingX = this.vendingRect.x - cameraX;
      context.fillStyle = "#33465f";
      context.fillRect(vendingX, this.vendingRect.y, this.vendingRect.width, this.vendingRect.height);
      context.fillStyle = "#8ad0ff";
      context.fillRect(vendingX + 8, this.vendingRect.y + 10, this.vendingRect.width - 16, 30);
      context.fillStyle = "#1f3045";
      context.fillRect(vendingX + 8, this.vendingRect.y + 48, this.vendingRect.width - 16, 45);
      context.fillStyle = "#9ec4ea";
      context.fillRect(vendingX + this.vendingRect.width - 14, this.vendingRect.y + 56, 6, 28);
      context.fillStyle = "#d2e6ff";
      context.font = '10px "Share Tech Mono", monospace';
      context.textAlign = "center";
      context.fillText("ENERGY", vendingX + this.vendingRect.width * 0.5, this.vendingRect.y + 30);

      if (interaction && interaction.nearVending) {
        const pulse = 0.3 + (Math.sin(elapsed * 6.5) + 1) * 0.18;
        context.strokeStyle = `rgba(132, 207, 245, ${pulse.toFixed(3)})`;
        context.lineWidth = 2;
        context.strokeRect(vendingX - 3, this.vendingRect.y - 3, this.vendingRect.width + 6, this.vendingRect.height + 6);
        context.lineWidth = 1;
      }

      const trainX = this.trainingRect.x - cameraX;
      context.fillStyle = "#44556f";
      context.fillRect(trainX, this.trainingRect.y + this.trainingRect.height - 12, this.trainingRect.width, 12);
      context.fillStyle = "#7f95b4";
      context.fillRect(trainX + 18, this.trainingRect.y + 18, this.trainingRect.width - 36, 8);
      context.fillRect(trainX + 18, this.trainingRect.y + 36, this.trainingRect.width - 36, 6);
      context.fillRect(trainX + 18, this.trainingRect.y + 54, this.trainingRect.width - 36, 6);
      context.fillStyle = "#c2d3eb";
      context.fillRect(trainX + 20, this.trainingRect.y + 8, 6, 54);
      context.fillRect(trainX + this.trainingRect.width - 26, this.trainingRect.y + 8, 6, 54);

      if (interaction && interaction.nearTraining) {
        const pulse = 0.3 + (Math.sin(elapsed * 6) + 1) * 0.16;
        context.strokeStyle = `rgba(141, 218, 177, ${pulse.toFixed(3)})`;
        context.lineWidth = 2;
        context.strokeRect(trainX - 3, this.trainingRect.y - 3, this.trainingRect.width + 6, this.trainingRect.height + 6);
        context.lineWidth = 1;
      }

      for (let i = 0; i < this.inmateRects.length; i += 1) {
        this.drawInmate(context, cameraX, this.inmateRects[i], interaction && interaction.nearInmateIndex === i, elapsed);
      }

      const chainAlpha = 0.24 + (Math.sin(elapsed * 3.2) + 1) * 0.08;
      context.strokeStyle = `rgba(188, 68, 53, ${chainAlpha.toFixed(3)})`;
      context.lineWidth = 2;
      const chainStartX = 260 - cameraX;
      context.beginPath();
      context.moveTo(chainStartX, 106);
      context.lineTo(chainStartX, 180);
      context.moveTo(chainStartX + 34, 106);
      context.lineTo(chainStartX + 34, 180);
      context.stroke();
      context.lineWidth = 1;

      const lampX = 330 - cameraX;
      const flicker = 0.2 + (Math.sin(elapsed * 17) + 1) * 0.05 + Math.sin(elapsed * 39) * 0.02;
      context.fillStyle = "#738198";
      context.fillRect(lampX, 128, 18, 10);
      context.fillStyle = "#2a3446";
      context.fillRect(lampX + 6, 138, 6, 5);

      const glow = context.createRadialGradient(lampX + 9, 142, 8, lampX + 9, 240, 150);
      glow.addColorStop(0, `rgba(226, 210, 176, ${(0.2 + flicker).toFixed(3)})`);
      glow.addColorStop(0.55, `rgba(157, 143, 121, ${(0.1 + flicker * 0.35).toFixed(3)})`);
      glow.addColorStop(1, "rgba(112, 102, 90, 0)");
      context.fillStyle = glow;
      context.beginPath();
      context.arc(lampX + 9, 210, 150, 0, Math.PI * 2);
      context.fill();
    }

    drawForegroundBars(context, cameraX, viewportWidth, elapsed) {
      const frontSpacing = 94;
      const offset = ((-cameraX * 0.92) % frontSpacing) - frontSpacing;
      const top = 74;
      const height = canvas.height - top;

      context.save();
      context.fillStyle = "rgba(26, 36, 50, 0.2)";
      for (let x = offset; x < viewportWidth + frontSpacing; x += frontSpacing) {
        context.fillRect(x + 15, top, 7, height);
        context.fillRect(x + 33, top, 7, height);
      }

      context.fillStyle = "rgba(74, 96, 122, 0.2)";
      context.fillRect(0, top, viewportWidth, 7);
      context.fillRect(0, top + height - 10, viewportWidth, 10);

      const pulse = 0.11 + (Math.sin(elapsed * 2.2) + 1) * 0.04;
      context.strokeStyle = `rgba(162, 185, 212, ${pulse.toFixed(3)})`;
      for (let x = offset; x < viewportWidth + frontSpacing; x += frontSpacing) {
        context.beginPath();
        context.moveTo(x + 16.5, top + 8);
        context.lineTo(x + 16.5, top + height - 18);
        context.stroke();
      }

      context.restore();
    }

    drawGate(context, cameraX, elapsed, interaction) {
      const lockedSet = new Set((interaction && interaction.lockedDoorIds) || []);
      const nearDoorId = interaction ? interaction.nearDoorId : null;

      for (const door of this.areaDoors) {
        if (!this.isVisible(door.x, door.width, cameraX, canvas.width)) {
          continue;
        }

        const gateX = door.x - cameraX;
        const gateY = door.y;
        const gateW = door.width;
        const gateH = door.height;
        const locked = lockedSet.has(door.id);
        const lit = nearDoorId === door.id;

        context.fillStyle = locked ? "#4f5c71" : "#60758f";
        context.fillRect(gateX, gateY, gateW, gateH);
        context.strokeStyle = locked ? "#aeb9cc" : "#c6d4e6";
        context.lineWidth = 2;
        context.strokeRect(gateX + 0.5, gateY + 0.5, gateW - 1, gateH - 1);

        for (let i = 0; i < 4; i += 1) {
          const barX = gateX + 3 + i * ((gateW - 6) / 3);
          context.strokeStyle = locked ? "rgba(36, 47, 63, 0.72)" : "rgba(44, 58, 77, 0.7)";
          context.beginPath();
          context.moveTo(barX, gateY + 2);
          context.lineTo(barX, gateY + gateH - 2);
          context.stroke();
        }

        context.fillStyle = locked ? "#c86256" : "#79c293";
        context.beginPath();
        context.arc(gateX + gateW * 0.5, gateY + 12, 4, 0, Math.PI * 2);
        context.fill();

        if (lit) {
          const pulse = 0.35 + (Math.sin(elapsed * 7.4) + 1) * 0.22;
          context.strokeStyle = locked
            ? `rgba(239, 166, 147, ${pulse.toFixed(3)})`
            : `rgba(173, 236, 199, ${pulse.toFixed(3)})`;
          context.strokeRect(gateX - 3, gateY - 3, gateW + 6, gateH + 6);
        }
      }
    }

    drawEscapeShaftHint(context, cameraX, elapsed) {
      if (!this.escapeOpened || !this.escapeTile) {
        return;
      }

      const sx = this.escapeTile.x - cameraX;
      const beamAlpha = 0.12 + (Math.sin(elapsed * 2.6) + 1) * 0.05;
      context.fillStyle = `rgba(153, 215, 203, ${beamAlpha.toFixed(3)})`;
      context.fillRect(sx + 4, this.escapeTile.y + this.escapeTile.size, this.escapeTile.size - 8, this.tunnelFloorY - this.escapeTile.y - this.escapeTile.size);
    }

    draw(context, cameraX, viewportWidth, elapsed, interaction) {
      const highlightTile = interaction ? interaction.highlightTile : null;
      const highlightMode = interaction ? interaction.highlightMode : null;
      this.drawBackdrop(context, cameraX, viewportWidth, elapsed);
      this.drawPrisonDetails(context, cameraX, viewportWidth, elapsed, interaction);

      for (const tile of this.staticTiles) {
        if (!this.isVisible(tile.x, tile.size, cameraX, viewportWidth)) {
          continue;
        }
        tile.draw(context, cameraX, elapsed);
      }

      this.drawGate(context, cameraX, elapsed, interaction);

      for (const tile of this.removableTiles) {
        if (!this.isVisible(tile.x, tile.size, cameraX, viewportWidth)) {
          continue;
        }

        tile.draw(context, cameraX, elapsed, highlightTile === tile, highlightMode);
      }

      this.drawEscapeShaftHint(context, cameraX, elapsed);

      context.fillStyle = "rgba(42, 57, 77, 0.2)";
      context.fillRect(0, this.tunnelCeilingY + 2, viewportWidth, 6);
    }
  }

  class Game {
    constructor(context) {
      this.ctx = context;
      this.input = new InputManager();
      this.level = new Level();
      this.player = new Player(3 * CONFIG.tileSize, this.level.upperFloorY - 80);

      this.cameraX = 0;
      this.elapsed = 0;
      this.lastFrameTime = 0;

      this.phase = "intro";
      this.state = "idle";
      this.stateTimer = 0;
      this.statePayload = null;

      this.stats = {
        money: 0,
        strength: 1,
        toolLevel: 0,
        diggingProgress: 0
      };
      this.money = 0;

      this.dayCount = 1;
      this.currentDay = 1;
      this.dayTimer = 0;
      this.gameTime = 0;
      this.guardTimer = CONFIG.guardIntervalGameSec;
      this.guardCheckTimer = CONFIG.guardIntervalGameSec;
      this.guardPatrolLeft = 0;
      this.guardWarningIssued = false;
      this.guardCaughtThisCheck = false;
      this.guardInspectTimer = 0;
      this.guardPenaltyCooldown = 0;
      this.energyBoostLeft = 0;

      this.firstStageComplete = false;
      this.bannerTimer = 0;
      this.bannerTitle = "";
      this.bannerSubtitle = "";
      this.currentInteractTile = null;
      this.highlightMode = null;
      this.nearbyBreakTile = null;
      this.nearbyDirtTile = null;
      this.nearBed = false;
      this.nearVending = false;
      this.nearTraining = false;
      this.nearInmateIndex = -1;
      this.nearTunnelEntry = false;
      this.nearDoor = null;
      this.nearDoorId = null;
      this.currentArea = "cell";
      this.lastArea = "cell";
      this.areaUnlocks = {
        cell: true,
        corridor: true,
        yard: false,
        cafeteria: false,
        secret: false
      };
      this.lockedDoorIds = [];
      this.areaHintCooldown = 0;
      this.rareRewards = {
        tunnel_map: false
      };
      this.digPowerBonus = 0;

      this.setMission("Q ile fayansları kontrol et");
      this.setStatus("Zengin ama masum bir adam: kaçış için zemini hazırlamalısın.");
    }

    setMission(text) {
      if (ui.mission) {
        ui.mission.textContent = `Görev: ${text}`;
      }
    }

    setStatus(text) {
      if (ui.status) {
        ui.status.textContent = text;
      }
    }

    startBanner(title, subtitle = "", duration = 3.6) {
      this.bannerTitle = title;
      this.bannerSubtitle = subtitle;
      this.bannerTimer = duration;
    }

    formatTimer(gameSeconds) {
      const total = Math.max(0, Math.ceil(gameSeconds));
      const mins = Math.floor(total / 60);
      const secs = total % 60;
      return `${mins}:${String(secs).padStart(2, "0")}`;
    }

    isGuardActive() {
      return this.guardPatrolLeft > 0;
    }

    getToolData(level = this.stats.toolLevel) {
      const safeLevel = clamp(Math.round(level), 0, TOOL_DATA.length - 1);
      return TOOL_DATA[safeLevel];
    }

    getDifficultyTier() {
      if (this.stats.strength >= 18) {
        return 3;
      }
      if (this.stats.strength >= 12) {
        return 2;
      }
      if (this.stats.strength >= 7) {
        return 1;
      }
      return 0;
    }

    getNextToolOffer() {
      const nextLevel = this.stats.toolLevel + 1;
      if (nextLevel >= TOOL_DATA.length) {
        return null;
      }

      const base = this.getToolData(nextLevel);
      const difficultyTax = 1 + this.getDifficultyTier() * 0.12;
      const finalCost = Math.round(base.baseCost * difficultyTax);
      return {
        ...base,
        finalCost
      };
    }

    getDigPower() {
      if (!this.player.hasSpoon) {
        return 0;
      }
      return this.getToolData().digPower + this.digPowerBonus;
    }

    getCurrentAreaData() {
      return this.level.getAreaById(this.currentArea);
    }

    getDoorLockReason(doorId) {
      if (doorId === "cellToCorridor") {
        if (this.isGuardActive()) {
          return "Gardiyan varken hucre kapisi acilmiyor.";
        }
        return "";
      }

      if (doorId === "corridorToYard") {
        if (!this.areaUnlocks.yard) {
          return "Bahce icin Gun 2 ve Guc 4 gerekiyor.";
        }
        return "";
      }

      if (doorId === "yardToCafeteria") {
        if (!this.areaUnlocks.cafeteria) {
          return "Yemekhane icin Gun 3 ve Guc 9 gerekiyor.";
        }
        return "";
      }

      if (doorId === "cafeteriaToSecret") {
        if (!this.areaUnlocks.secret) {
          return "Gizli alan icin Gun 4, Guc 14 ve Kazma Lv2 gerekiyor.";
        }
        if (this.isGuardActive()) {
          return "Gizli gecit sadece gardiyan yokken acik.";
        }
      }

      return "";
    }

    isDoorUnlocked(doorId) {
      if (doorId === "cellToCorridor") {
        return !this.isGuardActive();
      }

      if (doorId === "corridorToYard") {
        return this.areaUnlocks.yard;
      }

      if (doorId === "yardToCafeteria") {
        return this.areaUnlocks.cafeteria;
      }

      if (doorId === "cafeteriaToSecret") {
        return this.areaUnlocks.secret && !this.isGuardActive();
      }

      return true;
    }

    getLockedDoorIds() {
      const locked = [];
      for (const door of this.level.areaDoors) {
        if (!this.isDoorUnlocked(door.id)) {
          locked.push(door.id);
        }
      }
      return locked;
    }

    unlockAreasByProgress() {
      if (!this.areaUnlocks.yard && this.dayCount >= 2 && this.stats.strength >= 4) {
        this.areaUnlocks.yard = true;
        this.startBanner("YENI BOLUM", "Bahce kapisi acildi", 3.1);
        this.setStatus("Bahce bolumu acildi.");
      }

      if (!this.areaUnlocks.cafeteria && this.dayCount >= 3 && this.stats.strength >= 9) {
        this.areaUnlocks.cafeteria = true;
        this.startBanner("YENI BOLUM", "Yemekhane acildi", 3.1);
        this.setStatus("Yemekhane kapisi acildi.");
      }

      if (
        !this.areaUnlocks.secret &&
        this.dayCount >= 4 &&
        this.stats.strength >= 14 &&
        this.stats.toolLevel >= 2
      ) {
        this.areaUnlocks.secret = true;
        this.startBanner("YENI BOLUM", "Gizli alan erisimi hazir", 3.1);
        this.setStatus("Gizli alan sartlari saglandi.");
      }
    }

    getAreaInmate(areaId) {
      return this.level.inmateRects.find((inmate) => inmate.area === areaId) || null;
    }

    getInmateOffer(inmate) {
      if (!inmate) {
        return null;
      }

      const desiredLevel = Math.max(this.stats.toolLevel + 1, inmate.offerLevel || 1);
      if (desiredLevel >= TOOL_DATA.length) {
        return null;
      }

      const base = this.getToolData(desiredLevel);
      const difficultyTax = 1 + this.getDifficultyTier() * 0.08;
      const priceFactor = inmate.priceFactor || 1;
      const finalCost = Math.round(base.baseCost * priceFactor * difficultyTax);
      const reqStrength = Math.max(base.reqStrength, inmate.reqStrength || 0);
      return {
        ...base,
        level: desiredLevel,
        finalCost,
        reqStrength
      };
    }

    startTimedState(state, duration, payload, statusText) {
      if (this.state !== "idle") {
        this.setStatus("Önce mevcut işlemi bitir.");
        return false;
      }

      this.state = state;
      this.stateTimer = Math.max(0.06, duration);
      this.statePayload = payload || null;
      if (statusText) {
        this.setStatus(statusText);
      }
      return true;
    }

    cancelTimedState(reasonText) {
      this.state = "idle";
      this.stateTimer = 0;
      this.statePayload = null;
      if (reasonText) {
        this.setStatus(reasonText);
      }
    }

    syncPublicTimeStats() {
      this.currentDay = this.dayCount;
      this.guardCheckTimer = Math.max(0, this.guardTimer);
      this.money = this.stats.money;
    }

    isIllegalItemCarried() {
      return this.player.hasSpoon || this.stats.toolLevel > 1;
    }

    hasActiveTileTampering() {
      return this.level.removableTiles.some((tile) => tile.breakState === "breaking");
    }

    collectGuardSuspicion() {
      const digging = this.state === "digging";
      const illegalItem = this.isIllegalItemCarried();
      const tileTampering = this.hasActiveTileTampering();
      const escapePreparation =
        this.level.escapeOpened ||
        this.stats.diggingProgress > 0 ||
        (this.level.hasExposedDirt() && this.player.hasSpoon);

      let chance = 0;
      if (digging) {
        chance += 0.78;
      }
      if (tileTampering) {
        chance += 0.62;
      }
      if (illegalItem) {
        chance += 0.12;
      }
      if (escapePreparation) {
        chance += 0.12;
      }

      const areaRisk = this.getCurrentAreaData().risk;
      chance += Math.max(0, (areaRisk - 1) * 0.07);

      return {
        digging,
        tileTampering,
        illegalItem,
        escapePreparation,
        chance: clamp(chance, 0, 0.96)
      };
    }

    runGuardInspection(reasonPrefix) {
      if (this.guardCaughtThisCheck) {
        return;
      }

      const suspicion = this.collectGuardSuspicion();
      if (suspicion.chance <= 0) {
        return;
      }

      if (Math.random() < suspicion.chance) {
        this.applyGuardPenalty(reasonPrefix, suspicion);
      }
    }

    applyGuardPenalty(reasonText, evidence = {}) {
      if (this.guardPenaltyCooldown > 0) {
        this.setStatus(reasonText);
        return;
      }

      const areaRisk = this.getCurrentAreaData().risk;
      let penalty = Math.round(10 + this.getDifficultyTier() * 4 + (areaRisk - 1) * 8);
      if (evidence.illegalItem) {
        penalty += 7;
      }
      if (evidence.digging || evidence.tileTampering || evidence.escapePreparation) {
        penalty += 6;
      }
      penalty = Math.min(
        this.stats.money,
        penalty
      );

      this.stats.money -= penalty;

      let strengthLoss = evidence.digging || evidence.tileTampering ? 1 : 0;
      if (evidence.escapePreparation && this.stats.strength > 4) {
        strengthLoss += 1;
      }
      if (strengthLoss > 0) {
        this.stats.strength = Math.max(1, this.stats.strength - strengthLoss);
      }

      let progressLoss = 0;
      if (evidence.digging || evidence.escapePreparation || evidence.tileTampering) {
        progressLoss = Math.min(
          this.stats.diggingProgress,
          Math.round(5 + this.getDifficultyTier() * 3 + (areaRisk - 1) * 10)
        );
        this.stats.diggingProgress -= progressLoss;
      }

      let confiscated = "";
      if (evidence.illegalItem && this.stats.toolLevel > 1) {
        const previousTool = this.getToolData(this.stats.toolLevel).name;
        this.stats.toolLevel -= 1;
        confiscated = `${previousTool} alındı`;
      }

      if (evidence.illegalItem && this.energyBoostLeft > 0) {
        this.energyBoostLeft = Math.max(0, this.energyBoostLeft - 180);
      }

      this.guardPenaltyCooldown = 2;
      this.guardCaughtThisCheck = true;
      this.syncPublicTimeStats();

      const parts = [`${reasonText} Ceza: -${penalty} TL`];
      if (strengthLoss > 0) {
        parts.push(`-${strengthLoss} güç`);
      }
      if (progressLoss > 0) {
        parts.push(`tünel -${progressLoss}`);
      }
      if (confiscated) {
        parts.push(confiscated);
      }
      this.setStatus(`${parts.join(", ")}.`);
    }

    triggerGuardPatrol() {
      this.guardPatrolLeft = CONFIG.guardDurationGameSec;
      this.guardTimer = CONFIG.guardIntervalGameSec;
      this.guardWarningIssued = false;
      this.guardCaughtThisCheck = false;
      this.guardInspectTimer = 0;

      const areaLabel = this.getCurrentAreaData().label;
      this.startBanner("GARDIYAN KONTROLU GELIYOR!", `${areaLabel} bolgesi denetleniyor`, 1.8);

      if (this.state === "digging" || this.state === "fighting") {
        const wasDigging = this.state === "digging";
        const hadIllegalItem = this.isIllegalItemCarried();
        const hadTileTampering = this.hasActiveTileTampering();
        this.cancelTimedState("Gardiyan geldi, şüpheli işlem durduruldu.");
        this.applyGuardPenalty("Gardiyan seni suçüstü yakaladı", {
          digging: wasDigging,
          illegalItem: hadIllegalItem,
          tileTampering: hadTileTampering,
          escapePreparation: true
        });
      } else {
        this.setStatus("Gardiyan kontrolü başladı. Şüpheli hareket yapma.");
      }

      this.runGuardInspection("Kontrol aninda yasak durum tespit edildi");
      this.syncPublicTimeStats();
    }

    updateGuardCheck(gameDt) {
      this.guardTimer = Math.max(0, this.guardTimer - gameDt);

      if (this.guardPatrolLeft > 0) {
        this.guardPatrolLeft = Math.max(0, this.guardPatrolLeft - gameDt);

        this.guardInspectTimer -= gameDt;
        if (this.guardInspectTimer <= 0) {
          this.guardInspectTimer = CONFIG.guardInspectStepGameSec;
          this.runGuardInspection("Gardiyan kontrolünde supheli hareket yakalandı");
        }

        if (this.guardPatrolLeft === 0) {
          this.setStatus("Gardiyan kontrolü bitti.");
        }
      } else {
        if (!this.guardWarningIssued && this.guardTimer <= CONFIG.guardWarningGameSec) {
          this.guardWarningIssued = true;
          this.startBanner("UYARI", "Gardiyan kontrolü geliyor!", 1.8);
          this.setStatus("Gardiyan kontrolü geliyor!");
        }

        if (this.guardTimer <= 0) {
          this.triggerGuardPatrol();
        }
      }
    }

    updateWorldTimers(gameDt, dt) {
      this.guardPenaltyCooldown = Math.max(0, this.guardPenaltyCooldown - dt);
      this.energyBoostLeft = Math.max(0, this.energyBoostLeft - gameDt);
      this.areaHintCooldown = Math.max(0, this.areaHintCooldown - dt);
      this.gameTime += gameDt;

      this.dayTimer += gameDt;
      while (this.dayTimer >= CONFIG.dayIntervalGameSec) {
        this.dayTimer -= CONFIG.dayIntervalGameSec;
        this.dayCount += 1;
        this.stats.money += CONFIG.dailyIncome;
        this.setStatus(`Yeni gün: polis arkadaşın +${CONFIG.dailyIncome} TL verdi.`);
      }
      this.updateGuardCheck(gameDt);
      this.syncPublicTimeStats();
    }

    refreshInteractionTargets() {
      const area = this.level.getAreaByX(this.player.centerX);
      this.currentArea = area.id;
      this.nearbyBreakTile = this.level.getNearbyBreakableTile(this.player);
      this.nearbyDirtTile = this.level.getNearbyDirtTile(this.player);
      this.nearBed = this.level.isNearBed(this.player);
      this.nearVending = this.level.isNearVending(this.player);
      this.nearTraining = this.level.isNearTrainingZone(this.player);
      this.nearInmateIndex = this.level.getNearbyInmateIndex(this.player, this.currentArea);
      this.nearTunnelEntry = this.level.isNearTunnelEntry(this.player);
      this.nearDoor = this.level.getNearbyDoor(this.player);
      this.nearDoorId = this.nearDoor ? this.nearDoor.id : null;

      if (this.currentArea !== this.lastArea) {
        const areaData = this.level.getAreaById(this.currentArea);
        this.setStatus(`${areaData.label} bolumune girildi.`);
        this.lastArea = this.currentArea;
      }

      if (this.nearbyDirtTile) {
        this.currentInteractTile = this.nearbyDirtTile;
        this.highlightMode = "dig";
      } else if (this.nearbyBreakTile) {
        this.currentInteractTile = this.nearbyBreakTile;
        this.highlightMode = "break";
      } else {
        this.currentInteractTile = null;
        this.highlightMode = null;
      }
    }

    resolveTimedStateCompletion() {
      const completedState = this.state;
      const payload = this.statePayload;
      this.state = "idle";
      this.stateTimer = 0;
      this.statePayload = null;

      if (completedState === "training") {
        const strengthGain = this.energyBoostLeft > 0 ? 2 : 1;
        this.stats.strength += strengthGain;
        this.setStatus(`Antrenman tamamlandı. Güç +${strengthGain}.`);
        return;
      }

      if (completedState === "fighting") {
        const difficulty = payload ? payload.difficulty : 5;
        const roll = Math.random() * 4;
        const boost = this.energyBoostLeft > 0 ? 1.5 : 0;
        const combatPower = this.stats.strength + roll + boost;
        const inmate = this.level.inmateRects[payload ? payload.inmateIndex : 0];
        const baseReward = inmate ? inmate.rewardMoney || 12 : 12;
        if (combatPower >= difficulty) {
          const reward = Math.round(baseReward + this.getDifficultyTier() * 4);
          this.stats.money += reward;
          this.stats.strength += 1;
          if (inmate && inmate.rareReward && !this.rareRewards[inmate.rareReward]) {
            this.rareRewards[inmate.rareReward] = true;
            this.digPowerBonus += 1.2;
            this.startBanner("NADIR ESYA", "Tunel Plani bulundu: kazma hizi artti", 3.2);
            this.setStatus(`${inmate.name} yenildi. +${reward} TL, +1 güç, nadir eşya kazanıldı.`);
          } else {
            this.setStatus(`${inmate ? inmate.name : "Mahkum"} yenildi. +${reward} TL, +1 güç.`);
          }
        } else {
          const loss = Math.min(this.stats.money, Math.round(9 + this.getDifficultyTier() * 4 + difficulty * 0.35));
          this.stats.money -= loss;
          this.stats.strength = Math.max(1, this.stats.strength - 1);
          this.setStatus(`Kavgayı kaybettin. -${loss} TL, -1 güç.`);
        }
        return;
      }

      if (completedState === "digging") {
        if (!payload) {
          return;
        }

        if (payload.kind === "dirt" && payload.tile) {
          const result = payload.tile.dig(this.getDigPower());
          if (result === "done") {
            if (payload.tile.revealsEscape) {
              this.startBanner("GİZLİ GEÇİT AÇILDI", "Tünel girişi artık erişilebilir", 3.2);
              this.setStatus("Toprak tamamen kazıldı. Gizli kaçış yolu açıldı.");
            } else {
              this.setStatus("Toprak bitti ama bu geçit yanlış.");
            }
          } else if (result === "progress") {
            const progress = Math.round(payload.tile.getDigProgressRatio() * 100);
            this.setStatus(`Toprak kazılıyor... %${progress}`);
          }
          return;
        }

        if (payload.kind === "tunnel") {
          const boost = this.energyBoostLeft > 0 ? 1.25 : 1;
          const gain = this.getDigPower() * 4.6 * boost;
          this.stats.diggingProgress = clamp(
            this.stats.diggingProgress + gain,
            0,
            CONFIG.tunnelTarget
          );
          const percent = Math.floor((this.stats.diggingProgress / CONFIG.tunnelTarget) * 100);
          this.setStatus(`Tünel kazılıyor... %${percent}`);
        }
      }
    }

    updateTimedState(dt) {
      if (this.state === "idle") {
        return;
      }

      this.stateTimer -= dt;
      if (this.stateTimer <= 0) {
        this.resolveTimedStateCompletion();
      }
    }

    handleInteractQ() {
      if (this.state !== "idle") {
        this.setStatus("Önce devam eden işlemi bitir.");
        return;
      }

      if (this.nearDoorId) {
        const reason = this.getDoorLockReason(this.nearDoorId);
        if (reason) {
          this.setStatus(reason);
        } else {
          this.setStatus("Kapı açık. Geçiş yapabilirsin.");
        }
        return;
      }

      if (this.nearTraining) {
        const duration = this.energyBoostLeft > 0 ? CONFIG.trainingDuration * 0.75 : CONFIG.trainingDuration;
        this.startTimedState("training", duration, null, "Antrenman başladı.");
        return;
      }

      if (this.nearbyBreakTile) {
        if (this.isGuardActive()) {
          this.applyGuardPenalty("Gardiyan fayansla uğraştığını gördü", {
            tileTampering: true,
            illegalItem: this.isIllegalItemCarried(),
            escapePreparation: this.level.hasExposedDirt()
          });
          return;
        }

        if (this.nearbyBreakTile.beginBreak()) {
          this.setStatus("Fayans kırılıyor...");
        }
        return;
      }

      this.setStatus("Q için uygun bir etkileşim noktası yok.");
    }

    handlePickupE() {
      if (this.state !== "idle") {
        this.setStatus("Önce mevcut işlemi tamamla.");
        return;
      }

      if (this.nearBed && !this.player.hasSpoon) {
        const canPickupNow = this.level.hasExposedDirt();
        if (!canPickupNow) {
          this.setStatus("Önce Q ile bir fayansı kırıp toprağı açığa çıkar.");
          return;
        }

        if (this.level.tryPickupSpoon(this.player)) {
          this.player.hasSpoon = true;
          this.stats.toolLevel = Math.max(this.stats.toolLevel, 1);
          this.startBanner("KAŞIK ALINDI", "Kazı artık mümkün", 2.8);
          this.setStatus("Kaşık alındı.");
        }
        return;
      }

      if (this.nearVending) {
        if (this.stats.money < CONFIG.vendingCost) {
          this.setStatus(`Enerji içeceği için ${CONFIG.vendingCost} TL gerekiyor.`);
          return;
        }

        this.stats.money -= CONFIG.vendingCost;
        this.stats.strength += 1;
        this.energyBoostLeft = Math.min(this.energyBoostLeft + 360, 900);
        this.setStatus("Enerji içeceği alındı. +1 güç ve geçici enerji etkisi.");
        return;
      }

      if (this.nearInmateIndex >= 0) {
        const inmate = this.level.inmateRects[this.nearInmateIndex];
        const offer = this.getInmateOffer(inmate);
        if (!offer) {
          this.setStatus("En yüksek seviye kazma ekipmanına sahipsin.");
          return;
        }

        if (offer.level <= 1) {
          this.setStatus("Önce yatağın yanından kaşığı al.");
          return;
        }

        if (this.stats.strength < offer.reqStrength) {
          this.setStatus(`Bu ekipman için en az ${offer.reqStrength} güç lazım.`);
          return;
        }

        if (this.stats.money < offer.finalCost) {
          this.setStatus(`${offer.name} için ${offer.finalCost} TL gerekiyor.`);
          return;
        }

        this.stats.money -= offer.finalCost;
        this.stats.toolLevel = offer.level;
        this.player.hasSpoon = true;
        this.startBanner("EKIPMAN GELISTI", `${offer.name} - ${inmate ? inmate.area.toUpperCase() : "BOLGE"}`, 3);
        this.setStatus(`${offer.name} alındı. Kazma hızın arttı.`);
        return;
      }

      if (this.nearBed && this.player.hasSpoon) {
        this.setStatus("Yatakta alınacak başka eşya yok.");
        return;
      }

      this.setStatus("E ile alınacak bir eşya yakınında değilsin.");
    }

    handleDigW() {
      if (this.state !== "idle") {
        this.setStatus("Kazmadan önce mevcut işlemi bitir.");
        return;
      }

      if (this.isGuardActive()) {
        this.applyGuardPenalty("Gardiyan kazı denemeni fark etti", {
          digging: true,
          illegalItem: this.isIllegalItemCarried(),
          escapePreparation: true
        });
        return;
      }

      const digPower = this.getDigPower();
      if (digPower <= 0) {
        this.setStatus("Kazmak için önce kaşık veya kazma ekipmanı edin.");
        return;
      }

      if (this.nearbyDirtTile) {
        const speedFactor = clamp(0.5 + digPower * 0.35, 0.65, 2.4);
        const duration = CONFIG.diggingActionDuration / speedFactor;
        this.startTimedState(
          "digging",
          duration,
          { kind: "dirt", tile: this.nearbyDirtTile },
          "Toprak kazılıyor..."
        );
        return;
      }

      if (this.level.escapeOpened && this.nearTunnelEntry) {
        const speedFactor = clamp(0.45 + digPower * 0.3, 0.55, 2);
        const duration = (CONFIG.diggingActionDuration * 1.2) / speedFactor;
        this.startTimedState("digging", duration, { kind: "tunnel" }, "Tünelde kazı başlatıldı.");
        return;
      }

      this.setStatus("Kazmak için toprağa veya tünel girişine yaklaş.");
    }

    handleAttackR() {
      if (this.state !== "idle") {
        this.setStatus("Dövüş için önce mevcut işlemi bitir.");
        return;
      }

      if (this.nearInmateIndex < 0) {
        this.setStatus("Dövüşmek için bir mahkuma yaklaş.");
        return;
      }

      if (this.isGuardActive()) {
        this.applyGuardPenalty("Gardiyan kavga girişimini yakaladı", {
          illegalItem: this.isIllegalItemCarried(),
          escapePreparation: this.stats.diggingProgress > 0
        });
        return;
      }

      const inmate = this.level.inmateRects[this.nearInmateIndex];
      const areaRisk = this.getCurrentAreaData().risk;
      const difficulty = (inmate ? inmate.power : 5) + this.stats.toolLevel * 0.45 + areaRisk;
      this.startTimedState(
        "fighting",
        CONFIG.fightingDuration,
        { inmateIndex: this.nearInmateIndex, difficulty },
        `${inmate ? inmate.name : "Mahkum"} ile kavga başladı.`
      );
    }

    handleTileStateEvents() {
      for (const tile of this.level.removableTiles) {
        if (tile.consumeToDirtEvent()) {
          if (tile.revealsEscape) {
            this.setStatus("Doğru fayans kırıldı. Altında kazılabilir toprak var.");
          } else {
            this.setStatus("Fayans kırıldı. Altında toprak ortaya çıktı.");
          }
        }

        if (tile.consumeToEmptyEvent()) {
          if (tile.revealsEscape) {
            this.setStatus("Toprak bitti, tünel boşluğu açıldı.");
          }
        }
      }
    }

    updateMissionByProgress() {
      if (this.phase === "escaped") {
        this.setMission("Kaçış tamamlandı");
        return;
      }

      if (!this.level.hasExposedDirt()) {
        this.setMission("Q ile doğru fayansı kır");
        return;
      }

      if (!this.player.hasSpoon) {
        this.setMission("E ile yataktan kaşığı al");
        return;
      }

      if (!this.areaUnlocks.yard) {
        this.setMission("Guclen: Gun 2 ve Guc 4 ile Bahceyi ac");
        return;
      }

      if (!this.areaUnlocks.cafeteria) {
        this.setMission("Bahcede antreman yap ve Yemekhaneyi ac");
        return;
      }

      if (!this.level.escapeOpened) {
        this.setMission("W ile toprağı kazıp tünel girişini aç");
        return;
      }

      if (!this.areaUnlocks.secret) {
        this.setMission("Gizli alan icin Guc 14 ve Kazma Lv2 kas");
        return;
      }

      const tunnelPercent = Math.floor((this.stats.diggingProgress / CONFIG.tunnelTarget) * 100);
      this.setMission(`W ile tüneli kaz (%${tunnelPercent})`);
    }

    completeEscape() {
      if (this.phase === "escaped") {
        return;
      }

      this.phase = "escaped";
      this.state = "idle";
      this.stateTimer = 0;
      this.statePayload = null;
      this.startBanner("KAÇIŞ BAŞARILI", "Tünel tamamlandı, plan kusursuz işledi", 6);
      this.setStatus("Tünel tamamlandı. Hapisten kaçış gerçekleşti.");
      this.setMission("Özgürlüğe ulaştın");
    }

    start() {
      requestAnimationFrame((timestamp) => this.loop(timestamp));
    }

    loop(timestamp) {
      if (!this.lastFrameTime) {
        this.lastFrameTime = timestamp;
      }

      const dt = clamp((timestamp - this.lastFrameTime) / 1000, 0, 1 / 30);
      this.lastFrameTime = timestamp;
      this.elapsed += dt;

      this.update(dt);
      this.render();

      requestAnimationFrame((nextTimestamp) => this.loop(nextTimestamp));
    }

    update(dt) {
      this.level.update(dt);

      if (this.phase === "intro") {
        if (this.input.consumeStart()) {
          this.phase = "playing";
          if (ui.intro) {
            ui.intro.classList.add("hidden");
          }
          this.setStatus("Önce Q ile fayansı kır. Sonra E ile kaşığı al ve W ile kaz.");
        }
        return;
      }

      this.currentArea = this.level.getAreaByX(this.player.centerX).id;
      const gameDt = dt * CONFIG.timeScale;
      if (this.phase !== "escaped") {
        this.unlockAreasByProgress();
        this.lockedDoorIds = this.getLockedDoorIds();
        this.updateWorldTimers(gameDt, dt);
        this.unlockAreasByProgress();
        this.lockedDoorIds = this.getLockedDoorIds();
      }

      const collisionRects = this.level.getCollisionRects(this.lockedDoorIds);
      this.player.update(dt, this.input, collisionRects);
      this.refreshInteractionTargets();
      this.updateTimedState(dt);
      this.handleTileStateEvents();

      if (
        this.nearDoorId &&
        this.lockedDoorIds.includes(this.nearDoorId) &&
        this.areaHintCooldown <= 0 &&
        this.state === "idle"
      ) {
        const reason = this.getDoorLockReason(this.nearDoorId);
        if (reason) {
          this.setStatus(reason);
          this.areaHintCooldown = 1.25;
        }
      }

      if (this.phase !== "escaped") {
        if (this.input.consumePickup()) {
          this.handlePickupE();
        }

        if (this.input.consumeInteract()) {
          this.handleInteractQ();
        }

        if (this.input.consumeDig()) {
          this.handleDigW();
        }

        if (this.input.consumeAttack()) {
          this.handleAttackR();
        }

        if (this.level.consumeEscapeOpenedEvent()) {
          this.startBanner("GEÇİT AÇILDI", "Aşağı in ve tüneli kazmaya başla", 3.3);
          this.setStatus("Gizli kaçış tüneli açıldı. Aşağı inip W ile tüneli kaz.");
        }

        if (this.level.escapeOpened && !this.firstStageComplete) {
          this.firstStageComplete = true;
          this.startBanner("İLK AŞAMA TAMAMLANDI", "Şimdi ekipmanını geliştir ve tüneli tamamla", 3.4);
        }

        if (this.stats.diggingProgress >= CONFIG.tunnelTarget) {
          this.completeEscape();
        }
      }

      if (this.bannerTimer > 0) {
        this.bannerTimer = Math.max(0, this.bannerTimer - dt);
      }

      this.updateMissionByProgress();
      this.updateCamera(dt);
    }

    updateCamera(dt) {
      const target = this.player.centerX - canvas.width * 0.45;
      this.cameraX += (target - this.cameraX) * Math.min(1, dt * 5.5);
      this.cameraX = clamp(this.cameraX, 0, this.level.width - canvas.width);
    }

    drawInteractionPrompt() {
      let text = "";
      let x = 0;
      let y = 0;
      let borderColor = "rgba(241, 192, 112, 0.7)";
      let textColor = "#f2cf96";

      if (this.state !== "idle") {
        const stateText =
          this.state === "training"
            ? "Antrenman sürüyor..."
            : this.state === "digging"
              ? "Kazı sürüyor..."
              : "Kavga sürüyor...";
        text = stateText;
        x = this.player.x - this.cameraX + this.player.width * 0.5;
        y = this.player.y - 22;
      } else if (this.nearDoorId) {
        const door = this.nearDoor || this.level.getDoorById(this.nearDoorId);
        const reason = this.getDoorLockReason(this.nearDoorId);
        text = reason || `${door ? door.label : "Kapi"} acik, yuru ve gec`;
        x = door ? door.x - this.cameraX + door.width * 0.5 : this.player.x - this.cameraX;
        y = door ? door.y - 12 : this.player.y - 16;
        if (reason) {
          borderColor = "rgba(237, 148, 128, 0.75)";
          textColor = "#ffd5c8";
        } else {
          borderColor = "rgba(159, 219, 187, 0.75)";
          textColor = "#d6f6e5";
        }
      } else if (this.nearBed && !this.player.hasSpoon) {
        text = this.level.hasExposedDirt() ? "E ile kaşığı al" : "Önce Q ile fayansı kır";
        x = this.level.bedRect.x - this.cameraX + this.level.bedRect.width * 0.5;
        y = this.level.bedRect.y - 16;
      } else if (this.nearbyBreakTile) {
        text = "Q ile fayansı kır";
        x = this.nearbyBreakTile.x - this.cameraX + this.nearbyBreakTile.size * 0.5;
        y = this.nearbyBreakTile.y - 18;
      } else if (this.nearbyDirtTile && this.player.hasSpoon) {
        const dirtProgress = Math.round(this.nearbyDirtTile.getDigProgressRatio() * 100);
        text = `W ile kaz (%${dirtProgress})`;
        x = this.nearbyDirtTile.x - this.cameraX + this.nearbyDirtTile.size * 0.5;
        y = this.nearbyDirtTile.y - 18;
        borderColor = "rgba(139, 221, 191, 0.7)";
        textColor = "#bce8da";
      } else if (this.nearbyDirtTile && !this.player.hasSpoon) {
        text = "Kazmak için E ile kaşık al";
        x = this.nearbyDirtTile.x - this.cameraX + this.nearbyDirtTile.size * 0.5;
        y = this.nearbyDirtTile.y - 18;
      } else if (this.nearVending) {
        text = `E ile enerji içeceği al (${CONFIG.vendingCost} TL)`;
        x = this.level.vendingRect.x - this.cameraX + this.level.vendingRect.width * 0.5;
        y = this.level.vendingRect.y - 14;
        borderColor = "rgba(132, 207, 245, 0.7)";
        textColor = "#caebff";
      } else if (this.nearTraining) {
        text = "Q ile antrenman yap (+güç)";
        x = this.level.trainingRect.x - this.cameraX + this.level.trainingRect.width * 0.5;
        y = this.level.trainingRect.y - 14;
        borderColor = "rgba(141, 218, 177, 0.7)";
        textColor = "#caefdd";
      } else if (this.nearInmateIndex >= 0) {
        const inmate = this.level.inmateRects[this.nearInmateIndex];
        const offer = this.getInmateOffer(inmate);
        if (offer && offer.level > 1) {
          text = `E: ${offer.name} (${offer.finalCost} TL) | R: Dovus`;
        } else {
          text = "R ile dovus, E ile konus";
        }
        x = inmate.x - this.cameraX + inmate.width * 0.5;
        y = inmate.y - 16;
      } else if (this.level.escapeOpened && this.nearTunnelEntry) {
        const tunnelPercent = Math.floor((this.stats.diggingProgress / CONFIG.tunnelTarget) * 100);
        text = `W ile tünel kaz (%${tunnelPercent})`;
        const entryTile = this.level.getEntryTile();
        x = entryTile.x - this.cameraX + entryTile.size * 0.5;
        y = entryTile.y - 18;
        borderColor = "rgba(129, 216, 198, 0.72)";
        textColor = "#c4ece2";
      } else {
        return;
      }

      this.ctx.font = '16px "Share Tech Mono", monospace';
      const width = Math.max(180, this.ctx.measureText(text).width + 26);
      const height = 30;

      this.ctx.save();
      drawRoundedRect(this.ctx, x - width * 0.5, y - height * 0.7, width, height, 7);
      this.ctx.fillStyle = "rgba(7, 11, 16, 0.88)";
      this.ctx.fill();
      this.ctx.strokeStyle = borderColor;
      this.ctx.stroke();
      this.ctx.fillStyle = textColor;
      this.ctx.font = '16px "Share Tech Mono", monospace';
      this.ctx.textAlign = "center";
      this.ctx.fillText(text, x, y - 2);
      this.ctx.restore();
    }

    drawStatsPanel() {
      const panelX = 12;
      const panelY = 10;
      const panelW = 380;
      const panelH = 152;
      const tool = this.getToolData();
      const tunnelPercent = Math.floor((this.stats.diggingProgress / CONFIG.tunnelTarget) * 100);
      const guardText = this.isGuardActive()
        ? `KONTROLDE (${this.formatTimer(this.guardPatrolLeft)})`
        : this.formatTimer(this.guardCheckTimer);
      const stateLabel = this.state.toUpperCase();
      const energyText = this.energyBoostLeft > 0 ? this.formatTimer(this.energyBoostLeft) : "YOK";
      const areaLabel = this.level.getAreaById(this.currentArea).label;
      const unlockText = `Y:${this.areaUnlocks.yard ? "A" : "K"} C:${this.areaUnlocks.cafeteria ? "A" : "K"} S:${this.areaUnlocks.secret ? "A" : "K"}`;

      this.ctx.save();
      drawRoundedRect(this.ctx, panelX, panelY, panelW, panelH, 9);
      this.ctx.fillStyle = "rgba(7, 13, 21, 0.6)";
      this.ctx.fill();
      this.ctx.strokeStyle = "rgba(126, 159, 191, 0.56)";
      this.ctx.stroke();

      this.ctx.fillStyle = "#d7e2f3";
      this.ctx.font = '600 20px "Teko", sans-serif';
      this.ctx.textAlign = "left";
      this.ctx.fillText("DURUM PANELI", panelX + 12, panelY + 24);

      this.ctx.font = '13px "Share Tech Mono", monospace';
      this.ctx.fillStyle = "#dbe7fa";
      this.ctx.fillText(`Durum: ${stateLabel}`, panelX + 12, panelY + 44);
      this.ctx.fillText(`Gun: ${this.currentDay}`, panelX + 12, panelY + 62);
      this.ctx.fillText(`Para: ${this.money} TL`, panelX + 12, panelY + 80);
      this.ctx.fillText(`Guc: ${this.stats.strength}`, panelX + 12, panelY + 98);
      this.ctx.fillText(`Bolum: ${areaLabel}`, panelX + 12, panelY + 116);
      this.ctx.fillText(`Kilitler: ${unlockText}`, panelX + 12, panelY + 134);

      this.ctx.fillStyle = "#bdd4f2";
      this.ctx.fillText(`Ekipman: ${tool.name}`, panelX + 174, panelY + 44);
      this.ctx.fillText(`Kazma gucu: ${tool.digPower.toFixed(1)}`, panelX + 174, panelY + 62);
      this.ctx.fillText(`Tunel: %${tunnelPercent}`, panelX + 174, panelY + 80);
      this.ctx.fillText(`Enerji etkisi: ${energyText}`, panelX + 174, panelY + 98);
      this.ctx.fillText(`Sonraki Kontrol: ${guardText}`, panelX + 174, panelY + 116);
      this.ctx.fillText(`Nadir esya: ${this.rareRewards.tunnel_map ? "Tunel Plani" : "Yok"}`, panelX + 174, panelY + 134);
      this.ctx.restore();
    }

    drawGuardAlert() {
      const incoming = !this.isGuardActive() && this.guardCheckTimer <= CONFIG.guardWarningGameSec;
      if (!this.isGuardActive() && !incoming) {
        return;
      }

      const pulse = 0.3 + (Math.sin(this.elapsed * 9) + 1) * 0.16;
      this.ctx.save();
      drawRoundedRect(this.ctx, canvas.width * 0.5 - 190, 8, 380, 34, 8);
      this.ctx.fillStyle = this.isGuardActive()
        ? `rgba(143, 42, 34, ${(0.26 + pulse * 0.28).toFixed(3)})`
        : `rgba(143, 92, 34, ${(0.22 + pulse * 0.26).toFixed(3)})`;
      this.ctx.fill();
      this.ctx.strokeStyle = "rgba(227, 161, 140, 0.85)";
      this.ctx.stroke();
      this.ctx.fillStyle = "#ffe4d8";
      this.ctx.textAlign = "center";
      this.ctx.font = '14px "Share Tech Mono", monospace';
      const text = this.isGuardActive()
        ? "GARDIYAN KONTROLU AKTIF - SUPHELI HAREKET YAPMA"
        : `GARDIYAN KONTROLU GELIYOR (${this.formatTimer(this.guardCheckTimer)})`;
      this.ctx.fillText(text, canvas.width * 0.5, 30);
      this.ctx.restore();
    }

    drawEscapeOverlay() {
      if (this.phase !== "escaped") {
        return;
      }

      const width = 420;
      const height = 96;
      const x = canvas.width * 0.5 - width * 0.5;
      const y = canvas.height * 0.5 - height * 0.5;

      this.ctx.save();
      drawRoundedRect(this.ctx, x, y, width, height, 12);
      this.ctx.fillStyle = "rgba(7, 14, 20, 0.68)";
      this.ctx.fill();
      this.ctx.strokeStyle = "rgba(126, 211, 188, 0.82)";
      this.ctx.stroke();

      this.ctx.fillStyle = "#d6f3eb";
      this.ctx.textAlign = "center";
      this.ctx.font = '600 30px "Teko", sans-serif';
      this.ctx.fillText("KACIS TAMAMLANDI", canvas.width * 0.5, y + 36);
      this.ctx.font = '14px "Share Tech Mono", monospace';
      this.ctx.fillStyle = "#b6ded4";
      this.ctx.fillText("TUNEL BITTI. SIRADAKI ADIM: GERCEGI ORTAYA CIKAR.", canvas.width * 0.5, y + 62);
      this.ctx.restore();
    }

    drawAtmosphere() {
      this.ctx.save();
      const topAmbient = this.ctx.createLinearGradient(0, 0, 0, canvas.height * 0.7);
      topAmbient.addColorStop(0, "rgba(206, 222, 244, 0.2)");
      topAmbient.addColorStop(0.42, "rgba(187, 206, 232, 0.1)");
      topAmbient.addColorStop(1, "rgba(164, 188, 220, 0)");
      this.ctx.fillStyle = topAmbient;
      this.ctx.fillRect(0, 0, canvas.width, canvas.height);
      this.ctx.restore();

      const sweepX = ((this.elapsed * 120) % (canvas.width + 320)) - 160;
      this.ctx.save();
      this.ctx.fillStyle = "rgba(186, 54, 42, 0.01)";
      this.ctx.beginPath();
      this.ctx.moveTo(sweepX, 0);
      this.ctx.lineTo(sweepX + 95, 0);
      this.ctx.lineTo(sweepX - 90, canvas.height);
      this.ctx.lineTo(sweepX - 185, canvas.height);
      this.ctx.closePath();
      this.ctx.fill();
      this.ctx.restore();

      this.ctx.save();
      const vignette = this.ctx.createRadialGradient(
        canvas.width * 0.5,
        canvas.height * 0.5,
        200,
        canvas.width * 0.5,
        canvas.height * 0.5,
        canvas.width * 0.78
      );
      vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
      vignette.addColorStop(1, "rgba(0, 0, 0, 0.045)");
      this.ctx.fillStyle = vignette;
      this.ctx.fillRect(0, 0, canvas.width, canvas.height);
      this.ctx.restore();
    }

    drawStageBanner() {
      if (this.bannerTimer <= 0) {
        return;
      }

      const alpha = Math.min(1, this.bannerTimer);
      const width = 430;
      const height = 64;
      const x = canvas.width * 0.5 - width * 0.5;
      const y = 26;

      this.ctx.save();
      this.ctx.globalAlpha = alpha;
      drawRoundedRect(this.ctx, x, y, width, height, 10);
      this.ctx.fillStyle = "rgba(9, 14, 22, 0.9)";
      this.ctx.fill();
      this.ctx.strokeStyle = "rgba(133, 199, 187, 0.78)";
      this.ctx.stroke();

      this.ctx.fillStyle = "#d8f3eb";
      this.ctx.textAlign = "center";
      this.ctx.font = '600 28px "Teko", sans-serif';
      this.ctx.fillText(this.bannerTitle || "İLK AŞAMA TAMAMLANDI", canvas.width * 0.5, y + 30);
      this.ctx.font = '15px "Share Tech Mono", monospace';
      this.ctx.fillStyle = "#a4c9bf";
      this.ctx.fillText(
        this.bannerSubtitle || "TÜNELDE İLERLEME BAŞARILI",
        canvas.width * 0.5,
        y + 50
      );
      this.ctx.restore();
    }

    drawPlayer(x, y) {
      this.player.draw(this.ctx, this.cameraX, this.elapsed, x, y);
    }

    render() {
      this.ctx.clearRect(0, 0, canvas.width, canvas.height);
      this.level.draw(this.ctx, this.cameraX, canvas.width, this.elapsed, {
        highlightTile: this.currentInteractTile,
        highlightMode: this.highlightMode,
        nearBed: this.nearBed,
        hasSpoon: this.player.hasSpoon,
        nearVending: this.nearVending,
        nearTraining: this.nearTraining,
        nearInmateIndex: this.nearInmateIndex,
        currentArea: this.currentArea,
        lockedDoorIds: this.lockedDoorIds,
        nearDoorId: this.nearDoorId
      });
      this.level.drawForegroundBars(this.ctx, this.cameraX, canvas.width, this.elapsed);
      this.drawAtmosphere();
      const player = this.player;
      const drawPlayer = (x, y) => this.drawPlayer(x, y);
      drawPlayer(player.x, player.y);
      this.drawStatsPanel();
      this.drawGuardAlert();

      if (this.phase === "playing") {
        this.drawInteractionPrompt();
      }

      this.drawStageBanner();
      this.drawEscapeOverlay();
    }
  }

  const game = new Game(ctx);
  game.start();
})();
