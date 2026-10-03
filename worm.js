// Worm Character Class with Animation, Physics, Team Hats, and Bot AI

class Worm {
    constructor(id, team, name, x, y) {
        this.id = id;
        this.team = team; // 'red' or 'blue'
        this.name = name;
        this.x = x;
        this.y = y;
        this.vx = 0;
        this.vy = 0;
        this.radius = 12; // Collision radius
        this.hp = 100;
        this.maxHp = 100;
        this.isAlive = true;
        this.isDrowned = false;

        this.facing = team === 'red' ? 1 : -1;
        this.aimAngle = this.facing === 1 ? -0.4 : -Math.PI + 0.4;
        this.onGround = false;

        // Visual & animation properties
        this.walkCycle = 0;
        this.squish = 1.0;
        this.blinkTimer = Math.random() * 120;
        this.isBlinking = false;
        this.haloY = 0; // For drowning angel
        this.tombstone = false;

        // Speech bubble
        this.speechText = "";
        this.speechTimer = 0;

        // AI Control state
        this.isBot = false;
        this.botStep = 'idle';
        this.botTimer = 0;
        this.botTarget = null;
        this.botPower = 0;
        this.botTargetAngle = 0;
        this.botChosenWeapon = 'bazooka';
    }

    say(text, duration = 90) {
        this.speechText = text;
        this.speechTimer = duration;
    }

    update(terrain, gravity = 0.28) {
        if (!this.isAlive) {
            if (this.isDrowned) {
                this.haloY -= 1.2;
            }
            return;
        }

        if (this.speechTimer > 0) this.speechTimer--;

        // Blinking logic
        this.blinkTimer++;
        if (this.blinkTimer > 180) {
            this.isBlinking = true;
            if (this.blinkTimer > 192) {
                this.isBlinking = false;
                this.blinkTimer = 0;
            }
        }

        // Apply physics
        this.vy += gravity;

        // Terminal fall velocity
        if (this.vy > 15) this.vy = 15;

        // Air drag
        this.vx *= 0.98;

        // Horizontal movement with slope climbing
        const nextX = this.x + this.vx;
        const nextY = this.y + this.vy;

        // Check water collision
        if (nextY >= terrain.waterLevel) {
            this.drown(terrain);
            return;
        }

        // Slope climbing and terrain collision
        if (this.vx !== 0) {
            let canMove = false;
            // Test if we can step up up to 7 pixels
            for (let stepUp = 0; stepUp <= 7; stepUp++) {
                if (!terrain.checkCircleOverlap(nextX, this.y - stepUp, this.radius)) {
                    this.x = nextX;
                    this.y -= stepUp;
                    canMove = true;
                    break;
                }
            }
            if (!canMove) {
                // Hit vertical wall
                if (Math.abs(this.vx) > 4) {
                    this.takeDamage(Math.floor(Math.abs(this.vx) * 1.5));
                }
                this.vx = 0;
            }
        }

        // Vertical collision
        if (this.vy > 0) {
            // Falling
            if (terrain.checkCircleOverlap(this.x, nextY, this.radius)) {
                // Touch ground!
                this.onGround = true;
                // High fall damage
                if (this.vy > 8.5) {
                    const dmg = Math.floor((this.vy - 7) * 7);
                    this.takeDamage(dmg);
                    this.say("Ай, больно!", 60);
                    if (window.soundSystem) window.soundSystem.playVoiceOuch();
                }
                this.vy = 0;
                // Align to ground surface
                while (terrain.checkCircleOverlap(this.x, this.y, this.radius) && this.y > 0) {
                    this.y -= 1;
                }
            } else {
                this.y = nextY;
                this.onGround = false;
            }
        } else if (this.vy < 0) {
            // Jumping / propelled upward
            if (terrain.checkCircleOverlap(this.x, nextY, this.radius)) {
                this.vy = 0;
            } else {
                this.y = nextY;
            }
            this.onGround = false;
        }

        // Keep inside horizontal world bounds
        this.x = Math.max(this.radius + 5, Math.min(terrain.width - this.radius - 5, this.x));
    }

