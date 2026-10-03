// Main Game Engine for Worms Battle 2D

class WormsGame {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');

        // Virtual world dimensions
        this.worldWidth = 2200;
        this.worldHeight = 1100;

        // Camera
        this.camX = 0;
        this.camY = 0;
        this.camZoom = 1.0;
        this.targetCamX = 0;
        this.targetCamY = 0;
        this.shakeTimer = 0;
        this.shakeIntensity = 0;

        // Mouse coordinates in world
        this.mouseX = 0;
        this.mouseY = 0;
        this.screenMouseX = 0;
        this.screenMouseY = 0;
        this.isMouseDown = false;

        // Game Settings & State
        this.mode = 'pvp'; // 'pvp' (Hotseat) or 'pve' (vs AI Bot)
        this.wormsPerTeam = 3;
        this.phase = 'turn'; // 'turn', 'charging', 'shot', 'retreat', 'settle', 'game_over'
        this.turnTimeMax = 45;
        this.turnTimer = this.turnTimeMax;
        this.retreatTimer = 3;
        this.currentTeam = 'red';
        this.teamIndices = { red: 0, blue: 0 };
        this.wind = 0; // -100 (left) to +100 (right)

        // Weapon states
        this.selectedWeapon = 'bazooka';
        this.shotgunShotsLeft = 0;
        this.chargePower = 0;
        this.isCharging = false;
        this.chargeDirection = 1; // 1 = rising, -1 = falling

        // Entity lists
        this.worms = [];
        this.projectiles = [];
        this.particles = [];
        this.floatingTexts = [];
        this.airstrike = null;

        // Keys state
        this.keys = {};

        // Terrain
        this.terrain = new Terrain(this.worldWidth, this.worldHeight);

        // Resize handler
        this.resize();
        window.addEventListener('resize', () => this.resize());

        // Setup Event Listeners
        this.setupEvents();
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    startNewGame(mode = 'pvp', wormsCount = 3) {
        this.mode = mode;
        this.wormsPerTeam = wormsCount;
        this.terrain = new Terrain(this.worldWidth, this.worldHeight);
        this.worms = [];
        this.projectiles = [];
        this.particles = [];
        this.floatingTexts = [];
        this.airstrike = null;
        this.teamIndices = { red: 0, blue: 0 };
        this.currentTeam = 'red';

        const redNames = ["Василий", "Шурик", "Геннадий", "Иван", "Димон"];
        const blueNames = ["Борис", "Гриша", "Федор", "Артем", "Максим"];

        // Spawn Red Worms (Left side of island)
        for (let i = 0; i < wormsCount; i++) {
            const spawnX = 300 + (i * 200) + Math.random() * 80;
            const groundY = this.terrain.findGroundY(spawnX) - 15;
            const worm = new Worm(`r_${i}`, 'red', redNames[i % redNames.length], spawnX, groundY);
            this.worms.push(worm);
        }

        // Spawn Blue Worms (Right side of island)
        for (let i = 0; i < wormsCount; i++) {
            const spawnX = this.worldWidth - 300 - (i * 200) - Math.random() * 80;
            const groundY = this.terrain.findGroundY(spawnX) - 15;
            const worm = new Worm(`b_${i}`, 'blue', blueNames[i % blueNames.length], spawnX, groundY);
            if (mode === 'pve') {
                worm.isBot = true;
            }
            this.worms.push(worm);
        }

        this.setNewWind();
        this.startTurn('red');
    }

    getActiveWorm() {
        const teamWorms = this.worms.filter(w => w.team === this.currentTeam && w.isAlive && !w.isDrowned);
        if (teamWorms.length === 0) return null;
        const idx = this.teamIndices[this.currentTeam] % teamWorms.length;
        return teamWorms[idx];
    }

    cycleActiveWorm() {
        if (this.phase !== 'turn') return;
        const teamWorms = this.worms.filter(w => w.team === this.currentTeam && w.isAlive && !w.isDrowned);
        if (teamWorms.length <= 1) return;

        this.teamIndices[this.currentTeam] = (this.teamIndices[this.currentTeam] + 1) % teamWorms.length;
        const active = this.getActiveWorm();
        if (active) {
            active.say("Я готов!", 40);
            this.targetCamX = active.x;
            this.targetCamY = active.y;
        }
    }

