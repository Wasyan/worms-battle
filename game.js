// Main Game Engine for Worms Battle 2D - Multi-team, Crates, Giant Worms, & Superweapons

class WormsGame {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');

        // Virtual world dimensions
        this.worldWidth = 2400;
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

        // Teams & settings
        this.mode = 'pvp'; // 'pvp' or 'pve'
        this.teams = ['red', 'blue'];
        this.wormsPerTeam = 3;
        this.currentTeamIndex = 0;
        this.currentTeam = 'red';
        this.teamIndices = { red: 0, blue: 0, green: 0, yellow: 0 };
        this.turnsCount = 0;

        // Turn & Phase state
        this.phase = 'turn'; // 'turn', 'charging', 'shot', 'retreat', 'settle', 'game_over'
        this.turnTimeMax = 45;
        this.turnTimer = this.turnTimeMax;
        this.retreatTimer = 3;
        this.wind = 0;

        // Ammo Inventory per Team
        this.teamAmmo = {};

        // Weapon states
        this.selectedWeapon = 'bazooka';
        this.shotgunShotsLeft = 0;
        this.chargePower = 0;
        this.isCharging = false;
        this.chargeDirection = 1;

        // Entity lists
        this.worms = [];
        this.projectiles = [];
        this.specialAttacks = [];
        this.crates = [];
        this.particles = [];
        this.floatingTexts = [];

        this.keys = {};
        this.terrain = new Terrain(this.worldWidth, this.worldHeight);

        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.setupEvents();
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    startNewGame(mode = 'pvp', wormsCount = 3, numTeams = 2) {
        this.mode = mode;
        this.wormsPerTeam = wormsCount;
        const allTeamKeys = ['red', 'blue', 'green', 'yellow'];
        this.teams = allTeamKeys.slice(0, Math.min(4, Math.max(2, numTeams)));
        this.currentTeamIndex = 0;
        this.currentTeam = this.teams[0];
        this.turnsCount = 0;

        this.terrain = new Terrain(this.worldWidth, this.worldHeight);
        this.worms = [];
        this.projectiles = [];
        this.specialAttacks = [];
        this.crates = [];
        this.particles = [];
        this.floatingTexts = [];
        this.teamIndices = { red: 0, blue: 0, green: 0, yellow: 0 };

        // Initialize Team Ammo
        this.teamAmmo = {};
        for (const t of this.teams) {
            this.teamAmmo[t] = {
                bazooka: Infinity,
                shotgun: Infinity,
                grenade: 5,
                cluster: 3,
                dynamite: 2,
                bat: 2,
                teleport: 2,
                airstrike: 1,
                carpet: 1,
                holy: 1,
                donkey: 1,
                annihilator: 1,
                sunbeam: 1,
                laser: 3,
                electro: 3
            };
        }

        const teamNames = {
            red: ["Василий", "Шурик", "Геннадий", "Иван", "Димон", "Федор", "Степан", "Михаил"],
            blue: ["Борис", "Гриша", "Артем", "Максим", "Олег", "Сергей", "Егор", "Влад"],
            green: ["Тимур", "Руслан", "Данил", "Антон", "Кирилл", "Денис", "Павел", "Глеб"],
            yellow: ["Ярослав", "Захар", "Матвей", "Лев", "Семен", "Роман", "Илья", "Арсений"]
        };

        // Distribute teams evenly along the island
        const numT = this.teams.length;
        const islandStart = 300;
        const islandEnd = this.worldWidth - 300;
        const teamSpan = (islandEnd - islandStart) / numT;

        this.teams.forEach((teamKey, tIdx) => {
            const teamCenter = islandStart + teamSpan * (tIdx + 0.5);
            for (let i = 0; i < wormsCount; i++) {
                const spread = (i - (wormsCount - 1) / 2) * 85;
                const spawnX = Math.max(150, Math.min(this.worldWidth - 150, teamCenter + spread + (Math.random() * 40 - 20)));
                const groundY = this.terrain.findGroundY(spawnX) - 15;
                const names = teamNames[teamKey] || teamNames.red;
                const worm = new Worm(`${teamKey}_${i}`, teamKey, names[i % names.length], spawnX, groundY);

                // If PvE, non-red teams are AI bots
                if (mode === 'pve' && teamKey !== 'red') {
                    worm.isBot = true;
                }
                this.worms.push(worm);
            }
        });

        // Spawn initial bonus crates (one guaranteed giant worm bonus!)
        this.crates.push(new Crate(this.worldWidth * 0.42, 'giant'));
        this.crates.push(new Crate(this.worldWidth * 0.58, 'weapon'));

        this.setNewWind();
        this.startTurn(this.teams[0]);
    }

