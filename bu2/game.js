document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const messagesDiv = document.getElementById('messages');
    const startButton = document.getElementById('startButton');
    const heartsDisplay = document.getElementById('hearts');
    const carrotsCollectedDisplay = document.getElementById('carrotsCollected');
    const totalCarrotsDisplay = document.getElementById('totalCarrotsInLevel');

    // Game settings
    canvas.width = 800;
    canvas.height = 400;

    const GRAVITY = 0.6;
    const PLAYER_SPEED = 3.5;
    const PLAYER_RUN_SPEED = 6;
    const JUMP_FORCE = 13;
    const MIN_JUMP_HEIGHT = 5;

    let cameraX = 0;
    let player, platforms, carrots, enemies, exit;
    let keys = {};
    let lives = 3; // Lives persist across levels
    const MAX_LIVES = 5; // Maximum lives Bobo can have
    let requiredCarrots = 0;
    let collectedCarrotsCount = 0;
    let isGameOver = false;
    let gameStarted = false;
    let isInvincible = false;
    let invincibilityTimer = 0;
    const INVINCIBILITY_DURATION = 2000;
    let currentSpeed = PLAYER_SPEED;

    let lastKeyPressTime = { 'ArrowLeft': 0, 'ArrowRight': 0 };
    const DOUBLE_TAP_THRESHOLD = 220;

    let gameLoopId;
    let soundsInitialized = false;
    let currentLevelIndex = 0;
    let currentLevelData; // Will hold data for the current level

    // --- Sound Effects with Tone.js ---
    const sounds = {
        jump: new Tone.Synth({ oscillator: { type: 'sine' }, envelope: { attack: 0.01, decay: 0.1, sustain: 0.05, release: 0.1 }, volume: -12 }).toDestination(),
        collect: new Tone.Synth({ oscillator: { type: 'triangle' }, envelope: { attack: 0.01, decay: 0.2, sustain: 0.01, release: 0.1 }, volume: -10 }).toDestination(),
        hit: new Tone.NoiseSynth({ noise: { type: 'pink' }, envelope: { attack: 0.005, decay: 0.1, sustain: 0, release: 0.1 }, volume: -8 }).toDestination(),
        stomp: new Tone.Synth({ oscillator: { type: 'square' }, envelope: { attack: 0.01, decay: 0.15, sustain: 0, release: 0.1 }, volume: -14 }).toDestination(),
        levelComplete: new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'sawtooth' }, envelope: { attack: 0.05, decay: 0.3, sustain: 0.2, release: 0.3 }, volume: -11 }).toDestination(),
        gameOver: new Tone.Synth({ oscillator: { type: 'fatsawtooth', detune: 10, count: 2 }, envelope: { attack: 0.1, decay: 0.5, sustain: 0, release: 0.2 }, volume: -9 }).toDestination(),
        nextLevel: new Tone.Synth({ oscillator: { type: 'pulse', width: 0.3 }, envelope: { attack: 0.02, decay: 0.2, sustain: 0.1, release: 0.2 }, volume: -10 }).toDestination(),
        gameWin: new Tone.PolySynth(Tone.Synth, { oscillator: {type: "triangle"}, envelope: { attack: 0.1, decay: 0.5, sustain: 0.3, release: 0.5}, volume: -8}).toDestination(),
    };

    function playSound(soundName) {
        if (!soundsInitialized || !sounds[soundName]) return;
        try {
            // Ensure Tone.context is running
            if (Tone.context.state !== 'running') {
                Tone.context.resume();
            }
            if (soundName === 'jump') sounds.jump.triggerAttackRelease('C5', '8n');
            else if (soundName === 'collect') sounds.collect.triggerAttackRelease('E6', '16n', Tone.now(), 0.8);
            else if (soundName === 'hit') sounds.hit.triggerAttackRelease('0.1');
            else if (soundName === 'stomp') sounds.stomp.triggerAttackRelease('G3', '8n');
            else if (soundName === 'levelComplete') sounds.levelComplete.triggerAttackRelease(['C4', 'E4', 'G4', 'C5'], '0.5n');
            else if (soundName === 'gameOver') sounds.gameOver.triggerAttackRelease('C3', '1n');
            else if (soundName === 'nextLevel') sounds.nextLevel.triggerAttackRelease('A4', '4n');
            else if (soundName === 'gameWin') sounds.gameWin.triggerAttackRelease(['C4', 'G4', 'C5', 'E5', 'G5'], '1n');
        } catch (error) {
            console.error("Error playing sound:", soundName, error);
        }
    }

    async function initializeSounds() {
        if (soundsInitialized) return;
        try {
            await Tone.start();
            soundsInitialized = true;
            console.log("Audio context started by Tone.js");
        } catch (e) {
            console.error("Could not start Tone.js audio context:", e);
        }
    }

    // --- Level Definitions ---
    // Helper function to generate simple platform arrays
    function generatePlatforms(levelWidth, yOffset, count, minWidth, maxWidth, minGap, maxGap, canBeMoving = false, movingChance = 0.2) {
        const plats = [];
        let currentX = 150;
        for (let i = 0; i < count; i++) {
            if (currentX > levelWidth - maxWidth - 50) break; // Stop if near end of level
            const width = Math.random() * (maxWidth - minWidth) + minWidth;
            const yPos = canvas.height - (Math.random() * 100 + yOffset); // Vary y position
            
            let platform = { worldX: currentX, y: yPos, width: width, height: 20, color: '#6f4e37' };

            if (canBeMoving && Math.random() < movingChance) {
                platform.type = 'moving';
                platform.speed = 0.5 + Math.random() * 1; // Speed between 0.5 and 1.5
                platform.range = 30 + Math.random() * 50; // Range between 30 and 80
                platform.dir = Math.random() < 0.5 ? 1 : -1;
                platform.originalWorldX = currentX;
            }
            plats.push(platform);
            currentX += width + (Math.random() * (maxGap - minGap) + minGap);
        }
        return plats;
    }
    
    // Helper to generate carrots on platforms
    function generateCarrots(platforms, chance = 0.5) {
        const crts = [];
        platforms.forEach(p => {
            if (Math.random() < chance && p.width > 30) { // Only on wider platforms
                 crts.push({ worldX: p.worldX + p.width / 2 - 7.5, y: p.y - 28, width: 15, height: 25, color: '#fd7e14', collected: false });
            }
        });
        return crts;
    }

    // Helper to generate enemies
    function generateEnemies(levelWidth, count, yLevel, baseSpeed, patrolRangeWidth) {
        const enms = [];
        for (let i = 0; i < count; i++) {
            const startX = 200 + Math.random() * (levelWidth - patrolRangeWidth - 300);
            enms.push({
                worldX: startX, y: canvas.height - yLevel, width: 40, height: 30, color: '#dc3545',
                speed: baseSpeed + Math.random() * 0.5, originalSpeed: baseSpeed + Math.random() * 0.5,
                direction: Math.random() < 0.5 ? 1 : -1,
                patrolRange: { start: startX - patrolRangeWidth/2, end: startX + patrolRangeWidth/2 }
            });
        }
        return enms;
    }


    const allLevelsData = [
        // Level 1 (Original)
        {
            width: 3200,
            bgColor: '#87CEEB', // Sky Blue
            groundColor: '#28a745',
            platformColor: '#6f4e37',
            platforms: [
                { worldX: 0, y: canvas.height - 20, width: 400, height: 20 }, { worldX: 500, y: canvas.height - 20, width: 600, height: 20 },
                { worldX: 1200, y: canvas.height - 20, width: 800, height: 20 }, { worldX: 2100, y: canvas.height - 20, width: 3200 - 2100, height: 20 },
                { worldX: 150, y: canvas.height - 80, width: 100, height: 20 }, { worldX: 300, y: canvas.height - 140, width: 120, height: 20 },
                { worldX: 550, y: canvas.height - 100, width: 150, height: 20 }, { worldX: 700, y: canvas.height - 180, width: 80, height: 20 },
                { worldX: 850, y: canvas.height - 120, width: 100, height: 20 }, { worldX: 1000, y: canvas.height - 90, width: 130, height: 20 },
                { worldX: 1150, y: canvas.height - 150, width: 100, height: 20 }, { worldX: 1300, y: canvas.height - 200, width: 120, height: 20 },
                { worldX: 1500, y: canvas.height - 100, width: 150, height: 20 }, 
                { worldX: 1600, y: canvas.height - 160, width: 70, height: 20, type: 'moving', speed: 1, range: 50, dir: 1, originalWorldX: 1600 },
                { worldX: 1750, y: canvas.height - 130, width: 100, height: 20 }, { worldX: 1900, y: canvas.height - 70, width: 90, height: 20 },
                { worldX: 2050, y: canvas.height - 140, width: 110, height: 20 }, { worldX: 2200, y: canvas.height - 190, width: 100, height: 20 },
                { worldX: 2350, y: canvas.height - 100, width: 150, height: 20 }, { worldX: 2500, y: canvas.height - 150, width: 80, height: 20 },
                { worldX: 2650, y: canvas.height - 220, width: 120, height: 20 }, { worldX: 2800, y: canvas.height - 120, width: 100, height: 20 },
                { worldX: 2950, y: canvas.height - 170, width: 130, height: 20, type: 'moving', speed: 1.5, range: 70, dir: 1, originalWorldX: 2950 },
            ],
            carrots: [ /* Defined as in previous version, slightly fewer for brevity here */
                { worldX: 180, y: canvas.height - 105, width: 15, height: 25, color: '#fd7e14', collected: false },
                { worldX: 350, y: canvas.height - 165, width: 15, height: 25, color: '#fd7e14', collected: false },
                { worldX: 1350, y: canvas.height - 225, width: 15, height: 25, color: '#fd7e14', collected: false },
                { worldX: 2250, y: canvas.height - 215, width: 15, height: 25, color: '#fd7e14', collected: false },
                { worldX: 3000, y: canvas.height - 50, width: 15, height: 25, color: '#fd7e14', collected: false },
            ],
            enemies: [
                { worldX: 400, y: canvas.height - 50, width: 40, height: 30, color: '#dc3545', speed: 1, originalSpeed: 1, direction: 1, patrolRange: { start: 300, end: 500 }},
                { worldX: 900, y: canvas.height - 50, width: 40, height: 30, color: '#dc3545', speed: 1.2, originalSpeed: 1.2, direction: 1, patrolRange: { start: 800, end: 1050 }},
            ],
            exitY: canvas.height - 60,
            requiredCarrotsFraction: 0.6 // Collect 60% of carrots
        },
        // Level 2: Slightly Harder, Cave Theme (Darker BG)
        {
            width: 3500,
            bgColor: '#34495e', // Dark Slate Blue
            groundColor: '#555', // Dark Grey
            platformColor: '#4a4a4a', // Darker Brown/Grey
            platforms: [
                { worldX: 0, y: canvas.height - 20, width: 300, height: 20 }, { worldX: 400, y: canvas.height - 20, width: 500, height: 20 },
                { worldX: 1000, y: canvas.height - 20, width: 700, height: 20 }, { worldX: 1800, y: canvas.height - 20, width: 3500 - 1800, height: 20 },
                ...generatePlatforms(3500, 70, 12, 60, 100, 80, 150, true, 0.3) // More moving platforms
            ],
            carrots: [], // Will be generated
            enemies: generateEnemies(3500, 4, 50, 1.3, 200), // More enemies, slightly faster
            exitY: canvas.height - 70,
            requiredCarrotsFraction: 0.7
        },
        // Level 3: Winter Theme (Lighter BG, Slippery?) - Not implementing slippery yet
        {
            width: 4000,
            bgColor: '#e0f7fa', // Very Light Cyan
            groundColor: '#c0c0c0', // Silver for "ice"
            platformColor: '#add8e6', // Light Blue for "ice" platforms
            platforms: [
                { worldX: 0, y: canvas.height - 20, width: 200, height: 20 }, { worldX: 300, y: canvas.height - 20, width: 400, height: 20 }, // More gaps in ground
                { worldX: 800, y: canvas.height - 20, width: 600, height: 20 }, { worldX: 1500, y: canvas.height - 20, width: 4000 - 1500, height: 20 },
                ...generatePlatforms(4000, 60, 15, 50, 90, 100, 180, true, 0.4) // Smaller platforms, bigger gaps
            ],
            carrots: [],
            enemies: generateEnemies(4000, 5, 50, 1.5, 180),
            exitY: canvas.height - 60,
            requiredCarrotsFraction: 0.75
        },
        // Level 4: Forest at Dusk
        {
            width: 3800,
            bgColor: '#4a4e69', // Dark Purple/Blue
            groundColor: '#22333b', // Dark Green/Brown
            platformColor: '#5e503f', // Dark Brown
            platforms: [
                { worldX: 0, y: canvas.height - 20, width: 350, height: 20 },
                { worldX: 450, y: canvas.height - 20, width: 550, height: 20 },
                { worldX: 1100, y: canvas.height - 20, width: 750, height: 20 },
                { worldX: 1950, y: canvas.height - 20, width: 3800 - 1950, height: 20 },
                ...generatePlatforms(3800, 80, 14, 70, 110, 90, 160, true, 0.35)
            ],
            carrots: [],
            enemies: generateEnemies(3800, 6, 50, 1.4, 220),
            exitY: canvas.height - 65,
            requiredCarrotsFraction: 0.7
        },
        // Level 5: High Mountains (More verticality, smaller platforms)
        {
            width: 4200,
            bgColor: '#9db4c0', // Dusty Blue
            groundColor: '#778899', // Light Slate Gray
            platformColor: '#5c6b73', // Grayish Blue
            platforms: [ // Less ground, more platforming
                { worldX: 0, y: canvas.height - 20, width: 150, height: 20 },
                { worldX: 500, y: canvas.height - 20, width: 200, height: 20 },
                { worldX: 1200, y: canvas.height - 20, width: 180, height: 20 },
                { worldX: 2000, y: canvas.height - 20, width: 250, height: 20 },
                { worldX: 3800, y: canvas.height - 20, width: 4200 - 3800, height: 20 },
                ...generatePlatforms(4200, 50, 18, 40, 80, 120, 200, true, 0.5) // Smaller, more moving
            ],
            carrots: [],
            enemies: generateEnemies(4200, 7, 50, 1.6, 150), // Faster, tighter patrol
            exitY: canvas.height - 80, // Higher exit
            requiredCarrotsFraction: 0.8
        },
        // Levels 6-10 will be variations with increasing parameters
    ];

    // Auto-generate levels 6-10 based on level 5, increasing difficulty
    for (let i = 1; i <= 5; i++) { // Create 5 more levels (total 10)
        const prevLevel = allLevelsData[4]; // Base on Level 5
        const newLevelWidth = prevLevel.width + i * 200;
        const newBgColor = `hsl(${200 + i * 10}, 50%, ${60 - i * 2}%)`; // Shift colors
        const newGroundColor = `hsl(${120 + i * 5}, 30%, ${40 - i * 2}%)`;
        const newPlatformColor = `hsl(${30 + i * 5}, 30%, ${35 - i * 2}%)`;

        allLevelsData.push({
            width: newLevelWidth,
            bgColor: newBgColor,
            groundColor: newGroundColor,
            platformColor: newPlatformColor,
            platforms: [ // Fewer ground platforms, more generated
                { worldX: 0, y: canvas.height - 20, width: 100 + i*10, height: 20 },
                { worldX: newLevelWidth - (100 + i*10), y: canvas.height - 20, width: 100 + i*10, height: 20 },
                ...generatePlatforms(newLevelWidth, 40 + i*5, 18 + i, 35 - i*2, 75 - i*3, 130 + i*10, 220 + i*10, true, 0.5 + i*0.05)
            ],
            carrots: [], // Will be generated
            enemies: generateEnemies(newLevelWidth, 7 + i, 50, 1.6 + i * 0.1, 140 - i*5),
            exitY: canvas.height - (80 + i*5),
            requiredCarrotsFraction: Math.min(0.95, 0.8 + i * 0.03)
        });
    }
    // Final "Boss" stage placeholder (Level 11 / index 10)
     allLevelsData.push({
        width: 1000, // Smaller arena
        bgColor: '#200000', // Ominous Red
        groundColor: '#100000',
        platformColor: '#301010',
        platforms: [ { worldX: 0, y: canvas.height - 20, width: 1000, height: 20 } ], // Just ground
        carrots: [], // No carrots, or maybe one special one
        enemies: [ /* Placeholder for a boss logic later */
            { worldX: 450, y: canvas.height - 100, width: 100, height: 80, color: '#ff0000', speed: 0, originalSpeed: 0, direction: 1, patrolRange: {start: 450, end: 450}, isBoss: true }
        ],
        exitY: canvas.height - 100,
        requiredCarrotsFraction: 0, // No carrots needed, just survive/defeat boss
        isBossLevel: true
    });


    function loadLevel(levelIndex) {
        if (levelIndex >= allLevelsData.length) {
            winGame();
            return;
        }
        currentLevelData = JSON.parse(JSON.stringify(allLevelsData[levelIndex])); // Deep copy

        // Set colors for platforms if not individually set
        currentLevelData.platforms.forEach(p => {
            if (!p.color) {
                p.color = (p.y === canvas.height - 20) ? currentLevelData.groundColor : currentLevelData.platformColor;
            }
            if (p.type === 'moving' && p.originalWorldX === undefined) {
                 p.originalWorldX = p.worldX; // Ensure originalWorldX is set
            }
        });
        
        // Generate carrots if array is empty for the level
        if (currentLevelData.carrots.length === 0 && !currentLevelData.isBossLevel) {
            currentLevelData.carrots = generateCarrots(currentLevelData.platforms.filter(p => p.y < canvas.height - 20), 0.6); // Don't put carrots on main ground
        }
         // Ensure all carrots have the collected flag
        currentLevelData.carrots.forEach(c => c.collected = false);


        platforms = currentLevelData.platforms;
        carrots = currentLevelData.carrots;
        enemies = currentLevelData.enemies;
        
        requiredCarrots = Math.ceil(carrots.length * currentLevelData.requiredCarrotsFraction);
        if (currentLevelData.isBossLevel) requiredCarrots = 0; // Boss level might not need carrots

        exit = {
            worldX: currentLevelData.width - 100,
            y: currentLevelData.exitY || canvas.height - 60,
            width: 50, height: 50, color: '#6c757d', isOpen: false
        };

        // Reset player for new level
        player = {
            worldX: 100, y: canvas.height - 100, width: 30, height: 40,
            drawWidth: 30, drawHeight: 40, color: '#007bff',
            velocityX: 0, velocityY: 0, isJumping: false, isOnGround: false,
            isCrouching: false, canVariableJump: false, jumpButtonPressedTime: 0
        };
        collectedCarrotsCount = 0;
        cameraX = 0;
        currentSpeed = PLAYER_SPEED;
        isGameOver = false; // Ensure game is not over when loading new level
        gameStarted = true; // Ensure game loop continues

        updateHUD();
        messagesDiv.textContent = `שלב ${levelIndex + 1}`;
        setTimeout(() => { if (messagesDiv.textContent === `שלב ${levelIndex + 1}`) messagesDiv.textContent = ""; }, 1500);
    }


    function startGame(startFreshGame = false) {
        if (startFreshGame) {
            currentLevelIndex = 0;
            lives = 3; // Reset lives only for a completely new game
        }
        isGameOver = false;
        gameStarted = true;
        startButton.style.display = 'none';
        messagesDiv.textContent = '';
        
        loadLevel(currentLevelIndex);

        if (!gameLoopId) {
             gameLoop();
        }
    }


    document.addEventListener('keydown', (e) => {
        keys[e.key] = true;
        if (isGameOver || !gameStarted || !player) return; // Added !player check

        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            const now = Date.now();
            if (now - lastKeyPressTime[e.key] < DOUBLE_TAP_THRESHOLD) {
                currentSpeed = PLAYER_RUN_SPEED;
            } else {
                currentSpeed = PLAYER_SPEED;
            }
            lastKeyPressTime[e.key] = now;
        }

        if ((e.key === 'ArrowUp' || e.key === ' ') && player.isOnGround && !player.isJumping) {
            player.isJumping = true;
            player.isOnGround = false;
            player.velocityY = -JUMP_FORCE;
            player.canVariableJump = true;
            player.jumpButtonPressedTime = Date.now();
            playSound('jump');
        }

        if (e.key === 'ArrowDown') {
            if (!player.isCrouching && player.isOnGround) {
                player.isCrouching = true;
                player.drawHeight = 25;
                player.drawWidth = 35;
            }
        }
    });

    document.addEventListener('keyup', (e) => {
        keys[e.key] = false;
        if (isGameOver || !gameStarted || !player) return; // Added !player check

        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            if (!keys['ArrowLeft'] && !keys['ArrowRight']) {
                currentSpeed = PLAYER_SPEED;
            }
        }
        
        if ((e.key === 'ArrowUp' || e.key === ' ') && player.canVariableJump) {
            player.canVariableJump = false;
            if (player.velocityY < -MIN_JUMP_HEIGHT) {
                 const pressDuration = Date.now() - player.jumpButtonPressedTime;
                 if (pressDuration < 150) { 
                    player.velocityY = -MIN_JUMP_HEIGHT * 1.5; 
                 }
            }
        }

        if (e.key === 'ArrowDown') {
            if (player.isCrouching) {
                player.isCrouching = false;
                player.drawHeight = player.height;
                player.drawWidth = player.width;
            }
        }
    });

    function updatePlayer() {
        if (isGameOver || !player) return;

        player.velocityX = 0;
        if (keys['ArrowLeft'] && !player.isCrouching) player.velocityX = -currentSpeed;
        if (keys['ArrowRight'] && !player.isCrouching) player.velocityX = currentSpeed;
        player.worldX += player.velocityX;

        player.velocityY += GRAVITY;
        player.y += player.velocityY;
        player.isOnGround = false;

        if (player.worldX < 0) player.worldX = 0;
        if (player.worldX + player.width > currentLevelData.width) player.worldX = currentLevelData.width - player.width;
        
        if (player.y + player.height > canvas.height + 50) {
            loseLife(true);
        }

        if (isInvincible) {
            invincibilityTimer -= 1000/60; 
            if (invincibilityTimer <= 0) isInvincible = false;
        }
    }

    function updateCamera() {
        if (!player) return;
        const targetCameraX = player.worldX - (canvas.width / 2 - player.width / 2);
        cameraX += (targetCameraX - cameraX) * 0.1;
        if (cameraX < 0) cameraX = 0;
        if (cameraX > currentLevelData.width - canvas.width) cameraX = currentLevelData.width - canvas.width;
    }
    
    function updatePlatforms() {
        if (!platforms) return;
        platforms.forEach(p => {
            if (p.type === 'moving') {
                p.worldX += p.speed * p.dir;
                 if (p.dir === 1 && p.worldX >= p.originalWorldX + p.range) {
                    p.worldX = p.originalWorldX + p.range;
                    p.dir = -1;
                } else if (p.dir === -1 && p.worldX <= p.originalWorldX) {
                    p.worldX = p.originalWorldX;
                    p.dir = 1;
                }
            }
        });
    }

    function updateEnemies() {
        if (isGameOver || !enemies) return;
        enemies.forEach(enemy => {
            if (enemy.isBoss) {
                // Basic boss behavior: move slightly, maybe later shoot or charge
                // For now, just static
                return;
            }
            const progressFactor = Math.min(1.5, 1 + (cameraX / currentLevelData.width) * 0.5);
            enemy.speed = enemy.originalSpeed * progressFactor * (1 + currentLevelIndex * 0.05); // Enemies get faster in later levels
            enemy.worldX += enemy.speed * enemy.direction;
            if (enemy.worldX <= enemy.patrolRange.start || enemy.worldX + enemy.width >= enemy.patrolRange.end) {
                enemy.direction *= -1;
            }
        });
    }

    function getPlayerHitbox() {
        if (!player) return {x:0,y:0,width:0,height:0}; // Safety
        if (player.isCrouching) {
            return {
                x: player.worldX, y: player.y + (player.height - player.drawHeight),
                width: player.drawWidth, height: player.drawHeight
            };
        }
        return { x: player.worldX, y: player.y, width: player.width, height: player.height };
    }

    function checkCollisions() {
        if (isGameOver || !player || !platforms || !carrots || !enemies || !exit) return;
        const playerHitbox = getPlayerHitbox();

        let onAnyPlatform = false;
        platforms.forEach(platform => {
            const platformHitbox = { x: platform.worldX, y: platform.y, width: platform.width, height: platform.height };
            if (isRectColliding(playerHitbox, platformHitbox)) {
                const prevPlayerBottom = (player.y + playerHitbox.height) - player.velocityY;
                if (player.velocityY >= 0 && prevPlayerBottom <= platform.y + 1) {
                    player.y = platform.y - playerHitbox.height;
                    player.velocityY = 0;
                    player.isJumping = false;
                    player.isOnGround = true;
                    onAnyPlatform = true;
                    if (platform.type === 'moving' && player.isOnGround) {
                        player.worldX += platform.speed * platform.dir;
                    }
                } else if (player.velocityY < 0 && player.y - player.velocityY >= platform.y + platform.height -1) {
                    player.y = platform.y + platform.height;
                    player.velocityY = 0;
                } else {
                     if (player.velocityX > 0 && playerHitbox.x + playerHitbox.width - player.velocityX <= platform.worldX) {
                        player.worldX = platform.worldX - playerHitbox.width;
                        player.velocityX = 0;
                    } else if (player.velocityX < 0 && playerHitbox.x - player.velocityX >= platform.worldX + platform.width) {
                        player.worldX = platform.worldX + platform.width;
                        player.velocityX = 0;
                    }
                }
            }
        });

        carrots.forEach((carrot) => {
            if (!carrot.collected && isRectColliding(playerHitbox, {x: carrot.worldX, y: carrot.y, width: carrot.width, height: carrot.height})) {
                carrot.collected = true;
                collectedCarrotsCount++;
                playSound('collect');
                updateHUD();
                checkLevelCompletion();
            }
        });

        enemies.forEach(enemy => {
            const enemyHitbox = { x: enemy.worldX, y: enemy.y, width: enemy.width, height: enemy.height };
            if (isRectColliding(playerHitbox, enemyHitbox) && !isInvincible) {
                if (enemy.isBoss){
                     // Boss collision - for now, just lose life
                    loseLife();
                    return;
                }
                const prevPlayerBottom = (player.y + playerHitbox.height) - player.velocityY;
                if (player.velocityY > 0 && prevPlayerBottom < enemy.y + 5 && !player.isCrouching) {
                    enemies.splice(enemies.indexOf(enemy), 1);
                    player.velocityY = -JUMP_FORCE / 1.5;
                    player.isJumping = true;
                    player.isOnGround = false;
                    playSound('stomp');
                } else {
                    loseLife();
                }
            }
        });

        if (exit.isOpen && isRectColliding(playerHitbox, {x: exit.worldX, y: exit.y, width: exit.width, height: exit.height})) {
            levelComplete();
        }
    }

    function isRectColliding(rect1, rect2) {
        return rect1.x < rect2.x + rect2.width &&
               rect1.x + rect1.width > rect2.x &&
               rect1.y < rect2.y + rect2.height &&
               rect1.y + rect1.height > rect2.y;
    }

    function loseLife(isFallDeath = false) {
        if (isInvincible || isGameOver) return;
        lives--;
        playSound('hit');
        isInvincible = true;
        invincibilityTimer = INVINCIBILITY_DURATION;
        updateHUD();

        if (lives <= 0) {
            gameOver();
        } else {
            if (isFallDeath) {
                player.worldX = Math.max(50, cameraX + 100);
                player.y = canvas.height - 200;
            } else {
                player.worldX = Math.max(50, player.worldX - 50); // Move back a bit
                player.y = canvas.height - 100;
            }
            player.velocityX = 0; player.velocityY = 0;
            player.isCrouching = false; player.drawHeight = player.height; player.drawWidth = player.width;
            messagesDiv.textContent = "נפסלת! נסה שוב.";
            setTimeout(() => { if(!isGameOver && messagesDiv.textContent === "נפסלת! נסה שוב.") messagesDiv.textContent = ""; }, 2000);
        }
    }

    function gameOver() {
        isGameOver = true; gameStarted = false;
        playSound('gameOver');
        messagesDiv.innerHTML = `אוי לא, נגמרו החיים! <br> הגעת לשלב ${currentLevelIndex + 1}`;
        startButton.textContent = "שחק שוב מההתחלה";
        startButton.style.display = 'block';
        if (gameLoopId) { cancelAnimationFrame(gameLoopId); gameLoopId = null; }
    }

    function checkLevelCompletion() {
        if (collectedCarrotsCount >= requiredCarrots) {
            exit.isOpen = true;
            exit.color = '#FFD700';
        }
    }

    function levelComplete() {
        gameStarted = false; // Stop updates but not game over necessarily
        playSound('levelComplete');
        currentLevelIndex++;
        if (currentLevelIndex >= allLevelsData.length) {
            winGame();
        } else {
            messagesDiv.textContent = `שלב ${currentLevelIndex} הושלם!`;
            startButton.textContent = `התחל שלב ${currentLevelIndex + 1}`;
            startButton.style.display = 'block';
            playSound('nextLevel');
        }
         if (gameLoopId) { cancelAnimationFrame(gameLoopId); gameLoopId = null; } // Stop current loop
    }

    function winGame() {
        isGameOver = true; gameStarted = false;
        playSound('gameWin');
        messagesDiv.innerHTML = `כל הכבוד! ניצחת את המשחק! <br> סיימת את כל ${allLevelsData.length} השלבים!`;
        startButton.textContent = "שחק שוב מההתחלה";
        startButton.style.display = 'block';
        currentLevelIndex = 0; // Reset for new game
        if (gameLoopId) { cancelAnimationFrame(gameLoopId); gameLoopId = null; }
    }


    function updateHUD() {
        if (heartsDisplay) heartsDisplay.textContent = lives;
        if (carrotsCollectedDisplay) carrotsCollectedDisplay.textContent = collectedCarrotsCount;
        if (totalCarrotsDisplay) totalCarrotsDisplay.textContent = requiredCarrots;
    }

    function draw() {
        if (!currentLevelData && !isGameOver) { // Before first level load or after win/gameover and button shown
             ctx.clearRect(0, 0, canvas.width, canvas.height);
             ctx.fillStyle = '#87CEEB'; ctx.fillRect(0,0, canvas.width, canvas.height);
             if (!isGameOver) messagesDiv.textContent = "הרפתקאות בובו הארנב";
             startButton.style.display = 'block';
             // startButton text is set by gameOver or levelComplete or winGame
             if (startButton.textContent === "התחל משחק") { // Default if not set by other states
                messagesDiv.textContent = "הרפתקאות בובו הארנב";
             }
             return;
        }
        if (isGameOver && !gameStarted) return; // Keep game over message, handled by button
        if (!gameStarted && !isGameOver) { // Initial screen before first game start
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#87CEEB'; ctx.fillRect(0,0, canvas.width, canvas.height);
            messagesDiv.textContent = "הרפתקאות בובו הארנב";
            startButton.style.display = 'block'; startButton.textContent = "התחל משחק";
            return;
        }


        ctx.fillStyle = currentLevelData.bgColor || '#87CEEB';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Parallax remains generic for now, could be tied to level theme
        const bgMountainX = -(cameraX * 0.1) % canvas.width;
        ctx.fillStyle = '#a0a0c0'; // Slightly purplish mountains
        for (let i = -1; i < (canvas.width / 200) + 1; i++) {
            ctx.beginPath(); ctx.moveTo(bgMountainX + i * 200, canvas.height - 20);
            ctx.lineTo(bgMountainX + i * 200 + 100, canvas.height - 20 - 150);
            ctx.lineTo(bgMountainX + i * 200 + 200, canvas.height - 20);
            ctx.closePath(); ctx.fill();
        }
        const bgHillsX = -(cameraX * 0.3) % canvas.width;
        ctx.fillStyle = '#6B8E63'; // More olive
        for (let i = -1; i < (canvas.width / 150) +1; i++) {
            ctx.beginPath(); ctx.arc(bgHillsX + i * 150 + 75, canvas.height - 20, 75, Math.PI, 2*Math.PI, false);
            ctx.fill();
        }

        ctx.save(); ctx.translate(-cameraX, 0);

        if (platforms) platforms.forEach(platform => {
            ctx.fillStyle = platform.color || currentLevelData.platformColor || '#6f4e37';
            ctx.fillRect(platform.worldX, platform.y, platform.width, platform.height);
            ctx.fillStyle = 'rgba(0,0,0,0.2)';
            ctx.fillRect(platform.worldX + 3, platform.y + platform.height -3, platform.width -6, 3);
        });

        if (carrots) carrots.forEach(carrot => {
            if (!carrot.collected) {
                ctx.fillStyle = carrot.color; ctx.fillRect(carrot.worldX, carrot.y, carrot.width, carrot.height);
                ctx.fillStyle = '#228B22'; ctx.beginPath();
                ctx.moveTo(carrot.worldX + carrot.width / 2, carrot.y - 5);
                ctx.lineTo(carrot.worldX, carrot.y); ctx.lineTo(carrot.worldX + carrot.width, carrot.y);
                ctx.closePath(); ctx.fill();
            }
        });

        if (enemies) enemies.forEach(enemy => {
            ctx.fillStyle = enemy.color; ctx.fillRect(enemy.worldX, enemy.y, enemy.width, enemy.height);
            if (!enemy.isBoss) { // Simple eyes for regular enemies
                ctx.fillStyle = 'white';
                const eyeXOffset = enemy.direction > 0 ? enemy.width * 0.6 : enemy.width * 0.2;
                ctx.fillRect(enemy.worldX + eyeXOffset, enemy.y + 5, 5, 5);
                ctx.fillRect(enemy.worldX + eyeXOffset + (enemy.direction > 0 ? 7 : -7) , enemy.y + 5, 5, 5);
                ctx.fillStyle = 'black';
                ctx.fillRect(enemy.worldX + eyeXOffset + 1, enemy.y + 7, 2, 2);
                ctx.fillRect(enemy.worldX + eyeXOffset + (enemy.direction > 0 ? 7 : -7) + 1, enemy.y + 7, 2, 2);
            } else { // Bigger eyes for boss
                 ctx.fillStyle = 'yellow';
                 ctx.fillRect(enemy.worldX + enemy.width * 0.25, enemy.y + enemy.height * 0.2, 15, 15);
                 ctx.fillRect(enemy.worldX + enemy.width * 0.75 - 15, enemy.y + enemy.height * 0.2, 15, 15);
                 ctx.fillStyle = 'black';
                 ctx.fillRect(enemy.worldX + enemy.width * 0.25 + 5, enemy.y + enemy.height * 0.2 + 5, 5, 5);
                 ctx.fillRect(enemy.worldX + enemy.width * 0.75 - 10, enemy.y + enemy.height * 0.2 + 5, 5, 5);
            }
        });

        if (exit) {
            ctx.fillStyle = exit.color; ctx.fillRect(exit.worldX, exit.y, exit.width, exit.height);
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(exit.worldX + exit.width * 0.2, exit.y + exit.height * 0.2, exit.width*0.6, exit.height*0.8);
            if (exit.isOpen) {
                ctx.fillStyle = 'black'; ctx.font = 'bold 12px Arial'; ctx.textAlign = 'center';
                ctx.fillText("יציאה", exit.worldX + exit.width / 2, exit.y + exit.height / 2 + 5);
            }
        }
        
        if (player) {
            if (isInvincible) ctx.globalAlpha = (Math.floor(Date.now() / 100) % 2 === 0) ? 0.4 : 0.8;
            const playerDrawX = player.worldX;
            let playerVisualY = player.y;
            if (player.isCrouching) playerVisualY = player.y + (player.height - player.drawHeight);
            ctx.fillStyle = player.color;
            ctx.fillRect(playerDrawX, playerVisualY, player.drawWidth, player.drawHeight);
            const earHeight = 12, earWidth = 7;
            ctx.fillStyle = player.isCrouching ? player.color : '#ffc0cb';
            ctx.fillRect(playerDrawX + player.drawWidth*0.2 - earWidth/2, playerVisualY - earHeight + (player.isCrouching?5:0), earWidth, earHeight);
            ctx.fillRect(playerDrawX + player.drawWidth*0.8 - earWidth/2, playerVisualY - earHeight + (player.isCrouching?5:0), earWidth, earHeight);
            ctx.globalAlpha = 1.0;
        }
        ctx.restore();
    }

    function gameLoop() {
        if (!isGameOver && gameStarted) {
            updatePlayer(); updateCamera(); updateEnemies(); updatePlatforms(); checkCollisions();
        }
        draw();
        // Continue loop if game is active OR on start/gameover/nextlevel screen (to allow restart/advance)
        if (gameStarted || startButton.style.display === 'block') {
           gameLoopId = requestAnimationFrame(gameLoop);
        }
    }

    startButton.addEventListener('click', async () => {
        if (!soundsInitialized) {
            await initializeSounds();
        }
        if (gameLoopId) { cancelAnimationFrame(gameLoopId); gameLoopId = null; }
        
        if (isGameOver || currentLevelIndex >= allLevelsData.length) { // If game was over or won, start fresh
            startGame(true); // true for fresh game start (reset level index and lives)
        } else {
            startGame(false); // Continue to next level or retry current if somehow stuck
        }
    });

    // Initial setup message and draw
    messagesDiv.textContent = "הרפתקאות בובו הארנב";
    startButton.textContent = "התחל משחק";
    startButton.style.display = 'block';
    draw(); // Draw initial screen
});