    setNewWind() {
        this.wind = Math.round((Math.random() * 160 - 80));
    }

    startTurn(team) {
        this.currentTeam = team;
        this.phase = 'turn';
        this.turnTimer = this.turnTimeMax;
        this.retreatTimer = 3;
        this.chargePower = 0;
        this.isCharging = false;
        this.shotgunShotsLeft = 0;

        // Check if teams still alive
        if (this.checkWinCondition()) return;

        // Advance to next living worm
        const teamWorms = this.worms.filter(w => w.team === this.currentTeam && w.isAlive && !w.isDrowned);
        if (teamWorms.length > 0) {
            this.teamIndices[this.currentTeam] = this.teamIndices[this.currentTeam] % teamWorms.length;
        }

        const activeWorm = this.getActiveWorm();
        if (activeWorm) {
            this.targetCamX = activeWorm.x;
            this.targetCamY = activeWorm.y;
            activeWorm.say(`Ход команды ${this.currentTeam === 'red' ? 'Красных' : 'Синих'}!`, 60);

            // Bot init
            if (activeWorm.isBot) {
                activeWorm.botStep = 'idle';
                activeWorm.botTimer = 0;
            }
        }

        this.setNewWind();
        this.updateHUD();
    }

    startRetreat() {
        this.phase = 'retreat';
        this.retreatTimer = 3;
        const active = this.getActiveWorm();
        if (active && active.isAlive) {
            active.say("Отход! 3 сек!", 60);
        }
    }

    endTurn() {
        // Switch team
        const nextTeam = this.currentTeam === 'red' ? 'blue' : 'red';
        this.teamIndices[this.currentTeam]++;
        this.startTurn(nextTeam);
    }

    selectWeapon(weaponName) {
        this.selectedWeapon = weaponName;
        this.updateHUD();
        const active = this.getActiveWorm();
        if (active && !active.isBot) {
            const weaponTitles = {
                bazooka: 'Базука',
                grenade: 'Граната',
                cluster: 'Кластерная бомба',
                shotgun: 'Дробовик',
                dynamite: 'Динамит',
                bat: 'Бейсбольная бита',
                airstrike: 'Авиаудар',
                teleport: 'Телепорт'
            };
            active.say(weaponTitles[weaponName] || weaponName, 40);
        }
    }

    fireCurrentWeapon(overridePower = null) {
        const active = this.getActiveWorm();
        if (!active || !active.isAlive) return;

        const power = overridePower !== null ? overridePower : this.chargePower;
        const angle = active.aimAngle;
        const facing = active.facing;

        // Launch coordinates (at weapon muzzle)
        const spawnX = active.x + Math.cos(angle) * 22;
        const spawnY = active.y - 4 + Math.sin(angle) * 22;

        if (this.selectedWeapon === 'bazooka') {
            const speed = 5 + (power / 100) * 22;
            const p = new Projectile(spawnX, spawnY, Math.cos(angle) * speed, Math.sin(angle) * speed, 'bazooka', active);
            this.projectiles.push(p);
            if (window.soundSystem) {
                window.soundSystem.playRocketLaunch();
                window.soundSystem.playVoiceFire();
            }
            this.phase = 'shot';
        } else if (this.selectedWeapon === 'grenade' || this.selectedWeapon === 'cluster') {
            const speed = 4 + (power / 100) * 19;
            const p = new Projectile(spawnX, spawnY, Math.cos(angle) * speed, Math.sin(angle) * speed, this.selectedWeapon, active);
            this.projectiles.push(p);
            if (window.soundSystem) {
                window.soundSystem.playRocketLaunch();
                window.soundSystem.playVoiceFire();
            }
            this.phase = 'shot';
        } else if (this.selectedWeapon === 'shotgun') {
            if (this.shotgunShotsLeft === 0) {
                this.shotgunShotsLeft = 2;
            }
            this.shotgunShotsLeft--;

            // Fast bullet pellet
            const speed = 36;
            const p = new Projectile(spawnX, spawnY, Math.cos(angle) * speed, Math.sin(angle) * speed, 'bullet', active);
            this.projectiles.push(p);
            if (window.soundSystem) {
                window.soundSystem.playShotgun();
                window.soundSystem.playVoiceFire();
            }

            if (this.shotgunShotsLeft <= 0) {
                this.startRetreat();
            } else {
                active.say("Второй выстрел!", 45);
            }
        } else if (this.selectedWeapon === 'dynamite') {
            // Drop dynamite gently at feet
            const p = new Projectile(active.x + facing * 12, active.y - 2, facing * 1.5, -1.5, 'dynamite', active);
            this.projectiles.push(p);
            if (window.soundSystem) window.soundSystem.playFuseTicking();
            this.startRetreat();
        } else if (this.selectedWeapon === 'bat') {
            // Melee bat swing
            if (window.soundSystem) window.soundSystem.playBatSwing();

            // Check hit worms in front cone
            let hitAnyone = false;
            for (const w of this.worms) {
                if (w !== active && w.isAlive && !w.isDrowned) {
                    const dist = Math.hypot(w.x - active.x, w.y - active.y);
                    if (dist < 42) {
                        const hitAngle = Math.atan2(w.y - active.y, w.x - active.x);
                        // Launch worm flying!
                        w.applyImpulse(Math.cos(angle) * 16, Math.sin(angle) * 16 - 3);
                        w.takeDamage(30);
                        w.say("ХОУМ-РАН!!", 60);
                        hitAnyone = true;
                    }
                }
            }

            if (hitAnyone && window.soundSystem) {
                window.soundSystem.playBatHit();
            }
            this.startRetreat();
        }

        this.chargePower = 0;
        this.isCharging = false;
    }

