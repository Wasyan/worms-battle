// Weapon Projectiles, Special Weapons, Crates, and Arsenal Logic

function distToSegment(p, v, w) {
    const l2 = (v.x - w.x) * (v.x - w.x) + (v.y - w.y) * (v.y - w.y);
    if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
}

class Projectile {
    constructor(x, y, vx, vy, type, owner) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.type = type; // 'bazooka', 'grenade', 'cluster', 'bomblet', 'dynamite', 'bullet', 'holy', 'annihilator', 'carpet_bomb'
        this.owner = owner;
        this.alive = true;
        this.timer = 0;
        this.maxTimer = 0;
        this.radius = 4;
        this.bounces = 0;
        this.hallelujahPlayed = false;

        if (this.type === 'grenade') {
            this.maxTimer = 180; // 3 seconds
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
        } else if (this.type === 'holy') {
            this.maxTimer = 210; // 3.5 seconds
            this.radius = 7;
        } else if (this.type === 'annihilator') {
            this.radius = 8;
        } else if (this.type === 'carpet_bomb') {
            this.maxTimer = 130;
            this.radius = 5;
        }
    }

    update(game) {
        if (!this.alive) return;

        const terrain = game.terrain;
        const gravity = 0.26;

        // Apply wind & gravity physics
        if (this.type === 'bazooka') {
            this.vx += game.wind * 0.0006;
            this.vy += gravity * 0.65;

            // Smoke trail
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
        } else if (this.type === 'annihilator') {
            // Antimatter orb
            this.vy += gravity * 0.2;
            game.addParticle({
                x: this.x + (Math.random() - 0.5) * 8,
                y: this.y + (Math.random() - 0.5) * 8,
                vx: -this.vx * 0.1,
                vy: -this.vy * 0.1,
                size: 4 + Math.random() * 4,
                color: Math.random() > 0.5 ? '#a855f7' : '#38bdf8',
                life: 0.8,
                decay: 0.05
            });
        } else if (this.type === 'bullet') {
            // Instant high speed
        } else {
            // Grenades, Holy Grenade, Dynamite, Cluster
            this.vy += gravity;
            this.vx *= 0.99;
        }

        // Holy Hand Grenade Hallelujah moment!
        if (this.type === 'holy') {
            if (this.timer >= 125 && !this.hallelujahPlayed) {
                this.hallelujahPlayed = true;
                this.vx = 0;
                this.vy = 0;
                if (window.soundSystem) window.soundSystem.playHallelujah();
            }
        }

        // Timer countdown for fused weapons
        if (this.maxTimer > 0) {
            this.timer++;
            if (this.timer % 60 === 0 && this.timer < this.maxTimer && this.type !== 'holy') {
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

        // Collision steps
        const speed = Math.hypot(this.vx, this.vy);
        const steps = Math.max(1, Math.ceil(speed / 4));
        const stepVx = this.vx / steps;
        const stepVy = this.vy / steps;

        for (let s = 0; s < steps; s++) {
            const nextX = this.x + stepVx;
            const nextY = this.y + stepVy;

            // Worm collision
            if (this.type === 'bazooka' || this.type === 'annihilator' || this.type === 'bullet' || (this.type === 'bomblet' && this.timer > 15)) {
                for (const w of game.worms) {
                    if (w.isAlive && !w.isDrowned) {
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

            // Terrain collision
            if (terrain.checkCircleOverlap(nextX, nextY, this.radius)) {
                if (this.type === 'bazooka' || this.type === 'bullet' || this.type === 'annihilator') {
                    this.x = nextX;
                    this.y = nextY;
                    this.explode(game);
                    return;
                } else if (this.type === 'grenade' || this.type === 'cluster' || this.type === 'bomblet' || this.type === 'dynamite' || this.type === 'holy' || this.type === 'carpet_bomb') {
                    const normal = terrain.getNormal(nextX, nextY);
                    const dot = this.vx * normal.x + this.vy * normal.y;
                    const restitution = (this.type === 'dynamite') ? 0.2 : (this.type === 'holy' ? 0.5 : 0.6);

                    this.vx = (this.vx - 2 * dot * normal.x) * restitution;
                    this.vy = (this.vy - 2 * dot * normal.y) * restitution;

                    this.bounces++;
                    if (speed > 1.5 && window.soundSystem && this.type !== 'holy') {
                        window.soundSystem.playBounce();
                    }

                    this.vx *= 0.85;
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
            if (window.soundSystem) window.soundSystem.playExplosion(0.6);
            game.createExplosion(this.x, this.y, 25, 20);

            for (let i = 0; i < 5; i++) {
                const angle = -Math.PI * 0.8 + (i / 4) * Math.PI * 0.6 + (Math.random() * 0.3 - 0.15);
                const pSpeed = 3 + Math.random() * 4;
                const bomblet = new Projectile(this.x, this.y - 4, Math.cos(angle) * pSpeed, Math.sin(angle) * pSpeed, 'bomblet', this.owner);
                game.projectiles.push(bomblet);
            }
            return;
        }

        let blastRadius = 45;
        let maxDamage = 50;

        if (this.type === 'bazooka') {
            blastRadius = 48;
            maxDamage = 50;
        } else if (this.type === 'grenade') {
            blastRadius = 55;
            maxDamage = 55;
        } else if (this.type === 'holy') {
            // Holy Hand Grenade mega blast!
            blastRadius = 95;
            maxDamage = 115;
            // Screen flash white
            game.addParticle({
                x: this.x, y: this.y, vx: 0, vy: 0, size: 140,
                color: 'rgba(255, 255, 255, 0.9)', life: 1.0, decay: 0.05
            });
        } else if (this.type === 'annihilator') {
            // Annihilator Cannon antimatter blast
            blastRadius = 88;
            maxDamage = 100;
            if (window.soundSystem) window.soundSystem.playAnnihilatorFire();
        } else if (this.type === 'carpet_bomb') {
            blastRadius = 52;
            maxDamage = 50;
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
            const angle = Math.atan2(this.vy, this.vx);
            ctx.rotate(angle);
            ctx.fillStyle = '#dc2626';
            ctx.beginPath();
            ctx.moveTo(10, 0);
            ctx.lineTo(-4, -4);
            ctx.lineTo(-6, -2);
            ctx.lineTo(-6, 2);
            ctx.lineTo(-4, 4);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = '#facc15';
            ctx.beginPath();
            ctx.moveTo(-6, -2);
            ctx.lineTo(-12 + Math.random() * 3, 0);
            ctx.lineTo(-6, 2);
            ctx.closePath();
            ctx.fill();
        } else if (this.type === 'annihilator') {
            // Swirling black hole / antimatter sphere
            ctx.fillStyle = '#1e1b4b';
            ctx.beginPath();
            ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = '#c084fc';
            ctx.lineWidth = 2.5;
            ctx.stroke();

            // Energy ring
            ctx.strokeStyle = '#38bdf8';
            ctx.beginPath();
            ctx.arc(0, 0, this.radius + 3 + Math.sin(Date.now() * 0.02) * 2, 0, Math.PI * 2);
            ctx.stroke();
        } else if (this.type === 'holy') {
            // Holy Hand Grenade
            if (this.hallelujahPlayed) {
                // Heavenly beam of light
                ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
                ctx.fillRect(-12, -200, 24, 200);
            }

            ctx.fillStyle = '#eab308';
            ctx.beginPath();
            ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#ca8a04';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // Ruby Cross
            ctx.fillStyle = '#dc2626';
            ctx.fillRect(-1.5, -13, 3, 8);
            ctx.fillRect(-4, -11, 8, 3);
        } else if (this.type === 'grenade' || this.type === 'cluster' || this.type === 'bomblet' || this.type === 'carpet_bomb') {
            ctx.rotate(this.bounces + this.timer * 0.15);
            ctx.fillStyle = this.type === 'cluster' ? '#ef4444' : (this.type === 'carpet_bomb' ? '#b91c1c' : (this.type === 'bomblet' ? '#f97316' : '#15803d'));
            ctx.beginPath();
            ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 1;
            ctx.stroke();

            if (this.maxTimer > 0) {
                const secsRemaining = Math.max(1, Math.ceil((this.maxTimer - this.timer) / 60));
                ctx.rotate(-(this.bounces + this.timer * 0.15));
                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 10px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(secsRemaining, 0, -8);
            }
        } else if (this.type === 'dynamite') {
            ctx.fillStyle = '#dc2626';
            ctx.fillRect(-7, -5, 14, 10);
            ctx.fillStyle = '#fef08a';
            ctx.fillRect(-7, -2, 14, 4);
            const sparkY = -8;
            ctx.strokeStyle = '#78350f';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(0, -5);
            ctx.lineTo(2, sparkY);
            ctx.stroke();
            ctx.fillStyle = Math.random() > 0.5 ? '#facc15' : '#fb923c';
            ctx.beginPath();
            ctx.arc(2, sparkY, 3 + Math.random() * 2, 0, Math.PI * 2);
            ctx.fill();
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

// Concrete Donkey Manager
class ConcreteDonkeyManager {
    constructor(targetX) {
        this.x = targetX;
        this.y = -60;
        this.vy = 8;
        this.active = true;
        this.bounces = 0;
        this.maxBounces = 7;
        if (window.soundSystem) window.soundSystem.playDonkeyBays();
    }

    update(game) {
        if (!this.active) return;
        this.y += this.vy;
        this.vy += 0.45; // Heavy gravity

        // Check water
        if (this.y >= game.terrain.waterLevel) {
            game.createWaterSplash(this.x, game.terrain.waterLevel);
            if (window.soundSystem) window.soundSystem.playSplash();
            this.active = false;
            return;
        }

        // Check terrain collision
        if (game.terrain.checkCircleOverlap(this.x, this.y, 25)) {
            game.terrain.carveCrater(this.x, this.y, 65);
            game.shakeTimer = 22;
            game.shakeIntensity = 18;

            if (window.soundSystem) {
                window.soundSystem.playDonkeyBays();
                window.soundSystem.playDonkeyImpact();
            }

            // Damage nearby worms & crush them
            for (const w of game.worms) {
                if (w.isAlive && !w.isDrowned) {
                    const dist = Math.hypot(w.x - this.x, w.y - this.y);
                    if (dist < 85) {
                        w.takeDamage(65);
                        w.applyImpulse((Math.random() - 0.5) * 6, 8);
                        game.addFloatingText("-65", w.x, w.y - 20, '#ef4444');
                    }
                }
            }

            this.bounces++;
            this.vy = -3.5;

            if (this.bounces >= this.maxBounces) {
                game.terrain.carveVerticalShaft(this.x, 50);
            }
        }
    }

    draw(ctx) {
        if (!this.active) return;
        ctx.save();
        ctx.translate(this.x, this.y);

        ctx.fillStyle = '#94a3b8';
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 2;

        // Body
        ctx.beginPath();
        ctx.roundRect(-24, -18, 48, 36, 8);
        ctx.fill();
        ctx.stroke();

        // Head & Muzzle
        ctx.fillRect(-18, -36, 20, 22);
        ctx.fillRect(-28, -28, 14, 14);

        // Ears
        ctx.fillRect(-16, -48, 6, 16);
        ctx.fillRect(-8, -46, 6, 14);

        // Legs
        ctx.fillRect(-20, 18, 8, 16);
        ctx.fillRect(12, 18, 8, 16);

        // Eye
        ctx.fillStyle = '#1e293b';
        ctx.beginPath();
        ctx.arc(-14, -30, 2.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
}

// Sunbeam Orbital Manager
class SunbeamManager {
    constructor(targetX) {
        this.x = targetX;
        this.timer = 0;
        this.maxTimer = 110;
        this.active = true;
        this.width = 65;
        if (window.soundSystem) window.soundSystem.playSunbeam();
    }

    update(game) {
        if (!this.active) return;
        this.timer++;

        if (this.timer > 20 && this.timer < 95) {
            const currentY = (this.timer - 20) * 13;
            if (currentY < game.terrain.waterLevel) {
                game.terrain.carveCrater(this.x + (Math.random() - 0.5) * 15, currentY, 35);
            }

            for (const w of game.worms) {
                if (w.isAlive && !w.isDrowned) {
                    if (Math.abs(w.x - this.x) < this.width * 0.6) {
                        w.takeDamage(2);
                        w.applyImpulse((w.x - this.x) * 0.1, 0.4);
                        if (Math.random() < 0.2) {
                            game.addFloatingText("🔥", w.x, w.y - 15, '#facc15');
                        }
                    }
                }
            }

            for (let i = 0; i < 4; i++) {
                game.addParticle({
                    x: this.x + (Math.random() - 0.5) * this.width,
                    y: Math.random() * game.terrain.waterLevel,
                    vx: (Math.random() - 0.5) * 3,
                    vy: 4 + Math.random() * 8,
                    size: 3 + Math.random() * 5,
                    color: Math.random() > 0.5 ? '#fef08a' : '#f97316',
                    life: 1.0,
                    decay: 0.05
                });
            }
        }

        if (this.timer >= this.maxTimer) {
            this.active = false;
        }
    }

    draw(ctx) {
        if (!this.active || this.timer < 10) return;
        ctx.save();
        const progress = Math.min(1, (this.timer - 10) / 20) * Math.max(0, (this.maxTimer - this.timer) / 25);
        const curW = this.width * progress;

        const grad = ctx.createLinearGradient(this.x - curW / 2, 0, this.x + curW / 2, 0);
        grad.addColorStop(0, 'rgba(250, 204, 21, 0)');
        grad.addColorStop(0.3, 'rgba(253, 224, 71, 0.7)');
        grad.addColorStop(0.5, 'rgba(255, 255, 255, 0.95)');
        grad.addColorStop(0.7, 'rgba(253, 224, 71, 0.7)');
        grad.addColorStop(1, 'rgba(250, 204, 21, 0)');

        ctx.fillStyle = grad;
        ctx.fillRect(this.x - curW / 2, 0, curW, 1100);
        ctx.restore();
    }
}

// Laser Drill Manager
class LaserDrillManager {
    constructor(x, y, angle, owner) {
        this.x = x;
        this.y = y;
        this.angle = angle;
        this.owner = owner;
        this.timer = 0;
        this.maxTimer = 45;
        this.active = true;
        this.length = 260;
        if (window.soundSystem) window.soundSystem.playLaserDrill();
    }

    update(game) {
        if (!this.active) return;
        this.timer++;

        const endX = this.x + Math.cos(this.angle) * this.length;
        const endY = this.y + Math.sin(this.angle) * this.length;

        game.terrain.carveTunnel(this.x, this.y, endX, endY, 20);

        for (const w of game.worms) {
            if (w !== this.owner && w.isAlive && !w.isDrowned) {
                const distToLine = distToSegment({ x: w.x, y: w.y }, { x: this.x, y: this.y }, { x: endX, y: endY });
                if (distToLine < 24) {
                    w.takeDamage(2);
                    w.applyImpulse(Math.cos(this.angle) * 0.8, Math.sin(this.angle) * 0.8);
                }
            }
        }

        for (let i = 0; i < 3; i++) {
            const t = Math.random();
            game.addParticle({
                x: this.x + (endX - this.x) * t,
                y: this.y + (endY - this.y) * t,
                vx: (Math.random() - 0.5) * 5,
                vy: (Math.random() - 0.5) * 5,
                size: 2 + Math.random() * 3,
                color: '#ef4444',
                life: 1.0,
                decay: 0.08
            });
        }

        if (this.timer >= this.maxTimer) {
            this.active = false;
        }
    }

    draw(ctx) {
        if (!this.active) return;
        ctx.save();
        const endX = this.x + Math.cos(this.angle) * this.length;
        const endY = this.y + Math.sin(this.angle) * this.length;

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(endX, endY);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(239, 68, 68, 0.7)';
        ctx.lineWidth = 16;
        ctx.stroke();

        ctx.restore();
    }
}

// Electroshock Manager
class ElectroshockManager {
    constructor(x, y, angle, owner) {
        this.x = x;
        this.y = y;
        this.angle = angle;
        this.owner = owner;
        this.timer = 0;
        this.maxTimer = 35;
        this.active = true;
        this.targetWorm = null;
        if (window.soundSystem) window.soundSystem.playElectroshock();
    }

    update(game) {
        if (!this.active) return;
        this.timer++;

        if (this.timer === 1) {
            let closest = null;
            let minDist = 190;
            for (const w of game.worms) {
                if (w !== this.owner && w.isAlive && !w.isDrowned) {
                    const dist = Math.hypot(w.x - this.x, w.y - this.y);
                    if (dist < minDist) {
                        minDist = dist;
                        closest = w;
                    }
                }
            }

            if (closest) {
                this.targetWorm = closest;
                closest.takeDamage(48);
                const angle = Math.atan2(closest.y - this.y, closest.x - this.x);
                closest.applyImpulse(Math.cos(angle) * 9, -5);
                game.addFloatingText("-48 ⚡", closest.x, closest.y - 20, '#38bdf8');
                closest.say("БЗЗЗТ! ⚡", 60);
            }
        }

        if (this.timer >= this.maxTimer) {
            this.active = false;
        }
    }

    draw(ctx) {
        if (!this.active) return;
        ctx.save();
        const targetX = this.targetWorm ? this.targetWorm.x : (this.x + Math.cos(this.angle) * 160);
        const targetY = this.targetWorm ? this.targetWorm.y : (this.y + Math.sin(this.angle) * 160);

        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);

        const segments = 10;
        for (let i = 1; i <= segments; i++) {
            const t = i / segments;
            const px = this.x + (targetX - this.x) * t + (i < segments ? (Math.random() - 0.5) * 22 : 0);
            const py = this.y + (targetY - this.y) * t + (i < segments ? (Math.random() - 0.5) * 22 : 0);
            ctx.lineTo(px, py);
        }
        ctx.stroke();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.restore();
    }
}

// Carpet Strike Bomber Manager
class CarpetStrikeManager {
    constructor(targetX) {
        this.targetX = targetX;
        this.x = targetX - 650;
        this.y = 70;
        this.speed = 14;
        this.active = true;
        this.bombsDropped = 0;
        this.maxBombs = 10;
        this.dropCooldown = 0;
        if (window.soundSystem) {
            window.soundSystem.playAirstrikeSiren();
            window.soundSystem.playJetFlyover();
        }
    }

    update(game) {
        if (!this.active) return;
        this.x += this.speed;

        const dropStart = this.targetX - 220;
        const dropEnd = this.targetX + 220;

        if (this.x >= dropStart && this.x <= dropEnd && this.bombsDropped < this.maxBombs) {
            this.dropCooldown--;
            if (this.dropCooldown <= 0) {
                this.dropCooldown = 6;
                this.bombsDropped++;
                const bomb = new Projectile(this.x, this.y + 15, this.speed * 0.25, 2, 'carpet_bomb', null);
                bomb.maxTimer = 120;
                game.projectiles.push(bomb);
            }
        }

        if (this.x > game.terrain.width + 450) {
            this.active = false;
        }
    }

    draw(ctx) {
        if (!this.active) return;
        ctx.save();
        ctx.translate(this.x, this.y);

        ctx.fillStyle = '#1e293b';
        ctx.beginPath();
        ctx.moveTo(40, 0);
        ctx.lineTo(-30, -35);
        ctx.lineTo(-20, -15);
        ctx.lineTo(-35, 0);
        ctx.lineTo(-20, 15);
        ctx.lineTo(-30, 35);
        ctx.closePath();
        ctx.fill();

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

        ctx.fillStyle = '#334155';
        ctx.beginPath();
        ctx.moveTo(35, 0);
        ctx.lineTo(-25, -12);
        ctx.lineTo(-15, 0);
        ctx.lineTo(-25, 12);
        ctx.closePath();
        ctx.fill();

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

        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.arc(-22, 0, 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
}

// Parachute Bonus Crate
class Crate {
    constructor(x, type = 'giant') {
        this.x = x;
        this.y = 50;
        this.vy = 1.2;
        this.type = type; // 'giant', 'weapon', 'health'
        this.active = true;
        this.width = 24;
        this.height = 24;
        this.onGround = false;
    }

    update(game) {
        if (!this.active) return;

        if (!this.onGround) {
            this.y += this.vy;
            if (game.terrain.checkCircleOverlap(this.x, this.y + 12, 12)) {
                this.onGround = true;
                this.vy = 0;
            }
        }

        if (this.y >= game.terrain.waterLevel) {
            this.active = false;
            game.createWaterSplash(this.x, game.terrain.waterLevel);
            return;
        }

        // Worm collision
        for (const w of game.worms) {
            if (w.isAlive && !w.isDrowned) {
                const dist = Math.hypot(w.x - this.x, w.y - this.y);
                if (dist < w.radius + 14) {
                    this.collect(w, game);
                    break;
                }
            }
        }
    }

    collect(worm, game) {
        this.active = false;
        if (window.soundSystem) window.soundSystem.playCratePickup();

        if (this.type === 'giant') {
            worm.becomeGiant();
            game.addFloatingText("🦖 МЕГА-ЧЕРВЯК! 400 HP!", worm.x, worm.y - 30, '#facc15');
        } else if (this.type === 'health') {
            worm.hp = Math.min(worm.maxHp, worm.hp + 60);
            game.addFloatingText("+60 HP Аптечка!", worm.x, worm.y - 25, '#22c55e');
            worm.say("О, здоровье!", 50);
        } else if (this.type === 'weapon') {
            game.refillTeamAmmo(worm.team);
            game.addFloatingText("БОЕПРИПАСЫ ПОПОЛНЕНЫ! 📦", worm.x, worm.y - 25, '#38bdf8');
            worm.say("Оружие пополнено!", 50);
        }
    }

    draw(ctx) {
        if (!this.active) return;
        ctx.save();
        ctx.translate(this.x, this.y);

        if (!this.onGround) {
            ctx.fillStyle = '#f8fafc';
            ctx.strokeStyle = '#94a3b8';
            ctx.lineWidth = 1.5;

            ctx.beginPath();
            ctx.arc(0, -22, 18, Math.PI, 0);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(-16, -22);
            ctx.lineTo(0, -10);
            ctx.moveTo(16, -22);
            ctx.lineTo(0, -10);
            ctx.stroke();
        }

        ctx.fillStyle = this.type === 'giant' ? '#d97706' : '#78350f';
        ctx.fillRect(-11, -11, 22, 22);
        ctx.strokeStyle = this.type === 'giant' ? '#facc15' : '#451a03';
        ctx.lineWidth = 2;
        ctx.strokeRect(-11, -11, 22, 22);

        ctx.font = '13px sans-serif';
        ctx.textAlign = 'center';
        if (this.type === 'giant') {
            ctx.fillText('🦖', 0, 4);
        } else if (this.type === 'health') {
            ctx.fillText('❤️', 0, 4);
        } else {
            ctx.fillText('📦', 0, 4);
        }

        ctx.restore();
    }
}

window.Projectile = Projectile;
window.AirstrikeManager = AirstrikeManager;
window.CarpetStrikeManager = CarpetStrikeManager;
window.ConcreteDonkeyManager = ConcreteDonkeyManager;
window.SunbeamManager = SunbeamManager;
window.LaserDrillManager = LaserDrillManager;
window.ElectroshockManager = ElectroshockManager;
window.Crate = Crate;