    refillTeamAmmo(team) {
        if (!this.teamAmmo[team]) return;
        const ammo = this.teamAmmo[team];
        ammo.grenade += 3;
        ammo.cluster += 2;
        ammo.dynamite += 1;
        ammo.bat += 1;
        ammo.teleport += 1;
        ammo.laser += 2;
        ammo.electro += 2;
        ammo.holy += 1;
        ammo.donkey += 1;
        ammo.annihilator += 1;
        ammo.sunbeam += 1;
        ammo.carpet += 1;
        ammo.airstrike += 1;
        this.updateHUD();
    }

    consumeAmmo(weapon) {
        if (this.teamAmmo[this.currentTeam] && this.teamAmmo[this.currentTeam][weapon] !== undefined) {
            if (this.teamAmmo[this.currentTeam][weapon] !== Infinity) {
                this.teamAmmo[this.currentTeam][weapon] = Math.max(0, this.teamAmmo[this.currentTeam][weapon] - 1);
                if (this.teamAmmo[this.currentTeam][weapon] <= 0) {
                    this.selectedWeapon = 'bazooka';
                }
            }
        }
        this.updateHUD();
    }

    getAmmo(weapon) {
        if (!this.teamAmmo[this.currentTeam]) return Infinity;
        const val = this.teamAmmo[this.currentTeam][weapon];
        return val !== undefined ? val : Infinity;
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

        if (this.checkWinCondition()) return;

        const teamWorms = this.worms.filter(w => w.team === this.currentTeam && w.isAlive && !w.isDrowned);
        if (teamWorms.length > 0) {
            this.teamIndices[this.currentTeam] = this.teamIndices[this.currentTeam] % teamWorms.length;
        }

        const activeWorm = this.getActiveWorm();
        if (activeWorm) {
            this.targetCamX = activeWorm.x;
            this.targetCamY = activeWorm.y;

            const teamTitles = {
                red: 'Красных',
                blue: 'Синих',
                green: 'Зелёных',
                yellow: 'Жёлтых'
            };
            activeWorm.say(`Ход команды ${teamTitles[this.currentTeam] || this.currentTeam}!`, 60);

            if (activeWorm.isBot) {
                activeWorm.botStep = 'idle';
                activeWorm.botTimer = 0;
            }
        }

        // Spawn periodic bonus crate every 2 turns
        this.turnsCount++;
        if (this.turnsCount > 1 && this.turnsCount % 2 === 0) {
            const types = ['giant', 'weapon', 'health', 'giant'];
            const randomType = types[Math.floor(Math.random() * types.length)];
            const spawnX = 250 + Math.random() * (this.worldWidth - 500);
            this.crates.push(new Crate(spawnX, randomType));
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
        // Find next living team in order
        const totalTeams = this.teams.length;
        let nextIdx = (this.teams.indexOf(this.currentTeam) + 1) % totalTeams;

        for (let i = 0; i < totalTeams; i++) {
            const candidateTeam = this.teams[nextIdx];
            const living = this.worms.some(w => w.team === candidateTeam && w.isAlive && !w.isDrowned);
            if (living) {
                this.teamIndices[this.currentTeam]++;
                this.startTurn(candidateTeam);
                return;
            }
            nextIdx = (nextIdx + 1) % totalTeams;
        }

        this.checkWinCondition();
    }

    selectWeapon(weaponName) {
        if (this.getAmmo(weaponName) <= 0) return;
        this.selectedWeapon = weaponName;
        this.updateHUD();
        const active = this.getActiveWorm();
        if (active && !active.isBot) {
            const titles = {
                bazooka: 'Базука',
                grenade: 'Граната',
                cluster: 'Кластер',
                shotgun: 'Дробовик',
                dynamite: 'Динамит',
                bat: 'Бита',
                airstrike: 'Авиаудар',
                carpet: 'Ковровый удар',
                holy: 'Святая граната',
                donkey: 'Мраморный осёл',
                annihilator: 'Аннигилятор',
                sunbeam: 'Луч солнца',
                laser: 'Лазерный бур',
                electro: 'Электрошок',
                teleport: 'Телепорт'
            };
            active.say(titles[weaponName] || weaponName, 40);
        }
    }

    fireCurrentWeapon(overridePower = null) {
        const active = this.getActiveWorm();
        if (!active || !active.isAlive) return;

        if (this.getAmmo(this.selectedWeapon) <= 0) {
            this.selectedWeapon = 'bazooka';
        }

        const power = overridePower !== null ? overridePower : this.chargePower;
        const angle = active.aimAngle;
        const facing = active.facing;

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
            this.consumeAmmo('bazooka');
            this.phase = 'shot';
        } else if (this.selectedWeapon === 'grenade' || this.selectedWeapon === 'cluster' || this.selectedWeapon === 'holy') {
            const speed = 4 + (power / 100) * 19;
            const p = new Projectile(spawnX, spawnY, Math.cos(angle) * speed, Math.sin(angle) * speed, this.selectedWeapon, active);
            this.projectiles.push(p);
            if (window.soundSystem) {
                window.soundSystem.playRocketLaunch();
                window.soundSystem.playVoiceFire();
            }
            this.consumeAmmo(this.selectedWeapon);
            this.phase = 'shot';
        } else if (this.selectedWeapon === 'annihilator') {
            const speed = 7 + (power / 100) * 24;
            const p = new Projectile(spawnX, spawnY, Math.cos(angle) * speed, Math.sin(angle) * speed, 'annihilator', active);
            this.projectiles.push(p);
            if (window.soundSystem) {
                window.soundSystem.playAnnihilatorFire();
                window.soundSystem.playVoiceFire();
            }
            this.consumeAmmo('annihilator');
            this.phase = 'shot';
        } else if (this.selectedWeapon === 'laser') {
            this.specialAttacks.push(new LaserDrillManager(active.x, active.y - 4, angle, active));
            this.consumeAmmo('laser');
            this.startRetreat();
        } else if (this.selectedWeapon === 'electro') {
            this.specialAttacks.push(new ElectroshockManager(active.x, active.y - 4, angle, active));
            this.consumeAmmo('electro');
            this.startRetreat();
        } else if (this.selectedWeapon === 'shotgun') {
            if (this.shotgunShotsLeft === 0) {
                this.shotgunShotsLeft = 2;
                this.consumeAmmo('shotgun');
            }
            this.shotgunShotsLeft--;

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
            const p = new Projectile(active.x + facing * 12, active.y - 2, facing * 1.5, -1.5, 'dynamite', active);
            this.projectiles.push(p);
            if (window.soundSystem) window.soundSystem.playFuseTicking();
            this.consumeAmmo('dynamite');
            this.startRetreat();
        } else if (this.selectedWeapon === 'bat') {
            if (window.soundSystem) window.soundSystem.playBatSwing();
            let hitAnyone = false;
            for (const w of this.worms) {
                if (w !== active && w.isAlive && !w.isDrowned) {
                    const dist = Math.hypot(w.x - active.x, w.y - active.y);
                    if (dist < 45) {
                        w.applyImpulse(Math.cos(angle) * 16, Math.sin(angle) * 16 - 3);
                        w.takeDamage(32);
                        w.say("ХОУМ-РАН!!", 60);
                        hitAnyone = true;
                    }
                }
            }
            if (hitAnyone && window.soundSystem) window.soundSystem.playBatHit();
            this.consumeAmmo('bat');
            this.startRetreat();
        }

        this.chargePower = 0;
        this.isCharging = false;
    }