    fireAirstrikeAt(worldX, worldY) {
        if (this.phase !== 'turn') return;
        this.airstrike = new AirstrikeManager(worldX, worldY);
        this.phase = 'shot';
        const active = this.getActiveWorm();
        if (active) active.say("Авиаудар на подходе!", 60);
    }

    teleportActiveWormTo(worldX, worldY) {
        const active = this.getActiveWorm();
        if (!active || !active.isAlive) return;

        // Check target isn't inside solid terrain
        if (this.terrain.checkCircleOverlap(worldX, worldY, active.radius)) {
            active.say("Туда нельзя!", 40);
            return;
        }

        // Teleport VFX
        for (let i = 0; i < 25; i++) {
            this.addParticle({
                x: active.x + (Math.random() - 0.5) * 20,
                y: active.y + (Math.random() - 0.5) * 20,
                vx: (Math.random() - 0.5) * 3,
                vy: (Math.random() - 0.5) * 3,
                size: 3 + Math.random() * 3,
                color: '#38bdf8',
                life: 1.0,
                decay: 0.04
            });
        }

        active.x = worldX;
        active.y = worldY;
        active.vx = 0;
        active.vy = 0;
        if (window.soundSystem) window.soundSystem.playTeleport();

        for (let i = 0; i < 25; i++) {
            this.addParticle({
                x: active.x + (Math.random() - 0.5) * 20,
                y: active.y + (Math.random() - 0.5) * 20,
                vx: (Math.random() - 0.5) * 3,
                vy: (Math.random() - 0.5) * 3,
                size: 3 + Math.random() * 3,
                color: '#a855f7',
                life: 1.0,
                decay: 0.04
            });
        }

        this.endTurn();
    }

