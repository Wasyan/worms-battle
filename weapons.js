// Weapon Projectiles, Effects, and Arsenal Logic

class Projectile {
    constructor(x, y, vx, vy, type, owner) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.type = type; // 'bazooka', 'grenade', 'cluster', 'bomblet', 'dynamite', 'bullet'
        this.owner = owner;
        this.alive = true;
        this.timer = 0;
        this.maxTimer = 0;
        this.radius = 4;
        this.bounces = 0;

        if (this.type === 'grenade') {
            this.maxTimer = 180; // 3 seconds at 60fps
            this.radius = 5;
        } else if (this.type === 'cluster') {
            this.maxTimer = 150; // 2.5 seconds
            this.radius = 6;
        } else if (this.type === 'bomblet') {
            this.maxTimer = 70 + Math.floor(Math.random() * 30);
            this.radius = 3;
        } else if (this.type === 'dynamite') {
            this.maxTimer = 300; // 5 seconds
            this.radius = 7;
        }
    }

    update(game) {
        if (!this.alive) return;

        const terrain = game.terrain;
        const gravity = 0.26;

        // Apply wind physics (especially bazooka)
        if (this.type === 'bazooka') {
            this.vx += game.wind * 0.0006;
            this.vy += gravity * 0.65;

            // Spawn smoke trail
            if (Math.random() > 0.2) {
                game.addParticle({
                    x: this.x - this.vx * 0.5,
                    y: this.y - this.vy * 0.5,
                    vx: -this.vx * 0.1 + (Math.random() - 0.5) * 0.5,
                    vy: -this.vy * 0.1 + (Math.random() - 0.5) * 0.5,
                    size: 3 + Math.random() * 4,
                    color: 'rgba(220, 220, 220, 0.7)',
                    life: 1.0,
                    decay: 0.03
                });
            }
        } else if (this.type === 'bullet') {
            // High speed, no gravity
        } else {
            // Grenades, dynamite, cluster
            this.vy += gravity;
            this.vx *= 0.99;
        }

        // Timer countdown for fused weapons
        if (this.maxTimer > 0) {
            this.timer++;
            // Sound tick every second
            if (this.timer % 60 === 0 && this.timer < this.maxTimer) {
                if (window.soundSystem) window.soundSystem.playFuseTicking();
            }

            if (this.timer >= this.maxTimer) {
                this.explode(game);
                return;
            }
        }

        // Water check
        if (this.y >= terrain.waterLevel) {
            this.alive = false;
            game.createWaterSplash(this.x, terrain.waterLevel);
            if (window.soundSystem) window.soundSystem.playSplash();
            return;
        }

        // Step-based movement for collision accuracy
        const speed = Math.hypot(this.vx, this.vy);
        const steps = Math.max(1, Math.ceil(speed / 4));
        const stepVx = this.vx / steps;
        const stepVy = this.vy / steps;

        for (let s = 0; s < steps; s++) {
            const nextX = this.x + stepVx;
            const nextY = this.y + stepVy;

            // Worm collision check (for bazooka, shotgun bullets, cluster)
            if (this.type === 'bazooka' || this.type === 'bullet' || (this.type === 'bomblet' && this.timer > 15)) {
                for (const w of game.worms) {
                    if (w.isAlive && !w.isDrowned) {
                        // Avoid hitting owner immediately at launch
                        if (w === this.owner && this.timer < 10 && this.type !== 'bullet') continue;

                        const dist = Math.hypot(w.x - nextX, w.y - nextY);
                        if (dist < w.radius + this.radius) {
                            this.x = nextX;
                            this.y = nextY;
                            this.explode(game);
                            return;
                        }
                    }
                }
            }

            // Terrain collision check
            if (terrain.checkCircleOverlap(nextX, nextY, this.radius)) {
                if (this.type === 'bazooka' || this.type === 'bullet') {
                    this.x = nextX;
                    this.y = nextY;
                    this.explode(game);
                    return;
                } else if (this.type === 'grenade' || this.type === 'cluster' || this.type === 'bomblet' || this.type === 'dynamite') {
                    // Bounce
                    const normal = terrain.getNormal(nextX, nextY);
                    const dot = this.vx * normal.x + this.vy * normal.y;

                    // Elastic reflection
                    const restitution = (this.type === 'dynamite') ? 0.2 : 0.6;
                    this.vx = (this.vx - 2 * dot * normal.x) * restitution;
                    this.vy = (this.vy - 2 * dot * normal.y) * restitution;

                    this.bounces++;
                    if (speed > 1.5 && window.soundSystem) {
                        window.soundSystem.playBounce();
                    }

                    // Friction when rolling
                    this.vx *= 0.85;

                    // Stop jitter if very slow
                    if (Math.abs(this.vx) < 0.2 && Math.abs(this.vy) < 0.3) {
                        this.vx = 0;
                        this.vy = 0;
                    }
                    break;
                }
            } else {
                this.x = nextX;
                this.y = nextY;
            }
        }
    }

    explode(game) {
        this.alive = false;

        if (this.type === 'cluster') {
            // Burst into 5 smaller bomblets
            if (window.soundSystem) window.soundSystem.playExplosion(0.6);
            game.createExplosion(this.x, this.y, 25, 20);

            for (let i = 0; i < 5; i++) {
                const angle = -Math.PI * 0.8 + (i / 4) * Math.PI * 0.6 + (Math.random() * 0.3 - 0.15);
                const pSpeed = 3 + Math.random() * 4;
                const bomblet = new Projectile(
                    this.x,
                    this.y - 4,
                    Math.cos(angle) * pSpeed,
                    Math.sin(angle) * pSpeed,
                    'bomblet',
                    this.owner
                );
                game.projectiles.push(bomblet);
            }
            return;
        }

        // Standard explosions
        let blastRadius = 45;
        let maxDamage = 50;

        if (this.type === 'bazooka') {
            blastRadius = 48;
            maxDamage = 50;
        } else if (this.type === 'grenade') {
            blastRadius = 55;
            maxDamage = 55;
        } else if (this.type === 'bomblet') {
            blastRadius = 30;
            maxDamage = 28;
        } else if (this.type === 'dynamite') {
            blastRadius = 75;
            maxDamage = 75;
        } else if (this.type === 'bullet') {
            blastRadius = 18;
            maxDamage = 25;
        }

        game.createExplosion(this.x, this.y, blastRadius, maxDamage);
    }

    draw(ctx) {
        if (!this.alive) return;
        ctx.save();
        ctx.translate(this.x, this.y);

        if (this.type === 'bazooka') {
            // Rotate rocket to flight vector
            const angle = Math.atan2(this.vy, this.vx);
            ctx.rotate(angle);

            // Red/silver rocket body
            ctx.fillStyle = '#dc2626';
            ctx.beginPath();
            ctx.moveTo(10, 0);
            ctx.lineTo(-4, -4);
            ctx.lineTo(-6, -2);
            ctx.lineTo(-6, 2);
            ctx.lineTo(-4, 4);
            ctx.closePath();
            ctx.fill();

            // Rocket flame
            ctx.fillStyle = '#facc15';
            ctx.beginPath();
            ctx.moveTo(-6, -2);
            ctx.lineTo(-12 + Math.random() * 3, 0);
            ctx.lineTo(-6, 2);
            ctx.closePath();
            ctx.fill();
        } else if (this.type === 'grenade' || this.type === 'cluster' || this.type === 'bomblet') {
            // Spinning grenade
            ctx.rotate(this.bounces + this.timer * 0.15);
            ctx.fillStyle = this.type === 'cluster' ? '#ef4444' : (this.type === 'bomblet' ? '#f97316' : '#15803d');
            ctx.beginPath();
            ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 1;
            ctx.stroke();

            // Fuse countdown text
            if (this.maxTimer > 0) {
                const secsRemaining = Math.max(1, Math.ceil((this.maxTimer - this.timer) / 60));
                ctx.rotate(-(this.bounces + this.timer * 0.15)); // Unrotate for legible text
                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 10px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(secsRemaining, 0, -8);
            }
        } else if (this.type === 'dynamite') {
            // Red dynamite bundle
            ctx.fillStyle = '#dc2626';
            ctx.fillRect(-7, -5, 14, 10);
            ctx.fillStyle = '#fef08a';
            ctx.fillRect(-7, -2, 14, 4);

            // Burning fuse with spark
            const sparkY = -8;
            ctx.strokeStyle = '#78350f';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(0, -5);
            ctx.lineTo(2, sparkY);
            ctx.stroke();

            // Animated spark
            ctx.fillStyle = Math.random() > 0.5 ? '#facc15' : '#fb923c';
            ctx.beginPath();
            ctx.arc(2, sparkY, 3 + Math.random() * 2, 0, Math.PI * 2);
            ctx.fill();

            // Big countdown
            const secsRemaining = Math.max(1, Math.ceil((this.maxTimer - this.timer) / 60));
            ctx.fillStyle = '#facc15';
            ctx.font = 'bold 13px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(secsRemaining, 0, -14);
        } else if (this.type === 'bullet') {
            ctx.fillStyle = '#facc15';
            ctx.beginPath();
            ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }
}