    move(dir, terrain) {
        if (!this.isAlive || !this.onGround) return;
        this.facing = dir;
        this.walkCycle += 0.35;
        this.vx = dir * 1.8;

        // Auto update aim angle to maintain orientation
        if (this.facing === 1 && (this.aimAngle < -Math.PI / 2 || this.aimAngle > Math.PI / 2)) {
            this.aimAngle = -0.4;
        } else if (this.facing === -1 && this.aimAngle > -Math.PI / 2 && this.aimAngle < Math.PI / 2) {
            this.aimAngle = -Math.PI + 0.4;
        }
    }

    jump(terrain, isHighJump = false) {
        if (!this.isAlive || !this.onGround) return;
        this.onGround = false;
        if (isHighJump) {
            // Backflip / high vertical leap
            this.vy = -7.5;
            this.vx = -this.facing * 2.2;
            this.say("Хоп!", 40);
        } else {
            // Forward hop
            this.vy = -5.8;
            this.vx = this.facing * 3.4;
        }
        if (window.soundSystem) window.soundSystem.playJump();
    }

    takeDamage(dmg) {
        if (!this.isAlive) return;
        this.hp -= dmg;
        this.squish = 0.5;
        if (this.hp <= 0) {
            this.hp = 0;
            this.die();
        } else {
            this.say(`-${dmg}`, 45);
        }
    }

    applyImpulse(ix, iy) {
        this.vx += ix;
        this.vy += iy;
        this.onGround = false;
    }

    die() {
        this.isAlive = false;
        this.tombstone = true;
        this.say("Прощайте...", 80);
        if (window.soundSystem) window.soundSystem.playVoiceOuch();
    }

    drown(terrain) {
        this.isAlive = false;
        this.isDrowned = true;
        this.hp = 0;
        this.y = terrain.waterLevel + 10;
        this.haloY = this.y - 15;
        this.say("Буль-буль!", 80);
        if (window.soundSystem) window.soundSystem.playSplash();
    }