    createExplosion(x, y, radius, maxDamage) {
        // 1. Carve terrain
        this.terrain.carveCrater(x, y, radius);

        // 2. Camera shake
        this.shakeTimer = 22;
        this.shakeIntensity = Math.min(18, radius * 0.35);

        // 3. Audio
        if (window.soundSystem) {
            window.soundSystem.playExplosion(radius / 50);
        }

        // 4. Damage and blast knockback to worms
        for (const w of this.worms) {
            if (w.isAlive && !w.isDrowned) {
                const dist = Math.hypot(w.x - x, w.y - y);
                if (dist < radius * 1.5) {
                    const falloff = Math.max(0, 1 - dist / (radius * 1.5));
                    const dmg = Math.floor(falloff * maxDamage);

                    if (dmg > 0) {
                        w.takeDamage(dmg);
                        this.addFloatingText(`-${dmg}`, w.x, w.y - 20, '#ef4444');
                    }

                    // Push impulse away from blast center
                    const angle = Math.atan2(w.y - y, w.x - x);
                    const force = falloff * (radius * 0.22);
                    w.applyImpulse(Math.cos(angle) * force, Math.sin(angle) * force - 3);
                }
            }
        }

        // 5. Fireball particles
        const particleCount = Math.floor(radius * 0.9);
        const colors = ['#facc15', '#f97316', '#ef4444', '#78350f', '#1e293b'];
        for (let i = 0; i < particleCount; i++) {
            const ang = Math.random() * Math.PI * 2;
            const spd = 1 + Math.random() * (radius * 0.14);
            this.addParticle({
                x: x,
                y: y,
                vx: Math.cos(ang) * spd,
                vy: Math.sin(ang) * spd,
                size: 4 + Math.random() * (radius * 0.2),
                color: colors[Math.floor(Math.random() * colors.length)],
                life: 1.0,
                decay: 0.02 + Math.random() * 0.03
            });
        }
    }

    createWaterSplash(x, y) {
        for (let i = 0; i < 30; i++) {
            this.addParticle({
                x: x + (Math.random() - 0.5) * 20,
                y: y,
                vx: (Math.random() - 0.5) * 5,
                vy: -3 - Math.random() * 6,
                size: 2 + Math.random() * 4,
                color: '#67e8f9',
                life: 1.0,
                decay: 0.03
            });
        }
    }

    addParticle(p) {
        this.particles.push(p);
    }

    addFloatingText(text, x, y, color = '#ffffff') {
        this.floatingTexts.push({
            text, x, y, color, life: 1.0, decay: 0.02
        });
    }

    checkWinCondition() {
        const redAlive = this.worms.some(w => w.team === 'red' && w.isAlive && !w.isDrowned);
        const blueAlive = this.worms.some(w => w.team === 'blue' && w.isAlive && !w.isDrowned);

        if (!redAlive && !blueAlive) {
            this.showGameOver('Ничья!');
            return true;
        } else if (!redAlive) {
            this.showGameOver('Победа Синей Команды!');
            if (window.soundSystem) window.soundSystem.playVoiceCheer();
            return true;
        } else if (!blueAlive) {
            this.showGameOver('Победа Красной Команды!');
            if (window.soundSystem) window.soundSystem.playVoiceCheer();
            return true;
        }
        return false;
    }

    showGameOver(winnerText) {
        this.phase = 'game_over';
        const modal = document.getElementById('game-over-modal');
        const text = document.getElementById('winner-text');
        if (modal && text) {
            text.innerText = winnerText;
            modal.classList.remove('hidden');
        }
    }