    fireAirstrikeAt(worldX, worldY) {
        if (this.phase !== 'turn' || this.getAmmo('airstrike') <= 0) return;
        this.specialAttacks.push(new AirstrikeManager(worldX, worldY));
        this.consumeAmmo('airstrike');
        this.phase = 'shot';
        const active = this.getActiveWorm();
        if (active) active.say("Авиаудар на подходе!", 60);
    }

    fireCarpetStrikeAt(worldX) {
        if (this.phase !== 'turn' || this.getAmmo('carpet') <= 0) return;
        this.specialAttacks.push(new CarpetStrikeManager(worldX));
        this.consumeAmmo('carpet');
        this.phase = 'shot';
        const active = this.getActiveWorm();
        if (active) active.say("Ковровый удар! Спасайтесь!", 60);
    }

    fireConcreteDonkeyAt(worldX) {
        if (this.phase !== 'turn' || this.getAmmo('donkey') <= 0) return;
        this.specialAttacks.push(new ConcreteDonkeyManager(worldX));
        this.consumeAmmo('donkey');
        this.phase = 'shot';
        const active = this.getActiveWorm();
        if (active) active.say("И-ААА! Мраморный осёл!", 60);
    }

    fireSunbeamAt(worldX) {
        if (this.phase !== 'turn' || this.getAmmo('sunbeam') <= 0) return;
        this.specialAttacks.push(new SunbeamManager(worldX));
        this.consumeAmmo('sunbeam');
        this.phase = 'shot';
        const active = this.getActiveWorm();
        if (active) active.say("Да будет свет! ☀️", 60);
    }