    draw(ctx, isActive = false, currentWeapon = 'bazooka') {
        ctx.save();

        if (this.isDrowned) {
            // Draw golden angel halo ascending into heaven
            ctx.strokeStyle = '#facc15';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.ellipse(this.x, this.haloY, 14, 6, 0, 0, Math.PI * 2);
            ctx.stroke();

            // Tiny cartoon wings
            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            ctx.beginPath();
            ctx.ellipse(this.x - 12, this.haloY + 6, 8, 4, -0.4, 0, Math.PI * 2);
            ctx.ellipse(this.x + 12, this.haloY + 6, 8, 4, 0.4, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            return;
        }

        if (this.tombstone) {
            // Draw stone cross / grave
            ctx.fillStyle = '#64748b';
            ctx.fillRect(this.x - 7, this.y - 20, 14, 22);
            ctx.fillRect(this.x - 14, this.y - 15, 28, 7);
            ctx.fillStyle = '#cbd5e1';
            ctx.font = 'bold 9px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('R.I.P', this.x, this.y - 3);
            ctx.restore();
            return;
        }

        // Active pointer indicator arrow above worm
        if (isActive) {
            const bounce = Math.sin(Date.now() * 0.008) * 4;
            const arrowY = this.y - 42 + bounce;
            ctx.fillStyle = this.team === 'red' ? '#ef4444' : '#3b82f6';
            ctx.beginPath();
            ctx.moveTo(this.x, arrowY + 8);
            ctx.lineTo(this.x - 7, arrowY);
            ctx.lineTo(this.x + 7, arrowY);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }

        // Health bar & name tag
        this.drawHealthBar(ctx, isActive);

        // Worm Body Rendering
        ctx.translate(this.x, this.y);
        ctx.scale(this.facing, 1);

        // Body squish animation during walking or landing
        const squishX = 1 + Math.sin(this.walkCycle) * 0.18;
        const squishY = 1 - Math.sin(this.walkCycle) * 0.15;
        ctx.scale(squishX, squishY);

        // Worm Flesh Colors
        const wormPink = '#fb7185';
        const wormShadow = '#e11d48';

        // 1. Tail segment
        ctx.fillStyle = wormShadow;
        ctx.beginPath();
        ctx.arc(-8, 3, 7, 0, Math.PI * 2);
        ctx.fill();

        // 2. Main Middle segment
        ctx.fillStyle = wormPink;
        ctx.beginPath();
        ctx.arc(-1, 0, 9, 0, Math.PI * 2);
        ctx.fill();

        // 3. Head segment
        ctx.beginPath();
        ctx.arc(4, -7, 9, 0, Math.PI * 2);
        ctx.fill();

        // 4. Team Hat / Headgear!
        if (this.team === 'red') {
            // Red Bandana with trailing knot
            ctx.fillStyle = '#dc2626';
            ctx.beginPath();
            ctx.arc(4, -10, 9.5, Math.PI * 0.9, Math.PI * 2.1);
            ctx.fill();
            // Bandana knot tails
            ctx.beginPath();
            ctx.moveTo(-4, -8);
            ctx.lineTo(-12, -4);
            ctx.lineTo(-10, -11);
            ctx.closePath();
            ctx.fill();
        } else {
            // Blue Military Helmet with rim
            ctx.fillStyle = '#1d4ed8';
            ctx.beginPath();
            ctx.arc(4, -10, 10.5, Math.PI * 0.8, Math.PI * 2.2);
            ctx.fill();
            // Helmet rim
            ctx.fillStyle = '#1e3a8a';
            ctx.fillRect(-6, -11, 20, 3.5);
            // Little star/badge
            ctx.fillStyle = '#facc15';
            ctx.beginPath();
            ctx.arc(5, -12, 2.5, 0, Math.PI * 2);
            ctx.fill();
        }

        // 5. Big expressive eyes
        const eyeX = 7;
        const eyeY = -8;
        if (this.isBlinking) {
            // Closed eyes
            ctx.strokeStyle = '#1e293b';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(eyeX - 3, eyeY);
            ctx.lineTo(eyeX + 3, eyeY);
            ctx.stroke();
        } else {
            // White eyeballs
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(eyeX, eyeY, 3.5, 0, Math.PI * 2);
            ctx.arc(eyeX - 4, eyeY, 3.0, 0, Math.PI * 2);
            ctx.fill();

            // Dark Pupils looking towards aiming direction
            ctx.fillStyle = '#0f172a';
            ctx.beginPath();
            ctx.arc(eyeX + 1.2, eyeY - 0.2, 1.8, 0, Math.PI * 2);
            ctx.arc(eyeX - 3.2, eyeY - 0.2, 1.6, 0, Math.PI * 2);
            ctx.fill();
        }

        // 6. Cute smile or mouth
        ctx.strokeStyle = '#881337';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(6, -3, 3, 0.2, Math.PI * 0.8);
        ctx.stroke();

        // 7. Weapon in hands if active
        if (isActive) {
            this.drawWeapon(ctx, currentWeapon);
        }

        ctx.restore();

        // Draw Speech Bubble
        if (this.speechTimer > 0 && this.speechText) {
            this.drawSpeechBubble(ctx);
        }
    }

    drawWeapon(ctx, weapon) {
        // Draw weapon angled towards aimAngle
        ctx.save();
        ctx.translate(2, -4);

        // Adjust relative angle for flipped orientation
        let renderAngle = this.aimAngle;
        if (this.facing === -1) {
            renderAngle = Math.PI - this.aimAngle;
        }

        ctx.rotate(renderAngle);

        switch (weapon) {
            case 'bazooka':
                // Bazooka green launch tube
                ctx.fillStyle = '#3f6212';
                ctx.fillRect(0, -4, 20, 8);
                // Metal nozzle & trigger
                ctx.fillStyle = '#1e293b';
                ctx.fillRect(17, -5, 4, 10);
                ctx.fillRect(-2, -5, 4, 10);
                ctx.fillRect(6, 4, 3, 5);
                break;
            case 'grenade':
            case 'cluster':
                // Hand holding round grenade
                ctx.fillStyle = weapon === 'cluster' ? '#dc2626' : '#15803d';
                ctx.beginPath();
                ctx.arc(12, 0, 5.5, 0, Math.PI * 2);
                ctx.fill();
                // Pin / lever
                ctx.fillStyle = '#94a3b8';
                ctx.fillRect(11, -7, 2, 4);
                break;
            case 'shotgun':
                // Double barrel shotgun
                ctx.fillStyle = '#78350f'; // Wood stock
                ctx.fillRect(-2, -2, 8, 5);
                ctx.fillStyle = '#475569'; // Metal dual barrel
                ctx.fillRect(6, -3, 16, 5);
                break;
            case 'dynamite':
                // Red stick of dynamite with burning fuse
                ctx.fillStyle = '#ef4444';
                ctx.fillRect(8, -4, 14, 7);
                // Spark
                ctx.fillStyle = '#facc15';
                ctx.beginPath();
                ctx.arc(24, -2, 2.5, 0, Math.PI * 2);
                ctx.fill();
                break;
            case 'bat':
                // Baseball bat
                ctx.fillStyle = '#d97706';
                ctx.beginPath();
                ctx.moveTo(0, -2);
                ctx.lineTo(24, -6);
                ctx.lineTo(25, 4);
                ctx.lineTo(0, 2);
                ctx.closePath();
                ctx.fill();
                break;
            case 'airstrike':
                // Walkie-talkie radio / radio antenna
                ctx.fillStyle = '#334155';
                ctx.fillRect(4, -6, 8, 12);
                ctx.strokeStyle = '#94a3b8';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(8, -6);
                ctx.lineTo(8, -14);
                ctx.stroke();
                break;
            case 'teleport':
                // Sci-fi remote beamer
                ctx.fillStyle = '#06b6d4';
                ctx.fillRect(6, -4, 12, 7);
                ctx.fillStyle = '#a5f3fc';
                ctx.beginPath();
                ctx.arc(18, 0, 3, 0, Math.PI * 2);
                ctx.fill();
                break;
        }

        ctx.restore();
    }

    drawHealthBar(ctx, isActive) {
        const barW = 34;
        const barH = 5;
        const barX = this.x - barW / 2;
        const barY = this.y - 28;

        // Name tag
        ctx.font = 'bold 10px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#0f172a';
        ctx.fillText(this.name, this.x + 1, barY - 4);
        ctx.fillStyle = this.team === 'red' ? '#fca5a5' : '#93c5fd';
        ctx.fillText(this.name, this.x, barY - 5);

        // Bar background
        ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
        ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);

        // Bar fill
        const fillW = Math.max(0, (this.hp / this.maxHp) * barW);
        ctx.fillStyle = this.team === 'red' ? '#ef4444' : '#3b82f6';
        ctx.fillRect(barX, barY, fillW, barH);

        // HP number
        ctx.font = '8px sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(`${this.hp}`, this.x, barY + barH - 0.5);
    }