    setupEvents() {
        window.addEventListener('keydown', (e) => {
            if (window.soundSystem) window.soundSystem.ensureContext();
            this.keys[e.code] = true;

            if (e.code === 'KeyQ') {
                const arsenal = document.getElementById('weapon-arsenal');
                if (arsenal) arsenal.classList.toggle('hidden');
            }

            if (e.code === 'Tab') {
                e.preventDefault();
                this.cycleActiveWorm();
            }

            // Quick weapon keys 1-8
            const weaponKeys = {
                Digit1: 'bazooka',
                Digit2: 'grenade',
                Digit3: 'cluster',
                Digit4: 'shotgun',
                Digit5: 'dynamite',
                Digit6: 'bat',
                Digit7: 'airstrike',
                Digit8: 'teleport'
            };
            if (weaponKeys[e.code]) {
                this.selectWeapon(weaponKeys[e.code]);
            }

            // Spacebar: charging initiation
            if (e.code === 'Space' && !e.repeat && this.phase === 'turn') {
                const active = this.getActiveWorm();
                if (active && !active.isBot) {
                    if (this.selectedWeapon === 'bazooka' || this.selectedWeapon === 'grenade' || this.selectedWeapon === 'cluster') {
                        this.isCharging = true;
                        this.chargePower = 0;
                        this.chargeDirection = 1;
                    } else if (this.selectedWeapon === 'shotgun' || this.selectedWeapon === 'dynamite' || this.selectedWeapon === 'bat') {
                        this.fireCurrentWeapon();
                    }
                }
            }

            // High Jump
            if ((e.code === 'Backspace' || (e.shiftKey && e.code === 'ArrowUp')) && this.phase === 'turn') {
                const active = this.getActiveWorm();
                if (active && !active.isBot) active.jump(this.terrain, true);
            }
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;

            if (e.code === 'Space' && this.isCharging && this.phase === 'turn') {
                const active = this.getActiveWorm();
                if (active && !active.isBot) {
                    this.fireCurrentWeapon();
                }
            }
        });

        // Mouse aiming & tracking
        window.addEventListener('mousemove', (e) => {
            this.screenMouseX = e.clientX;
            this.screenMouseY = e.clientY;
            // Convert to world coordinates
            this.mouseX = (e.clientX - this.canvas.width / 2) / this.camZoom + this.camX;
            this.mouseY = (e.clientY - this.canvas.height / 2) / this.camZoom + this.camY;

            // Aim active worm
            const active = this.getActiveWorm();
            if (active && !active.isBot && this.phase === 'turn') {
                const dx = this.mouseX - active.x;
                const dy = this.mouseY - (active.y - 4);
                active.aimAngle = Math.atan2(dy, dx);
                active.facing = dx >= 0 ? 1 : -1;
            }
        });

        window.addEventListener('mousedown', (e) => {
            if (window.soundSystem) window.soundSystem.ensureContext();
            if (e.button === 2) {
                // Right click opens weapon arsenal
                e.preventDefault();
                const arsenal = document.getElementById('weapon-arsenal');
                if (arsenal) arsenal.classList.toggle('hidden');
                return;
            }

            if (e.button === 0) {
                // Left click for Airstrike / Teleport targeting
                if (this.selectedWeapon === 'airstrike' && this.phase === 'turn') {
                    this.fireAirstrikeAt(this.mouseX, this.mouseY);
                } else if (this.selectedWeapon === 'teleport' && this.phase === 'turn') {
                    this.teleportActiveWormTo(this.mouseX, this.mouseY);
                }
            }
        });

        window.addEventListener('contextmenu', (e) => e.preventDefault());

        // Mouse wheel zoom
        window.addEventListener('wheel', (e) => {
            e.preventDefault();
            const zoomDelta = e.deltaY < 0 ? 0.1 : -0.1;
            this.camZoom = Math.max(0.6, Math.min(1.4, this.camZoom + zoomDelta));
        }, { passive: false });

        // Touch support for mobile aiming and target selection
        const handleTouchPos = (e) => {
            if (e.touches && e.touches.length > 0) {
                const t = e.touches[0];
                this.screenMouseX = t.clientX;
                this.screenMouseY = t.clientY;
                this.mouseX = (t.clientX - this.canvas.width / 2) / this.camZoom + this.camX;
                this.mouseY = (t.clientY - this.canvas.height / 2) / this.camZoom + this.camY;
                const active = this.getActiveWorm();
                if (active && !active.isBot && this.phase === 'turn') {
                    const dx = this.mouseX - active.x;
                    const dy = this.mouseY - (active.y - 4);
                    active.aimAngle = Math.atan2(dy, dx);
                    active.facing = dx >= 0 ? 1 : -1;
                }
            }
        };

        this.canvas.addEventListener('touchstart', (e) => {
            handleTouchPos(e);
            if (this.selectedWeapon === 'airstrike' && this.phase === 'turn') {
                this.fireAirstrikeAt(this.mouseX, this.mouseY);
            } else if (this.selectedWeapon === 'teleport' && this.phase === 'turn') {
                this.teleportActiveWormTo(this.mouseX, this.mouseY);
            }
        }, { passive: true });

        this.canvas.addEventListener('touchmove', (e) => {
            handleTouchPos(e);
        }, { passive: true });
    }


