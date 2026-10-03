// Terrain Engine with Destructible Pixels and High-Performance Collision Grid

class Terrain {
    constructor(width = 2200, height = 1100) {
        this.width = width;
        this.height = height;
        this.waterLevel = height - 120;

        // Visual terrain canvas
        this.canvas = document.createElement('canvas');
        this.canvas.width = width;
        this.canvas.height = height;
        this.ctx = this.canvas.getContext('2d');

        // Fast in-memory 8-bit collision bitmask: 1 = solid, 0 = empty air
        this.grid = new Uint8Array(width * height);

        // Water animation offset
        this.waterOffset = 0;
        this.debrisList = [];

        this.generateIsland();
    }

    generateIsland() {
        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;

        ctx.clearRect(0, 0, w, h);
        this.grid.fill(0);

        // Procedural height curve with noise
        const seed1 = Math.random() * 100;
        const seed2 = Math.random() * 100;
        const seed3 = Math.random() * 100;

        // Base height map calculation
        const heightMap = new Float32Array(w);
        for (let x = 0; x < w; x++) {
            // Normalized X: -1 to 1 across island
            const nx = (x / w) * 2 - 1;
            // Island shape mask (drops sharply at sides into water)
            const islandMask = Math.max(0, 1 - Math.pow(Math.abs(nx * 1.25), 3.5));

            // Multi-frequency sine waves
            const wave1 = Math.sin(x * 0.003 + seed1) * 160;
            const wave2 = Math.sin(x * 0.008 + seed2) * 80;
            const wave3 = Math.sin(x * 0.025 + seed3) * 35;
            const roughness = Math.sin(x * 0.08) * 12;

            const baseElevation = h * 0.52 - (wave1 + wave2 + wave3 + roughness);
            // Height at this column
            const finalY = h - (h - baseElevation) * islandMask;
            heightMap[x] = Math.min(this.waterLevel + 40, finalY);
        }

        // Draw Dirt / Rock layer
        // Gradient dirt
        const dirtGrad = ctx.createLinearGradient(0, h * 0.2, 0, h);
        dirtGrad.addColorStop(0, '#a76a43'); // Top rich dirt
        dirtGrad.addColorStop(0.35, '#874d2b'); // Mid clay
        dirtGrad.addColorStop(0.7, '#5c321a'); // Dark rock
        dirtGrad.addColorStop(1.0, '#361b0d'); // Bedrock

        ctx.fillStyle = dirtGrad;
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let x = 0; x < w; x++) {
            ctx.lineTo(x, heightMap[x]);
        }
        ctx.lineTo(w, h);
        ctx.closePath();
        ctx.fill();