// Airstrike Jet Flyover Manager
class AirstrikeManager {
    constructor(targetX, targetY) {
        this.targetX = targetX;
        this.targetY = targetY;
        this.x = targetX - 600;
        this.y = 80;
        this.speed = 12;
        this.active = true;
        this.bombsDropped = 0;
        this.maxBombs = 5;
        this.dropCooldown = 0;

        if (window.soundSystem) {
            window.soundSystem.playAirstrikeSiren();
            window.soundSystem.playJetFlyover();
        }
    }

    update(game) {
        if (!this.active) return;
        this.x += this.speed;

        // Drop bombs around targetX
        const dropStart = this.targetX - 140;
        const dropEnd = this.targetX + 140;

        if (this.x >= dropStart && this.x <= dropEnd && this.bombsDropped < this.maxBombs) {
            this.dropCooldown--;
            if (this.dropCooldown <= 0) {
                this.dropCooldown = 10;
                this.bombsDropped++;
                const bomb = new Projectile(this.x, this.y + 15, this.speed * 0.35, 2, 'grenade', null);
                bomb.maxTimer = 180;
                game.projectiles.push(bomb);
            }
        }

        if (this.x > game.terrain.width + 400) {
            this.active = false;
        }
    }

    draw(ctx) {
        if (!this.active) return;
        ctx.save();
        ctx.translate(this.x, this.y);

        // Jet fighter silhouette
        ctx.fillStyle = '#334155';
        ctx.beginPath();
        ctx.moveTo(35, 0);
        ctx.lineTo(-25, -12);
        ctx.lineTo(-15, 0);
        ctx.lineTo(-25, 12);
        ctx.closePath();
        ctx.fill();

        // Wings
        ctx.fillStyle = '#475569';
        ctx.beginPath();
        ctx.moveTo(5, 0);
        ctx.lineTo(-10, -30);
        ctx.lineTo(-18, -30);
        ctx.lineTo(-8, 0);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(5, 0);
        ctx.lineTo(-10, 30);
        ctx.lineTo(-18, 30);
        ctx.lineTo(-8, 0);
        ctx.closePath();
        ctx.fill();

        // Afterburner glow
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.arc(-22, 0, 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
}

window.Projectile = Projectile;
window.AirstrikeManager = AirstrikeManager;