    update() {
        const active = this.getActiveWorm();

        // 1. Bot logic update
        if (active && active.isBot && (this.phase === 'turn' || this.phase === 'retreat')) {
            active.updateBot(this);
        }

        // 2. Player Input Handling during Turn / Retreat
        if (active && !active.isBot && (this.phase === 'turn' || this.phase === 'retreat')) {
            if (this.keys['KeyA'] || this.keys['ArrowLeft']) {
                active.move(-1, this.terrain);
            }
            if (this.keys['KeyD'] || this.keys['ArrowRight']) {
                active.move(1, this.terrain);
            }
            if (this.keys['KeyW'] || this.keys['ArrowUp'] || (this.keys['Enter'] && !this.isCharging)) {
                active.jump(this.terrain, false);
            }
        }

        // 3. Power Meter Charging
        if (this.isCharging) {
            this.chargePower += this.chargeDirection * 1.8;
            if (this.chargePower >= 100) {
                this.chargePower = 100;
                this.chargeDirection = -1;
            } else if (this.chargePower <= 5) {
                this.chargePower = 5;
                this.chargeDirection = 1;
            }
            if (window.soundSystem && Math.random() < 0.2) {
                window.soundSystem.playChargeSound(this.chargePower / 100);
            }
        }

        // 4. Update Timers
        if (this.phase === 'turn') {
            this.turnTimer -= 1 / 60;
            if (this.turnTimer <= 5 && Math.floor(this.turnTimer * 60) % 60 === 0 && this.turnTimer > 0) {
                if (window.soundSystem) window.soundSystem.playCountdownTick(true);
            }

            if (this.turnTimer <= 0) {
                this.turnTimer = 0;
                if (active) active.say("Время вышло!", 50);
                this.endTurn();
            }
        } else if (this.phase === 'retreat') {
            this.retreatTimer -= 1 / 60;
            if (this.retreatTimer <= 0) {
                this.retreatTimer = 0;
                this.phase = 'settle';
            }
        }

        // 5. Update Worms physics
        for (const w of this.worms) {
            w.update(this.terrain);
        }

        // 6. Update Projectiles
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];
            p.update(this);
            if (!p.alive) {
                this.projectiles.splice(i, 1);
            }
        }

        // 7. Update Airstrike Jet
        if (this.airstrike) {
            this.airstrike.update(this);
            if (!this.airstrike.active) {
                this.airstrike = null;
            }
        }

        // 8. Update Particles & Floating Text
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const pt = this.particles[i];
            pt.x += pt.vx;
            pt.y += pt.vy;
            pt.life -= pt.decay;
            if (pt.life <= 0) this.particles.splice(i, 1);
        }

        for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
            const ft = this.floatingTexts[i];
            ft.y -= 0.6;
            ft.life -= ft.decay;
            if (ft.life <= 0) this.floatingTexts.splice(i, 1);
        }

        // 9. Update Terrain Debris
        this.terrain.updateDebris();

        // 10. Phase Progression from 'shot' to 'retreat' or 'settle'
        if (this.phase === 'shot') {
            if (this.projectiles.length === 0 && !this.airstrike) {
                this.startRetreat();
            }
        } else if (this.phase === 'settle') {
            // Check if all worms have settled (stopped flying/falling)
            const allSettled = this.worms.every(w => !w.isAlive || (w.onGround && Math.abs(w.vx) < 0.2 && Math.abs(w.vy) < 0.2));
            if (allSettled && this.particles.length < 5) {
                if (!this.checkWinCondition()) {
                    this.endTurn();
                }
            }
        }

        // 11. Camera Tracking
        this.updateCamera();

        // 12. Update UI DOM Elements
        this.updateHUD();
    }

    updateCamera() {
        // Track projectile if in flight
        if (this.projectiles.length > 0) {
            const p = this.projectiles[this.projectiles.length - 1];
            this.targetCamX = p.x;
            this.targetCamY = p.y;
        } else {
            const active = this.getActiveWorm();
            if (active && active.isAlive) {
                this.targetCamX = active.x;
                this.targetCamY = active.y;
            }
        }

        // Smooth camera lerp
        this.camX += (this.targetCamX - this.camX) * 0.08;
        this.camY += (this.targetCamY - this.camY) * 0.08;

        // Clamp camera inside world bounds
        const halfW = (this.canvas.width / 2) / this.camZoom;
        const halfH = (this.canvas.height / 2) / this.camZoom;
        this.camX = Math.max(halfW, Math.min(this.worldWidth - halfW, this.camX));
        this.camY = Math.max(halfH, Math.min(this.worldHeight - halfH, this.camY));

        // Screen Shake decay
        if (this.shakeTimer > 0) {
            this.shakeTimer--;
        }
    }

    render() {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        ctx.clearRect(0, 0, w, h);

        // Sky gradient background
        const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
        skyGrad.addColorStop(0, '#38bdf8'); // Bright cartoon blue
        skyGrad.addColorStop(0.65, '#bae6fd'); // Soft horizon
        skyGrad.addColorStop(1, '#e0f2fe');
        ctx.fillStyle = skyGrad;
        ctx.fillRect(0, 0, w, h);

        // Apply Camera Transform
        ctx.save();
        ctx.translate(w / 2, h / 2);
        ctx.scale(this.camZoom, this.camZoom);

        // Shake offset
        let shakeX = 0;
        let shakeY = 0;
        if (this.shakeTimer > 0) {
            const intensity = (this.shakeTimer / 22) * this.shakeIntensity;
            shakeX = (Math.random() - 0.5) * intensity;
            shakeY = (Math.random() - 0.5) * intensity;
        }
        ctx.translate(-this.camX + shakeX, -this.camY + shakeY);

        // 1. Draw Clouds
        this.drawBackgroundClouds(ctx);

        // 2. Draw Terrain & Water
        this.terrain.draw(ctx);

        // 3. Draw Worms
        const activeWorm = this.getActiveWorm();
        for (const worm of this.worms) {
            worm.draw(ctx, worm === activeWorm, this.selectedWeapon);
        }

        // 4. Draw Projectiles
        for (const p of this.projectiles) {
            p.draw(ctx);
        }

        // 5. Draw Airstrike Jet
        if (this.airstrike) {
            this.airstrike.draw(ctx);
        }

        // 6. Draw Fire / Smoke Particles
        for (const pt of this.particles) {
            ctx.fillStyle = pt.color;
            ctx.globalAlpha = Math.max(0, pt.life);
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1.0;

        // 7. Draw Floating Damage Numbers
        for (const ft of this.floatingTexts) {
            ctx.font = 'bold 16px "Segoe UI", sans-serif';
            ctx.fillStyle = ft.color;
            ctx.globalAlpha = Math.max(0, ft.life);
            ctx.textAlign = 'center';
            ctx.fillText(ft.text, ft.x, ft.y);
        }
        ctx.globalAlpha = 1.0;

        // 8. Draw Crosshair / Trajectory prediction for Human Player
        if (activeWorm && !activeWorm.isBot && this.phase === 'turn') {
            this.drawAimGuide(ctx, activeWorm);
        }

        ctx.restore();

        // 9. Draw Minimap overlay
        this.drawMinimap(ctx);
    }

    drawAimGuide(ctx, worm) {
        const angle = worm.aimAngle;
        const startX = worm.x + Math.cos(angle) * 25;
        const startY = worm.y - 4 + Math.sin(angle) * 25;

        // Crosshair reticle
        const reticleDist = 55;
        const rx = worm.x + Math.cos(angle) * reticleDist;
        const ry = worm.y - 4 + Math.sin(angle) * reticleDist;

        ctx.strokeStyle = 'rgba(239, 68, 68, 0.85)';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(rx, ry, 7, 0, Math.PI * 2);
        ctx.moveTo(rx - 10, ry);
        ctx.lineTo(rx + 10, ry);
        ctx.moveTo(rx, ry - 10);
        ctx.lineTo(rx, ry + 10);
        ctx.stroke();

        // Trajectory preview dots when charging
        if (this.isCharging && (this.selectedWeapon === 'bazooka' || this.selectedWeapon === 'grenade' || this.selectedWeapon === 'cluster')) {
            const speed = (this.selectedWeapon === 'bazooka' ? 5 + (this.chargePower / 100) * 22 : 4 + (this.chargePower / 100) * 19);
            let simX = startX;
            let simY = startY;
            let simVx = Math.cos(angle) * speed;
            let simVy = Math.sin(angle) * speed;

            ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
            for (let i = 0; i < 20; i++) {
                if (this.selectedWeapon === 'bazooka') {
                    simVx += this.wind * 0.0006;
                    simVy += 0.26 * 0.65;
                } else {
                    simVy += 0.26;
                }
                simX += simVx * 2;
                simY += simVy * 2;

                ctx.beginPath();
                ctx.arc(simX, simY, 2.5, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    drawBackgroundClouds(ctx) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        const cloudOffsets = [
            { x: 300, y: 140, r: 45 },
            { x: 750, y: 90, r: 60 },
            { x: 1300, y: 170, r: 50 },
            { x: 1850, y: 110, r: 65 }
        ];

        for (const c of cloudOffsets) {
            ctx.beginPath();
            ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
            ctx.arc(c.x + c.r * 0.6, c.y - c.r * 0.2, c.r * 0.75, 0, Math.PI * 2);
            ctx.arc(c.x + c.r * 1.2, c.y, c.r * 0.8, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    drawMinimap(ctx) {
        const mw = 180;
        const mh = 90;
        const mx = this.canvas.width - mw - 16;
        const my = 16;

        // Frame
        ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(mx, my, mw, mh, 6);
        ctx.fill();
        ctx.stroke();

        // Scale factors
        const sx = mw / this.worldWidth;
        const sy = mh / this.worldHeight;

        // Water level line
        const waterMinimapY = my + this.terrain.waterLevel * sy;
        ctx.fillStyle = 'rgba(6, 182, 212, 0.4)';
        ctx.fillRect(mx, waterMinimapY, mw, mh - (waterMinimapY - my));

        // Draw Worm Dots
        for (const w of this.worms) {
            if (w.isAlive && !w.isDrowned) {
                const wx = mx + w.x * sx;
                const wy = my + w.y * sy;
                ctx.fillStyle = w.team === 'red' ? '#ef4444' : '#3b82f6';
                ctx.beginPath();
                ctx.arc(wx, wy, 3, 0, Math.PI * 2);
                ctx.fill();

                if (w === this.getActiveWorm()) {
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 1.2;
                    ctx.stroke();
                }
            }
        }
    }

    updateHUD() {
        // Turn timer
        const timerEl = document.getElementById('turn-timer');
        if (timerEl) {
            if (this.phase === 'turn') {
                timerEl.innerText = Math.ceil(this.turnTimer);
                timerEl.style.color = this.turnTimer <= 5 ? '#ef4444' : '#ffffff';
            } else if (this.phase === 'retreat') {
                timerEl.innerText = `Отход: ${Math.ceil(this.retreatTimer)}`;
                timerEl.style.color = '#facc15';
            } else {
                timerEl.innerText = '...';
            }
        }

        // Active Team Banner
        const teamBanner = document.getElementById('team-banner');
        if (teamBanner) {
            teamBanner.innerText = this.currentTeam === 'red' ? 'Ход: Красные' : 'Ход: Синие';
            teamBanner.className = `badge ${this.currentTeam}`;
        }

        // Wind indicator
        const windBar = document.getElementById('wind-bar');
        const windText = document.getElementById('wind-text');
        if (windBar && windText) {
            const absWind = Math.abs(this.wind);
            const dir = this.wind >= 0 ? '▶' : '◀';
            windText.innerText = `${dir} ${absWind}`;
            windBar.style.width = `${absWind}%`;
            windBar.style.backgroundColor = this.wind >= 0 ? '#38bdf8' : '#f43f5e';
            windBar.style.marginLeft = this.wind >= 0 ? '50%' : `${50 - absWind / 2}%`;
        }

        // Power charge bar
        const powerBar = document.getElementById('charge-bar');
        if (powerBar) {
            powerBar.style.width = `${this.chargePower}%`;
        }

        // Current Weapon display
        const curWeaponEl = document.getElementById('cur-weapon-name');
        if (curWeaponEl) {
            const names = {
                bazooka: 'Базука',
                grenade: 'Граната',
                cluster: 'Кластерная бомба',
                shotgun: 'Дробовик',
                dynamite: 'Динамит',
                bat: 'Бита',
                airstrike: 'Авиаудар',
                teleport: 'Телепорт'
            };
            curWeaponEl.innerText = names[this.selectedWeapon] || this.selectedWeapon;
        }
    }
}

window.WormsGame = WormsGame;