        // Add some procedural caverns/tunnels through the island
        const numCaves = 4 + Math.floor(Math.random() * 3);
        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        for (let c = 0; c < numCaves; c++) {
            const caveX = w * (0.2 + 0.6 * (c / numCaves)) + (Math.random() * 80 - 40);
            const groundY = heightMap[Math.floor(caveX)];
            const caveY = groundY + 120 + Math.random() * 140;
            const caveRadius = 60 + Math.random() * 45;

            if (caveY < this.waterLevel - 60) {
                ctx.beginPath();
                ctx.ellipse(caveX, caveY, caveRadius * 1.5, caveRadius * 0.8, Math.random() * 0.4 - 0.2, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.restore();

        // Read rendered pixels to build fast collision grid and detect surface
        const imgData = ctx.getImageData(0, 0, w, h);
        const data = imgData.data;

        for (let i = 0; i < data.length; i += 4) {
            const alpha = data[i + 3];
            const pixelIdx = i / 4;
            if (alpha > 40) {
                this.grid[pixelIdx] = 1;
            }
        }

        // Decorate: Paint lush green grass on all top-facing solid pixels!
        this.paintGrass();

        // Add dirt speckles and underground stones
        this.paintSpeckles();
    }

    paintGrass() {
        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;

        ctx.save();
        // Grass surface stroke
        for (let x = 1; x < w - 1; x++) {
            for (let y = 1; y < this.waterLevel; y++) {
                const idx = y * w + x;
                // If current pixel is solid and pixel directly above is air
                if (this.grid[idx] === 1 && this.grid[(y - 1) * w + x] === 0) {
                    // Thick lush grass top
                    ctx.fillStyle = '#4ade80'; // Bright cartoon green
                    ctx.fillRect(x, y, 1, 4);

                    ctx.fillStyle = '#16a34a'; // Dark green roots
                    ctx.fillRect(x, y + 4, 1, 3);

                    // Occasional grass blade tuft
                    if ((x % 7 === 0) && Math.random() > 0.3) {
                        ctx.fillStyle = '#22c55e';
                        ctx.fillRect(x, y - 3, 2, 3);
                    }
                    break;
                }
            }
        }
        ctx.restore();
    }

    paintSpeckles() {
        const ctx = this.ctx;
        ctx.save();
        // Specks of rocks and stones
        for (let i = 0; i < 900; i++) {
            const x = Math.floor(Math.random() * this.width);
            const y = Math.floor(Math.random() * (this.waterLevel - 100)) + 100;
            if (this.isSolid(x, y)) {
                ctx.fillStyle = Math.random() > 0.5 ? 'rgba(210, 180, 140, 0.4)' : 'rgba(50, 25, 10, 0.4)';
                const sz = 2 + Math.floor(Math.random() * 4);
                ctx.beginPath();
                ctx.arc(x, y, sz, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.restore();
    }

    isSolid(x, y) {
        const ix = Math.floor(x);
        const iy = Math.floor(y);
        if (ix < 0 || ix >= this.width) return false;
        if (iy < 0) return false;
        if (iy >= this.height) return true;
        return this.grid[iy * this.width + ix] === 1;
    }

    // High performance collision check: returns true if any pixel in circle is solid
    checkCircleOverlap(cx, cy, radius) {
        const r2 = radius * radius;
        const minX = Math.max(0, Math.floor(cx - radius));
        const maxX = Math.min(this.width - 1, Math.ceil(cx + radius));
        const minY = Math.max(0, Math.floor(cy - radius));
        const maxY = Math.min(this.height - 1, Math.ceil(cy + radius));

        for (let y = minY; y <= maxY; y++) {
            const dy = y - cy;
            const dy2 = dy * dy;
            const rowOffset = y * this.width;
            for (let x = minX; x <= maxX; x++) {
                const dx = x - cx;
                if (dx * dx + dy2 <= r2) {
                    if (this.grid[rowOffset + x] === 1) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    // Carves an explosion crater into the canvas and grid
    carveCrater(cx, cy, radius) {
        cx = Math.round(cx);
        cy = Math.round(cy);
        const r2 = radius * radius;

        // 1. Cut crater from visual canvas
        const ctx = this.ctx;
        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        // Add slight jagged cartoon perimeter
        const points = 16;
        for (let i = 0; i <= points; i++) {
            const angle = (i / points) * Math.PI * 2;
            const jitter = 0.9 + Math.random() * 0.2;
            const px = cx + Math.cos(angle) * (radius * jitter);
            const py = cy + Math.sin(angle) * (radius * jitter);
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();

        // 2. Add scorched burn rim around crater
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = 'rgba(30, 20, 15, 0.7)';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.restore();

        // 3. Clear collision grid
        const minX = Math.max(0, Math.floor(cx - radius));
        const maxX = Math.min(this.width - 1, Math.ceil(cx + radius));
        const minY = Math.max(0, Math.floor(cy - radius));
        const maxY = Math.min(this.height - 1, Math.ceil(cy + radius));

        for (let y = minY; y <= maxY; y++) {
            const dy = y - cy;
            const dy2 = dy * dy;
            const rowOffset = y * this.width;
            for (let x = minX; x <= maxX; x++) {
                const dx = x - cx;
                if (dx * dx + dy2 <= r2) {
                    this.grid[rowOffset + x] = 0;
                }
            }
        }

        // 4. Regrow fresh grass rim on newly exposed floor
        ctx.save();
        ctx.fillStyle = '#4ade80';
        for (let x = minX; x <= maxX; x += 2) {
            for (let y = Math.max(0, cy - radius); y <= Math.min(this.waterLevel, cy + radius + 10); y++) {
                const idx = y * this.width + x;
                if (this.grid[idx] === 1 && this.grid[(y - 1) * this.width + x] === 0) {
                    ctx.fillRect(x, y, 2, 3);
                    break;
                }
            }
        }
        ctx.restore();

        // 5. Spawn flying dirt and smoke debris particles
        this.spawnDebris(cx, cy, radius);
    }

    spawnDebris(cx, cy, radius) {
        const count = Math.min(60, Math.floor(radius * 0.9));
        const colors = ['#874d2b', '#5c321a', '#22c55e', '#a76a43', '#333333'];
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 2 + Math.random() * 9;
            this.debrisList.push({
                x: cx + Math.cos(angle) * (radius * 0.4),
                y: cy + Math.sin(angle) * (radius * 0.4),
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - (3 + Math.random() * 4),
                size: 2 + Math.random() * 4,
                color: colors[Math.floor(Math.random() * colors.length)],
                life: 1.0,
                decay: 0.015 + Math.random() * 0.02
            });
        }
    }

    updateDebris(gravity = 0.25) {
        for (let i = this.debrisList.length - 1; i >= 0; i--) {
            const d = this.debrisList[i];
            d.x += d.vx;
            d.y += d.vy;
            d.vy += gravity;
            d.life -= d.decay;

            // Simple bounce if hit terrain
            if (this.isSolid(d.x, d.y)) {
                d.vy *= -0.4;
                d.vx *= 0.6;
                d.y -= 1;
            }

            if (d.life <= 0 || d.y > this.height) {
                this.debrisList.splice(i, 1);
            }
        }
    }

    drawDebris(ctx) {
        for (const d of this.debrisList) {
            ctx.fillStyle = d.color;
            ctx.globalAlpha = Math.max(0, d.life);
            ctx.beginPath();
            ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1.0;
    }

    // Find first solid ground Y coordinate for placing worms
    findGroundY(x) {
        const ix = Math.floor(Math.max(10, Math.min(this.width - 10, x)));
        for (let y = 50; y < this.waterLevel; y++) {
            if (this.grid[y * this.width + ix] === 1) {
                return y;
            }
        }
        return -1;
    }

    // Normal vector calculation around collision point for bouncy weapons
    getNormal(x, y, searchRadius = 7) {
        let nx = 0;
        let ny = 0;
        const sr2 = searchRadius * searchRadius;

        for (let dy = -searchRadius; dy <= searchRadius; dy++) {
            for (let dx = -searchRadius; dx <= searchRadius; dx++) {
                if (dx * dx + dy * dy <= sr2) {
                    if (this.isSolid(x + dx, y + dy)) {
                        nx -= dx;
                        ny -= dy;
                    }
                }
            }
        }

        const len = Math.hypot(nx, ny);
        if (len > 0.001) {
            return { x: nx / len, y: ny / len };
        }
        return { x: 0, y: -1 }; // Default upward normal
    }

    // Raycast from (x1, y1) to (x2, y2). Returns { hit: boolean, x, y }
    raycast(x1, y1, x2, y2, step = 3) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const dist = Math.hypot(dx, dy);
        const steps = Math.ceil(dist / step);

        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const curX = x1 + dx * t;
            const curY = y1 + dy * t;

            if (this.isSolid(curX, curY)) {
                return { hit: true, x: curX, y: curY };
            }
        }
        return { hit: false, x: x2, y: y2 };
    }

    // Render terrain and water
    draw(renderCtx) {
        // Draw terrain canvas
        renderCtx.drawImage(this.canvas, 0, 0);

        // Draw debris
        this.drawDebris(renderCtx);

        // Animated ocean waves at waterLevel
        this.drawWater(renderCtx);
    }

    drawWater(ctx) {
        this.waterOffset += 0.04;
        const w = this.width;
        const yBase = this.waterLevel;

        ctx.save();
        // Deep water background
        const waterGrad = ctx.createLinearGradient(0, yBase, 0, this.height);
        waterGrad.addColorStop(0, 'rgba(14, 116, 144, 0.85)'); // Cyan deep
        waterGrad.addColorStop(1, 'rgba(2, 44, 84, 0.98)');   // Abyss

        ctx.fillStyle = waterGrad;
        ctx.beginPath();
        ctx.moveTo(0, this.height);
        ctx.lineTo(0, yBase);

        // Animated wave surface
        for (let x = 0; x <= w; x += 15) {
            const waveY = yBase + Math.sin(x * 0.02 + this.waterOffset) * 6 + Math.cos(x * 0.04 - this.waterOffset * 0.7) * 4;
            ctx.lineTo(x, waveY);
        }
        ctx.lineTo(w, this.height);
        ctx.closePath();
        ctx.fill();

        // Wave foam highlight
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        for (let x = 0; x <= w; x += 15) {
            const waveY = yBase + Math.sin(x * 0.02 + this.waterOffset) * 6 + Math.cos(x * 0.04 - this.waterOffset * 0.7) * 4;
            if (x === 0) ctx.moveTo(x, waveY);
            else ctx.lineTo(x, waveY);
        }
        ctx.stroke();

        ctx.restore();
    }
}

window.Terrain = Terrain;