    drawSpeechBubble(ctx) {
        ctx.save();
        const text = this.speechText;
        ctx.font = 'bold 11px "Segoe UI", sans-serif';
        const textWidth = ctx.measureText(text).width;
        const bubbleW = textWidth + 14;
        const bubbleH = 20;
        const bx = this.x - bubbleW / 2;
        const by = this.y - 48;

        // Speech bubble rect
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 1.5;

        ctx.beginPath();
        ctx.roundRect(bx, by, bubbleW, bubbleH, 6);
        ctx.fill();
        ctx.stroke();

        // Bubble pointer tail
        ctx.beginPath();
        ctx.moveTo(this.x - 3, by + bubbleH);
        ctx.lineTo(this.x, by + bubbleH + 5);
        ctx.lineTo(this.x + 3, by + bubbleH);
        ctx.fill();
        ctx.stroke();

        // Text
        ctx.fillStyle = '#0f172a';
        ctx.textAlign = 'center';
        ctx.fillText(text, this.x, by + 14);

        ctx.restore();
    }

    // --- Bot AI Logic ---
    updateBot(game) {
        if (!this.isBot || !this.isAlive) return;

        this.botTimer++;

        // 1. Initial delay to simulate thinking
        if (this.botStep === 'idle') {
            if (this.botTimer > 35) {
                // Find nearest enemy worm
                const enemies = game.worms.filter(w => w.team !== this.team && w.isAlive && !w.isDrowned);
                if (enemies.length === 0) return;

                // Pick closest target
                let closest = enemies[0];
                let minDist = Math.hypot(enemies[0].x - this.x, enemies[0].y - this.y);
                for (const en of enemies) {
                    const dist = Math.hypot(en.x - this.x, en.y - this.y);
                    if (dist < minDist) {
                        minDist = dist;
                        closest = en;
                    }
                }

                this.botTarget = closest;

                // Choose weapon based on situation
                const dist = minDist;
                const canUseAirstrike = (this.botTarget.y < game.terrain.waterLevel - 150) && (Math.random() > 0.6);

                if (canUseAirstrike) {
                    this.botChosenWeapon = 'airstrike';
                } else if (dist < 50) {
                    this.botChosenWeapon = Math.random() > 0.5 ? 'bat' : 'shotgun';
                } else if (dist < 300 && Math.random() > 0.4) {
                    this.botChosenWeapon = 'grenade';
                } else {
                    this.botChosenWeapon = 'bazooka';
                }

                game.selectWeapon(this.botChosenWeapon);
                this.botStep = 'aiming';
                this.botTimer = 0;
            }
        } else if (this.botStep === 'aiming') {
            if (!this.botTarget || !this.botTarget.isAlive) {
                this.botStep = 'idle';
                return;
            }

            const dx = this.botTarget.x - this.x;
            const dy = this.botTarget.y - this.y;
            this.facing = dx >= 0 ? 1 : -1;

            if (this.botChosenWeapon === 'airstrike') {
                // Airstrike targets enemy position directly
                if (this.botTimer > 30) {
                    game.fireAirstrikeAt(this.botTarget.x, this.botTarget.y);
                    this.botStep = 'retreat';
                    this.botTimer = 0;
                }
                return;
            }

            // Ballistic target calculation
            let desiredAngle = Math.atan2(dy, dx);
            // High lob for bazooka/grenade
            if (this.botChosenWeapon === 'bazooka' || this.botChosenWeapon === 'grenade') {
                desiredAngle -= (this.facing * 0.4);
                // Wind compensation
                desiredAngle -= (game.wind * 0.003 * this.facing);
            }

            // Smoothly lerp aimAngle
            this.aimAngle += (desiredAngle - this.aimAngle) * 0.15;

            // Power estimation
            const dist = Math.hypot(dx, dy);
            let targetPower = Math.min(100, Math.max(25, dist * 0.14));
            if (this.botChosenWeapon === 'grenade') targetPower = Math.min(95, targetPower * 1.15);

            if (this.botTimer > 45) {
                this.botPower = targetPower;
                this.botStep = 'firing';
                this.botTimer = 0;
            }
        } else if (this.botStep === 'firing') {
            // Execute fire
            game.fireCurrentWeapon(this.botPower);
            this.botStep = 'retreat';
            this.botTimer = 0;
        } else if (this.botStep === 'retreat') {
            // Move away from danger or hop into cover during retreat phase
            if (game.phase === 'retreat' && this.botTimer < 60) {
                const retreatDir = -this.facing;
                this.move(retreatDir, game.terrain);
                if (Math.random() < 0.05) this.jump(game.terrain);
            }
        }
    }
}

window.Worm = Worm;