    teleportActiveWormTo(worldX, worldY) {
        if (this.getAmmo('teleport') <= 0) return;
        const active = this.getActiveWorm();
        if (!active || !active.isAlive) return;

        if (this.terrain.checkCircleOverlap(worldX, worldY, active.radius)) {
            active.say("Туда нельзя!", 40);
            return;
        }

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

        this.consumeAmmo('teleport');
        this.endTurn();
    }

    createExplosion(x, y, radius, maxDamage) {
        this.terrain.carveCrater(x, y, radius);
        this.shakeTimer = 22;
        this.shakeIntensity = Math.min(20, radius * 0.35);

        if (window.soundSystem) {
            window.soundSystem.playExplosion(radius / 50);
        }

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

                    const angle = Math.atan2(w.y - y, w.x - x);
                    const force = falloff * (radius * 0.22);
                    w.applyImpulse(Math.cos(angle) * force, Math.sin(angle) * force - 3);
                }
            }
        }

        const particleCount = Math.floor(radius * 0.9);
        const colors = ['#facc15', '#f97316', '#ef4444', '#78350f', '#1e293b'];
        for (let i = 0; i < particleCount; i++) {
            const ang = Math.random() * Math.PI * 2;
            const spd = 1 + Math.random() * (radius * 0.14);
            this.addParticle({
                x: x, y: y,
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
        this.floatingTexts.push({ text, x, y, color, life: 1.0, decay: 0.02 });
    }

    checkWinCondition() {
        const livingTeams = this.teams.filter(t => this.worms.some(w => w.team === t && w.isAlive && !w.isDrowned));

        if (livingTeams.length === 0) {
            this.showGameOver('Ничья!');
            return true;
        } else if (livingTeams.length === 1) {
            const teamTitles = {
                red: 'Красной Команды!',
                blue: 'Синей Команды!',
                green: 'Зелёной Команды!',
                yellow: 'Жёлтой Команды!'
            };
            this.showGameOver(`Победа ${teamTitles[livingTeams[0]] || livingTeams[0]}`);
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

            const chargeWeapons = ['bazooka', 'grenade', 'cluster', 'holy', 'annihilator'];
            const instantWeapons = ['shotgun', 'dynamite', 'bat', 'laser', 'electro'];

            if (e.code === 'Space' && !e.repeat && this.phase === 'turn') {
                const active = this.getActiveWorm();
                if (active && !active.isBot) {
                    if (chargeWeapons.includes(this.selectedWeapon)) {
                        this.isCharging = true;
                        this.chargePower = 0;
                        this.chargeDirection = 1;
                        if (this.selectedWeapon === 'annihilator' && window.soundSystem) {
                            window.soundSystem.playAnnihilatorCharge();
                        }
                    } else if (instantWeapons.includes(this.selectedWeapon)) {
                        this.fireCurrentWeapon();
                    }
                }
            }

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

        window.addEventListener('mousemove', (e) => {
            this.screenMouseX = e.clientX;
            this.screenMouseY = e.clientY;
            this.mouseX = (e.clientX - this.canvas.width / 2) / this.camZoom + this.camX;
            this.mouseY = (e.clientY - this.canvas.height / 2) / this.camZoom + this.camY;

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
                e.preventDefault();
                const arsenal = document.getElementById('weapon-arsenal');
                if (arsenal) arsenal.classList.toggle('hidden');
                return;
            }

            if (e.button === 0 && this.phase === 'turn') {
                if (this.selectedWeapon === 'airstrike') {
                    this.fireAirstrikeAt(this.mouseX, this.mouseY);
                } else if (this.selectedWeapon === 'carpet') {
                    this.fireCarpetStrikeAt(this.mouseX);
                } else if (this.selectedWeapon === 'donkey') {
                    this.fireConcreteDonkeyAt(this.mouseX);
                } else if (this.selectedWeapon === 'sunbeam') {
                    this.fireSunbeamAt(this.mouseX);
                } else if (this.selectedWeapon === 'teleport') {
                    this.teleportActiveWormTo(this.mouseX, this.mouseY);
                }
            }
        });

        window.addEventListener('contextmenu', (e) => e.preventDefault());

        window.addEventListener('wheel', (e) => {
            e.preventDefault();
            const zoomDelta = e.deltaY < 0 ? 0.1 : -0.1;
            this.camZoom = Math.max(0.6, Math.min(1.4, this.camZoom + zoomDelta));
        }, { passive: false });

        // Touch support
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
            if (this.phase === 'turn') {
                if (this.selectedWeapon === 'airstrike') {
                    this.fireAirstrikeAt(this.mouseX, this.mouseY);
                } else if (this.selectedWeapon === 'carpet') {
                    this.fireCarpetStrikeAt(this.mouseX);
                } else if (this.selectedWeapon === 'donkey') {
                    this.fireConcreteDonkeyAt(this.mouseX);
                } else if (this.selectedWeapon === 'sunbeam') {
                    this.fireSunbeamAt(this.mouseX);
                } else if (this.selectedWeapon === 'teleport') {
                    this.teleportActiveWormTo(this.mouseX, this.mouseY);
                }
            }
        }, { passive: true });

        this.canvas.addEventListener('touchmove', (e) => {
            handleTouchPos(e);
        }, { passive: true });
    }

    update() {
        const active = this.getActiveWorm();

        if (active && active.isBot && (this.phase === 'turn' || this.phase === 'retreat')) {
            active.updateBot(this);
        }

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

        // Charging
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

        // Timers
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

        // Update Worms
        for (const w of this.worms) {
            w.update(this.terrain);
        }

        // Update Projectiles
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];
            p.update(this);
            if (!p.alive) {
                this.projectiles.splice(i, 1);
            }
        }

        // Update Special Attacks
        for (let i = this.specialAttacks.length - 1; i >= 0; i--) {
            const s = this.specialAttacks[i];
            s.update(this);
            if (!s.active) {
                this.specialAttacks.splice(i, 1);
            }
        }

        // Update Crates
        for (let i = this.crates.length - 1; i >= 0; i--) {
            const c = this.crates[i];
            c.update(this);
            if (!c.active) {
                this.crates.splice(i, 1);
            }
        }

        // Particles & Floating text
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

        this.terrain.updateDebris();

        // Check Phase
        if (this.phase === 'shot') {
            if (this.projectiles.length === 0 && this.specialAttacks.length === 0) {
                this.startRetreat();
            }
        } else if (this.phase === 'settle') {
            const allSettled = this.worms.every(w => !w.isAlive || (w.onGround && Math.abs(w.vx) < 0.2 && Math.abs(w.vy) < 0.2));
            if (allSettled && this.particles.length < 5) {
                if (!this.checkWinCondition()) {
                    this.endTurn();
                }
            }
        }

        this.updateCamera();
        this.updateHUD();
    }

    updateCamera() {
        if (this.projectiles.length > 0) {
            const p = this.projectiles[this.projectiles.length - 1];
            this.targetCamX = p.x;
            this.targetCamY = p.y;
        } else if (this.specialAttacks.length > 0) {
            const s = this.specialAttacks[this.specialAttacks.length - 1];
            this.targetCamX = s.x || (s.targetX || this.targetCamX);
            this.targetCamY = s.y || (s.targetY || 400);
        } else {
            const active = this.getActiveWorm();
            if (active && active.isAlive) {
                this.targetCamX = active.x;
                this.targetCamY = active.y;
            }
        }

        this.camX += (this.targetCamX - this.camX) * 0.08;
        this.camY += (this.targetCamY - this.camY) * 0.08;

        const halfW = (this.canvas.width / 2) / this.camZoom;
        const halfH = (this.canvas.height / 2) / this.camZoom;
        this.camX = Math.max(halfW, Math.min(this.worldWidth - halfW, this.camX));
        this.camY = Math.max(halfH, Math.min(this.worldHeight - halfH, this.camY));

        if (this.shakeTimer > 0) {
            this.shakeTimer--;
        }
    }

    render() {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        ctx.clearRect(0, 0, w, h);

        const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
        skyGrad.addColorStop(0, '#38bdf8');
        skyGrad.addColorStop(0.65, '#bae6fd');
        skyGrad.addColorStop(1, '#e0f2fe');
        ctx.fillStyle = skyGrad;
        ctx.fillRect(0, 0, w, h);

        ctx.save();
        ctx.translate(w / 2, h / 2);
        ctx.scale(this.camZoom, this.camZoom);

        let shakeX = 0;
        let shakeY = 0;
        if (this.shakeTimer > 0) {
            const intensity = (this.shakeTimer / 22) * this.shakeIntensity;
            shakeX = (Math.random() - 0.5) * intensity;
            shakeY = (Math.random() - 0.5) * intensity;
        }
        ctx.translate(-this.camX + shakeX, -this.camY + shakeY);

        this.drawBackgroundClouds(ctx);
        this.terrain.draw(ctx);

        // Draw Crates
        for (const c of this.crates) {
            c.draw(ctx);
        }

        // Draw Worms
        const activeWorm = this.getActiveWorm();
        for (const worm of this.worms) {
            worm.draw(ctx, worm === activeWorm, this.selectedWeapon);
        }

        // Draw Projectiles
        for (const p of this.projectiles) {
            p.draw(ctx);
        }

        // Draw Special Attacks
        for (const s of this.specialAttacks) {
            s.draw(ctx);
        }

        // Particles
        for (const pt of this.particles) {
            ctx.fillStyle = pt.color;
            ctx.globalAlpha = Math.max(0, pt.life);
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1.0;

        // Floating Text
        for (const ft of this.floatingTexts) {
            ctx.font = 'bold 16px "Segoe UI", sans-serif';
            ctx.fillStyle = ft.color;
            ctx.globalAlpha = Math.max(0, ft.life);
            ctx.textAlign = 'center';
            ctx.fillText(ft.text, ft.x, ft.y);
        }
        ctx.globalAlpha = 1.0;

        // Reticle / Aim Guide
        if (activeWorm && !activeWorm.isBot && this.phase === 'turn') {
            this.drawAimGuide(ctx, activeWorm);
        }

        ctx.restore();
        this.drawMinimap(ctx);
    }

    drawAimGuide(ctx, worm) {
        const isTargeting = ['airstrike', 'carpet', 'donkey', 'sunbeam', 'teleport'].includes(this.selectedWeapon);

        if (isTargeting) {
            // Draw crosshair at mouse coordinates
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(this.mouseX, this.mouseY, 14, 0, Math.PI * 2);
            ctx.moveTo(this.mouseX - 20, this.mouseY);
            ctx.lineTo(this.mouseX + 20, this.mouseY);
            ctx.moveTo(this.mouseX, this.mouseY - 20);
            ctx.lineTo(this.mouseX, this.mouseY + 20);
            ctx.stroke();
            return;
        }

        const angle = worm.aimAngle;
        const rx = worm.x + Math.cos(angle) * 55;
        const ry = worm.y - 4 + Math.sin(angle) * 55;

        ctx.strokeStyle = 'rgba(239, 68, 68, 0.85)';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(rx, ry, 7, 0, Math.PI * 2);
        ctx.moveTo(rx - 10, ry);
        ctx.lineTo(rx + 10, ry);
        ctx.moveTo(rx, ry - 10);
        ctx.lineTo(rx, ry + 10);
        ctx.stroke();

        // Trajectory preview
        if (this.isCharging && ['bazooka', 'grenade', 'cluster', 'holy', 'annihilator'].includes(this.selectedWeapon)) {
            const speed = (this.selectedWeapon === 'bazooka' ? 5 + (this.chargePower / 100) * 22 : 4 + (this.chargePower / 100) * 19);
            let simX = worm.x + Math.cos(angle) * 25;
            let simY = worm.y - 4 + Math.sin(angle) * 25;
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
            { x: 1850, y: 110, r: 65 },
            { x: 2200, y: 150, r: 55 }
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
        const mw = 200;
        const mh = 90;
        const mx = this.canvas.width - mw - 16;
        const my = 16;

        ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(mx, my, mw, mh, 6);
        ctx.fill();
        ctx.stroke();

        const sx = mw / this.worldWidth;
        const sy = mh / this.worldHeight;

        const waterMinimapY = my + this.terrain.waterLevel * sy;
        ctx.fillStyle = 'rgba(6, 182, 212, 0.4)';
        ctx.fillRect(mx, waterMinimapY, mw, mh - (waterMinimapY - my));

        const teamColors = { red: '#ef4444', blue: '#3b82f6', green: '#22c55e', yellow: '#eab308' };

        // Draw Crates on minimap
        for (const c of this.crates) {
            if (c.active) {
                ctx.fillStyle = '#facc15';
                ctx.fillRect(mx + c.x * sx - 1.5, my + c.y * sy - 1.5, 3, 3);
            }
        }

        // Draw Worms on minimap
        for (const w of this.worms) {
            if (w.isAlive && !w.isDrowned) {
                const wx = mx + w.x * sx;
                const wy = my + w.y * sy;
                ctx.fillStyle = teamColors[w.team] || '#ffffff';
                ctx.beginPath();
                ctx.arc(wx, wy, w.isGiant ? 5 : 3, 0, Math.PI * 2);
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

        // Team Banner
        const teamBanner = document.getElementById('team-banner');
        if (teamBanner) {
            const teamTitles = { red: 'Красные', blue: 'Синие', green: 'Зелёные', yellow: 'Жёлтые' };
            teamBanner.innerText = `Ход: ${teamTitles[this.currentTeam] || this.currentTeam}`;
            teamBanner.className = `badge ${this.currentTeam}`;
        }

        // Wind
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

        // Power Bar
        const powerBar = document.getElementById('charge-bar');
        if (powerBar) {
            powerBar.style.width = `${this.chargePower}%`;
        }

        // Weapon Name & Ammo in HUD
        const curWeaponEl = document.getElementById('cur-weapon-name');
        if (curWeaponEl) {
            const titles = {
                bazooka: 'Базука',
                grenade: 'Граната',
                cluster: 'Кластер',
                shotgun: 'Дробовик',
                dynamite: 'Динамит',
                bat: 'Бита',
                airstrike: 'Авиаудар',
                carpet: 'Ковровый удар',
                holy: 'Святая граната',
                donkey: 'Мраморный осёл',
                annihilator: 'Аннигилятор',
                sunbeam: 'Луч солнца',
                laser: 'Лазерный бур',
                electro: 'Электрошок',
                teleport: 'Телепорт'
            };
            const ammoCount = this.getAmmo(this.selectedWeapon);
            const ammoStr = ammoCount === Infinity ? '∞' : `x${ammoCount}`;
            curWeaponEl.innerText = `${titles[this.selectedWeapon] || this.selectedWeapon} (${ammoStr})`;
        }

        // Update ammo badges on UI quickbar and arsenal modal
        document.querySelectorAll('[data-weapon]').forEach(el => {
            const wName = el.getAttribute('data-weapon');
            const ammo = this.getAmmo(wName);
            const badge = el.querySelector('.weapon-ammo');
            if (badge) {
                badge.innerText = ammo === Infinity ? '∞' : `x${ammo}`;
            }
            if (ammo <= 0) {
                el.classList.add('disabled');
            } else {
                el.classList.remove('disabled');
            }
        });
    }
}

window.WormsGame = WormsGame;
